# 运行框架与内容扩展

v0.3-alpha，2026-10-18。目标是让地点、剧情与角色独立增长，同时保留已有梅津寺内容。这里的“后端升级”指浏览器中的运行框架；仓库没有新增应用服务端。

## 依赖方向

```text
app ── world/registry ── lazy import content/scenes/<id>
 │                           │
 ├─ renderer                 ├─ scene-specific builders + places
 ├─ AssetManager             ├─ chapter content → StoryRunner + commands + view
 ├─ SceneManager             ├─ Actor → AnimationMixer + cloned skeleton
 ├─ UpdateLoop               └─ Scope → listeners, audio, handles, GPU resources
 └─ SaveStore
```

`src/app/main.ts` 只组装服务和调用场景协议，不知道梅津寺的车站、列车或剧情内容。`src/world/registry.ts` 是内容注册入口，场景实现被拆为动态导入的构建块。`public/content/` 是通过清单加载的数据；未进入的场景不会请求它的模型数据。

核心服务和独立角色场景采用 TypeScript。梅津寺原有构造算法与剧情以 JavaScript ES modules 保留；`tsconfig.json` 对 TS 核心开启 strict，暂未对整套旧内容开启 checkJs。所有场景运行实例独立，旧代码使用的 `C` 只存在于该梅津寺实例内部，不是全局服务或新增场景的接口。

## 场景协议

接口位于 `src/world/types.ts`：

| 阶段 | 约定 |
|---|---|
| `load(services)` | 异步获取资源并构造候选场景；响应 `signal`；不改当前界面 |
| `restore(save)` | 检查存档是否属于本场景；进入前暂存，进入后应用 |
| `enter()` | 旧场景退出后安装本场景界面，必须保持同步、轻量 |
| `update(dt, time)` | 更新游戏状态、动画、环境，`dt` 单位为秒 |
| `render(time)` | 使用应用提供的 renderer，按需走后期 |
| `resize(width, height)` | 更新相机和场景独有尺寸 |
| `snapshot()` | 只返回可序列化存档状态 |
| `diagnostics()` | 返回小型检查快照 |
| `dispose()` | 幂等，释放本场景全部所有权 |

`SceneManager` 采用“最后一次切换请求有效”：取消尚未完成的加载，晚到的候选会被销毁。资源加载或存档校验失败时保留当前场景。成功准备后释放旧场景，再调用新场景 `enter()`；`enter()` 自身抛错不具备旧场景回滚，所以异步工作、校验和可能失败的准备都应放在 `load/restore` 阶段。

`UpdateLoop` 将正常帧的 dt 限制到 0.1 秒，页面隐藏时暂停。应用使用实际墙钟时间计算 FPS，并在非 lite / still 模式调整分辨率。进入 `?still` 时不运行 RAF，测试接口可以手动步进。

## 增加一个地点

1. 创建 `content/scenes/<id>/manifest.json`，包含 `schemaVersion: 1`、固定 `id`、显示名称、`seed`、入口锚点、锚点名称与资源列表。
2. 将 JSON / GLB 放入 `public/content/<id>/`，资源 URL 写成 `content/<id>/...`。不要硬编码站点根路径；加载时使用 `import.meta.env.BASE_URL`。
3. 创建场景实现，返回 `SceneInstance`。可参考体量较小的 `content/scenes/studio/scene.ts`，不要复制梅津寺全部构造器。
4. 在 `src/world/registry.ts` 加入 manifest 和动态导入工厂；场景选择器会自动显示该场景，主循环无需修改。
5. 执行 `npm run build`，再用浏览器验证进入、离开、返回和存档。

清单示例：

```json
{
  "schemaVersion": 1,
  "id": "new-place",
  "name": "新的地点",
  "seed": 17,
  "entry": "entrance",
  "anchors": ["entrance"],
  "assets": [
    { "id": "layout", "type": "json", "url": "content/new-place/layout.json" },
    { "id": "guide", "type": "gltf", "url": "content/characters/guide.glb",
      "skinned": true, "animations": ["idle", "walk"] }
  ]
}
```

新地点不必使用梅津寺的地形格式。地形采集与转换工具接受地区配置，但日本 GSI 数据和梅津寺专属布置仍各有适用范围，详见 `tools/README.md`。

随机数可通过 `randomStream('scene-id/entity-id')` 建立独立流，避免新增一个对象改变其他对象的布局。现有梅津寺保留按场景 seed 重建的原始随机序列；其内部构造顺序改变仍可能改变后续装饰，这是兼容旧内容的边界。

## 资源所有权

- **应用拥有** renderer、AssetManager、SceneManager、UpdateLoop。
- **AssetManager 拥有**已加载的模板。相同类型和 URL 的并发请求去重，每个使用者持有独立 handle；最后一个 handle 释放后才销毁模板。
- **场景拥有**局部几何、灯光、后期、交互索引、监听和音频。`Scope.defer()` 登记逆序清理，`Scope.listen()` 注册可撤销监听；异常清理仍尝试执行剩余 disposer。
- **Actor 拥有**实例骨架、AnimationMixer 和动作状态；克隆共享模板几何、材质和贴图，不应由 Actor 提前销毁。

获取示例：

```ts
const handle = await services.assets.acquire<GLTF>('gltf', url, services.signal);
scope.defer(handle.release);
const actor = new Actor('new-place/guide', handle.value);
scope.defer(() => actor.dispose());
scene.add(actor.root);
```

`Actor.fromHandle()` 也可直接接管句柄；无论采用哪种方式，每个独立所有者都应获取自己的 handle。`release()` 可重复调用，但共享一个 handle 给多个不同生命周期会提前释放资源。

