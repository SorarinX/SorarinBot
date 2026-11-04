use crate::error::{io_error, ErrorCode, InstallerError};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const DATA_FILES: [&str; 3] = ["config.yaml", "data.db", "token.json"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub copied: Vec<String>,
    pub backed_up: Vec<String>,
    pub install_dir: String,
}

fn backup_name(target: &Path, timestamp: u64) -> PathBuf {
    let file_name = target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "data".into());
    let mut candidate = target.with_file_name(format!("{file_name}.bak-{timestamp}"));
    let mut index = 1;
    while candidate.exists() {
        candidate = target.with_file_name(format!("{file_name}.bak-{timestamp}-{index}"));
        index += 1;
    }
    candidate
}

fn rollback(destinations: &[PathBuf], backups: &[(PathBuf, PathBuf)]) -> Vec<String> {
    let mut failures = Vec::new();
    for destination in destinations {
        if destination.exists() {
            if let Err(error) = std::fs::remove_file(destination) {
                failures.push(format!("{}: {error}", destination.display()));
            }
        }
    }
    for (original, backup) in backups.iter().rev() {
        if original.exists() {
            let _ = std::fs::remove_file(original);
        }
        if backup.exists() {
            if let Err(error) = std::fs::rename(backup, original) {
                failures.push(format!("restore {}: {error}", original.display()));
            }
        }
    }
    failures
}

fn import_blocking(source: &Path, install: &Path) -> Result<ImportResult, InstallerError> {
    if !source.is_dir() {
        return Err(InstallerError::new(
            ErrorCode::DataImportInvalid,
            "请选择包含旧数据的文件夹",
        )
        .with_detail(source.display().to_string()));
    }
    std::fs::create_dir_all(install)
        .map_err(|error| io_error(ErrorCode::PathNotWritable, "无法创建安装目录", &error))?;

    let mut candidates = Vec::new();
    for name in DATA_FILES {
        let path = source.join(name);
        match std::fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_file() => {
                candidates.push((name, path));
            }
            Ok(_) => {
                return Err(InstallerError::new(
                    ErrorCode::DataImportInvalid,
                    "旧数据中包含不支持的文件类型",
                )
                .with_detail(path.display().to_string()));
            }
            Err(_) => {}
        }
    }
    if candidates.is_empty() {
        return Err(InstallerError::new(
            ErrorCode::DataImportInvalid,
            "所选文件夹中没有 config.yaml、data.db 或 token.json",
        )
        .with_detail(source.display().to_string()));
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();

    let mut destinations = Vec::new();
    let mut backups = Vec::new();
    let mut copied = Vec::new();
    let mut backed_up = Vec::new();

    for (name, source_path) in candidates {
        let destination = install.join(name);
        destinations.push(destination.clone());

        if destination.exists() {
            if !destination.is_file() {
                let failures = rollback(&destinations, &backups);
                return Err(InstallerError::new(
                    ErrorCode::DataImportInvalid,
                    "安装目录中存在同名文件夹，无法备份",
                )
                .with_detail(format!(
                    "{} {}",
                    destination.display(),
                    failures.join("; ")
                )));
            }
            let backup = backup_name(&destination, timestamp);
            if let Err(error) = std::fs::rename(&destination, &backup) {
                let failures = rollback(&destinations, &backups);
                return Err(io_error(
                    ErrorCode::DataImportInvalid,
                    "无法备份现有数据",
                    &error,
                )
                .with_detail(failures.join("; ")));
            }
            backups.push((destination.clone(), backup));
            backed_up.push(name.to_string());
        }

        if let Err(error) = std::fs::copy(&source_path, &destination) {
            let failures = rollback(&destinations, &backups);
            let mut err = io_error(ErrorCode::DataImportInvalid, "复制旧数据失败", &error);
            if !failures.is_empty() {
                err = err.with_detail(format!("回滚问题: {}", failures.join("; ")));
            }
            return Err(err);
        }
        copied.push(name.to_string());
    }

    crate::logging::write_log(format!(
        "import_data copied={copied:?} backed_up={backed_up:?}"
    ));

    Ok(ImportResult {
        copied,
        backed_up,
        install_dir: install.display().to_string(),
    })
}

/// Copies config.yaml / data.db / token.json with all-or-nothing rollback.
#[tauri::command]
pub async fn import_data(source_dir: String, install_dir: String) -> Result<ImportResult, InstallerError> {
    let source = PathBuf::from(source_dir);
    let install = PathBuf::from(install_dir);
    if !install.is_absolute() {
        return Err(InstallerError::new(
            ErrorCode::PathInvalid,
            "安装位置必须是绝对路径",
        ));
    }
    tokio::task::spawn_blocking(move || import_blocking(&source, &install))
        .await
        .map_err(|error| {
            InstallerError::new(ErrorCode::DataImportInvalid, "导入任务失败")
                .with_detail(error.to_string())
        })?
}
