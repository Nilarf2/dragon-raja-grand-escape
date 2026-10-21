# Dragon Raja platform updates / 龙族成品更新

Scope: only the migrated Dragon Raja game updates these existing works. Harbor is delivered on GitHub;
no additional platform demo or duplicate work is created. 范围仅为迁移后的 Dragon 成品，复用现有作品。

| Platform | Existing mapping | Player link |
|---|---|---|
| BilibiliToy | ID `41702756968448`, path `vKDPBhuruH6LcWU1` | https://www.bilibili.com/toy/vKDPBhuruH6LcWU1/index.html |
| VibeHub | slug `dragon-raja-grand-escape`, work `CWfwstBgW2iL3bkQqRxgv` | https://gamesvibe.app/play/CWfwstBgW2iL3bkQqRxgv |

Repository: https://github.com/Nilarf2/dragon-raja-grand-escape . Keep this repository and both mappings.
Title: `[龙族] 迎着阳光盛大逃亡 · Dragon Raja: A Grand Escape into the Sun`.
Preserve existing cover/screenshots unless an explicit reviewed replacement is supplied.
保留同人非官方说明、全部素材许可和现有展示媒体。

Read-only verification on 2026-10-21: Toy CLI v0.6.3 `whoami` succeeded; `mylist --json` listed this
single work as `published`, `PUBLIC`, `GAME`, dark theme, watermark disabled. VibeHub CLI
`0.3.2+r3658b7c23665` `whoami` and `list` succeeded, listing the exact slug and linked Dragon GitHub repo.
No credential values are recorded. Recheck authentication/status when actually publishing.

Current official VibeHub instructions: https://gamesvibe.app/api/skill . Read the complete live document
once per publish task. Before updating, run the official verified installer:
https://gamesvibe.app/downloads/vibehub-cli/install.sh . Reuse successful `whoami`; run `list` and
use `update`, never `deploy`, for this existing slug. Do not configure/revive old GitHub Actions.
BilibiliToy command syntax is verified from the installed official CLI's `toy update --help`;
updates package the selected static directory, create a preview and submit review.

After tested changes merge to main, build one exact static artifact from the merged revision. `dist/index.html`
must be at its root, `base` stays `./`, and HTML stays below 1 MB. Include all assets, notices,
licenses and the lazy same-origin OIDN weight. Exclude source/dependencies/secrets/archives.
Record source commit, Harbor tarball SHA-256, file count, total bytes, largest file, and per-file SHA-256.

```sh
vibehub whoami
vibehub list
vibehub update --slug dragon-raja-grand-escape --dir /absolute/release/dist --name-file /absolute/release/title.txt --description-file /absolute/release/description.txt --note-file /absolute/release/note.txt
# Re-read current toy help before this step / 实际执行前重新核对帮助
# Metadata omitted below means retain current settings; title is explicitly updated.
toy update 41702756968448 /absolute/release/dist --title '[龙族] 迎着阳光盛大逃亡 · Dragon Raja: A Grand Escape into the Sun' --yes --json
```

A CLI success is not acceptance. 回读审核状态直至 `published`，不能把审核中报为正式上线。
After upload, GET the actual immutable release's JS, model, map data, NOTICE and OIDN weight and
compare the recorded bytes/hashes. Toy injects host scripts into HTML, so additionally verify the
correct build entry is referenced rather than requiring identical HTML bytes. Some direct requests
meet WAF 403/412 responses; perform verification through the actual browser frame in that case.
Exercise the platform iframe's WebGPU boot, gameplay, scene switching and restricted-storage fallback.

Previous accepted main: `7a7ec8b1ff03f346e73334678c061bc52f8c18ab`, published 2026-10-18.
This document records discovery and the update procedure; it does not claim v0.4 has been uploaded.

The bilingual title, description and update note draft are in `RELEASE-0.4.md`; copy only the relevant
body into UTF-8 CLI input files after acceptance. The current Toy CLI exposes a title field but no
description flag, so do not invent one. VibeHub uses `--name-file`/`--description-file`/`--note-file`.
