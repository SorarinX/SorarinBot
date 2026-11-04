use crate::error::{ErrorCode, InstallerError};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

pub fn log_file() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("SorarinBot Installer").join("logs").join("installer.log")
}

pub fn write_log(line: impl AsRef<str>) {
    let path = log_file();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default();
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{stamp}] {}", line.as_ref());
    }
}

/// Opens the installer log with the user's default handler.
#[tauri::command]
pub async fn open_log(app: AppHandle) -> Result<(), InstallerError> {
    write_log("open_log");
    let path = log_file();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            crate::error::io_error(ErrorCode::InstallFailed, "无法创建日志目录", &error)
        })?;
    }
    if !path.exists() {
        std::fs::write(&path, b"SorarinBot installer log\n").map_err(|error| {
            crate::error::io_error(ErrorCode::InstallFailed, "无法创建日志文件", &error)
        })?;
    }
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<String>)
        .map_err(|error| {
            InstallerError::new(ErrorCode::InstallFailed, "无法打开安装日志")
                .with_detail(error.to_string())
        })
}
