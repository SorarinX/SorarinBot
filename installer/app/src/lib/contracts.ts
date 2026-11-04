export type Feature = { title: string; body: string };

export type Manifest = {
  schema: number;
  version: string;
  releasedAt?: string;
  payload: {
    url: string;
    mirrors?: string[];
    sha256: string;
    size: number;
  };
  minBootstrapper: string;
  notesUrl?: string;
  update?: { baseUrls?: string[] };
  features?: Feature[];
};

export type Phase = "download" | "verify" | "install" | "done" | "error";

export type DownloadProgress = {
  received: number;
  total: number;
  percent: number;
  bytesPerSecond: number;
};

export type InstallProgress = {
  percent: number;
  phase: string;
};

export type VerifyResult = {
  sha256Ok: boolean;
  signed: boolean;
  signer?: string | null;
};

export const MOCK_MANIFEST: Manifest = {
  schema: 1,
  version: "3.1.0",
  payload: {
    url: "https://example.invalid/SorarinBot-3.1.0-Setup-payload.exe",
    mirrors: [],
    sha256: "0".repeat(64),
    size: 127_200_000,
  },
  minBootstrapper: "1.0.0",
  notesUrl: "https://github.com/SorarinX/SorarinBot/releases",
  features: [
    { title: "多模型", body: "DeepSeek、OpenAI 与 Ollama，任意兼容接口自由切换。" },
    { title: "本地运行", body: "消息与密钥只留在你的电脑，不上传第三方服务器。" },
    { title: "开箱即用", body: "安装完成后扫码即可开始，无需配置运行环境。" },
  ],
};

export const MOCK_INSTALL_DIR = "C:\\Users\\你\\AppData\\Local\\Programs\\SorarinBot";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return (value >= 100 ? value.toFixed(0) : value.toFixed(1)) + " " + units[index];
}
