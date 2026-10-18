# 迎着阳光盛大逃亡 · A Grand Escape into the Sun

**v0.3-alpha · 模块化运行框架与 WebGPU 迁移**

Nilarf2 为江南《龙族 III》第十章创作的同人致敬作品：用真实地图与高程数据重建松山梅津寺，保留漫游与 11 段剧情。这个版本将浏览器里的游戏运行框架拆成可扩展模块，为其他地点、篇章、模型和骨骼动画提供接入方式。

渲染默认使用 **Three.js WebGPURenderer + TSL**，保留同一渲染器的 WebGL2 后备路径。场景选择器还提供一个独立的角色动作预览场景，内含原创占位 GLB 和五种骨骼动画。路明非、绘梨衣的正式角色美术尚未制作。

## 运行

需要 Node.js 22.12+ 和支持现代图形 API 的浏览器。在仓库目录执行：

```bash
npm ci
npm run dev
```

打开终端显示的本机地址。正式构建与本机预览：

```bash
npm run build
npm run preview
```

发布时将 **`dist/` 的全部内容**交给静态网站托管，使用 HTTPS；相对资源路径支持部署到子目录。游戏仍无需应用服务端。所有游戏资源随构建提供，安装依赖后，本机运行不必连接地图服务或 CDN。

本版采用 ES modules 和异步资源加载，需要通过 HTTP/HTTPS 访问；原来双击 `index.html` 的 `file://` 入口已退出使用。PWA 离线缓存还未实现。

## 玩法

- **剧情**：梅津寺的一天，从空地到末班车。Space 或点击提示继续，N 跳到下一段，Esc 回漫游。
- **漫游**：步行、坐下、切换地点、时间、雨与海雾。
- **场景切换**：右上角选择梅津寺或角色动作预览。加载失败保留当前场景，切换成功后释放旧场景。
- **保存 / 继续**：本机浏览器保存一个存档；漫游恢复位置、时间和天气，剧情从已保存段落的开头恢复。

| 桌面 | 触屏 | 操作 |
|---|---|---|
| WASD / 方向键，Shift | 左侧摇杆 | 行走 / 奔跑 |
| 鼠标拖动、滚轮 | 右侧拖动 | 视角、缩放 |
| E | ✋ | 坐下 / 交互 |
| G | 📍 | 地点菜单 |
| 1–4、T | 🌗 | 时刻、时间速度 |
| R / F | ☔ / 🌫 | 雨 / 海雾 |
| P、M、H | 帮助按钮 | 拍照模式、静音、帮助 |

## 现有内容

- GSI 近景高程和濑户内海远景，OpenStreetMap 道路、建筑与铁路。
- 梅津寺站房、候车室、站台、平交道、海堤、沙滩，以及橙色电车和 D51。
- 小说中的空地、神社旧巷、山坡电车、地藏、崖边岩石与摩天轮。
- 21 个程序化建筑变体、三级 LOD、空间分块合批、昼夜光照、天气和 WebAudio 音乐。
- TSL 天空、海面、地形和窗灯；节点后期包含 AO、屏幕空间反射、光束、雾、Bloom、调色与 SMAA 抗锯齿。
- 独立 GLB 角色实例、独立骨架与 AnimationMixer，动作交叉混合及完成事件。

下面是 v0.2 的历史内容截图；新渲染器的颜色与效果有变化，迁移验证见 [docs/VALIDATION.md](docs/VALIDATION.md)。

![梅津寺站 · 历史版本截图](docs/screenshots/station-sunset.jpg)

## 项目结构

