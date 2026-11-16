"""Build a static browser studio archive; no video files or secrets are packaged."""
import argparse
import os
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--site-url', default='https://onlinepeachstool.eu.cc')
    args = parser.parse_args()
    subprocess.run(['node', 'deploy/build-vercel.mjs'], cwd=ROOT,
                   env={**os.environ, 'BROWSER_SITE_URL': args.site_url}, check=True)
    output = ROOT / 'artifacts' / 'peakcut-hostinger.zip'
    output.parent.mkdir(exist_ok=True)
    dist = ROOT / 'dist'
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for item in sorted(dist.rglob('*')):
            if item.is_file():
                archive.write(item, item.relative_to(dist).as_posix())
    with zipfile.ZipFile(output) as archive:
        names = archive.namelist()
        assert '.htaccess' in names and 'app.html' in names
        assert 'vendor/core/ffmpeg-core.wasm' in names
        assert all(not name.startswith(('.env', 'data/', 'secrets/', '.venv/')) for name in names)
    print(f'Hostinger package: {output}')
    print(f'{len(names)} files, {output.stat().st_size / 1024 / 1024:.1f} MB; extract contents into the domain public_html folder.')


if __name__ == '__main__':
    main()
