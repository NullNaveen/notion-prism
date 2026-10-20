"""Create a runtime-only Chrome Web Store ZIP. Run from any directory."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
source = root / 'extension'
manifest = json.loads((source / 'manifest.json').read_text())
destination = root / 'dist' / f"prism-for-notion-{manifest['version']}.zip"
destination.parent.mkdir(exist_ok=True)
files = sorted(path for path in source.rglob('*') if path.is_file() and not any(part.startswith('.') for part in path.relative_to(source).parts))
with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.relative_to(source))
with ZipFile(destination) as archive:
    assert 'manifest.json' in archive.namelist()
    assert archive.testzip() is None
print(f'{destination}\n{len(files)} runtime files; {destination.stat().st_size:,} bytes')
