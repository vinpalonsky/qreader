# QReader

QR reader with a desktop Rust app and a mobile-friendly web scanner.

## Desktop App Prerequisites
- Rust toolchain (cargo and rustc)
- pkg-config
- X11 development headers (for the preview window)
- A V4L2 camera device (for example /dev/video0)

On Ubuntu or Debian:
```
sudo apt install pkg-config libx11-dev
```

## Build
```
cargo build
```

## Run
```
cargo run -- --camera 0 --width 640 --height 480 --decode-every 3
```

If the camera cannot be opened, make sure your user is in the video group and has access to /dev/video0.

## Controls
- Esc: quit
- C: clear last decoded value

## Mobile Web Scanner
The mobile web scanner lives in docs/. It uses the phone camera in the browser.

### Local Test
You must use HTTPS for camera access on phones. Use a tunnel or deploy to GitHub Pages.

If you only need to test on the same computer, you can open a local server and test on desktop:
```
cd docs
python3 -m http.server 8080
```

### GitHub Pages
Set GitHub Pages to use GitHub Actions, or add a PAT secret to enable it automatically.

- Manual: Repository Settings -> Pages -> Build and deployment -> Source: GitHub Actions.
- Automatic: Create a classic PAT with repo scope and add it as `PAGES_TOKEN`.

Then open the published URL on your phone.
