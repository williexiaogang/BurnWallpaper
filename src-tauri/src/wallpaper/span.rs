use std::path::Path;

use super::MonitorInfo;

pub fn write_slices(
    image_path: &str,
    monitors: &[MonitorInfo],
    dir: &Path,
) -> Result<Vec<(String, String)>, String> {
    let min_x = monitors.iter().map(|monitor| monitor.x).min().unwrap_or(0);
    let min_y = monitors.iter().map(|monitor| monitor.y).min().unwrap_or(0);
    let max_x = monitors
        .iter()
        .map(|monitor| monitor.x + monitor.width)
        .max()
        .unwrap_or(0);
    let max_y = monitors
        .iter()
        .map(|monitor| monitor.y + monitor.height)
        .max()
        .unwrap_or(0);
    let virtual_w = (max_x - min_x).max(1) as u32;
    let virtual_h = (max_y - min_y).max(1) as u32;
    let output_scale = monitors
        .iter()
        .map(|monitor| monitor.scale_factor)
        .filter(|scale| scale.is_finite() && *scale > 0.0)
        .fold(1.0_f64, f64::max);
    let canvas_w = (virtual_w as f64 * output_scale).round().max(1.0) as u32;
    let canvas_h = (virtual_h as f64 * output_scale).round().max(1.0) as u32;
    let source = image::open(image_path)
        .map_err(|e| format!("读取壁纸失败:{e}"))?
        .to_rgb8();
    let scaled = {
        let (sw, sh) = (source.width(), source.height());
        let scale = (canvas_w as f64 / sw as f64).max(canvas_h as f64 / sh as f64);
        let rw = (sw as f64 * scale).round().max(1.0) as u32;
        let rh = (sh as f64 * scale).round().max(1.0) as u32;
        let resized =
            image::imageops::resize(&source, rw, rh, image::imageops::FilterType::Lanczos3);
        let ox = rw.saturating_sub(canvas_w) / 2;
        let oy = rh.saturating_sub(canvas_h) / 2;
        image::imageops::crop_imm(&resized, ox, oy, canvas_w, canvas_h).to_image()
    };
    std::fs::create_dir_all(dir).map_err(|e| format!("准备跨屏切片目录失败:{e}"))?;
    let mut slices = Vec::with_capacity(monitors.len());
    for (index, monitor) in monitors.iter().enumerate() {
        let logical_w = monitor.width.max(1) as u32;
        let logical_h = monitor.height.max(1) as u32;
        let x = ((monitor.x - min_x).max(0) as f64 * output_scale).round() as u32;
        let y = ((monitor.y - min_y).max(0) as f64 * output_scale).round() as u32;
        let width = (logical_w as f64 * output_scale).round() as u32;
        let height = (logical_h as f64 * output_scale).round() as u32;
        let mut slice = image::imageops::crop_imm(
            &scaled,
            x.min(canvas_w - 1),
            y.min(canvas_h - 1),
            width.min(canvas_w.saturating_sub(x)).max(1),
            height.min(canvas_h.saturating_sub(y)).max(1),
        )
        .to_image();
        let monitor_scale = if monitor.scale_factor.is_finite() && monitor.scale_factor > 0.0 {
            monitor.scale_factor
        } else {
            1.0
        };
        let pixel_w = (logical_w as f64 * monitor_scale).round().max(1.0) as u32;
        let pixel_h = (logical_h as f64 * monitor_scale).round().max(1.0) as u32;
        if slice.width() != pixel_w || slice.height() != pixel_h {
            slice = image::imageops::resize(
                &slice,
                pixel_w,
                pixel_h,
                image::imageops::FilterType::Lanczos3,
            );
        }
        let slice_path = dir.join(format!("slice-{index}.png"));
        slice
            .save(&slice_path)
            .map_err(|e| format!("写入跨屏切片失败:{e}"))?;
        slices.push((
            monitor.device_path.clone(),
            slice_path.to_string_lossy().into_owned(),
        ));
    }
    Ok(slices)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_retina_slices_at_native_pixel_sizes() {
        let dir = std::env::temp_dir().join(format!("burn-span-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("source.png");
        image::RgbImage::from_pixel(400, 200, image::Rgb([20, 40, 60]))
            .save(&source)
            .unwrap();
        let monitors = vec![
            MonitorInfo {
                device_path: "left".into(),
                width: 200,
                height: 200,
                x: 0,
                y: 0,
                scale_factor: 1.0,
            },
            MonitorInfo {
                device_path: "right".into(),
                width: 200,
                height: 200,
                x: 200,
                y: 0,
                scale_factor: 2.0,
            },
        ];

        let slices = write_slices(source.to_str().unwrap(), &monitors, &dir).unwrap();

        assert_eq!(image::open(&slices[0].1).unwrap().width(), 200);
        assert_eq!(image::open(&slices[1].1).unwrap().width(), 400);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
