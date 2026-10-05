#!/usr/bin/env python3
"""Build longzu/0002/js/data/*.js from the raw data in tools/cache/ (run fetch_data.py first).

Writes plain .js files (no fetch, so the game runs from file://):
  terrain_near.js  5 m height grid, 1.9 x 2 km around the station (Int16 base64, 0.1 m units)
  terrain_far.js   120 m grid, 48 x 48 km with the islands (0.5 m units); sea depth is synthesized
  geo.js           the local frame: origin = Baishinji station, +X east, +Z south, metres
  osm.js           buildings, roads, paths, areas, lines and POIs from OpenStreetMap
  rail.js          the Takahama line, with both station tracks straightened through the platforms
  anchors.js       where the novel's places sit (station, lot, Ferris wheel, shrine, hill tram, rock...)

Change anchors here, not in the generated files.
Usage:  python build_data.py [--out DIR]      (default: ../js/data)
"""
import json, math, base64, sys, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.environ.get('LONGZU_DATA_CACHE') or os.path.join(HERE, 'cache')   # override with an env var to keep the cache elsewhere
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(HERE, '..', 'js', 'data')
os.makedirs(OUT, exist_ok=True)

# ---------- local frame (equirectangular around the station) ----------
lat0, lon0 = 33.874975, 132.7074333
phi = math.radians(lat0)
MLAT = 111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
MLON = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi) + 0.118 * math.cos(5 * phi)
def xz(lat, lon): return ((lon - lon0) * MLON, -(lat - lat0) * MLAT)

class DEM:
    def __init__(s, f):
        p = os.path.join(CACHE, f)
        if not os.path.exists(p): sys.exit(f'{p} is missing: run fetch_data.py first')
        d = np.load(p); s.A = d['A']; s.X0 = int(d['X0']); s.Y0 = int(d['Y0']); s.z = int(d['z'])

D5, D14, D11 = DEM('dem5a_z15.npz'), DEM('dem_z14.npz'), DEM('dem_z11.npz')

def grid_h(dems, xs, zs):
    """Vectorised bilinear sample, first non-NaN DEM wins. Returns array (nz,nx)."""
    X, Z = np.meshgrid(xs, zs)
    lat = lat0 - Z / MLAT; lon = lon0 + X / MLON
    out = np.full(X.shape, np.nan)
    for d in dems:
        n = 2 ** d.z
        tx = (lon + 180) / 360 * n
        ty = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2 * n
        px = (tx - d.X0) * 256 - 0.5; py = (ty - d.Y0) * 256 - 0.5
        j = np.floor(px).astype(int); i = np.floor(py).astype(int); fx = px - j; fy = py - i
        ok = (i >= 0) & (j >= 0) & (i + 1 < d.A.shape[0]) & (j + 1 < d.A.shape[1])
        i = np.clip(i, 0, d.A.shape[0] - 2); j = np.clip(j, 0, d.A.shape[1] - 2)
        A = d.A
        a, b, c, e = A[i, j], A[i, j + 1], A[i + 1, j], A[i + 1, j + 1]
        v = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + e * fx * fy
        take = np.isnan(out) & ok & ~np.isnan(v)
        out[take] = v[take]
    return out

def dist_transform(land, cell):
    """Chamfer distance (m) from land cells, for sea depth."""
    INF = 1e9; d = np.where(land, 0.0, INF); nz, nx = d.shape; s2 = cell * 1.4142
    for i in range(nz):
        row = d[i]
        if i > 0:
            up = d[i - 1]
            row[:] = np.minimum(row, up + cell)
            row[1:] = np.minimum(row[1:], up[:-1] + s2); row[:-1] = np.minimum(row[:-1], up[1:] + s2)
        for j in range(1, nx): row[j] = min(row[j], row[j - 1] + cell)
        for j in range(nx - 2, -1, -1): row[j] = min(row[j], row[j + 1] + cell)
    for i in range(nz - 2, -1, -1):
        row = d[i]; dn = d[i + 1]
        row[:] = np.minimum(row, dn + cell)
        row[1:] = np.minimum(row[1:], dn[:-1] + s2); row[:-1] = np.minimum(row[:-1], dn[1:] + s2)
        for j in range(1, nx): row[j] = min(row[j], row[j - 1] + cell)
        for j in range(nx - 2, -1, -1): row[j] = min(row[j], row[j + 1] + cell)
    return d

