# 内容生产工具

运行游戏直接使用 `public/content/` 中已提交的资源。只有修改地区或模型时才需要以下工具。命令均从仓库根目录执行。

## 地形与地图

```bash
python -m venv .venv
.venv/bin/pip install -r tools/terrain/requirements.txt
.venv/bin/python tools/terrain/fetch_data.py --region content/scenes/baishinji/region.json
.venv/bin/python tools/terrain/build_data.py --region content/scenes/baishinji/region.json
npm run validate
```

`content/scenes/<region>/region.json` 记录 schemaVersion、地区 ID、坐标原点、地图范围、快照日期、DEM 瓦片范围、近远景网格、铁路 way ID、站台坐标和剧情锚点。缓存默认位于 `tools/cache/<region>/`，可由 `LONGZU_DATA_CACHE` 覆盖；输出为 `public/content/<region>/`。`build_data.py --out DIR` 可另选输出目录。

| 输出 | 内容 |
|---|---|
| `geo.json` | 本地米制坐标：+X 东、+Z 南 |
| `terrain_near.json` | 近景 Int16 高程网格，base64 数据 |
| `terrain_far.json` | 远景高程与合成海底 |
| `osm.json` | 建筑、道路、区域和兴趣点 |
| `rail.json` | 铁路线与车站坐标系 |
| `anchors.json` | 地点与剧情布置锚点 |

抓取默认请求配置指定日期的 Overpass 快照；失败后允许回退最新数据并打印提示。`--latest` 直接请求最新数据，`--dem-only` / `--osm-only` 只抓取对应部分。实际请求端点、快照与回退信息写入缓存的 `source.json`，不要将回退结果误标为历史快照。铁路 way ID 缺失时转换会失败，需要检查地区配置。

当前转换器面向 GSI 的 `dem5a_z15`、`dem_z14`、`dem_z11` 三层数据及既有铁路组织方式。新日本地区可以复用配置和转换器；其他国家数据源或不同铁路拓扑需要新增转换适配器。梅津寺特有的修整地形和建筑布置仍在其 `builders/` 内，配置不是一键生成任意完整地区的编辑器。

本次迁移只将已有数据从脚本封装转换为 JSON，未重新下载地图或高程。重新抓取会受上游数据、历史可用性和依赖版本影响，不承诺重建字节完全相同。

## Blender 建筑管线

```bash
blender -b --python tools/blender/town_build.py -- --samples 16
blender -b --python tools/blender/town_build.py -- --only hip2_skirt --preview /tmp/house.png --out /tmp/house.json
```

`town_buildings.py` 与 `town_lib.py` 生成建筑几何；`town_build.py` 使用 Cycles 烘焙顶点 AO，导出默认文件 `public/content/baishinji/models_town.json`。支持 `--out FILE`。保留原来的毫米 Int16 位置、颜色调色板、AO、重着色分区、窗户 ID、三级 LOD 与轮廓壳。

原管线面向 Blender 3.4；本轮只校验 Python 语法与已生成资源，未重新烘焙，未验证更新的 Blender API。`--only` 输出部分变体，预览时请用独立 `--out`，避免覆盖完整库。

## GLB 角色与动画

仓库内的测试角色由代码原创生成，无外部模型下载：

```bash
node tools/blender/create-demo-character.mjs
npm run validate
```

输出 `public/content/characters/mannequin.glb`，包含 9 根骨骼和 `idle`、`walk`、`run`、`sit`、`wave` 五个动作。这是验证导入、独立骨架、动作混合和销毁的占位模型。

正式角色可从 Blender 导出 glTF 2.0 / GLB，统一采用米制、Y 向上，并在导出前检查骨骼与动作名称。将 GLB 放入 `public/content/characters/`，在场景清单声明资源、`skinned` 与必需的 `animations`，通过 AssetManager 获取并创建 Actor。默认加载器暂未配置 Draco、Meshopt 或 KTX2 解码器；使用这些压缩格式前需明确加入对应解码器和资源。

## 校验与来源

`npm run validate` 检查场景 ID、入口、资源路径、JSON、GLB 头、声明的骨架与动作、地形网格长度、建筑变体和 LOD。构建自动执行此检查。

地图数据 © OpenStreetMap contributors，`osm.json` 和 `rail.json` 是 ODbL 派生数据库。高程来自 GSI（加工して作成）；详情及许可链接见 [NOTICE.md](../NOTICE.md)。
