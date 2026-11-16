# Vercel with a separate PeakCut server

PeakCut's FFmpeg work, speech model, background queue and saved files run on a persistent server. This setup uses Vercel only to forward requests to that server; it does not run video processing in Vercel Functions.

## Run on this Windows computer

From the repository folder:

```powershell
.\Start-PeakCut.ps1
```

Open http://127.0.0.1:8765. Keep the process running while using the app. Set your AI service in Settings, AI. Without a key, clip selection uses loudness. The speech model downloads on first start. Local settings, videos and models are ignored by Git.

For the repository tests on Windows, enable UTF-8 so Hindi and Urdu output can be printed:

```powershell
$env:PYTHONUTF8 = '1'
.\.venv\Scripts\python.exe tests/run.py
```

## Prepare the backend

Follow [DEPLOY.md](../DEPLOY.md) on your Linux server. Use its Docker deployment with accounts enabled, persistent volumes, PostgreSQL and HTTPS. Keep one app process. Do not expose the local account-free server to the internet.

Use a separate origin such as `https://backend.example.com`. Verify `/healthz` there before configuring Vercel. Set `PEAKCUT_PUBLIC_URL` on the backend to the final Vercel/custom-domain URL, and use that public URL for OAuth callbacks. Restart the backend after changing settings. The origin URL must point directly to the backend, never back to Vercel.

## Prepare and publish Vercel

Run from the repository folder once the real HTTPS backend is available:

```powershell
.\deploy\Prepare-Vercel.ps1 -BackendUrl https://backend.example.com
```

This creates `vercel.json`, with a route forwarding all requests to your backend. Review the generated hostname, then:

```powershell
npx vercel --prod
```

Select the intended Vercel account/project. After deployment, set the backend's `PEAKCUT_PUBLIC_URL` to the returned production URL, restart it, and check `/healthz`, sign-up, sign-in, an upload and a completed clip through Vercel. Check Vercel's current proxy/upload limits before choosing large upload chunk sizes. For large uploads or long-lived connections, using the backend's own HTTPS domain directly may be preferable.

Commit `vercel.json` and connect the GitHub repository in Vercel if you want subsequent pushes to deploy automatically. Never add `.env`, `.venv`, `data`, OAuth secrets or AI keys to Git. No live Vercel deployment is created until the backend is available.
