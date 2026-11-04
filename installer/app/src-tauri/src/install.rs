use crate::error::{io_error, ErrorCode, InstallerError};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InstallPhase {
    Extracting,
    Registering,
    Shortcuts,
    Finishing,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallProgress {
    pub percent: f64,
    pub phase: InstallPhase,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOk {
    pub version: String,
    #[serde(default)]
    pub installed_at: Option<String>,
    #[serde(default)]
    pub install_dir: Option<String>,
}

fn install_ok_path(install_dir: &Path) -> PathBuf {
    install_dir.join("install.ok")
}

fn read_install_ok(install_dir: &Path) -> Option<InstallOk> {
    let bytes = std::fs::read(install_ok_path(install_dir)).ok()?;
    serde_json::from_slice::<InstallOk>(&bytes).ok()
}

fn has_file_with_prefix(dir: &Path, prefix: &str, extension: &str) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|entry| {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        name.starts_with(prefix) && name.ends_with(extension)
    })
}

fn infer_phase(install_dir: &Path, elapsed: Duration) -> InstallPhase {
    let exe_ready = has_file_with_prefix(install_dir, "sorarinbot", ".exe");
    if !exe_ready {
        return InstallPhase::Extracting;
    }
    if install_ok_path(install_dir).exists() {
        return InstallPhase::Finishing;
    }
    if has_file_with_prefix(install_dir, "uninstall", ".exe") {
        return InstallPhase::Shortcuts;
    }
    let _ = elapsed;
    InstallPhase::Registering
}

fn heuristic_percent(phase: InstallPhase, elapsed: Duration) -> f64 {
    // NSIS does not report fine-grained progress. This is a monotonic estimate
    // anchored to observable files; the final 100 only comes from install.ok.
    let seconds = elapsed.as_secs_f64();
    let percent = match phase {
        InstallPhase::Extracting => 5.0 + (seconds / 8.0).min(1.0) * 35.0,
        InstallPhase::Registering => 42.0 + (seconds / 12.0).min(1.0) * 25.0,
        InstallPhase::Shortcuts => 70.0 + (seconds / 8.0).min(1.0) * 18.0,
        InstallPhase::Finishing => 90.0 + (seconds / 10.0).min(1.0) * 8.0,
    };
    percent.min(98.0)
}

fn validate_install_dir(install_dir: &Path) -> Result<(), InstallerError> {
    if !install_dir.is_absolute() {
        return Err(InstallerError::new(
            ErrorCode::PathInvalid,
            "安装位置必须是绝对路径",
        ));
    }
    if install_dir.parent().is_none() {
        return Err(InstallerError::new(
            ErrorCode::PathInvalid,
            "不能直接安装到磁盘根目录",
        ));
    }
    let lower = install_dir.to_string_lossy().to_lowercase();
    for system_dir in [
        "c:\\windows",
        "c:\\program files",
        "c:\\program files (x86)",
    ] {
        if lower == system_dir || lower.starts_with(&format!("{system_dir}\\")) {
            return Err(InstallerError::new(
                ErrorCode::PathInvalid,
                "请选择当前用户可写目录，不要安装到系统目录",
            )
            .with_detail(install_dir.display().to_string()));
        }
    }

    std::fs::create_dir_all(install_dir)
        .map_err(|error| io_error(ErrorCode::PathNotWritable, "无法创建安装目录", &error))?;
    let probe = install_dir.join(format!(".sorarin-write-test-{}", std::process::id()));
    match std::fs::write(&probe, b"ok") {
        Ok(()) => {
            let _ = std::fs::remove_file(probe);
        }
        Err(error) => {
            return Err(io_error(
                ErrorCode::PathNotWritable,
                "安装目录不可写",
                &error,
            ));
        }
    }
    Ok(())
}

fn find_app_exe(install_dir: &Path) -> Option<PathBuf> {
    let direct = install_dir.join("SorarinBot.exe");
    if direct.is_file() {
        return Some(direct);
    }
    let entries = std::fs::read_dir(install_dir).ok()?;
    entries.flatten().find_map(|entry| {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name == "sorarinbot.exe" {
            Some(entry.path())
        } else {
            None
        }
    })
}

