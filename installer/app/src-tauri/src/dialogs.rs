use crate::error::{ErrorCode, InstallerError};
use std::path::Path;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

fn dialog_error(error: impl std::fmt::Display) -> InstallerError {
    InstallerError::new(ErrorCode::InstallFailed, "无法打开文件夹选择窗口")
        .with_detail(error.to_string())
}

#[tauri::command]
pub async fn pick_directory(
    app: AppHandle,
    initial: Option<String>,
) -> Result<Option<String>, InstallerError> {
    let initial = initial.filter(|path| !path.trim().is_empty());
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file().set_title("选择安装位置");
        if let Some(initial) = initial {
            if Path::new(&initial).is_dir() {
                dialog = dialog.set_directory(initial);
            }
        }
        dialog
            .blocking_pick_folder()
            .and_then(|file_path| file_path.into_path().ok())
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(dialog_error)
}

#[tauri::command]
pub async fn pick_data_source(app: AppHandle) -> Result<Option<String>, InstallerError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("选择旧数据文件夹")
            .blocking_pick_folder()
            .and_then(|file_path| file_path.into_path().ok())
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(dialog_error)
}
