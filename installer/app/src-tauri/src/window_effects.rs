#[cfg(target_os = "windows")]
pub fn apply(window: &tauri::WebviewWindow) {
    use tauri::Theme;
    use window_vibrancy::{apply_acrylic, apply_mica};
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    };
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};
    use windows::Win32::UI::HiDpi::GetDpiForWindow;

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

        // DWM rounding is a hint; clip the actual window region as well so the
        // white WebView2 background can never show through the corners.
        if let Ok(size) = window.outer_size() {
            let dpi = unsafe { GetDpiForWindow(hwnd) };
            let radius = ((18.0 * dpi as f32 / 96.0).round() as i32).max(1);
            let region = unsafe {
                CreateRoundRectRgn(
                    0,
                    0,
                    size.width as i32 + 1,
                    size.height as i32 + 1,
                    radius * 2,
                    radius * 2,
                )
            };
            if !region.is_invalid() {
                let _ = unsafe { SetWindowRgn(hwnd, Some(region), true) };
            }
        }
    }

    crate::logging::write_log("window effects: mica/acrylic + rounded corners");
}

#[cfg(not(target_os = "windows"))]
pub fn apply(_window: &tauri::WebviewWindow) {}
