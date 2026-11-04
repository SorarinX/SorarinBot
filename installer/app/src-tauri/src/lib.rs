mod dialogs;
mod download;
mod error;
mod import;
mod install;
mod logging;
mod manifest;
mod state;
mod verify;
mod window_effects;

use state::InstallerState;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
async fn fetch_manifest(urls: Vec<String>) -> Result<manifest::Manifest, error::InstallerError> {
    let mut urls = urls;
    if let Ok(local) = std::env::var("SORARINBOT_MANIFEST_URL") {
        if !local.trim().is_empty() {
            urls.insert(0, local);
        }
    }
    manifest::fetch(urls).await
}

#[tauri::command]
async fn installer_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn default_install_dir() -> Result<String, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA is not set".to_string())?;
    Ok(PathBuf::from(local)
        .join("Programs")
        .join("SorarinBot")
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
fn payload_temp_path(version: String) -> Result<String, String> {
    let dir = std::env::temp_dir()
        .join("SorarinBot-Installer")
        .join(&version);
    std::fs::create_dir_all(&dir).map_err(|error| format!("create temp dir: {error}"))?;
    Ok(dir.join("payload.exe").to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(InstallerState::default())
        .invoke_handler(tauri::generate_handler![
            fetch_manifest,
            download::download_payload,
            verify::verify_payload,
            install::run_payload,
            install::poll_install,
            install::launch_app,
            install::open_folder,
            dialogs::pick_directory,
            dialogs::pick_data_source,
            import::import_data,
            download::cancel_download,
            logging::open_log,
            installer_version,
            default_install_dir,
            payload_temp_path,
        ])
        .setup(|app| {
            logging::write_log(format!(
                "installer {} starting",
                env!("CARGO_PKG_VERSION")
            ));
            if let Some(window) = app.get_webview_window("main") {
                window_effects::apply(&window);
                // Let the CSS border-radius be genuinely transparent instead of
                // showing the WebView2 default white surface in the corners.
                let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