def seabed(d):
    # gravel beach shelf then gentle Seto Inland Sea floor (~-20..-40 m)
    return -(0.4 + np.minimum(d * 0.07, 2.5) + np.maximum(d - 35, 0) * 0.02 + np.maximum(d - 600, 0) * 0.008).clip(0, 45)

def pack(H, unit):
    v = np.clip(np.round(H / unit), -32768, 32767).astype('<i2')
    return base64.b64encode(v.tobytes()).decode()

GSI = '// Elevation: 出典：国土地理院 標高タイル（https://maps.gsi.go.jp/development/ichiran.html）を加工して作成\n'
OSM = '// Map data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). This file is a derived database under the ODbL.\n'
def write(name, js, credit=''):
    open(os.path.join(OUT, name), 'w', encoding='utf-8').write(credit + js); print(name, len(js) // 1024, 'KB')

def jnum(v): return float('%.1f' % v)

# ---------- terrain grids ----------
NEAR = dict(x0=-1000, z0=-1200, dx=5, nx=381, nz=401)
FAR = dict(x0=-24000, z0=-24000, dx=120, nx=401, nz=401)
def make_grid(g, dems, unit):
    xs = g['x0'] + np.arange(g['nx']) * g['dx']; zs = g['z0'] + np.arange(g['nz']) * g['dx']
    H = grid_h(dems, xs, zs)
    land = ~np.isnan(H) & (H > 0.05)
    d = dist_transform(land, g['dx'])
    H = np.where(land, np.maximum(H, 0.3), seabed(d))
    return H, xs, zs
Hn, xs_n, zs_n = make_grid(NEAR, [D5, D14, D11], 0.1)
Hf, _, _ = make_grid(FAR, [D14, D11], 0.5)
for name, g, H, unit in (('terrain_near.js', NEAR, Hn, 0.1), ('terrain_far.js', FAR, Hf, 0.5)):
    key = 'terrainNear' if 'near' in name else 'terrainFar'
    write(name, '(function(C){C.DATA=C.DATA||{};C.DATA.%s=%s;})(window.CITY);\n' % (key, json.dumps(dict(g, unit=unit, b64=pack(H, unit)))), GSI)
def hn(x, z):
    fx = (x - NEAR['x0']) / NEAR['dx']; fz = (z - NEAR['z0']) / NEAR['dx']
    j, i = int(fx), int(fz); fx -= j; fz -= i
    if not (0 <= i < NEAR['nz'] - 1 and 0 <= j < NEAR['nx'] - 1): return 0.0
    return float(Hn[i, j] * (1 - fx) * (1 - fz) + Hn[i, j + 1] * fx * (1 - fz) + Hn[i + 1, j] * (1 - fx) * fz + Hn[i + 1, j + 1] * fx * fz)

# ---------- geo ----------
write('geo.js', '''(function(C){C.DATA=C.DATA||{};
C.GEO={lat0:%r,lon0:%r,mLat:%r,mLon:%r,
toLocal(lat,lon){return[(lon-this.lon0)*this.mLon,-(lat-this.lat0)*this.mLat];},
toLatLon(x,z){return[this.lat0-z/this.mLat,this.lon0+x/this.mLon];}};})(window.CITY);
''' % (lat0, lon0, round(MLAT, 2), round(MLON, 2)))

# ---------- OSM ----------
E = json.load(open(os.path.join(CACHE, 'osm.json'), encoding='utf-8'))['elements']
BX0, BX1, BZ0, BZ1 = NEAR['x0'], NEAR['x0'] + (NEAR['nx'] - 1) * 5, NEAR['z0'], NEAR['z0'] + (NEAR['nz'] - 1) * 5
def inb(x, z, m=0): return BX0 - m <= x <= BX1 + m and BZ0 - m <= z <= BZ1 + m
def flat(g): return [jnum(v) for p in g for v in p]
ROADW = dict(trunk=10, trunk_link=7, primary=9, secondary=7.5, tertiary=6.5, unclassified=4.5, residential=4, service=3.5, living_street=3.5)
PATHW = dict(footway=1.8, path=1.4, steps=2, track=2.6, pedestrian=3, cycleway=2)
osm = dict(buildings=[], roads=[], paths=[], areas=[], lines=[], pois=[])
for e in E:
    t = e.get('tags', {})
    if e['type'] == 'node':
        x, z = xz(e['lat'], e['lon'])
        if not inb(x, z): continue
        k = next((f'{a}={t[a]}' for a in ('railway', 'amenity', 'natural', 'historic', 'tourism', 'man_made', 'highway', 'shop', 'leisure', 'barrier') if a in t), None)
        if k: osm['pois'].append(dict(x=jnum(x), z=jnum(z), k=k, n=t.get('name', '')))
        continue
    if e['type'] != 'way': continue
    g = [xz(p['lat'], p['lon']) for p in e.get('geometry', []) if p]
    if len(g) < 2 or not any(inb(x, z, 50) for x, z in g): continue
    n = t.get('name', '')
    if 'building' in t:
        if len(g) > 3 and g[0] == g[-1]: g = g[:-1]
        lv = t.get('building:levels'); h = t.get('height')
        osm['buildings'].append(dict(p=flat(g), lv=int(float(lv)) if lv else 0, h=float(h) if h else 0, k=t['building'], n=n))
    elif 'highway' in t:
        hw = t['highway']
        if hw in ROADW: osm['roads'].append(dict(p=flat(g), k=hw, w=float(t.get('width', ROADW[hw])) if t.get('width', '').replace('.', '').isdigit() else ROADW[hw], n=n))
        elif hw in PATHW: osm['paths'].append(dict(p=flat(g), k=hw, w=PATHW[hw]))
    elif any(a in t for a in ('landuse', 'leisure', 'amenity', 'natural')) and g[0] == g[-1]:
        k = next(f'{a}={t[a]}' for a in ('landuse', 'leisure', 'amenity', 'natural') if a in t)
        osm['areas'].append(dict(p=flat(g[:-1]), k=k, n=n))
    else:
        k = next((f'{a}={t[a]}' for a in ('natural', 'waterway', 'man_made', 'barrier', 'railway', 'power') if a in t), None)
        if k and k != 'railway=rail': osm['lines'].append(dict(p=flat(g), k=k, n=n))
write('osm.js', '(function(C){C.DATA=C.DATA||{};C.DATA.osm=%s;})(window.CITY);\n' % json.dumps(osm, ensure_ascii=False, separators=(',', ':')), OSM)
print({k: len(v) for k, v in osm.items()})

# ---------- rail ----------
ways = {e['id']: [xz(p['lat'], p['lon']) for p in e['geometry'] if p] for e in E if e['type'] == 'way' and e.get('tags', {}).get('railway') == 'rail'}
def resample(pts, step=2.0):
    pts = np.array(pts); seg = np.linalg.norm(np.diff(pts, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(seg)])
    S = np.arange(0, s[-1], step); S = np.append(S, s[-1])
    return np.stack([np.interp(S, s, pts[:, 0]), np.interp(S, s, pts[:, 1])], 1)
single = ways[1306182598] + ways[24412535][1:]                     # Takahama buffer → station north throat (-25,-35)
tA = ways[1306182597] + ways[173249000][1:]                         # east track (platform 1) → Minatoyama
tB = (ways[1306182596][::-1]) + ways[173249005][::-1][1:]           # west track (platform 2)
# station frame: straighten both tracks through the platforms (OSM wobbles ±0.5 m)
ST = dict(x0=-10.5, z0=-5.5, rot=0.50209, n0=0.2, half=1.8, s0=-2.0, s1=112.0, blend=14.0)
def snap(P, side):
    c, sn = math.cos(ST['rot']), math.sin(ST['rot']); out = []
    for x, z in P:
        dx, dz = x - ST['x0'], z - ST['z0']; sv = dx * sn + dz * c; nv = dx * c - dz * sn
        k = 1 - min(1, max(0, max(ST['s0'] - sv, sv - ST['s1']) / ST['blend']))
        nt = ST['n0'] + side * ST['half']; nv = nv + (nt - nv) * (k * k * (3 - 2 * k))
        out.append((ST['x0'] + nv * c + sv * sn, ST['z0'] - nv * sn + sv * c))
    return out
tA = snap(resample(tA, 2.0), 1); tB = snap(resample(tB, 2.0), -1)
A1, B1 = resample(tA, 1.0), resample(tB, 1.0)
m = min(len(A1), len(B1)); idx_a = np.linspace(0, len(A1) - 1, m).astype(int); idx_b = np.linspace(0, len(B1) - 1, m).astype(int)
mid = (A1[idx_a] + B1[idx_b]) / 2
centre = resample(np.concatenate([np.array(single), mid[1:]]), 2.0)
def rail_y(P):
    y = np.array([hn(x, z) for x, z in P]); y = np.maximum(y, 3.2)
    k = 25; ys = np.convolve(np.pad(y, k, mode='edge'), np.ones(2 * k + 1) / (2 * k + 1), mode='same')[k:-k]
    return ys + 0.6
cy = rail_y(centre)
def arc_at(P, x, z):
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(seg)])
    return float(s[np.argmin(np.hypot(P[:, 0] - x, P[:, 1] - z))])
