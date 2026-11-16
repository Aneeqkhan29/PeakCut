"""Import a bounded public video; browser-side rendering stays on the visitor's device."""
import json
import logging
import hmac
import os
import re
import shutil
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import urllib.request
import urllib.error

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
_slot = threading.BoundedSemaphore(1)
MAX_BYTES = 150 * 1024 * 1024
MAX_SECONDS = 20 * 60


def normalize_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError('Paste a YouTube video or Twitch video/clip link.')
    try:
        u = urlparse(value.strip())
        host = (u.hostname or '').lower()
        if u.scheme != 'https' or u.username or u.password or u.port not in (None, 443):
            raise ValueError()
    except ValueError:
        raise ValueError('Use a public HTTPS YouTube or Twitch video link.') from None
    if host == 'youtu.be':
        identifier = u.path.strip('/')
    elif host in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'):
        if u.path == '/watch':
            identifier = parse_qs(u.query).get('v', [''])[0]
        else:
            match = re.fullmatch(r'/(?:shorts|embed|live)/([A-Za-z0-9_-]{11})/?', u.path)
            identifier = match[1] if match else ''
    else:
        identifier = None
    if identifier is not None:
        if not re.fullmatch(r'[A-Za-z0-9_-]{11}', identifier):
            raise ValueError('Use a single YouTube video link, not a channel or playlist.')
        return 'https://www.youtube.com/watch?v=' + identifier
    if host in ('twitch.tv', 'www.twitch.tv'):
        if re.fullmatch(r'/videos/\d+/?', u.path) or re.fullmatch(r'/[A-Za-z0-9_]+/clip/[A-Za-z0-9_-]+/?', u.path):
            return 'https://www.twitch.tv' + u.path.rstrip('/')
    if host == 'clips.twitch.tv' and re.fullmatch(r'/[A-Za-z0-9_-]+/?', u.path):
        return 'https://clips.twitch.tv' + u.path.rstrip('/')
    raise ValueError('Use a YouTube video, Twitch recording or Twitch clip. Live channels and arbitrary websites are not supported.')


def download_video(url, folder):
    import yt_dlp
    ffmpeg_path = shutil.which('ffmpeg')
    if not ffmpeg_path:
        import imageio_ffmpeg
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()

    deadline = time.monotonic() + 190

    def progress(data):
        if time.monotonic() > deadline:
            raise ValueError('The import took too long. Try a shorter video.')
        size = max(data.get('downloaded_bytes') or 0, data.get('total_bytes') or 0, data.get('total_bytes_estimate') or 0)
        if size > MAX_BYTES:
            raise ValueError('The video is too large to import. Use a video under 150 MB or choose a local file.')

    def check_video(info, *, incomplete=False):
        if info.get('is_live') or info.get('live_status') == 'is_live':
            return 'Live streams are not supported. Paste a finished recording or clip.'
        if (info.get('duration') or 0) > MAX_SECONDS:
            return 'Link import supports videos up to 20 minutes. Choose a shorter clip or import a local video file.'
        if (info.get('filesize') or info.get('filesize_approx') or 0) > MAX_BYTES:
            return 'The video exceeds the 150 MB link import limit.'
        return None

    runtime = {}
    bundled = Path(__file__).resolve().parent / 'vendor' / 'deno'
    if bundled.is_file():
        runtime['deno'] = {'path': str(bundled)}
    elif shutil.which('deno'):
        runtime['deno'] = {'path': shutil.which('deno')}
    elif shutil.which('node'):
        runtime['node'] = {'path': shutil.which('node')}
    options = {
        'noplaylist': True, 'playlistend': 1, 'quiet': True, 'no_warnings': True,
        'socket_timeout': 15, 'retries': 1, 'fragment_retries': 1,
        'extractor_retries': 1, 'concurrent_fragment_downloads': 2,
        'cachedir': False, 'max_filesize': MAX_BYTES,
        'format': 'bv*[height<=480][vcodec^=avc1]+ba[ext=m4a]/b[height<=480]/b',
        'outtmpl': str(folder / 'source.%(ext)s'),
        'merge_output_format': 'mp4',
        'ffmpeg_location': ffmpeg_path,
        'postprocessors': [{'key': 'FFmpegVideoRemuxer', 'preferedformat': 'mp4'}],
        'progress_hooks': [progress], 'match_filter': check_video,
        'js_runtimes': runtime,
        'remote_components': {'ejs:github'},
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=True)
    if not info or info.get('_type') in ('playlist', 'multi_video'):
        raise ValueError('A single public video is required.')
    file = folder / 'source.mp4'
    if not file.is_file() or not file.stat().st_size:
        raise ValueError('The platform did not provide a downloadable video. Try another public video or choose a local file.')
    if file.stat().st_size > MAX_BYTES:
        raise ValueError('The downloaded video exceeds 150 MB. Choose a shorter video.')
    return file


