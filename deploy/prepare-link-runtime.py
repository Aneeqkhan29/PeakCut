"""Bundle the pinned Linux JS runtime where the Python function can execute it."""
import hashlib
import io
import json
import urllib.request
import zipfile
from pathlib import Path

VERSION = '2.9.8'
ROOT = Path(__file__).resolve().parent.parent
target = ROOT / 'api' / 'vendor' / 'deno'
with urllib.request.urlopen(f'https://pypi.org/pypi/deno/{VERSION}/json', timeout=30) as response:
    release = json.load(response)
asset = next(item for item in release['urls'] if item['filename'] == f'deno-{VERSION}-py3-none-manylinux_2_27_x86_64.whl')
with urllib.request.urlopen(asset['url'], timeout=90) as response:
    data = response.read()
if hashlib.sha256(data).hexdigest() != asset['digests']['sha256']:
    raise RuntimeError('The JavaScript runtime download failed its checksum.')
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    executable = next(name for name in archive.namelist() if name.endswith('.data/scripts/deno'))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(archive.read(executable))
target.chmod(0o755)
print(f'Prepared Deno {VERSION} for the link importer.')
