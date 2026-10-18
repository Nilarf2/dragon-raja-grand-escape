"""Common region configuration for data acquisition and offline conversion."""
import json
import os
from pathlib import Path
import re
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]

def load_region():
    path = Path(sys.argv[sys.argv.index('--region') + 1]) if '--region' in sys.argv else PROJECT_ROOT / 'content/scenes/baishinji/region.json'
    region = json.loads(path.read_text(encoding='utf-8'))
    if region.get('schemaVersion') != 1 or not re.fullmatch(r'[a-z0-9-]+', region.get('id', '')):
        raise ValueError('Unsupported region configuration')
    return region

REGION = load_region()
CACHE = os.environ.get('LONGZU_DATA_CACHE') or str(PROJECT_ROOT / 'tools/cache' / REGION['id'])
OUTPUT = str(PROJECT_ROOT / 'public/content' / REGION['id'])
