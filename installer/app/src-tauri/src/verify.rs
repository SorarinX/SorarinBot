use crate::error::{io_error, ErrorCode, InstallerError};
use crate::manifest::is_sha256_hex;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResult {
    pub sha256_ok: bool,
    /// Publisher name when it can be extracted. WinVerifyTrust validates the
    /// chain; this build does not parse the signer certificate, so it is None.
    pub signer: Option<String>,
    pub signed: bool,
}

fn sha256_file(path: &Path) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 128 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

#[cfg(windows)]
fn authenticode_status(path: &Path) -> bool {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HANDLE, HWND};
    use windows::Win32::Security::WinTrust::{
        WinVerifyTrust, WINTRUST_ACTION_GENERIC_VERIFY_V2, WINTRUST_DATA, WINTRUST_DATA_0,
        WINTRUST_FILE_INFO, WTD_CACHE_ONLY_URL_RETRIEVAL, WTD_CHOICE_FILE, WTD_REVOKE_NONE,
        WTD_STATEACTION_CLOSE, WTD_STATEACTION_VERIFY, WTD_UI_NONE,
    };

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut file_info = WINTRUST_FILE_INFO {
        cbStruct: std::mem::size_of::<WINTRUST_FILE_INFO>() as u32,
        pcwszFilePath: PCWSTR(wide.as_ptr()),
        hFile: HANDLE(std::ptr::null_mut()),
        pgKnownSubject: std::ptr::null_mut(),
    };

    let mut data = WINTRUST_DATA {
        cbStruct: std::mem::size_of::<WINTRUST_DATA>() as u32,
        dwUIChoice: WTD_UI_NONE,
        fdwRevocationChecks: WTD_REVOKE_NONE,
        dwUnionChoice: WTD_CHOICE_FILE,
        Anonymous: WINTRUST_DATA_0 {
            pFile: &mut file_info,
        },
        dwStateAction: WTD_STATEACTION_VERIFY,
        dwProvFlags: WTD_CACHE_ONLY_URL_RETRIEVAL,
        ..Default::default()
    };

    let mut action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
    let status = unsafe {
        WinVerifyTrust(
            HWND(std::ptr::null_mut()),
            &mut action,
            &mut data as *mut _ as *mut _,
        )
    };

    data.dwStateAction = WTD_STATEACTION_CLOSE;
    unsafe {
        let _ = WinVerifyTrust(
            HWND(std::ptr::null_mut()),
            &mut action,
            &mut data as *mut _ as *mut _,
        );
    }

    if status != 0 {
        crate::logging::write_log(format!("authenticode status 0x{status:08x}"));
    }
    status == 0
}

#[cfg(not(windows))]
fn authenticode_status(_path: &Path) -> bool {
    false
}

/// Verifies SHA-256 and (on Windows) the Authenticode signature.
#[tauri::command]
pub async fn verify_payload(path: String, sha256: String) -> Result<VerifyResult, InstallerError> {
    if !is_sha256_hex(&sha256) {
        return Err(InstallerError::new(
            ErrorCode::PayloadHash,
            "校验参数中的 SHA-256 无效",
        ));
    }
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.is_file() {
        return Err(InstallerError::new(
            ErrorCode::PayloadHash,
            "安装包不存在",
        )
        .with_detail(path));
    }

    let path_for_hash = path_buf.clone();
    let actual = tokio::task::spawn_blocking(move || sha256_file(&path_for_hash))
        .await
        .map_err(|error| {
            InstallerError::new(ErrorCode::PayloadHash, "校验安装包失败")
                .with_detail(error.to_string())
        })?
        .map_err(|error| io_error(ErrorCode::PayloadHash, "读取安装包失败", &error))?;

    let sha256_ok = actual.eq_ignore_ascii_case(&sha256);
    let signed = authenticode_status(&path_buf);
    crate::logging::write_log(format!(
        "verify_payload sha256_ok={sha256_ok} signed={signed}"
    ));

    Ok(VerifyResult {
        sha256_ok,
        signer: None,
        signed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn hashes_known_content() {
        let mut file = tempfile::NamedTempFile::new().unwrap();
        file.write_all(b"abc").unwrap();
        assert_eq!(
            sha256_file(file.path()).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