取消一个资源使用者不会取消其他使用者；所有使用者退出后 abort。无法立即中断的解析即使晚完成也会释放结果。推荐内嵌资源的 GLB；外链 glTF 子请求的细粒度取消尚未封装。新格式在 `src/assets/loaders.ts` 注册 `{ load, dispose }`，并扩展内容校验规则。

梅津寺的 `SceneResources` 是程序化旧内容的资源收集适配层：追踪被合批后脱离场景树的原几何和延迟生成资源，监听显式 dispose，避免只遍历当前可见树造成遗漏。`clone()` 生成且不加入树的几何需要显式 `resources.track()`。Three.js Sprite 的全局共享几何不归单个场景所有。对象本身也需要 `Object3D.dispose()`，以释放渲染和阴影绑定；仅 dispose 几何和材质不够。树木批次各自拥有几何，避免当前渲染器将实例属性的清理关联到共享几何的第一个使用者。树木 LOD 使用实例批次在世界中的包围球中心。车站密集栏杆按 256 个实例分批，限制矩阵缓冲大小，也避免当前 Three.js 在超大实例批次跨阴影 / 普通 pass 时遗漏属性清理。新场景可以直接用 Scope 管理资源，不必使用这个适配层。

列车由 `trains.js` 单一工厂创建；`railway.js` 按类型复用退场列车，清空活动状态、车门和蒸汽。模型与夜光注册留在本场景内供复用，在场景销毁时整体释放。

## 角色与骨骼动画

`src/characters/Actor.ts` 使用 SkeletonUtils 克隆模型，为每个实例创建 AnimationMixer。`play(name, fade, once)` 支持交叉混合和单次动作，`onFinished()` 返回取消监听函数。

```ts
actor.play('walk', 0.25);
const off = actor.onFinished(name => {
  if (name === 'wave') actor.play('idle');
});
scope.defer(off);
actor.play('wave', 0.2, true);
// 在 update 中调用 actor.update(dt)
```

角色 Studio 用真实 GLB 验证了模型加载、9 骨架、五动作和实例生命周期。它是原创方块人占位资源，不是最终人物外观。当前没有 IK、骨骼重定向、面部动画、根运动、导航和角色行为树。后续可在 Actor 之上添加控制器，避免把行为规则写进模型加载器。

剧情命令 `cast(id, action)` 通过场景的 actor 注册表调用动作。现有章节没有可见路明非 / 绘梨衣模型；导入正式资源后，在场景中注册这些固定 ID，再由内容调用命令。

## 剧情与存档

`content/chapters/escape/chapter.js` 只组织剧情段落、文案和场景行为；`StoryRunner` 负责等待、推进、跳过和检查点；`createStory.js` 提供镜头、时间、音效、道具和视图命令，`StoryView.js` 负责字幕、笔记和淡入淡出。

段落 ID 是显式的对象键，例如 `prologue`、`reveal`、`lastTrain`，不会取自函数名、数组下标或 Three.js UUID。修改代码压缩设置也不会改变存档 ID。新增段落应给出永久 ID；删除或重命名已有 ID 时必须考虑旧存档兼容。

`SaveGame` v1 存储场景、模式、玩家位置与朝向、时刻、雨雾，以及可选 chapterId / beatId。读取时拒绝损坏值和未知 schema。当前没有跨 schema 的自动迁移；后续加入显式迁移函数，不能将不兼容数据直接当作新版本读取。

剧情存档**从当前段落开头恢复**，不保存任意 generator 栈、镜头 tween 或对白中途位置。每个可独立恢复的段落应初始化自己依赖的环境和对象。切换或跳过时关闭 generator，并清理临时道具、计时器、字幕和 tween。

## 渲染与画质

所有运行时 shader 定制使用 TSL / NodeMaterial，旧 ShaderMaterial 与 onBeforeCompile 字符串替换已移除。`WebGPURenderer` 负责 WebGPU 与 WebGL2 两个后端，内容不维护两套 GLSL/WGSL。

| 模块 | 实现 |
|---|---|
| 天空 / 海面 / 地形 / 建筑 | `rendering/materials.js` 中的节点逻辑 |
| 基础画面 | RenderPipeline、单采样 MRT 色彩 / 法线 / 深度；非 lite 模式在后期加 SMAA |
| AO | GTAO，半分辨率，按档位调整采样 |
| 反射 | 高档 SSR，半分辨率，用海面高度及湿地法线掩码 |
| 光束 / 雾 | 独立径向采样、视空间重建与高度雾节点 |
| 画面风格 | Bloom、曝光、饱和度、暖色、暗角、颗粒 |

`fx=off` 保留基础 Bloom / 调色，`nofx` 才完全直出场景。屏幕空间反射不是硬件光追。迁移保留现有风格和效果职责，没有承诺与 r149 像素一致或达到特定 FPS。

旧 `CITY.fx` 控制台接口、`fxdebug` 单效果缓冲视图和多帧截图累积没有移植；普通拍照模式保留。新的自动化检查通过只返回快照和受控操作的 `window.__DRAGON_RAJA__` 接口执行。

## 扩展边界

空间索引为旋转矩形碰撞框和可行走平面提供二维网格宽阶段查询，保留原有精确判定。它减轻碰撞候选扫描，但不是完整三维物理；楼上楼下、桥下通行和复杂室内仍需更合适的碰撞 / 导航方案。

已有按场景加载、建筑空间合批和 LOD；尚无跨区域连续世界流式加载、资源下载进度预算和动态邻区预取。要继续扩大到所有地点，应先约定目标设备、单场景资源预算和内容验收标准，再根据真实规模加入这些能力。账号、云存档和多人同步可在未来通过明确 API 引入，当前静态发行不依赖它们。
