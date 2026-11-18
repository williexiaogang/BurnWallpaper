use std::sync::{Arc, Mutex};
use tauri::{PhysicalSize, Size, WebviewWindow, WindowEvent};

const MIN_WIDTH: u32 = 960;
const MIN_HEIGHT: u32 = 600;
const ASPECT_RATIO: f64 = 16.0 / 10.0;

fn constrained_size(current: (u32, u32), previous: (u32, u32)) -> (u32, u32) {
    let width = current.0.max(MIN_WIDTH);
    let height = current.1.max(MIN_HEIGHT);
    if width.abs_diff(previous.0) >= height.abs_diff(previous.1) {
        (width, ((width as f64 / ASPECT_RATIO).round() as u32).max(MIN_HEIGHT))
    } else {
        (((height as f64 * ASPECT_RATIO).round() as u32).max(MIN_WIDTH), height)
    }
}

pub fn enforce_main_window(window: &WebviewWindow) -> Result<(), tauri::Error> {
    window.set_min_size(Some(PhysicalSize::new(MIN_WIDTH, MIN_HEIGHT)))?;
    let initial = window.inner_size()?;
    let previous = Arc::new(Mutex::new((initial.width, initial.height)));
    let resizing = Arc::new(Mutex::new(false));
    let handle = window.clone();
    window.on_window_event(move |event| {
        let WindowEvent::Resized(size) = event else { return };
        if handle.is_maximized().unwrap_or(false) { return; }
        let current = (size.width, size.height);
        let Ok(last) = previous.lock().map(|value| *value) else { return };
        let next = constrained_size(current, last);
        if next == current {
            if let Ok(mut value) = previous.lock() {
                *value = current;
            }
            return;
        }
        if let Ok(mut value) = previous.lock() {
            *value = next;
        }
        let Ok(mut active) = resizing.lock() else { return };
        if *active { return; }
        *active = true;
        drop(active);
        let _ = handle.set_size(Size::Physical(PhysicalSize::new(next.0, next.1)));
        if let Ok(mut active) = resizing.lock() {
            *active = false;
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn width_resize_adjusts_height() {
        assert_eq!(constrained_size((1400, 800), (1280, 800)), (1400, 875));
    }

    #[test]
    fn height_resize_adjusts_width() {
        assert_eq!(constrained_size((1280, 900), (1280, 800)), (1440, 900));
    }

    #[test]
    fn size_never_falls_below_minimum() {
        assert_eq!(constrained_size((800, 500), (800, 500)), (960, 600));
    }

    #[test]
    fn correct_size_is_unchanged() {
        assert_eq!(constrained_size((1280, 800), (1280, 800)), (1280, 800));
    }
}