def track(P):
    P = resample(P, 2.0); y = np.interp(np.arange(len(P)), np.arange(len(P)), rail_y(P))
    return [jnum(v) for i in range(len(P)) for v in (P[i, 0], y[i], P[i, 1])]
cross = []
seen = []
for e in E:
    if e['type'] == 'node' and e.get('tags', {}).get('railway') == 'level_crossing':
        x, z = xz(e['lat'], e['lon'])
        if any(math.hypot(x - a, z - b) < 8 for a, b in seen) or not inb(x, z): continue
        seen.append((x, z)); i = int(np.argmin(np.hypot(centre[:, 0] - x, centre[:, 1] - z)))
        d = centre[min(i + 1, len(centre) - 1)] - centre[max(i - 1, 0)]
        cross.append(dict(x=jnum(x), z=jnum(z), rot=round(math.atan2(d[0], d[1]), 3), w=5 if math.hypot(x, z) > 20 else 6))
rail = dict(centre=[jnum(v) for i in range(len(centre)) for v in (centre[i, 0], cy[i], centre[i, 1])],
            tracks=[dict(id='single', p=track(single)), dict(id='east', p=track(tA)), dict(id='west', p=track(tB))],
            stops=dict(takahama=arc_at(centre, -489, -925), baishinji=arc_at(centre, 12, 40), minatoyama=arc_at(centre, 538, 605)),
            crossings=cross, station=ST)
