use serde::Serialize;
use std::fmt;

/// Error codes frozen by installer/CONTRACT.md section 6.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    ManifestUnreachable,
    ManifestSchema,
    BootstrapperTooOld,
    PayloadDownload,
    PayloadHash,
    PayloadSignature,
    PayloadRun,
    InstallTimeout,
    InstallFailed,
    PathInvalid,
    PathNotWritable,
    DiskFull,
    DataImportInvalid,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallerError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl InstallerError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }
}

impl fmt::Display for InstallerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.detail {
            Some(detail) => write!(f, "{:?}: {} ({detail})", self.code, self.message),
            None => write!(f, "{:?}: {}", self.code, self.message),
        }
    }
}

impl std::error::Error for InstallerError {}

pub fn is_disk_full(error: &std::io::Error) -> bool {
    // ERROR_DISK_FULL on Windows, ENOSPC on Unix.
    matches!(error.raw_os_error(), Some(112) | Some(28))
}

pub fn io_error(
    fallback: ErrorCode,
    message: impl Into<String>,
    error: &std::io::Error,
) -> InstallerError {
    let code = if is_disk_full(error) {
        ErrorCode::DiskFull
    } else {
        fallback
    };
    InstallerError::new(code, message).with_detail(error.to_string())
}

pub fn net_error(message: impl Into<String>, error: &reqwest::Error) -> InstallerError {
    InstallerError::new(ErrorCode::PayloadDownload, message).with_detail(error.to_string())
}
