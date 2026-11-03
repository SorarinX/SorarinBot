/** Settings / prompt API types and helpers (P3). */

import {
  readNumber,
  readRecord,
  readString,
  requestJson,
} from "./http";

export const APP_VERSION = "v2.4.0";

export type ProviderPresetId = "deepseek" | "openai" | "minimax" | "custom";

export type ProviderPreset = {
  id: ProviderPresetId;
  label: string;
  providerName: string;
  baseUrl: string;
  model: string;
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    providerName: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  {
    id: "openai",
    label: "OpenAI",
    providerName: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
  },
  {
    id: "minimax",
    label: "MiniMax",
    providerName: "minimax",
    baseUrl: "https://api.minimaxi.com/v1",
    model: "MiniMax-M3",
  },
  {
    id: "custom",
    label: "自定义",
    providerName: "openaicompat",
    baseUrl: "",
    model: "",
  },
];

export type AppConfig = {
  provider: {
    name: string;
    baseUrl: string;
    model: string;
    apiKey: string;
  };
  prompt: string;
  databasePath: string;
};

export type ConfigUpdate = {
  provider_name?: string;
  base_url?: string;
  model?: string;
  api_key?: string;
  prompt?: string;
};

export type ModelsResult = {
  ok: boolean;
  models: string[];
  error: string;
};

export type TestResult = {
  ok: boolean;
  latencyMs: number | null;
  model: string;
  error: string;
};

export function inferPreset(name: string): ProviderPresetId | "" {
  const normalized = name.trim().toLowerCase();
  if (
    normalized === "deepseek" ||
    normalized === "openai" ||
    normalized === "minimax"
  ) {
    return normalized;
  }
  if (!normalized) return "";
  return "custom";
}

export function presetById(id: ProviderPresetId | ""): ProviderPreset | null {
  return PROVIDER_PRESETS.find((preset) => preset.id === id) ?? null;
}

export async function getConfig(): Promise<AppConfig> {
  const payload = readRecord(await requestJson("/api/config"));
  if (!payload) throw new Error("配置接口返回了无效数据");

  const provider = readRecord(payload.provider);
  const database = readRecord(payload.database);

  return {
    provider: {
      name: readString(provider?.name),
      baseUrl: readString(provider?.base_url),
      model: readString(provider?.model),
      apiKey: readString(provider?.api_key),
    },
    prompt: typeof payload.prompt === "string" ? payload.prompt : "",
    databasePath: readString(database?.path),
  };
}

export async function saveConfig(updates: ConfigUpdate): Promise<void> {
  const payload = readRecord(
    await requestJson("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }),
  );

  if (payload?.status !== "ok") {
    throw new Error(readString(payload?.error) || "保存失败");
  }
}

export async function getModels(): Promise<ModelsResult> {
  const payload = readRecord(await requestJson("/api/models"));
  if (!payload) {
    return { ok: false, models: [], error: "模型接口返回了无效数据" };
  }

  const models = Array.isArray(payload.models)
    ? payload.models.filter((model): model is string => typeof model === "string")
    : [];

  return {
    ok: payload.ok === true,
    models,
    error: payload.ok === true ? "" : readString(payload.error) || "获取模型失败",
  };
}

export async function testConnection(): Promise<TestResult> {
  const payload = readRecord(await requestJson("/api/test", { method: "POST" }));

  return {
    ok: payload?.ok === true,
    latencyMs: readNumber(payload?.latency_ms),
    model: readString(payload?.model),
    error: readString(payload?.error),
  };
}

export async function getAutostart(): Promise<boolean> {
  const payload = readRecord(await requestJson("/api/autostart"));
  if (typeof payload?.enabled !== "boolean") {
    throw new Error("开机自启接口返回了无效数据");
  }
  return payload.enabled;
}

export async function setAutostart(enabled: boolean): Promise<boolean> {
  const payload = readRecord(
    await requestJson("/api/autostart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }),
  );

  if (payload?.ok !== true) {
    throw new Error(readString(payload?.error) || "设置开机自启失败");
  }

  return typeof payload.enabled === "boolean" ? payload.enabled : enabled;
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}
