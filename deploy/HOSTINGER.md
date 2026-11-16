# Hostinger: processing on the visitor's device

The browser edition is a static website. Hostinger serves HTML, JavaScript, fonts and WebAssembly; each visitor's browser reads and processes their own video. No Python app, account, database, AI key or background server is required for this edition.

**Video links are different:** the YouTube/Twitch link form requires `/api/link` on a working download backend. The static ZIP by itself supports local files, not server-side link downloads. See [LINK-IMPORT.md](LINK-IMPORT.md) before enabling link import on Hostinger. YouTube may refuse a server network even when the software is installed correctly.

## What works

- Choose a video, then press **Make short automatically** for moment selection, optional local captions and MP4 export in one operation. If the source has no usable audio or caption generation fails, export continues with a clear notice instead of stopping before an MP4 is produced.
- Import a local video up to 500 MB, trim a clip up to 180 seconds, and render H.264/AAC MP4.
- Vertical centre crop, fit with black bars, or original frame. Vertical export at 480 × 854 or 720 × 1280.
- Find a high-energy audio window; this is a loudness suggestion, not AI content ranking.
- Generate captions locally with Whisper Tiny, review/edit them, burn them into the MP4, and download SRT. English, Urdu, Hindi and other Whisper languages are supported by the model; accuracy varies.
- Add manual captions without downloading a speech model. No video or audio is sent to the server.

The browser edition does not implement YouTube downloads, live recording, account management, social posting or the desktop edition's AI content ranking. Long recordings and large files are better handled by the Python edition. Keep the tab open and download exports before leaving. Chrome or Edge on a desktop is recommended. Mobile memory and performance vary.

## Build the upload package

From the repository root, with Node.js installed on the build computer:

```powershell
npm ci --ignore-scripts
python deploy/package-hostinger.py --site-url https://onlinepeachstool.eu.cc
```

The archive is `artifacts/peakcut-hostinger.zip`. It contains the **contents** of the web root, including `.htaccess`, `app.html`, the video engine, model runtime, fonts and license notices. It excludes videos, settings and secrets. The speech model weights download directly from Hugging Face only when a visitor requests automatic captions; the model may be cached by their browser.

## Upload

1. Open the exact website's `public_html` folder through hPanel or SFTP. Back up the existing site and `.htaccess` first. Do not delete unrelated websites, email files, `.well-known`, or other domain folders.
2. Upload the archive and extract its contents directly into that domain's `public_html`. Alternatively, upload the contents of `dist/` over SFTP, including the hidden `.htaccess`. Do not upload the whole repository or `node_modules`.
3. Ensure the hostname has the DNS records provided for this Hostinger website and HTTPS is active. No DNS change is needed if the domain already points to the correct hosting account. Do not guess its hosting IP address.
4. Open `https://onlinepeachstool.eu.cc/app`. Choose a short video, generate or write captions, render and download. Check `.wasm` requests return `application/wasm` and `.mjs` requests return a JavaScript MIME type. The included `.htaccess` declares these types and maps extensionless pages.

The video engine uses single-thread WebAssembly, so COOP/COEP or SharedArrayBuffer headers are not required. All video processing assets are served from the same origin. The browser must be able to reach Hugging Face to download the optional caption model. Installing Node or Python on Hostinger is unnecessary.

## Validation

`npm run build` followed by `npm run test:browser` runs a real Chromium test using a generated video, verifies MP4 audio/video streams and dimensions with ffprobe, checks caption/SRT export, audio suggestions, cancellation/retry, mobile overflow and that processing made no upload requests. The Windows test expects Chrome and FFmpeg installed.

For the optional actual speech-model test:

```powershell
$env:RUN_CAPTIONS = '1'
npm run test:browser
```

This downloads a public speech fixture and Whisper model for testing. User media is not used.
