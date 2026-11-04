use crate::error::{io_error, net_error, ErrorCode, InstallerError};
use crate::manifest::{is_sha256_hex, is_https};
use crate::state::InstallerState;
use futures_util::StreamExt;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub received: u64,
    pub total: u64,
    pub percent: f64,
    pub bytes_per_second: f64,
}

struct ActiveGuard(Arc<AtomicBool>);

impl Drop for ActiveGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

fn emit_progress(app: &AppHandle, received: u64, total: u64, speed: f64) {
    let percent = if total == 0 {
        0.0
    } else {
        ((received as f64 / total as f64) * 1000.0).round() / 10.0
    };
    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            received,
            total,
            percent: percent.clamp(0.0, 100.0),
            bytes_per_second: if speed.is_finite() && speed > 0.0 {
                speed
            } else {
                0.0
            },
        },
    );
}

async fn stream_to_file(
    app: &AppHandle,
    response: reqwest::Response,
    temp: &Path,
    expected_size: u64,
    cancel: &AtomicBool,
) -> Result<f64, InstallerError> {
    let mut file = tokio::fs::File::create(temp)
        .await
        .map_err(|error| io_error(ErrorCode::PayloadDownload, "无法创建临时安装包", &error))?;
    let mut stream = response.bytes_stream();
    let mut received: u64 = 0;
    let started = Instant::now();
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut last_bytes: u64 = 0;
    let mut last_at = started;
    let mut speed: f64 = 0.0;

    emit_progress(app, 0, expected_size, 0.0);

    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            return Err(InstallerError::new(
                ErrorCode::Cancelled,
                "下载已取消",
            ));
        }
        let chunk = chunk.map_err(|error| {
            net_error("下载安装包时连接中断", &error)
        })?;
        received = received.saturating_add(chunk.len() as u64);
        if received > expected_size {
            return Err(InstallerError::new(
                ErrorCode::PayloadDownload,
                "安装包大小与清单不一致",
            )
            .with_detail(format!(
                "已接收 {received} 字节，清单为 {expected_size} 字节"
            )));
        }
        file.write_all(&chunk)
            .await
            .map_err(|error| io_error(ErrorCode::PayloadDownload, "写入安装包失败", &error))?;

        let now = Instant::now();
        if now.duration_since(last_emit) >= Duration::from_millis(120) || received == expected_size
        {
            let delta_time = now.duration_since(last_at).as_secs_f64();
            if delta_time > 0.0 {
                speed = (received.saturating_sub(last_bytes)) as f64 / delta_time;
                last_bytes = received;
                last_at = now;
            }
            emit_progress(app, received, expected_size, speed);
            last_emit = now;
        }
    }

    file.flush()
        .await
        .map_err(|error| io_error(ErrorCode::PayloadDownload, "刷新安装包失败", &error))?;
    file.sync_all()
        .await
        .map_err(|error| io_error(ErrorCode::PayloadDownload, "同步安装包失败", &error))?;

    if received != expected_size {
        return Err(InstallerError::new(
            ErrorCode::PayloadDownload,
            "安装包下载不完整",
        )
        .with_detail(format!(
            "已接收 {received} 字节，清单为 {expected_size} 字节"
        )));
    }
    Ok(speed)
}

/// Downloads the payload to `dest` and emits `download-progress` while streaming.
#[tauri::command]
pub async fn download_payload(
    app: AppHandle,
    state: tauri::State<'_, InstallerState>,
    url: String,
    dest: String,
    sha256: String,
    size: u64,
) -> Result<String, InstallerError> {
    if !is_https(&url) {
        return Err(InstallerError::new(
            ErrorCode::PayloadDownload,
            "安装包地址必须使用 HTTPS",
        ));
    }
    if !is_sha256_hex(&sha256) {
        return Err(InstallerError::new(
            ErrorCode::PayloadDownload,
            "下载参数中的 SHA-256 无效",
        ));
    }
    if size == 0 {
        return Err(InstallerError::new(
            ErrorCode::PayloadDownload,
            "下载参数中的安装包大小无效",
        ));
    }

    let dest_path = PathBuf::from(&dest);
    if !dest_path.is_absolute() {
        return Err(InstallerError::new(
            ErrorCode::PathInvalid,
            "安装包临时路径必须是绝对路径",
        ));
    }
    let parent = dest_path.parent().ok_or_else(|| {
        InstallerError::new(ErrorCode::PathInvalid, "安装包临时路径无效")
    })?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|error| io_error(ErrorCode::PathNotWritable, "无法创建临时目录", &error))?;
    let temp = PathBuf::from(format!("{}.part", dest_path.display()));

    let cancel = state.cancel.clone();
    let active = state.download_active.clone();
    cancel.store(false, Ordering::SeqCst);
    active.store(true, Ordering::SeqCst);
    let _guard = ActiveGuard(active);

    if temp.exists() {
        let _ = tokio::fs::remove_file(&temp).await;
    }

    crate::logging::write_log(format!("download_payload {url} -> {}", dest_path.display()));

    let client = reqwest::Client::builder()
        .user_agent(format!(
            "SorarinBot-Installer/{} (Windows)",
            env!("CARGO_PKG_VERSION")
        ))
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(1800))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| {
            InstallerError::new(ErrorCode::PayloadDownload, "无法初始化下载连接")
                .with_detail(error.to_string())
        })?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| net_error("无法连接安装包地址", &error))?;

    if !response.status().is_success() {
        return Err(InstallerError::new(
            ErrorCode::PayloadDownload,
            "安装包地址返回了错误",
        )
        .with_detail(format!("HTTP {}", response.status())));
    }
    if let Some(length) = response.content_length() {
        if length > size.saturating_add(1024 * 1024) {
            return Err(InstallerError::new(
                ErrorCode::PayloadDownload,
                "安装包大小与清单不一致",
            )
            .with_detail(format!("服务器报告 {length} 字节，清单为 {size} 字节")));
        }
    }

    let result = stream_to_file(&app, response, &temp, size, &cancel).await;
    match result {
        Ok(speed) => {
            if cancel.load(Ordering::SeqCst) {
                let _ = tokio::fs::remove_file(&temp).await;
                return Err(InstallerError::new(
                    ErrorCode::Cancelled,
                    "下载已取消",
                ));
            }
            emit_progress(&app, size, size, speed);
            if dest_path.exists() {
                let _ = tokio::fs::remove_file(&dest_path).await;
            }
            tokio::fs::rename(&temp, &dest_path)
                .await
                .map_err(|error| io_error(ErrorCode::PayloadDownload, "保存安装包失败", &error))?;
            crate::logging::write_log(format!("download complete {}", dest_path.display()));
            Ok(dest)
        }
        Err(error) => {
            let _ = tokio::fs::remove_file(&temp).await;
            Err(error)
        }
    }
}

/// Cancels the in-flight download. The download command then fails with `cancelled`.
#[tauri::command]
pub async fn cancel_download(
    state: tauri::State<'_, InstallerState>,
) -> Result<(), InstallerError> {
    if state.download_active.load(Ordering::SeqCst) {
        state.cancel.store(true, Ordering::SeqCst);
        crate::logging::write_log("cancel_download requested");
    }
    Ok(())
}
