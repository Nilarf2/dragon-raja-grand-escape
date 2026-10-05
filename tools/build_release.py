"""Package the browser game into dist without repository or development files."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
output = root / "dist"
output.mkdir(exist_ok=True)
for name in ("index.html", "LICENSE", "NOTICE.md"):
    shutil.copy2(root / name, output / name)
for name in ("css", "js", "lib", "docs/screenshots"):
    shutil.copytree(root / name, output / name, dirs_exist_ok=True)
print("Static release prepared at dist")
