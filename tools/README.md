# Data pipeline (longzu/0002)

The game never downloads anything. These two scripts turn real-world data into the plain `.js` files in `../js/data/`.
They are already built and committed, so **you only need this to change the area or the anchors.**

```
pip install -r requirements.txt     # numpy
python fetch_data.py                # GSI elevation tiles + OpenStreetMap → cache/   (about 17 MB, not committed)
python build_data.py                # cache/ → ../js/data/*.js
```

| Output | What it is |
|---|---|
| `terrain_near.js` | 5 m height grid, 1.9 × 2 km around the station (GSI `dem5a`, gaps filled from `dem`) |
| `terrain_far.js` | 120 m grid, 48 × 48 km with the Inland Sea islands (GSI `dem` z14 + z11); sea depth is synthesized from the distance to the shore |
| `geo.js` | the local frame: origin = Baishinji station (33.874975 N, 132.7074333 E), +X east, +Z south, 1 unit = 1 m |
| `osm.js` | buildings, roads, paths, land-use areas, lines and points of interest |
| `rail.js` | the Iyotetsu Takahama line; both station tracks are straightened through the platforms (`station` frame) |
| `anchors.js` | where the novel's places sit: station, parking lot, Ferris wheel, school, shrine, hill tram, the rock… (edit `A = dict(...)` in `build_data.py`) |

Notes:
- `fetch_data.py` asks Overpass for the map **as it was on 2026-10-04**, so the railway way IDs in `build_data.py` still match.
  If the dated query fails, it falls back to today's data and says so. `--latest` asks for today's data directly;
  `--dem-only` / `--osm-only` fetch one half.
- Running both scripts on the 2026-10-04 data reproduces the committed files byte-for-byte.
- The public Overpass servers are often busy (HTTP 504). Wait a few minutes and run `python fetch_data.py --osm-only` again.

## Town buildings (Blender)

`town_build.py` builds the library of town buildings with Blender 3.4 (headless, CPU only) and writes
`../js/data/models_town.js`. The geometry is generated in plain Python (`town_lib.py`: walls with real window openings,
kawara roofs, ridges, railings…; `town_buildings.py`: the house, shop, apartment and warehouse types and the variant
list). Blender bakes ambient occlusion with Cycles into each face corner, and the script packs everything as base64
(Int16 positions in millimetres, a shared colour palette, AO, the part to recolour, the window id) in three levels of
detail, plus an inverted-hull outline shell.

```
blender -b --python town_build.py -- --samples 16                       # rebuild ../js/data/models_town.js
blender -b --python town_build.py -- --only hip2_skirt --preview out.png  # render a Cycles preview of some variants
```

The output is deterministic: the same scripts give the same file. The game (`../js/models.js`) fits a variant to each
footprint, scales it a little, picks the colours per house and switches the levels of detail.

## Sources and licences
- Elevation: 出典：国土地理院 標高タイル（加工して作成）. Source: Geospatial Information Authority of Japan (GSI)
  elevation tiles, processed. Used under the [GSI terms of use](https://maps.gsi.go.jp/development/ichiran.html).
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the
  Open Database Licence (ODbL 1.0). `osm.js` and `rail.js` are derived databases and are offered under the ODbL too.
