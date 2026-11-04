use crate::error::{ErrorCode, InstallerError};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::Url;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub schema: u32,
    pub version: String,
    #[serde(default)]
    pub released_at: Option<String>,
    pub payload: Payload,
    pub min_bootstrapper: String,
    #[serde(default)]
    pub notes_url: Option<String>,
    #[serde(default)]
    pub update: Option<UpdateInfo>,
    #[serde(default)]
    pub features: Vec<Feature>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Payload {
    pub url: String,
    #[serde(default)]
    pub mirrors: Vec<String>,
    pub sha256: String,
    pub size: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    #[serde(default)]
    pub base_urls: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Feature {
    pub title: String,
    pub body: String,
}

pub fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}

pub(crate) fn is_https(value: &str) -> bool {
    if std::env::var("SORARINBOT_ALLOW_HTTP").is_ok()
        && (value.starts_with("http://127.0.0.1:") || value.starts_with("http://localhost:"))
    {
        return true;
    }
    Url::parse(value)
        .map(|url| url.scheme() == "https" && url.host_str().is_some())
        .unwrap_or(false)
}

fn parse_version(value: &str) -> Option<Version> {
    let version = Version::parse(value).ok()?;
    if !version.pre.is_empty() || !version.build.is_empty() {
        return None;
    }
    Some(version)
}

pub fn validate(manifest: &Manifest) -> Result<(), InstallerError> {
    if manifest.schema != 1 {
        return Err(InstallerError::new(
            ErrorCode::ManifestSchema,
            "安装清单版本不受支持",
        )
        .with_detail(format!("schema = {}", manifest.schema)));
    }

    if parse_version(&manifest.version).is_none() {
        return Err(InstallerError::new(
            ErrorCode::ManifestSchema,
            "安装清单中的应用版本无效",
        )
        .with_detail(&manifest.version));
    }

    let min_bootstrapper = parse_version(&manifest.min_bootstrapper).ok_or_else(|| {
        InstallerError::new(ErrorCode::ManifestSchema, "安装清单中的最低启动器版本无效")
            .with_detail(&manifest.min_bootstrapper)
    })?;
    let current = parse_version(env!("CARGO_PKG_VERSION")).expect("crate version is valid semver");
    if min_bootstrapper > current {
        return Err(InstallerError::new(
            ErrorCode::BootstrapperTooOld,
            "当前安装器版本过旧，请下载最新安装器",
        )
        .with_detail(format!(
            "需要 {min_bootstrapper}，当前 {}",
            env!("CARGO_PKG_VERSION")
        )));
    }

    if !is_https(&manifest.payload.url) {
        return Err(InstallerError::new(
            ErrorCode::ManifestSchema,
            "安装包地址必须使用 HTTPS",
        )
        .with_detail(&manifest.payload.url));
    }
    for mirror in &manifest.payload.mirrors {
        if !is_https(mirror) {
            return Err(InstallerError::new(
                ErrorCode::ManifestSchema,
                "安装包镜像地址必须使用 HTTPS",
            )
            .with_detail(mirror));
        }
    }
    if !is_sha256_hex(&manifest.payload.sha256) {
        return Err(InstallerError::new(
            ErrorCode::ManifestSchema,
            "安装清单中的 SHA-256 无效",
        ));
    }
    if manifest.payload.size == 0 {
        return Err(InstallerError::new(
            ErrorCode::ManifestSchema,
            "安装清单中的安装包大小无效",
        ));
    }

    if let Some(notes_url) = &manifest.notes_url {
        if !is_https(notes_url) {
            return Err(InstallerError::new(
                ErrorCode::ManifestSchema,
                "更新说明地址必须使用 HTTPS",
            )
            .with_detail(notes_url));
        }
    }
    if let Some(update) = &manifest.update {
        for url in &update.base_urls {
            if !is_https(url) {
                return Err(InstallerError::new(
                    ErrorCode::ManifestSchema,
                    "更新服务地址必须使用 HTTPS",
                )
                .with_detail(url));
            }
        }
    }

    if manifest.features.len() > 4 {
        return Err(InstallerError::new(
            ErrorCode::ManifestSchema,
            "安装清单中的功能介绍过多",
        ));
    }
    for feature in &manifest.features {
        if feature.title.chars().count() > 40 || feature.body.chars().count() > 120 {
            return Err(InstallerError::new(
                ErrorCode::ManifestSchema,
                "安装清单中的功能介绍过长",
            ));
        }
    }

    Ok(())
}

