# [龙族] 迎着阳光盛大逃亡 · Dragon Raja: A Grand Escape into the Sun

**v0.4.0 · Harbor 0.2 application / Harbor 0.2 应用**

在真实地图和高程重建的松山梅津寺漫游，或体验从空地到末班车的 11 段剧情。本作是 Nilarf2 为江南《龙族 III》创作的非商业、非官方同人致敬，保留原有场景、交互、音乐、地图数据和存档格式。

Explore Baishinji, Matsuyama, reconstructed from real maps and elevation data, or follow an eleven-beat escape story. This is an unofficial, non-commercial fan tribute to Jiang Nan's *Dragon Raja III* by Nilarf2. It retains the original world, interactions, music, data and save format.

## 运行 / Run

需要 Node.js 22.12+。Requires Node.js 22.12+.

```sh
npm ci
npm run dev
# Production / 正式构建
npm run build
npm run preview
```

将 **整个 `dist/`** 发布到 HTTPS 静态托管；构建使用 `base: './'`，支持子目录。源码、`node_modules`、凭据和压缩包不属于部署内容。地图、模型、许可和 OIDN 权重均随产物提供；运行时不访问地图服务、模型服务或权重 CDN。OIDN 权重仅在精修开始时从本站加载。需要 HTTP/HTTPS，不能双击 `file://` 运行。

Deploy the **complete `dist/`** directory to HTTPS static hosting. Relative paths support subdirectories. Source, dependencies, credentials and archives are not deployment files. Maps, models, licenses and OIDN weights ship with the build; runtime uses no map service, model service or weights CDN. OIDN weights load lazily from the same origin. Use HTTP/HTTPS rather than `file://`.

## 玩法与画面 / Play and rendering

| 功能 / Function | 操作 / Control |
|---|---|
| 行走 / Walk · 奔跑 / Run | WASD / arrows · Shift; touch joystick |
| 视角 / Look · 缩放 / Zoom | Drag · wheel / touch |
| 坐下与交互 / Sit and interact | E / ✋ |
| 地点 / Places · 时间 / Time | G · 1–4 / T |
| 雨与海雾 / Rain and sea fog | R / F |
| 剧情继续 / Continue · 跳段 / Skip · 退出 / Leave | Space / click · N · Esc |
| 保存与恢复 / Save and restore | 保存 / Save · 继续 / Continue |
| 角色动作 / Character animations | 场景选择器 / Scene picker → Studio |

原生 WebGPU 默认进入“光线追踪 / Ray tracing”，采用完整画布分辨率与 15 次反弹。“实时 / Realtime”保留原始 Three.js WebGPU + TSL，兼容 WebGL2；`?view=raster` 可显式选择。完整保留地形、车站、街巷、三级建筑 LOD、天空、海水和天气，实时模式也保留 AO/SSR。

Native WebGPU defaults to ray tracing at full drawing-buffer resolution and fifteen bounces. Realtime preserves the original Three.js WebGPU/TSL world with WebGL2 compatibility; select it explicitly with `?view=raster`. Terrain, station, town, building LOD, sky, water and weather remain available, with AO/SSR retained in realtime mode.

最高画质目前是原型。GTX1070、8 GB 主机的完整场景初测每个光追帧约 0.8–1 秒，首次准备约 72 秒，进入新的建筑 LOD 区域重建约 57 秒；耗时也受 CPU、浏览器编译与缓存影响。准备期间保留栅格预览，同步 CPU 阶段暂时不能响应操作或取消。流畅游玩请预先选择实时模式或 `?view=raster`，避开光追准备；性能优化留待后续。

The highest quality mode is a prototype. On the tested GTX1070/8 GB host, full-scene ray-traced frames take approximately 0.8–1 second, first preparation about 72 seconds and a new building LOD rebuild about 57 seconds. CPU speed, browser compilation and caches also affect these timings. A raster preview remains visible; synchronous CPU preparation temporarily prevents input and cancellation. For interactive play, select Realtime or `?view=raster` before loading to avoid ray-tracing preparation. Performance tuning follows later.

“光线追踪 / Ray tracing”使用 Harbor 原生 WebGPU 路径追踪。Dragon 显式转换地形颜色、建筑 LOD、实体窗光、室内材质、水面与环境；任意 TSL 不会自动作为物理材质执行。天空、海岸泡沫、雨、云、花瓣与线条通过同相机的线性 HDR 分类合成；光追模式关闭额外 AO/SSR，最终统一调色和输出。未知自定义材质或不支持的变形会明确报告并保留实时模式。

Ray tracing uses Harbor's native WebGPU path tracer. Dragon explicitly adapts terrain colours, building LOD, physical windows, interiors, water and environment. Arbitrary TSL is not executed as a physical material automatically. Sky, shore foam, rain, clouds, petals and lines compose in linear HDR through the same camera; additional AO/SSR are disabled, with one final colour transform. Unsupported custom materials or deformation report a failure and retain realtime rendering.

“精修静帧 / Refine”冻结整个世界，等待所有像素至少达到 64 或 256 spp，再以同一设备上的 FP32 OIDN 去噪。继续世界、移动、切换动作或地点、推进剧情、改变天气和调整窗口会取消细化，恢复实时交互。高画质需要原生 WebGPU；实际显存/缓冲限制、设备丢失或权重错误会显示状态，不会通过删减场景伪装成功。

Refine freezes the complete simulation, waits until every pixel reaches 64 or 256 spp, and runs FP32 OIDN on the same GPU. Resume, movement, animation/location changes, story progression, weather changes and resizing cancel refinement and restore interaction. Native WebGPU is required. Memory limits, device loss and weight errors are reported explicitly.

旧存档继续使用 `dragon-raja.save.v1` 和原 schema 1；剧情从固定段落开头恢复。受限内嵌浏览器不能使用持久存储时，仍可临时保存，并提示刷新失效。

