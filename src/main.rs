use anyhow::{Context, Result};
use clap::Parser;
use minifb::{Key, Window, WindowOptions};
use rqrr::PreparedImage;
use rscam::{Camera, Config};
use std::time::Duration;

#[derive(Parser, Debug)]
#[command(name = "qreader", about = "Desktop QR reader using a webcam")]
struct Args {
    #[arg(short, long, default_value_t = 0)]
    camera: u32,

    #[arg(long, default_value_t = 640)]
    width: u32,

    #[arg(long, default_value_t = 480)]
    height: u32,

    #[arg(long, default_value_t = 3)]
    decode_every: u32,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let decode_every = args.decode_every.max(1) as u64;
    let width = args.width.max(1);
    let height = args.height.max(1);

    let device = format!("/dev/video{}", args.camera);
    let mut camera = Camera::new(&device)
        .with_context(|| format!("Failed to open camera device {}", device))?;

    camera
        .start(&Config {
            interval: (1, 30),
            resolution: (width, height),
            format: b"YUYV",
            ..Default::default()
        })
        .context("Failed to start camera stream")?;

    let mut window = Window::new(
        "QReader - No QR detected",
        width as usize,
        height as usize,
        WindowOptions::default(),
    )
    .context("Failed to create window")?;

    window.limit_update_rate(Some(Duration::from_micros(16_666)));

    let pixel_count = (width * height) as usize;
    let mut rgb = vec![0u32; pixel_count];
    let mut gray = vec![0u8; pixel_count];

    let mut frame_idx: u64 = 0;
    let mut last_text: Option<String> = None;
    let mut last_printed: Option<String> = None;
    let mut last_title = String::from("QReader - No QR detected");

    while window.is_open() {
        let frame = camera.capture().context("Failed to capture frame")?;
        let data = &frame[..];
        if data.len() < pixel_count * 2 {
            continue;
        }

        yuyv_to_buffers(data, &mut rgb, &mut gray);

        frame_idx += 1;
        if frame_idx % decode_every == 0 {
            if let Some(text) = decode_gray(&gray, width, height)? {
                last_text = Some(text.clone());
                if last_printed.as_deref() != Some(text.as_str()) {
                    println!("{}", text);
                    last_printed = Some(text);
                }
            }
        }

        let title = match &last_text {
            Some(text) => format!("QReader - {}", truncate_for_title(text, 60)),
            None => "QReader - No QR detected".to_string(),
        };
        if title != last_title {
            window.set_title(&title);
            last_title = title;
        }

        window
            .update_with_buffer(&rgb, width as usize, height as usize)
            .context("Failed to update window")?;

        if window.is_key_down(Key::Escape) {
            break;
        }
        if window.is_key_down(Key::C) {
            last_text = None;
            last_printed = None;
        }
    }

    Ok(())
}

fn yuyv_to_buffers(src: &[u8], rgb: &mut [u32], gray: &mut [u8]) {
    let mut src_idx = 0;
    let mut dst_idx = 0;

    while src_idx + 3 < src.len() && dst_idx + 1 < gray.len() {
        let y0 = src[src_idx];
        let y1 = src[src_idx + 2];

        gray[dst_idx] = y0;
        gray[dst_idx + 1] = y1;

        rgb[dst_idx] = luma_to_rgb(y0);
        rgb[dst_idx + 1] = luma_to_rgb(y1);

        src_idx += 4;
        dst_idx += 2;
    }
}

fn luma_to_rgb(luma: u8) -> u32 {
    let value = u32::from(luma);
    (value << 16) | (value << 8) | value
}

fn decode_gray(gray: &[u8], width: u32, height: u32) -> Result<Option<String>> {
    let gray_image = image::GrayImage::from_raw(width, height, gray.to_vec())
        .context("Failed to convert frame to GrayImage")?;

    let mut prepared = PreparedImage::prepare(gray_image);
    let grids = prepared.detect_grids();
    for grid in grids {
        if let Ok((_meta, content)) = grid.decode() {
            return Ok(Some(content));
        }
    }

    Ok(None)
}

fn truncate_for_title(input: &str, max_len: usize) -> String {
    let mut out = String::new();
    let mut iter = input.chars();

    for _ in 0..max_len {
        match iter.next() {
            Some(ch) => out.push(ch),
            None => return out,
        }
    }

    if iter.next().is_some() {
        if max_len > 3 {
            let keep = max_len - 3;
            out = out.chars().take(keep).collect();
            out.push_str("...");
        } else {
            out = "...".to_string();
        }
    }

    out
}
