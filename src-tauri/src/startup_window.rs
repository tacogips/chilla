use std::time::{Duration, Instant};

use tauri::{LogicalSize, Manager, PhysicalPosition, PhysicalRect, PhysicalSize, WebviewWindow};

#[derive(Debug, PartialEq)]
struct FittedWindow {
    inner_size: PhysicalSize<u32>,
    outer_size: PhysicalSize<u32>,
    position: PhysicalPosition<i32>,
    minimum: PhysicalSize<u32>,
}

fn fit_window(
    area: PhysicalRect<i32, u32>,
    position: PhysicalPosition<i32>,
    outer: PhysicalSize<u32>,
    inner: PhysicalSize<u32>,
    minimum: PhysicalSize<u32>,
) -> FittedWindow {
    let border = PhysicalSize::new(
        outer.width.saturating_sub(inner.width),
        outer.height.saturating_sub(inner.height),
    );
    let available = PhysicalSize::new(
        area.size.width.saturating_sub(border.width).max(1),
        area.size.height.saturating_sub(border.height).max(1),
    );
    let minimum = PhysicalSize::new(
        minimum.width.min(available.width),
        minimum.height.min(available.height),
    );
    let inner_size = PhysicalSize::new(
        inner.width.min(available.width).max(minimum.width),
        inner.height.min(available.height).max(minimum.height),
    );
    let outer_size = PhysicalSize::new(
        inner_size.width.saturating_add(border.width),
        inner_size.height.saturating_add(border.height),
    );
    FittedWindow {
        inner_size,
        outer_size,
        position: PhysicalPosition::new(
            fit_axis(
                position.x,
                area.position.x,
                area.size.width,
                outer_size.width,
            ),
            fit_axis(
                position.y,
                area.position.y,
                area.size.height,
                outer_size.height,
            ),
        ),
        minimum,
    }
}

fn fit_axis(position: i32, origin: i32, available: u32, size: u32) -> i32 {
    let end = i64::from(origin) + i64::from(available.saturating_sub(size));
    i64::from(position).clamp(i64::from(origin), end.min(i64::from(i32::MAX))) as i32
}

// Runs on a blocking worker so native event processing can apply size/position
// changes before readback and before the hidden startup window is shown.
pub(super) fn clamp_main_window_to_work_area(window: &WebviewWindow) -> tauri::Result<bool> {
    let monitor = match window.current_monitor()? {
        Some(monitor) => Some(monitor),
        None => window.primary_monitor()?,
    };
    let Some(monitor) = monitor else {
        return Ok(false);
    };
    let area = monitor_work_area(window, &monitor)?;
    if area.size.width == 0 || area.size.height == 0 {
        return Ok(false);
    }
    let outer = window.outer_size()?;
    let inner = window.inner_size()?;
    let position = window.outer_position()?;
    let config = window
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == window.label());
    let minimum = LogicalSize::new(
        config.and_then(|config| config.min_width).unwrap_or(0.0),
        config.and_then(|config| config.min_height).unwrap_or(0.0),
    )
    .to_physical(window.scale_factor()?);
    let fitted = fit_window(area, position, outer, inner, minimum);
    if fitted.minimum != minimum {
        window.set_min_size(Some(fitted.minimum))?;
    }
    let resized = fitted.inner_size != inner;
    if resized {
        window.set_size(fitted.inner_size)?;
    }
    if resized || fitted.position != position {
        // Compute position from the requested size, not an immediate readback:
        // macOS queues native size and position changes asynchronously.
        window.set_position(fitted.position)?;
        let deadline = Instant::now() + Duration::from_millis(500);
        loop {
            if window.outer_size()? == fitted.outer_size
                && window.outer_position()? == fitted.position
            {
                return Ok(true);
            }
            if Instant::now() >= deadline {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "startup window bounds were not applied before the visibility deadline",
                )
                .into());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    Ok(false)
}

#[cfg(not(target_os = "macos"))]
fn monitor_work_area(
    _window: &WebviewWindow,
    monitor: &tauri::Monitor,
) -> tauri::Result<PhysicalRect<i32, u32>> {
    Ok(*monitor.work_area())
}