@app.get('/api/link')
def health():
    return {'ok': True, 'max_minutes': 20, 'max_mb': 150, 'platforms': ['youtube', 'twitch']}


@app.post('/api/link')
async def import_video(request: Request):
    if os.environ.get('PEAKCUT_LINK_REQUIRE_KEY') == '1':
        expected = os.environ.get('PEAKCUT_LINK_BACKEND_KEY', '')
        supplied = request.headers.get('x-peakcut-backend-key', '')
        if not expected or not hmac.compare_digest(supplied, expected):
            raise HTTPException(401, 'Download service authentication required.')
    origin = request.headers.get('origin')
    if origin and urlparse(origin).netloc != request.headers.get('host'):
        raise HTTPException(403, 'Open link import from this website.')
    try:
        size = int(request.headers.get('content-length', '0'))
    except ValueError:
        raise HTTPException(400, 'Invalid request size.') from None
    if size > 4096:
        raise HTTPException(413, 'The request is too large.')
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 4096:
            raise HTTPException(413, 'The request is too large.')
    try:
        body = json.loads(raw)
        if not isinstance(body, dict):
            raise ValueError('Paste a video link.')
        url = normalize_url(body.get('url'))
    except (ValueError, TypeError) as error:
        raise HTTPException(400, str(error)) from None
    if not _slot.acquire(blocking=False):
        raise HTTPException(429, 'Another link is importing. Please try again in a moment.')
    folder = Path(tempfile.mkdtemp(prefix='peakcut-link-'))
    remote = None

    def cleanup():
        if remote is not None:
            remote.close()
        shutil.rmtree(folder, ignore_errors=True)
        _slot.release()

    try:
        from fastapi.concurrency import run_in_threadpool
        upstream = os.environ.get('PEAKCUT_LINK_UPSTREAM', '').rstrip('/')
        if upstream:
            parsed = urlparse(upstream)
            if parsed.scheme != 'https' or not parsed.netloc or parsed.path or parsed.username or parsed.password:
                raise ValueError('The download service address is not configured correctly.')
            req = urllib.request.Request(upstream + '/api/link', data=json.dumps({'url': url}).encode(), headers={
                'Content-Type': 'application/json',
                'X-PeakCut-Backend-Key': os.environ.get('PEAKCUT_LINK_BACKEND_KEY', ''),
            }, method='POST')
            try:
                remote = await run_in_threadpool(urllib.request.urlopen, req, timeout=210)
            except urllib.error.HTTPError as error:
                try:
                    detail = json.loads(error.read(4096)).get('detail')
                except (ValueError, TypeError):
                    detail = None
                finally:
                    error.close()
                raise HTTPException(error.code if error.code in (400, 413, 422, 429) else 503, detail or 'The download service is temporarily unavailable. Try again later or choose a video file.') from None
            except OSError:
                raise HTTPException(503, 'The download service is offline. Try again later or choose a local video file.') from None
            size = int(remote.headers.get('content-length', '0'))
            if size > MAX_BYTES or not remote.headers.get('content-type', '').startswith('video/'):
                raise ValueError('The download service returned an invalid or oversized video.')

            def remote_stream():
                received = 0
                while chunk := remote.read(256 * 1024):
                    received += len(chunk)
                    if received > MAX_BYTES:
                        raise ValueError('The imported video exceeds the size limit.')
                    yield chunk

            headers = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}
            if size:
                headers['Content-Length'] = str(size)
            return StreamingResponse(remote_stream(), media_type='video/mp4', headers=headers, background=BackgroundTask(cleanup))
        file = await run_in_threadpool(download_video, url, folder)
    except HTTPException:
        cleanup()
        raise
    except Exception as error:
        cleanup()
        logging.getLogger('peakcut.link').error('Video import failed: %s: %s', type(error).__name__, str(error)[:1200])
        message = str(error)
        if re.search(r'not a bot|confirm you.?re not|sign in to confirm', message, re.I):
            message = 'YouTube refused downloads from this hosting server. A download backend on an allowed network is required; local video import still works.'
        elif 'private' in message.lower() or 'login' in message.lower():
            message = 'This video needs a login. Only public videos can be imported.'
        elif isinstance(error, FileNotFoundError):
            message = 'The download server is missing its video runtime. Local video import still works.'
        elif not isinstance(error, ValueError):
            message = 'The platform did not allow this import. The video may be unavailable or restricted. Try another public link or choose a local video file.'
        raise HTTPException(422, message, headers={'X-PeakCut-Error': type(error).__name__}) from None

    def stream():
        with file.open('rb') as video:
            while chunk := video.read(256 * 1024):
                yield chunk

    return StreamingResponse(stream(), media_type='video/mp4', headers={
        'Content-Length': str(file.stat().st_size),
        'Content-Disposition': 'attachment; filename="peakcut-import.mp4"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
    }, background=BackgroundTask(cleanup))
