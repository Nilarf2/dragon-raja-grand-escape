# v0.4 — Harbor application / Harbor 应用迁移

Release candidate; actual GPU acceptance and platform status are recorded in VALIDATION.md and PUBLISHING.md.
候选发行；真实显卡验收与平台状态以对应记录为准。

Title / 标题：**[龙族] 迎着阳光盛大逃亡 · Dragon Raja: A Grand Escape into the Sun**

## Platform description / 平台介绍

在松山梅津寺的海岸、电车站和街巷中漫游，或体验 11 段《龙族》同人致敬剧情。保留 9 个地点、时间与天气、列车、摩天轮和原有存档。WASD / 方向键移动，鼠标拖动观察，E 交互，G 选择地点，空格推进剧情；触屏提供操作按钮。

Explore the coast, tram station and streets of Baishinji, Matsuyama, or follow an eleven-part Dragon Raja tribute story. Nine places, time, weather, trains, Ferris wheel and existing saves remain available. Move with WASD/arrows, drag to look, press E to interact, G for places and Space for story; touch controls are provided.

本次基于 Harbor 0.2 引擎迁移，原生 WebGPU 默认采用完整分辨率光线追踪；64/256 spp 静帧精修冻结世界并运行同设备 OIDN。实时模式保留原 TSL 画面，WebGL2 可兼容；具体设备能力以实测为准。Studio 提供既有原创 mannequin 的五段骨骼动作，未新增路明非或绘梨衣正式模型。

This Harbor 0.2 migration defaults to full-resolution native WebGPU ray tracing. Static refinement freezes the world for 64/256 spp and same-GPU OIDN. Realtime preserves the original TSL renderer with WebGL2 compatibility; device support depends on measured capabilities. Studio retains the original mannequin and its five skeletal clips; finished Lu Mingfei or Erii models are not added.

GTX1070 初测完整光追帧约 0.8–1 秒，画质模式目前不流畅；交互游玩可切换实时模式，后续再优化性能。

Initial GTX1070 full-scene ray-traced frames take about 0.8–1 second. Quality mode is currently slow; choose Realtime for interactive play. Performance tuning is deferred.

《龙族》同人、非官方作品；不代表原作作者、版权方或动画官方。地形、地图和第三方素材许可详见游戏内发行包 NOTICE.md。

An unofficial Dragon Raja fan tribute, unaffiliated with the author, rights holders or official animation. Terrain, map and third-party asset credits are included in NOTICE.md.

## Update note / 更新说明

v0.4：迁移为 Harbor 应用，保留完整梅津寺、9 地点、11 段剧情和 schema 1 存档；共享资产、Actor、剧情、空间索引与生命周期采用公共引擎接口。添加显式 PBR 材质转换、原生质量视图、64/256 spp 冻结精修与同设备 OIDN；中英双语标题和有效操作文案。原地图工具、素材许可、作品链接和展示媒体保留。

v0.4 migrates the complete game to Harbor while preserving Baishinji, nine places, eleven story beats and schema 1 saves. Shared assets, actors, story, spatial queries and lifecycle use public engine APIs. Adds explicit PBR adaptation, native quality rendering, frozen 64/256-spp refinement and same-device OIDN, with bilingual title and controls. Existing content tools, licenses, work links and display media are preserved.