#[cfg(target_os = "macos")]
fn monitor_work_area(
    window: &WebviewWindow,
    monitor: &tauri::Monitor,
) -> tauri::Result<PhysicalRect<i32, u32>> {
    let monitor = monitor.clone();
    let (sender, receiver) = std::sync::mpsc::channel();
    window.run_on_main_thread(move || {
        let area = objc2::MainThreadMarker::new()
            .and_then(|marker| {
                let screens = objc2_app_kit::NSScreen::screens(marker);
                let primary = screens.firstObject()?;
                let primary_top = primary.frame().origin.y + primary.frame().size.height;
                screens.iter().find_map(|screen| {
                    let frame = screen.frame();
                    let scale = screen.backingScaleFactor();
                    let origin = macos_top_left(
                        frame.origin.x,
                        frame.origin.y,
                        frame.size.height,
                        primary_top,
                        scale,
                    );
                    if origin != *monitor.position() {
                        return None;
                    }
                    // Tauri 2.10's macOS work_area omits the top inset. Use the
                    // complete native visible frame (menu bar, notch, and Dock).
                    let visible = screen.visibleFrame();
                    Some(PhysicalRect {
                        position: macos_top_left(
                            visible.origin.x,
                            visible.origin.y,
                            visible.size.height,
                            primary_top,
                            scale,
                        ),
                        size: LogicalSize::new(visible.size.width, visible.size.height)
                            .to_physical(scale),
                    })
                })
            })
            .unwrap_or(*monitor.work_area());
        // The worker may already have exited if application shutdown began.
        let _ = sender.send(area);
    })?;
    receiver
        .recv_timeout(Duration::from_millis(500))
        .map_err(|error| std::io::Error::other(error).into())
}

#[cfg(any(target_os = "macos", test))]
fn macos_top_left(
    x: f64,
    y: f64,
    height: f64,
    primary_top: f64,
    scale: f64,
) -> PhysicalPosition<i32> {
    tauri::LogicalPosition::new(x, primary_top - y - height).to_physical(scale)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_visible_frame_preserves_menu_bar_and_dock_offsets() {
        // 33-point menu bar plus a 60-point bottom Dock on a Retina screen.
        assert_eq!(
            macos_top_left(0.0, 60.0, 863.0, 956.0, 2.0),
            PhysicalPosition::new(0, 66)
        );
        // Secondary screen to the left and above the primary display.
        assert_eq!(
            macos_top_left(-1280.0, 956.0, 800.0, 956.0, 2.0),
            PhysicalPosition::new(-2560, -1600)
        );
    }

    fn fit(area: PhysicalRect<i32, u32>, x: i32, y: i32, width: u32, height: u32) -> FittedWindow {
        fit_window(
            area,
            PhysicalPosition::new(x, y),
            PhysicalSize::new(width, height),
            PhysicalSize::new(width, height),
            PhysicalSize::new(960, 640),
        )
    }

    fn area(x: i32, y: i32, width: u32, height: u32) -> PhysicalRect<i32, u32> {
        PhysicalRect {
            position: PhysicalPosition::new(x, y),
            size: PhysicalSize::new(width, height),
        }
    }

    #[test]
    fn preserves_window_already_inside_work_area() {
        let fitted = fit(area(0, 33, 1920, 1047), 100, 80, 1480, 920);
        assert_eq!(fitted.position, PhysicalPosition::new(100, 80));
        assert_eq!(fitted.inner_size, PhysicalSize::new(1480, 920));
    }

    #[test]
    fn corrects_position_without_resizing() {
        let fitted = fit(area(0, 33, 1920, 1047), 600, -20, 1480, 920);
        assert_eq!(fitted.position, PhysicalPosition::new(440, 33));
        assert_eq!(fitted.inner_size, PhysicalSize::new(1480, 920));
    }

    #[test]
    fn oversized_window_fills_offset_work_area() {
        let fitted = fit(area(-1280, -780, 1280, 760), 0, 0, 1480, 920);
        assert_eq!(fitted.position, PhysicalPosition::new(-1280, -780));
        assert_eq!(fitted.outer_size, PhysicalSize::new(1280, 760));
    }

    #[test]
    fn reduces_minimum_for_small_scaled_screens_and_accounts_for_frame() {
        for scale in [1.0, 1.5, 2.0] {
            let work_size = LogicalSize::new(800.0, 600.0).to_physical(scale);
            let inner = LogicalSize::new(1480.0, 920.0).to_physical::<u32>(scale);
            let border = LogicalSize::new(8.0, 28.0).to_physical::<u32>(scale);
            let minimum = LogicalSize::new(960.0, 640.0).to_physical(scale);
            let fitted = fit_window(
                PhysicalRect {
                    position: PhysicalPosition::new(0, 66),
                    size: work_size,
                },
                PhysicalPosition::new(0, 0),
                PhysicalSize::new(inner.width + border.width, inner.height + border.height),
                inner,
                minimum,
            );
            assert_eq!(fitted.outer_size, work_size);
            assert_eq!(
                fitted.minimum,
                PhysicalSize::new(
                    work_size.width - border.width,
                    work_size.height - border.height
                )
            );
            assert_eq!(fitted.position, PhysicalPosition::new(0, 66));
        }
    }

    #[test]
    fn positive_monitor_origin_and_large_coordinates_do_not_overflow() {
        let fitted = fit(area(1920, 100, 1600, 900), 4000, 1000, 1000, 700);
        assert_eq!(fitted.position, PhysicalPosition::new(2520, 300));
        assert_eq!(fit_axis(i32::MAX, i32::MAX - 100, u32::MAX, 10), i32::MAX);
    }
}