Existing saves keep `dragon-raja.save.v1` and schema 1. Story saves resume at a stable beat ID. Restricted embedded browsers retain temporary page saves and show that refreshing loses them.

## 内容与边界 / Content and limits

梅津寺有 9 个地点和 11 段剧情、21 个建筑变体、近远地形、车站、电车、D51、神社、崖边岩石和摩天轮。主场景原本没有正式人物模型，本次没有新增路明非或绘梨衣角色内容。Studio 仍只有原创 mannequin、9 根骨骼与 `idle / walk / run / sit / wave` 五段动作，承担真实骨骼和动画回归。

Baishinji contains nine places, eleven story beats, twenty-one building variants, terrain, station, trains, shrine, cliff and Ferris wheel. The main world has no finished character models; this release does not add Lu Mingfei or Erii character content. Studio retains the original nine-bone mannequin with five clips for animation validation.

正式角色美术、IK/重定向、NPC AI、无缝流式大世界、云存档、PWA 缓存不在本次范围。移动端与具体设备的画质和性能以实测记录为准。

Finished character art, IK/retargeting, NPC AI, seamless streaming, cloud saves and PWA caching are outside this release. Device compatibility and performance are stated only where measured.

## 开发与验证 / Development and validation

Harbor 通过 `vendor/harbor-engine-0.2.0.tgz` 和锁文件复现安装，不从其他仓库的 `src` 导入。Dragon 负责内容、资源构造器、玩法、镜头、存档 schema、原始渲染效果与发布；Harbor 负责应用生命周期、取消、共享资产、Actor、剧情运行器、空间索引和原生质量渲染。

Harbor installs reproducibly from the vendored tarball and lockfile, without cross-repository source imports. Dragon owns content, builders, gameplay, cameras, save schema, original effects and publishing. Harbor owns application lifecycle, cancellation, shared assets, actors, story progression, spatial indexing and native quality rendering.

```sh
npm test
npm run build
# Software regression; not hardware proof / 软件回归，不代表真实显卡验收
npm run test:browser
# Full-scene CPU acceleration preflight through the Vite dev server / 完整场景 CPU 加速构建前置验证
npm run test:quality:cpu
# Native GPU acceptance / 真实 GPU 验收
TEST_GPU=hardware TEST_URL=http://127.0.0.1:5179/ npm run test:browser
TEST_GPU=hardware TEST_SCENE=studio TEST_REFINE=1 npm run test:quality
TEST_GPU=hardware TEST_SCENE=baishinji TEST_REFINE=1 npm run test:quality
```

测试支持 `CHROMIUM_PATH`、`TEST_CDP`（复用已启动浏览器）和 `TEST_HEADED=1`；硬件模式拒绝 SwiftShader / fallback adapter。产物、适配器、剧情、场景和资源证据写入 `tests/artifacts/`。执行状态见 [验证记录](docs/VALIDATION.md)，平台映射与发布规则见 [发布记录](docs/PUBLISHING.md)。

Tests accept `CHROMIUM_PATH`, `TEST_CDP` and `TEST_HEADED=1`. Hardware mode rejects SwiftShader and fallback adapters. Evidence goes to `tests/artifacts/`; see [validation](docs/VALIDATION.md) and [publishing](docs/PUBLISHING.md).

`test:quality:cpu` uses the Vite development server and performs the actual upstream acceleration/material packing for the complete authored scene. It needs no GPU compute allocation. `TEST_REFERENCE=1 TEST_REFINE=1` on the hardware quality test additionally compares 64-spp raw/OIDN HDR against a 256-spp raw reference, recording MSE and edge energy. CPU preflight and raster fallback are never substitutes for full-scene hardware quality acceptance.

| 路径 / Path | 职责 / Responsibility |
|---|---|
| `src/app` | Harbor application host and bilingual controls |
| `src/core`, `src/world`, `src/assets`, `src/characters`, `src/narrative` | Public Harbor adapters + Dragon-specific save/content protocols |
| `src/rendering` | Original TSL raster, explicit PBR conversion and HDR compositor |
| `content`, `public/content` | Scenes, story, manifests, original JSON and GLB |
| `src/gameplay`, `src/audio`, `src/ui` | Original interactions, audio and presentation |
| `tools` | Original terrain/Blender asset pipeline; see [tools guide](tools/README.md) |

Useful URL options: `?scene=studio`, `?view=raster`, `?start&at=platform1&t=18.7`, `?story&beat=lastTrain`, `?lite`, `?fx=high|low|off`, `?nofx`, `?renderer=webgl`, `?still`, `?stats`.

## 作者与许可 / Credits and licenses

Nilarf2 创作；Claude 参与原场景、建筑与效果；Codex 参与 v0.3 模块化和 v0.4 Harbor 迁移与验证。代码 MIT。地图 © OpenStreetMap contributors（ODbL）；高程为加工后的国土地理院 GSI 数据；海底为合成。第三方引擎、路径追踪与 OIDN 许可见 [NOTICE.md](NOTICE.md) 和构建内 `licenses/`。

Created by Nilarf2, with Claude collaborating on the original world and effects, and Codex on the v0.3 runtime and v0.4 Harbor migration. Code is MIT. Map data © OpenStreetMap contributors (ODbL); processed elevation © GSI Japan; seabed is synthetic. See [NOTICE.md](NOTICE.md) and distributed `licenses/` for third-party terms.

非商业、非官方同人作品。《龙族》人物与故事属于江南及相关权利方；真实地名、公司和车站名称属于其权利人。This unofficial, non-commercial fan work is not affiliated with the rights holders. *Dragon Raja*, its characters and story belong to Jiang Nan and the relevant rights holders.
