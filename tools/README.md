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

## Sources and licences
- Elevation: 出典：国土地理院 標高タイル（加工して作成）. Source: Geospatial Information Authority of Japan (GSI)
  elevation tiles, processed. Used under the [GSI terms of use](https://maps.gsi.go.jp/development/ichiran.html).
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the
  Open Database Licence (ODbL 1.0). `osm.js` and `rail.js` are derived databases and are offered under the ODbL too.
