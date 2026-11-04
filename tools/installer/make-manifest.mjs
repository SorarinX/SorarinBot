#!/usr/bin/env node
/**
 * make-manifest.mjs - generate installer-manifest.json for the SorarinBot bootstrapper.
 *
 * This is the source of truth for the manifest described by installer/CONTRACT.md
 * (section 3) and validated by installer/manifest.schema.json.
 *
 * Runtime: Node ESM, no dependencies.
 *
 * Usage:
 *   node tools/installer/make-manifest.mjs \
 *     --payload electron/release/SorarinBot-3.1.0-Setup-payload.exe \
 *     --version 3.1.0 \
 *     --notes-url https://github.com/SorarinX/SorarinBot/releases/tag/v3.1.0 \
 *     --out out/installer-manifest.json
 *
 * Optional flags:
 *   --mirror <https-url>          extra payload download mirror (repeatable, order kept)
 *   --update-base <https-url>     electron-updater base URL (repeatable)
 *   --min-bootstrapper <semver>   minimum bootstrapper version (default 1.0.0)
 *   --payload-url <https-url>     canonical payload URL (default: GitHub release asset)
 *   --released-at <iso-date>      manifest timestamp (default: now, UTC, second precision)
 *   --features-file <json>        override the three default feature cards
 *
 * Every invalid argument exits with a non-zero status and a single clear message.
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/** Manifest schema version understood by the bootstrapper (CONTRACT.md section 3). */
const SCHEMA = 1;
/** Bootstrapper 1.0.0 is the first implementation of the frozen contract. */
const DEFAULT_MIN_BOOTSTRAPPER = "1.0.0";
/** Fallback location for the payload asset when --payload-url is not passed. */
const DEFAULT_PAYLOAD_BASE = "https://github.com/SorarinX/SorarinBot/releases/download";
/** manifest.schema.json allows at most four feature cards. */
const MAX_FEATURES = 4;
const FEATURE_TITLE_MAX = 40;
const FEATURE_BODY_MAX = 120;

/** The three agreed welcome-screen cards from CONTRACT.md section 3. */
const DEFAULT_FEATURES = [
  { title: "多模型", body: "DeepSeek / OpenAI / Ollama，任意兼容接口" },
  { title: "本地运行", body: "消息与密钥只留在你的电脑" },
  { title: "开箱即用", body: "安装完成后扫码即可开始" },
];

const USAGE =
  "Usage: node tools/installer/make-manifest.mjs --payload <path> --version <semver> --notes-url <https-url> --out <path> [options]\n" +
  "\n" +
  "Generates the installer manifest consumed by the Tauri bootstrapper.\n" +
  "See installer/CONTRACT.md section 3 for the required shape.\n" +
  "\n" +
  "Required:\n" +
  "  --payload <path>         NSIS payload built by electron-builder (sha256 + size are computed)\n" +
  "  --version <semver>       app version written to the manifest, e.g. 3.1.0\n" +
  "  --notes-url <https-url>  release notes page opened by the what's-new link\n" +
  "  --out <path>             destination manifest path (parent directories are created)\n" +
  "\n" +
  "Optional:\n" +
  "  --mirror <https-url>        additional payload download mirror (repeatable)\n" +
  "  --update-base <https-url>   electron-updater base URL (repeatable)\n" +
  "  --min-bootstrapper <semver> minimum bootstrapper version (default " + DEFAULT_MIN_BOOTSTRAPPER + ")\n" +
  "  --payload-url <https-url>   canonical payload URL (default: GitHub release asset)\n" +
  "  --released-at <iso-date>    manifest timestamp (default: now in UTC)\n" +
  "  --features-file <json>      JSON array of title/body cards (1-" + MAX_FEATURES + ")\n" +
  "  -h, --help                  show this help and exit\n" +
  "\n" +
  "Exit status: 0 on success, 1 on invalid input or I/O failure.\n";

class UsageError extends Error {}
class InputError extends Error {}

const SCALAR_FLAGS = new Map([
  ["--payload", "payload"],
  ["--version", "version"],
  ["--notes-url", "notesUrl"],
  ["--out", "out"],
  ["--min-bootstrapper", "minBootstrapper"],
  ["--payload-url", "payloadUrl"],
  ["--released-at", "releasedAt"],
  ["--features-file", "featuresFile"],
]);

const ARRAY_FLAGS = new Map([
  ["--mirror", "mirrors"],
  ["--update-base", "updateBases"],
]);

