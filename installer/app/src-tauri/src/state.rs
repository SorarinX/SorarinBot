use std::sync::atomic::AtomicBool;
use std::sync::Arc;

/// Shared state for the one download that this bootstrapper can run at a time.
#[derive(Default, Clone)]
pub struct InstallerState {
    pub cancel: Arc<AtomicBool>,
    pub download_active: Arc<AtomicBool>,
}
