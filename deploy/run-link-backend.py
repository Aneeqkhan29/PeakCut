"""Run only the authenticated video downloader, not the local personal PeakCut app."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
config = ROOT / '.env.link'
if not config.is_file():
    raise SystemExit('The private .env.link settings file is missing.')
for line in config.read_text(encoding='utf-8').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        name, value = line.split('=', 1)
        if name.startswith('PEAKCUT_LINK_'):
            os.environ[name] = value
if not os.environ.get('PEAKCUT_LINK_BACKEND_KEY'):
    raise SystemExit('The backend authentication key is missing.')
os.environ['PEAKCUT_LINK_REQUIRE_KEY'] = '1'
os.environ.pop('PEAKCUT_LINK_UPSTREAM', None)
import uvicorn
uvicorn.run('api.link:app', host='127.0.0.1', port=8767, proxy_headers=False, log_level='warning')