/**
 * Parse argv. Supports "--flag value" and "--flag=value". Scalar flags may appear
 * at most once; --mirror and --update-base accumulate in command-line order.
 */
function parseArgv(argv) {
  const options = { mirrors: [], updateBases: [] };
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "-h" || token === "--help") {
      options.help = true;
      continue;
    }

    let flag = token;
    let value;
    const equals = token.startsWith("--") ? token.indexOf("=") : -1;
    if (equals !== -1) {
      flag = token.slice(0, equals);
      value = token.slice(equals + 1);
    }

    if (SCALAR_FLAGS.has(flag)) {
      if (value === undefined) {
        value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new UsageError(flag + " requires a value");
        }
        index += 1;
      }
      const key = SCALAR_FLAGS.get(flag);
      if (seen.has(key)) {
        throw new UsageError(flag + " was given more than once");
      }
      seen.add(key);
      options[key] = value;
      continue;
    }

    if (ARRAY_FLAGS.has(flag)) {
      if (value === undefined) {
        value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new UsageError(flag + " requires a value");
        }
        index += 1;
      }
      options[ARRAY_FLAGS.get(flag)].push(value);
      continue;
    }

    if (token.startsWith("-")) {
      throw new UsageError("unknown option " + token);
    }
    throw new UsageError("unexpected argument " + JSON.stringify(token));
  }

  return options;
}

/**
 * Numeric semver without prerelease or build metadata. The bootstrapper compares
 * versions numerically and contract v1 explicitly has no prerelease support.
 */
function parseSemver(raw, flag) {
  const text = typeof raw === "string" ? raw : "";
  if (/^v/i.test(text)) {
    throw new UsageError(flag + " must not use a leading v (got " + JSON.stringify(text) + "); pass the numeric version only");
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(text)) {
    throw new UsageError(
      flag + " must be a numeric MAJOR.MINOR.PATCH version with no prerelease or build suffix (got " + JSON.stringify(text) + ")",
    );
  }
  return text;
}

/** Only absolute HTTPS URLs are accepted; the manifest is fetched over TLS. */
function parseHttpsUrl(raw, flag) {
  if (typeof raw !== "string" || raw === "") {
    throw new UsageError(flag + " requires a non-empty URL");
  }
  if (/\s/.test(raw)) {
    throw new UsageError(flag + " must not contain whitespace (got " + JSON.stringify(raw) + ")");
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UsageError(flag + " is not a valid absolute URL (got " + JSON.stringify(raw) + ")");
  }
  if (parsed.protocol !== "https:") {
    throw new UsageError(flag + " must use https:// (got " + JSON.stringify(raw) + ")");
  }
  if (!parsed.hostname) {
    throw new UsageError(flag + " has no host (got " + JSON.stringify(raw) + ")");
  }
  return raw;
}

function resolvePayload(rawPath) {
  const absolute = path.resolve(rawPath);
  let stats;
  try {
    stats = statSync(absolute);
  } catch (error) {
    const detail = error && error.code ? error.code : error instanceof Error ? error.message : String(error);
    throw new InputError("payload not found: " + absolute + " (" + detail + ")");
  }
  if (!stats.isFile()) {
    throw new InputError("payload is not a regular file: " + absolute);
  }
  if (stats.size < 1) {
    throw new InputError("payload is empty: " + absolute);
  }
  return { path: absolute, size: stats.size, name: path.basename(absolute) };
}

function defaultPayloadUrl(version, fileName) {
  const encodedName = encodeURIComponent(fileName);
  return parseHttpsUrl(
    DEFAULT_PAYLOAD_BASE + "/v" + version + "/" + encodedName,
    "derived payload URL",
  );
}

function readFeaturesFile(rawPath) {
  const absolute = path.resolve(rawPath);
  let text;
  try {
    text = readFileSync(absolute, "utf8");
  } catch (error) {
    const detail = error && error.code ? error.code : error instanceof Error ? error.message : String(error);
    throw new InputError("cannot read --features-file " + absolute + " (" + detail + ")");
  }
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new InputError("--features-file " + absolute + " is not valid JSON: " + error.message);
  }
  return validateFeatures(parsed, "--features-file " + absolute);
}