pub async fn fetch(urls: Vec<String>) -> Result<Manifest, InstallerError> {
    if urls.is_empty() {
        return Err(InstallerError::new(
            ErrorCode::ManifestUnreachable,
            "没有可用的安装清单地址",
        ));
    }

    let client = reqwest::Client::builder()
        .user_agent(format!(
            "SorarinBot-Installer/{} (Windows)",
            env!("CARGO_PKG_VERSION")
        ))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(35))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| {
            InstallerError::new(ErrorCode::ManifestUnreachable, "无法初始化网络连接")
                .with_detail(error.to_string())
        })?;

    let mut last_error: Option<InstallerError> = None;
    for url in urls {
        if !is_https(&url) {
            last_error = Some(
                InstallerError::new(
                    ErrorCode::ManifestUnreachable,
                    "安装清单地址必须使用 HTTPS",
                )
                .with_detail(url),
            );
            continue;
        }

        crate::logging::write_log(format!("fetch_manifest {url}"));
        let response = match client.get(&url).send().await {
            Ok(response) => response,
            Err(error) => {
                crate::logging::write_log(format!("manifest network error: {error}"));
                last_error = Some(
                    InstallerError::new(ErrorCode::ManifestUnreachable, "无法连接安装清单地址")
                        .with_detail(format!("{url}: {error}")),
                );
                continue;
            }
        };

        if !response.status().is_success() {
            last_error = Some(
                InstallerError::new(ErrorCode::ManifestUnreachable, "安装清单地址返回了错误")
                    .with_detail(format!("{}: HTTP {}", url, response.status())),
            );
            continue;
        }

        if let Some(length) = response.content_length() {
            if length > 2 * 1024 * 1024 {
                last_error = Some(InstallerError::new(
                    ErrorCode::ManifestSchema,
                    "安装清单文件异常大",
                ));
                continue;
            }
        }

        let bytes = match response.bytes().await {
            Ok(bytes) => bytes,
            Err(error) => {
                last_error = Some(
                    InstallerError::new(ErrorCode::ManifestUnreachable, "读取安装清单失败")
                        .with_detail(format!("{url}: {error}")),
                );
                continue;
            }
        };
        if bytes.len() > 2 * 1024 * 1024 {
            return Err(InstallerError::new(
                ErrorCode::ManifestSchema,
                "安装清单文件异常大",
            ));
        }

        let manifest: Manifest = serde_json::from_slice(&bytes).map_err(|error| {
            InstallerError::new(ErrorCode::ManifestSchema, "安装清单格式无效")
                .with_detail(error.to_string())
        })?;
        validate(&manifest)?;
        return Ok(manifest);
    }

    Err(last_error.unwrap_or_else(|| {
        InstallerError::new(ErrorCode::ManifestUnreachable, "无法获取安装清单")
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_manifest() -> Manifest {
        serde_json::from_value(serde_json::json!({
            "schema": 1,
            "version": "3.1.0",
            "payload": {
                "url": "https://example.com/payload.exe",
                "mirrors": [],
                "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "size": 1
            },
            "minBootstrapper": "1.0.0",
            "features": []
        }))
        .unwrap()
    }

    #[test]
    fn accepts_valid_manifest() {
        assert!(validate(&valid_manifest()).is_ok());
    }

    #[test]
    fn rejects_schema_and_prerelease() {
        let mut manifest = valid_manifest();
        manifest.schema = 2;
        assert_eq!(
            validate(&manifest).unwrap_err().code,
            ErrorCode::ManifestSchema
        );

        let mut manifest = valid_manifest();
        manifest.version = "3.1.0-beta.1".into();
        assert_eq!(
            validate(&manifest).unwrap_err().code,
            ErrorCode::ManifestSchema
        );
    }

    #[test]
    fn rejects_plain_http_and_bad_hash() {
        let mut manifest = valid_manifest();
        manifest.payload.url = "http://example.com/payload.exe".into();
        assert_eq!(
            validate(&manifest).unwrap_err().code,
            ErrorCode::ManifestSchema
        );

        let mut manifest = valid_manifest();
        manifest.payload.sha256 = "ABC".into();
        assert_eq!(
            validate(&manifest).unwrap_err().code,
            ErrorCode::ManifestSchema
        );
    }

    #[test]
    fn rejects_newer_bootstrapper_requirement() {
        let mut manifest = valid_manifest();
        manifest.min_bootstrapper = "9.0.0".into();
        assert_eq!(
            validate(&manifest).unwrap_err().code,
            ErrorCode::BootstrapperTooOld
        );
    }
}