| 路径 | 职责 |
|---|---|
| `src/app/` | 启动、场景选择、主循环组装 |
| `src/core/` | 生命周期、更新循环、存档、确定性随机流 |
| `src/assets/` | 加载器、去重、引用计数、取消与资源释放 |
| `src/world/` | 场景协议、注册、切换、碰撞空间索引 |
| `src/rendering/` | WebGPU 渲染器、TSL 材质、后期、画质档位 |
| `src/characters/` | 模型实例、骨骼动画、动作事件 |
| `src/narrative/`、`src/ui/` | 剧情运行器、镜头命令、字幕与控制 |
| `src/gameplay/`、`src/audio/` | 移动交互、音乐与环境声 |
| `content/scenes/` | 场景清单、配置及场景专属构造器 |
| `content/chapters/` | 有固定 ID 的剧情内容 |
| `public/content/` | 按清单异步获取的 JSON、GLB |
| `tools/` | 地形、Blender、模型导出与内容校验 |

核心协议使用 TypeScript；已有程序化场景以 ES modules JavaScript 保留并逐步迁移。没有 `window.CITY`，没有依赖脚本标签顺序的初始化。具体扩展步骤、所有权约定和现阶段边界见 **[架构与扩展指南](docs/ARCHITECTURE.md)**；资源重建见 **[工具指南](tools/README.md)**。

## URL 选项

选项放在站点地址后，例如 `http://localhost:5173/?lite&start`。

| 选项 | 效果 |
|---|---|
| `?scene=studio` | 独立角色动作场景 |
| `?story&beat=lastTrain` | 从固定 ID 的剧情段落开始；旧数字索引仍支持 |
| `?start&at=station&t=18.7&yaw=290&pitch=-5` | 在指定地点、时间和视角漫游 |
| `?lite` | 半分辨率、关闭阴影、低档后期 |
| `?fx=high` / `?fx=low` / `?fx=off` | 完整后期 / 无 SSR / 仅基础 Bloom 与调色 |
| `?nofx` | 完全关闭后期 |
| `?renderer=webgl` | 强制同一节点管线使用 WebGL2 |
| `?stats` | 显示实际帧率、绘制调用和渲染后端 |
| `?still` | 首帧后停止自动更新，供截图与测试使用 |
| `?cam=x,y,z&look=x,y,z&fov=50&photo` | 固定世界坐标相机，隐藏 HUD |
| `?scam=n,dy,s&slook=n,dy,s&photo` | 梅津寺车站坐标相机 |

可定位的地点：`station`、`platform1`、`lot`、`lane`、`shrine`、`summit`、`rock`、`wheel`、`beach`。

## 验证与边界

```bash
npm test
npm run build
# 另一个终端运行 npm run preview -- --port 5180
TEST_URL=http://127.0.0.1:5180/ CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

浏览器脚本使用临时 Chromium 会话和 SwiftShader 软件适配器，检查真实 WebGPU 路径、场景往返、角色、剧情和资源计数；结果与截图写入 `tests/artifacts/`。详细执行结果见 [验证记录](docs/VALIDATION.md)。

此版本完成的是扩展框架及现有内容迁移。无缝大世界流式加载、复杂室内三维碰撞、导航网格、NPC AI、IK / 动作重定向、正式角色美术、账号与云存档不在当前实现内。尚需真实桌面 GPU 和手机验收画质、性能与设备兼容性。

## 贡献者

- **Nilarf2**：项目作者，负责创作方向与需求。
- **Claude（Anthropic）**：AI 编程协作者，参与原有场景、建筑、画面效果的开发与迭代修正。
- **Codex（OpenAI）**：AI 编程协作者，参与 v0.3 运行框架模块化、WebGPU / TSL 迁移、资源生命周期管理、骨骼动画接入与自动化验证。

## 作者与许可

- 作者 **Nilarf2**；代码 MIT，© 2026 Nilarf2，见 [LICENSE](LICENSE)。
- three.js 及第三方数据保留各自许可，见 [NOTICE.md](NOTICE.md)。
- 地图数据 © OpenStreetMap contributors，派生地图数据库采用 ODbL。
- 高程：出典：国土地理院 標高タイル（加工して作成）；海底深度为合成数据。
- 非商业、非官方同人作品。《龙族》及人物、故事属于江南及相关权利方；真实地名、公司和车站名称属于各自权利人。
