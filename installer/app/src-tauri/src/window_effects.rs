#[cfg(target_os = "windows")]
pub fn apply(window: &tauri::WebviewWindow) {
    use tauri::Theme;
    use window_vibrancy::{apply_acrylic, apply_mica};
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
        DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    };
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, SetWindowLongW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED,
        SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_BORDER, WS_CAPTION, WS_DLGFRAME,
        WS_THICKFRAME,
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

        // Windows 11 paints a 1px window border around every top-level window;
        // on a light desktop it reads as a white hairline around the rounded UI.
        let no_border = DWMWA_COLOR_NONE;
        let _ = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_BORDER_COLOR,
                &no_border as *const _ as *const _,
                std::mem::size_of_val(&no_border) as u32,
            )
        };

        // A frameless Tauri window still carries the Win32 resize frame on
        // Windows, which leaves an 8px white non-client border around the
        // webview. Remove the frame styles so the client area fills the window.
        let style = unsafe { GetWindowLongW(hwnd, GWL_STYLE) };
        let keep = !(WS_THICKFRAME.0 as i32
            | WS_CAPTION.0 as i32
            | WS_BORDER.0 as i32
            | WS_DLGFRAME.0 as i32);
        unsafe {
            SetWindowLongW(hwnd, GWL_STYLE, style & keep);
            let _ = SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
            );
        }

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