write('rail.js', '(function(C){C.DATA=C.DATA||{};C.DATA.rail=%s;})(window.CITY);\n' % json.dumps(rail, separators=(',', ':')), OSM + GSI)
print('rail len', len(centre) * 2, 'stops', rail['stops'], 'crossings', len(cross))

# ---------- anchors ----------
def bearing_rot(b): r = math.radians(b); return round(math.atan2(math.sin(r), -math.cos(r)), 3)
A = dict(station=(3.5, 20, 151), parkingLot=(50, 30, 151), ferrisWheel=(-262, -247, 0), school=(152, -132, 180), loco=(20, -57, 151),
         shrine=(80, -340, 250), tramBase=(92, -352, 160), tramTop=(122, -575, 172), mineShrine=(126, -602, 290),
         jizo=(123, -588, 290), cliffRock=(104, -590, 290))
anchors = {k: dict(x=x, y=round(hn(x, z), 2), z=z, rot=bearing_rot(b)) for k, (x, z, b) in A.items()}
anchors['station']['y'] = round(float(np.interp(arc_at(centre, 3.5, 20), np.arange(len(centre)) * 2.0, cy)), 2)
write('anchors.js', '(function(C){C.ANCHORS=%s;})(window.CITY);\n' % json.dumps(anchors), GSI)
for k, v in anchors.items(): print(k, v)