function validateFeatures(input, source) {
  if (!Array.isArray(input)) {
    throw new InputError(source + " must contain a JSON array");
  }
  if (input.length < 1) {
    throw new InputError(source + " must contain at least one feature card");
  }
  if (input.length > MAX_FEATURES) {
    throw new InputError(source + " may contain at most " + MAX_FEATURES + " feature cards (got " + input.length + ")");
  }

  return input.map((feature, index) => {
    const where = source + "[" + index + "]";
    if (feature === null || typeof feature !== "object" || Array.isArray(feature)) {
      throw new InputError(where + " must be an object with title and body strings");
    }
    const title = feature.title;
    const body = feature.body;
    if (typeof title !== "string" || title.trim() === "") {
      throw new InputError(where + ".title must be a non-empty string");
    }
    if (typeof body !== "string" || body.trim() === "") {
      throw new InputError(where + ".body must be a non-empty string");
    }
    if (title.length > FEATURE_TITLE_MAX) {
      throw new InputError(where + ".title must be at most " + FEATURE_TITLE_MAX + " characters");
    }
    if (body.length > FEATURE_BODY_MAX) {
      throw new InputError(where + ".body must be at most " + FEATURE_BODY_MAX + " characters");
    }
    return { title, body };
  });
}

/** ISO-8601 UTC with second precision, matching the contract example. */
function formatTimestamp(raw) {
  let date;
  if (raw === undefined) {
    date = new Date();
  } else {
    date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new UsageError("--released-at is not a valid ISO-8601 timestamp (got " + JSON.stringify(raw) + ")");
    }
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function printSummary(outPath, manifest, featureCount) {
  const lines = [
    "make-manifest: wrote " + outPath,
    "  version: " + manifest.version,
    "  releasedAt: " + manifest.releasedAt,
    "  payload: " + manifest.payload.url + " (" + manifest.payload.size + " bytes)",
    "  sha256: " + manifest.payload.sha256,
    "  mirrors: " + manifest.payload.mirrors.length,
    "  update base URLs: " + manifest.update.baseUrls.length,
    "  minBootstrapper: " + manifest.minBootstrapper,
    "  features: " + featureCount,
  ];
  console.log(lines.join("\n"));
}

async function main() {
  const options = parseArgv(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  const required = [
    ["payload", "--payload"],
    ["version", "--version"],
    ["notesUrl", "--notes-url"],
    ["out", "--out"],
  ];
  const missing = required
    .filter(([key]) => options[key] === undefined || options[key] === "")
    .map(([, flag]) => flag);
  if (missing.length > 0) {
    throw new UsageError(
      "missing required option" + (missing.length > 1 ? "s" : "") + ": " + missing.join(", "),
    );
  }

  const version = parseSemver(options.version, "--version");
  const notesUrl = parseHttpsUrl(options.notesUrl, "--notes-url");
  const minBootstrapper = parseSemver(
    options.minBootstrapper === undefined ? DEFAULT_MIN_BOOTSTRAPPER : options.minBootstrapper,
    "--min-bootstrapper",
  );
  const mirrors = options.mirrors.map((mirror, index) =>
    parseHttpsUrl(mirror, "--mirror #" + (index + 1)),
  );
  const updateBases = options.updateBases.map((base, index) =>
    parseHttpsUrl(base, "--update-base #" + (index + 1)),
  );

  const payload = resolvePayload(options.payload);
  const payloadUrl =
    options.payloadUrl === undefined
      ? defaultPayloadUrl(version, payload.name)
      : parseHttpsUrl(options.payloadUrl, "--payload-url");
  const releasedAt = formatTimestamp(options.releasedAt);
  const features =
    options.featuresFile === undefined ? DEFAULT_FEATURES : readFeaturesFile(options.featuresFile);

  const sha256 = await sha256OfFile(payload.path);
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error("internal error: sha256 digest is not 64 lowercase hex characters");
  }

  const manifest = {
    schema: SCHEMA,
    version: version,
    releasedAt: releasedAt,
    payload: {
      url: payloadUrl,
      mirrors: mirrors,
      sha256: sha256,
      size: payload.size,
    },
    minBootstrapper: minBootstrapper,
    notesUrl: notesUrl,
    update: { baseUrls: updateBases },
    features: features,
  };

  const outPath = path.resolve(options.out);
  if (existsSync(outPath) && statSync(outPath).isDirectory()) {
    throw new InputError("--out points at a directory, expected a file path: " + outPath);
  }
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  printSummary(outPath, manifest, features.length);
}

main().catch((error) => {
  if (error instanceof UsageError || error instanceof InputError) {
    console.error("make-manifest: error: " + error.message);
    if (error instanceof UsageError) {
      console.error("Run with --help for usage.");
    }
  } else {
    console.error("make-manifest: unexpected error: " + (error && error.stack ? error.stack : String(error)));
  }
  process.exitCode = 1;
});
