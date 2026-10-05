#!/usr/bin/env python3
"""Download the raw data for longzu/0002 into tools/cache/ (not committed).

Elevation, from the GSI elevation tiles (標高タイル, text format), mosaicked into .npz grids:
    dem5a z15  5 m laser DEM      tiles x 28461-28464, y 13101-13104  (the town and the hill)
    dem   z14  10 m DEM           tiles x 14228-14232, y 6550-6552    (the wider coast)
    dem   z11  about 76 m         tiles x 1777-1780,   y 817-820      (the Inland Sea islands)
Map data, from the OpenStreetMap Overpass API, bbox 33.862-33.888 N, 132.692-132.722 E.
By default it asks for the data as it was on 2026-10-04 (when the game was built), so the
railway way IDs in build_data.py still match. Use --latest for today's data.

Credits: 出典：国土地理院 標高タイル（加工して作成）· © OpenStreetMap contributors (ODbL 1.0)

Usage:  python fetch_data.py [--latest] [--dem-only | --osm-only]      then      python build_data.py
"""
import os, sys, json, time, urllib.request, urllib.parse, urllib.error
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.environ.get('LONGZU_DATA_CACHE') or os.path.join(HERE, 'cache')   # override with an env var to keep the cache elsewhere
UA = {'User-Agent': 'LONGZU-data-pipeline/1.0 (offline fan game; one-off download)'}

DEMS = [  # (layer, zoom, x0, x1, y0, y1)
    ('dem5a', 15, 28461, 28464, 13101, 13104),
    ('dem', 14, 14228, 14232, 6550, 6552),
    ('dem', 11, 1777, 1780, 817, 820),
]
BBOX = (33.862, 132.692, 33.888, 132.722)
DATE = '2026-10-04T12:00:00Z'
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
            'https://maps.mail.ru/osm/tools/overpass/api/interpreter']


def tile(layer, z, x, y):
    """One 256x256 tile as floats; NaN where there is no data (sea). Cached as the raw text."""
    d = os.path.join(CACHE, 'tiles', layer, str(z)); os.makedirs(d, exist_ok=True)
    p = os.path.join(d, f'{x}_{y}.txt')
    if not os.path.exists(p):
        url = f'https://cyberjapandata.gsi.go.jp/xyz/{layer}/{z}/{x}/{y}.txt'
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()
        except urllib.error.HTTPError as e:
            if e.code != 404: raise
            data = b''  # 404 = all sea, no tile
        open(p, 'wb').write(data); time.sleep(0.2)
    s = open(p, encoding='ascii').read().strip()
    if not s: return np.full((256, 256), np.nan)
    return np.array([[float(v) if v.strip() != 'e' else np.nan for v in r.split(',')] for r in s.splitlines()])


def fetch_dem(layer, z, x0, x1, y0, y1):
    A = np.full(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256), np.nan)
    for X in range(x0, x1 + 1):
        for Y in range(y0, y1 + 1):
            A[(Y - y0) * 256:(Y - y0 + 1) * 256, (X - x0) * 256:(X - x0 + 1) * 256] = tile(layer, z, X, Y)
    out = os.path.join(CACHE, f'{layer}_z{z}.npz')
    np.savez_compressed(out, A=A, X0=x0, Y0=y0, z=z)
    print(f'{out}: {A.shape}, {np.nanmin(A):.1f} .. {np.nanmax(A):.1f} m, {np.isnan(A).mean():.0%} sea')


def fetch_osm(latest):
    b = ','.join(map(str, BBOX))
    body = f'''(
  way({b});
  node({b})[~"."~"."];
  relation({b})[natural];
  relation({b})[landuse];
  relation({b})[building];
);
out body geom qt;'''
    # Dated ("attic") queries are heavier and some servers refuse them; fall back to today's data.
    tries = [(u, False) for u in OVERPASS] if latest else [(u, True) for u in OVERPASS] + [(u, False) for u in OVERPASS]
    for url, dated in tries:
        q = '[out:json][timeout:120]' + (f'[date:"{DATE}"]' if dated else '') + ';' + body
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, data=urllib.parse.urlencode({'data': q}).encode(), headers=UA), timeout=180).read()
            n = len(json.loads(data)['elements'])
        except Exception as e:
            print(f'{url}{" (dated)" if dated else ""} failed: {e}'); time.sleep(5); continue
        open(os.path.join(CACHE, 'osm.json'), 'wb').write(data)
        print(f'osm.json: {n} elements from {url}' + ('' if dated else
              '\n  (current data: if build_data.py stops at a railway way ID, look up the new IDs on openstreetmap.org)'))
        return
    sys.exit('Overpass download failed (the public servers are often busy); try again later.')


if __name__ == '__main__':
    os.makedirs(CACHE, exist_ok=True)
    if '--osm-only' not in sys.argv:
        for d in DEMS: fetch_dem(*d)
    if '--dem-only' not in sys.argv:
        fetch_osm('--latest' in sys.argv)