/// Runs the silent NSIS payload and waits for it, passing the install directory
/// through SORARINBOT_INSTALL_DIR (never /D=).
#[tauri::command]
pub async fn run_payload(payload_path: String, install_dir: String) -> Result<i32, InstallerError> {
    let payload = PathBuf::from(&payload_path);
    let install = PathBuf::from(&install_dir);
    if !payload.is_file() {
        return Err(InstallerError::new(
            ErrorCode::PayloadRun,
            "安装包文件不存在",
        )
        .with_detail(payload_path));
    }
    validate_install_dir(&install)?;

    let payload_parent = payload.parent().and_then(|parent| parent.canonicalize().ok());
    let install_canon = install.canonicalize().ok();
    if let (Some(payload_parent), Some(install_canon)) = (payload_parent, install_canon) {
        if payload_parent == install_canon {
            return Err(InstallerError::new(
                ErrorCode::PathInvalid,
                "安装位置不能是安装包所在目录",
            ));
        }
    }

    crate::logging::write_log(format!(
        "run_payload {} install_dir={}",
        payload.display(),
        install.display()
    ));

    let mut command = std::process::Command::new(&payload);
    command
        .arg("/S")
        .env("SORARINBOT_INSTALL_DIR", &install)
        .current_dir(payload.parent().unwrap_or_else(|| Path::new(".")))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let mut child = command.spawn().map_err(|error| {
        io_error(ErrorCode::PayloadRun, "无法启动安装包", &error)
    })?;
    let status = tokio::task::spawn_blocking(move || child.wait())
        .await
        .map_err(|error| {
            InstallerError::new(ErrorCode::PayloadRun, "等待安装包失败")
                .with_detail(error.to_string())
        })?
        .map_err(|error| io_error(ErrorCode::PayloadRun, "等待安装包失败", &error))?;
    let code = status.code().unwrap_or(-1);
    crate::logging::write_log(format!("payload exited with {code}"));
    Ok(code)
}

/// Polls for install.ok and emits install-progress. Percentages are a
/// documented estimate except the final 100, which requires install.ok with a
/// matching version.
#[tauri::command]
pub async fn poll_install(
    app: AppHandle,
    install_dir: String,
    version: String,
    timeout_secs: Option<u64>,
) -> Result<InstallOk, InstallerError> {
    let dir = PathBuf::from(&install_dir);
    if !dir.is_absolute() {
        return Err(InstallerError::new(
            ErrorCode::PathInvalid,
            "安装位置必须是绝对路径",
        ));
    }
    let timeout = Duration::from_secs(timeout_secs.unwrap_or(600).clamp(30, 1800));
    let started = Instant::now();
    let mut last_phase: Option<InstallPhase> = None;
    let mut last_emit = Instant::now() - Duration::from_secs(2);

    loop {
        if let Some(ok) = read_install_ok(&dir) {
            if ok.version == version {
                let _ = app.emit(
                    "install-progress",
                    InstallProgress {
                        percent: 100.0,
                        phase: InstallPhase::Finishing,
                    },
                );
                crate::logging::write_log(format!("install.ok found for {}", ok.version));
                return Ok(ok);
            }
        }

        let phase = infer_phase(&dir, started.elapsed());
        let percent = heuristic_percent(phase, started.elapsed());
        if last_phase != Some(phase) || last_emit.elapsed() >= Duration::from_secs(1) {
            let _ = app.emit(
                "install-progress",
                InstallProgress { percent, phase },
            );
            last_phase = Some(phase);
            last_emit = Instant::now();
        }

        if started.elapsed() >= timeout {
            return Err(InstallerError::new(
                ErrorCode::InstallTimeout,
                "安装超时，未找到有效的 install.ok",
            )
            .with_detail(format!(
                "{} 秒内未在 {} 发现匹配版本 {} 的 install.ok",
                timeout.as_secs(),
                dir.display(),
                version
            )));
        }
        tokio::time::sleep(Duration::from_millis(350)).await;
    }
}

/// Launches SorarinBot.exe from the install directory.
#[tauri::command]
pub async fn launch_app(install_dir: String) -> Result<(), InstallerError> {
    let dir = PathBuf::from(&install_dir);
    let exe = find_app_exe(&dir).ok_or_else(|| {
        InstallerError::new(ErrorCode::PayloadRun, "未在安装目录中找到 SorarinBot.exe")
            .with_detail(install_dir.clone())
    })?;

    crate::logging::write_log(format!("launch_app {}", exe.display()));
    let mut command = std::process::Command::new(&exe);
    command.current_dir(&dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command.spawn().map_err(|error| {
        io_error(ErrorCode::PayloadRun, "无法启动 SorarinBot", &error)
    })?;
    Ok(())
}

/// Opens a folder with Explorer / the user's file manager.
#[tauri::command]
pub async fn open_folder(app: AppHandle, path: String) -> Result<(), InstallerError> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(InstallerError::new(
            ErrorCode::PathInvalid,
            "文件夹不存在",
        )
        .with_detail(path));
    }
    app.opener()
        .open_path(dir.to_string_lossy().into_owned(), None::<String>)
        .map_err(|error| {
            InstallerError::new(ErrorCode::InstallFailed, "无法打开安装目录")
                .with_detail(error.to_string())
        })
}
