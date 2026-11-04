import type { DownloadProgress, Manifest, VerifyResult } from "./contracts";

export const isTauri = (): boolean => "__TAURI_INTERNALS__" in window;

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import("@tauri-apps/api/core");
  return call<T>(command, args);
}

export async function onEvent<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, (message) => handler(message.payload));
}

export async function startDraggingWindow(): Promise<void> {
  if (!isTauri()) return;
  await invoke("start_window_drag");
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().minimize();
}

export async function closeWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}

export async function defaultInstallDir(): Promise<string> {
  return invoke<string>("default_install_dir");
}

export async function fetchManifest(urls: string[]): Promise<Manifest> {
  return invoke<Manifest>("fetch_manifest", { urls });
}

export async function downloadPayload(
  urls: string[],
  sha256: string,
  size: number,
  version: string,
  onProgress: (progress: DownloadProgress) => void,
): Promise<string> {
  const unlisten = await onEvent<DownloadProgress>("download-progress", onProgress);
  try {
    const dest = await invoke<string>("payload_temp_path", { version });
    let lastError: unknown = new Error("没有可用的下载地址");
    for (const url of urls) {
      try {
        return await invoke<string>("download_payload", { url, dest, sha256, size });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  } finally {
    unlisten();
  }
}

export async function onInstallProgress(handler: (progress: { percent: number; phase: string }) => void): Promise<() => void> {
  return onEvent("install-progress", handler);
}

export async function verifyPayload(path: string, sha256: string): Promise<VerifyResult> {
  return invoke<VerifyResult>("verify_payload", { path, sha256 });
}

export async function runPayload(path: string, installDir: string): Promise<number> {
  return invoke<number>("run_payload", { payloadPath: path, installDir });
}

export async function pollInstall(installDir: string, version: string, timeoutSecs: number): Promise<boolean> {
  const ok = await invoke<{ version?: string } | null>("poll_install", { installDir, version, timeoutSecs });
  return Boolean(ok && ok.version === version);
}

export async function launchApp(installDir: string): Promise<void> {
  await invoke("launch_app", { installDir });
}

export async function pickDirectory(initial: string): Promise<string | null> {
  return invoke<string | null>("pick_directory", { initial: initial || null });
}

export async function pickDataSource(): Promise<string | null> {
  return invoke<string | null>("pick_data_source");
}

export async function importData(sourceDir: string, installDir: string): Promise<unknown> {
  return invoke("import_data", { sourceDir, installDir });
}

export async function openPath(path: string): Promise<void> {
  await invoke("open_folder", { path });
}

export async function cancelDownload(): Promise<void> {
  await invoke("cancel_download");
}
