import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const source = path.join(repo, "web/src/styles/tokens.css");
const destDir = path.join(repo, "installer/app/src/styles");
const dest = path.join(destDir, "tokens.css");
const header = "/* Generated from web/src/styles/tokens.css by installer/app/scripts/sync-tokens.mjs. Do not edit. */\n";

if (!existsSync(source)) {
  console.error("missing source:", source);
  process.exit(1);
}

const normalize = (value) => value.replace(/\r\n/g, "\n");
const next = header + normalize(readFileSync(source, "utf8"));
const check = process.argv.includes("--check");

if (check) {
  if (!existsSync(dest)) {
    console.error("missing generated tokens:", dest);
    process.exit(1);
  }
  const current = normalize(readFileSync(dest, "utf8"));
  if (current !== next) {
    console.error("design tokens are out of date; run node installer/app/scripts/sync-tokens.mjs");
    process.exit(1);
  }
  console.log("tokens in sync");
} else {
  mkdirSync(destDir, { recursive: true });
  writeFileSync(dest, next, "utf8");
  console.log("wrote", dest);
}
