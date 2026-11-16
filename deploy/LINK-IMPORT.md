# YouTube / Twitch link import

The browser studio posts a link to the same-origin `/api/link` endpoint. The download service validates and normalizes YouTube videos, Twitch recordings and Twitch clips, rejects live streams and playlists, fetches a bounded MP4, and streams it to the browser. The browser then selects a high-energy moment, optionally generates Whisper captions, and renders the short. A downloaded video never gives instructions to the application; titles are not executed or inserted as HTML.

Limits: one concurrent import per service instance, 20 minutes per source, 150 MB per download. Public videos only. Downloads are temporary and are deleted after the response. The endpoint rejects arbitrary hosts, credentials, nonstandard ports, redirects disguised as video links, oversized request bodies and cross-site browser requests.

## Vercel

`pyproject.toml` declares the small download API separately from the local desktop installation's `requirements.txt`. Vercel builds a Python function at `api/link.py`; FFmpeg is provided by imageio-ffmpeg. The build also packages the pinned Deno runtime inside the function, because the Python package's external CLI installation directory is not retained by the function packager. The frontend remains static.

YouTube can refuse a hosting network with a bot-verification response even when the downloader is correctly installed. This is an external restriction, not a browser rendering failure. Do not label that response successful or ask visitors to paste account cookies. Twitch and other links may still work. Error messages distinguish refusal, unavailability, size limits and invalid inputs.

## Separate downloader on an allowed network

The function supports these server-side environment variables:

- `PEAKCUT_LINK_UPSTREAM`: HTTPS origin of a separately hosted copy of this download API. The public Vercel function relays only the normalized video URL and streams the result.
- `PEAKCUT_LINK_BACKEND_KEY`: private shared key passed to the separate download service. Never put this value in browser JavaScript.
- `PEAKCUT_LINK_REQUIRE_KEY=1`: set on the separate service so it refuses requests without the shared key. Do not set this on the public website function.

Test downloads from the chosen server's network before switching the frontend over; moving to another data-center IP does not guarantee YouTube will accept it. Keep the personal PeakCut app on port 8765 private. The separate API exposes only the bounded link import routes.

`deploy/run-link-backend.py` reads private `.env.link` settings and starts this separate authenticated API on `127.0.0.1:8767`. It requires the existing Python dependencies plus yt-dlp, Node/Deno, and FFmpeg. Use a managed HTTPS reverse proxy on the intended server to reach it. The current local machine is not exposed by this repository or by the browser frontend.

For Hostinger, this API requires suitable server hosting (for example a VPS). Uploading the static ZIP alone does not install the Python API. Configure `/api/link` to reach the download service; static shared hosting needs an appropriate server-side bridge or reverse proxy. Keep SSH credentials and service keys outside the web root and Git.

## Verification

`python tests/test_link_import.py` checks URL boundaries, private-backend authentication, normalized forwarding, request rejection, streaming cleanup and platform refusals without contacting real platforms. `npm run test:browser` checks the browser link flow with a controlled response, including actual rendering, retry and error display. Those controlled tests do not prove a platform will permit downloads from a deployed server; test a real public link separately before claiming support works on a particular network.
