"""Capture the real dashboard and verify reproducible output. Run from the repo."""
from pathlib import Path
import json
import os
import shutil
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = '/home/noir/makefun-agent/radar-kit/token-radar-01-kit/input/snapshot.json'
os.chdir(ROOT)

def build(target, check=True):
    return subprocess.run(['node', 'main.ts', '--input', SNAPSHOT],
                          env={**os.environ, 'MAKEFUN_OUTPUT_DIR': target}, check=check)

scratch = ROOT / '.capture'
shots = ROOT / 'screenshots'
scratch.mkdir(exist_ok=True)
shots.mkdir(exist_ok=True)
try:
    build('out', check=False)  # Dashboard is emitted before screenshot validation.
    first = json.loads((ROOT / 'out/board.json').read_text())['rows'][0]
    url = (ROOT / 'out/dashboard/index.html').as_uri()
    for name, fragment in [('1-board', ''), ('2-detail', '#p/' + first['slug']), ('3-filtered', '#watchlist')]:
        png = scratch / (name + '.png')
        subprocess.run(['google-chrome', '--headless=new', '--no-sandbox', '--disable-gpu',
                        '--allow-file-access-from-files', '--window-size=1440,900',
                        '--virtual-time-budget=8000', '--user-data-dir=' + str(scratch / 'chrome'),
                        '--screenshot=' + str(png), url + fragment], check=True)
        with Image.open(png) as source:
            assert source.size == (1440, 900), source.size
            image = source.convert('RGB')
            jpg = shots / (name + '.jpg')
            image.save(jpg, quality=82)
            if jpg.stat().st_size > 524288:
                image.save(jpg, quality=75)
            assert jpg.stat().st_size <= 524288
            print(f'{jpg.name}: {jpg.stat().st_size} bytes; 1440x900')
    print(f'Detail: rank 1 {first["name"]} ({first["slug"]})')
    shutil.rmtree(ROOT / 'out')
    for target in ['out1', 'out2']:
        shutil.rmtree(ROOT / target, ignore_errors=True)
        build(target)
        assert (ROOT / target / 'dossier.json').is_file()
        subprocess.run(['node', 'scripts/check-output.mjs', SNAPSHOT, target], check=True)
    subprocess.run(['diff', '-r', 'out1', 'out2'], check=True)
    for target in ['out1', 'out2']:
        shutil.rmtree(ROOT / target)
    print('PASS: both dossiers exist; output trees are byte-identical.')
finally:
    shutil.rmtree(scratch, ignore_errors=True)
