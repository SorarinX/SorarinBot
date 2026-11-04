#[cfg(target_os = "windows")]
pub fn apply(window: &tauri::WebviewWindow) {
    use tauri::Theme;
    use window_vibrancy::{apply_acrylic, apply_mica};
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    };

    let tint = match window.theme() {
        Ok(Theme::Dark) => (18, 18, 18, 168),
        _ => (247, 247, 245, 176),
    };

    if apply_mica(window, None).is_err() {
        let _ = apply_acrylic(window, Some(tint));
    }

    // Windows 11 rounds frameless windows via DWM. On Windows 10 this returns
    // an error and the transparent CSS corners remain the fallback.
    if let Ok(hwnd) = window.hwnd() {
        let preference = DWMWCP_ROUND;
        let _ = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &preference as *const _ as *const _,
                std::mem::size_of_val(&preference) as u32,
            )
        };
    }

    crate::logging::write_log("window effects: mica/acrylic + rounded corners");
}

#[cfg(not(target_os = "windows"))]
pub fn apply(_window: &tauri::WebviewWindow) {}
