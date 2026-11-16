# Vercel with a separate PeakCut server

The website is deployed at https://peakcut-ochre.vercel.app and connected to the GitHub repository. The current `vercel.json` builds the landing page and browser studio at `/app` with `node deploy/build-vercel.mjs`. The browser studio processes videos on the visitor's own device and does not require the Python backend. See [HOSTINGER.md](HOSTINGER.md) for browser-edition features and static Hostinger deployment. Generated files in `dist/` are ignored by Git. Private settings, data and Python dependencies are excluded from Vercel uploads through `.vercelignore`.

The remaining instructions apply only if you want the full **Python edition**, including live recording and social posting. Its background queue and files need a persistent server. Replacing the browser build with the backend proxy forwards all requests to that server and removes the browser edition from this deployment. Vercel Functions do not perform video processing in either setup.

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
.\deploy\Prepare-Vercel.ps1 -BackendUrl https://backend.example.com -ReplaceStatic
```

This creates `vercel.json`, with a route forwarding all requests to your backend. Review the generated hostname, then:

```powershell
npx vercel --prod
```

Select the intended Vercel account/project. After deployment, set the backend's `PEAKCUT_PUBLIC_URL` to the returned production URL, restart it, and check `/healthz`, sign-up, sign-in, an upload and a completed clip through Vercel. Check Vercel's current proxy/upload limits before choosing large upload chunk sizes. For large uploads or long-lived connections, using the backend's own HTTPS domain directly may be preferable.

Commit the updated `vercel.json` to switch the connected Vercel project from the informational website to the backend proxy. Never add `.env`, `.venv`, `data`, OAuth secrets or AI keys to Git. Verify backend behavior through the production domain after switching.
