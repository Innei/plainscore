# 站点改用 resume 的采样 · 摘要

完整文档：[2026-11-11-site-samples-design.md](./2026-11-11-site-samples-design.md)

## 做什么

把 resume 的 Salamander 钢琴和 VSCO2 弦乐、竖琴采样，连同 resume 的逐音校准和 trim，一次性写进 MP3 文件，提交到 `packages/render/sounds/`。之后站点和 CLI 都用这套采样，sf3 只给这套采样没覆盖的乐器兜底。

## 做完后你会看到

1. 打开站点上的"来路"，声音和 resume 的成品一致，每件乐器每段的电平差在 1.5 dB 以内。
2. 第一次打开只需要下载约 3.3 MB 的音源，原来是 38 MB。
3. `plainscore-render render examples/road.score --sounds …` 出来的声音和站点一样。
4. 混音器底部 "Sounds:" 显示 Salamander / VSCO2 的署名。

## 已定的

| 问题 | 决定 |
|---|---|
| 音源 | resume 的 5 组采样：piano、cello、violins、harp、pizz |
| 校准 | 离线写进文件，渲染器不改 |
| 格式 | MP3 160 kbps，约 3.3 MB |
| 解码 | 主线程用 OfflineAudioContext 解到 48 kHz，传给 worker |
| 兜底 | 只有用到采样没覆盖的乐器时才下载 sf3 |
| 匹配方式 | 按乐器 family 匹配（我定的）；采样里没有的演奏法，比如 `cello pizz.`，改用 sf3 |
| 超出采样音域 | 接受变调，和 resume 网站一致（你选的 1） |
| road.score | 保留本次加的 0.3 母带和 mix；换完采样后重测一次，必要时把 cello / harp 微调约 1 dB |

## 请检查（我自己定的）

- **全站统一一套音源**：ma.score 和 bgm.score 也会换成这套采样。ma 原来是在 sf3 上凭耳朵调的乐器比例，换了之后会变；各段响度有 loudness 目标兜着，不会跑。
- **采样直接提交进 plainscore 仓库**（约 3.3 MB），不从 resume 的站点拉取。
- **用 MP3**，没用 WAV（WAV 要 29 MB）。
- **road.score 里写了 `perform off`**，和 resume 未加演奏处理的渲染保持一致。

## 时间

约 2.5–3 小时：写入校准的脚本加文件约 30 分钟，站点加载链路加测试约 1.5 小时，重测、微调和文档约 30–45 分钟。

## 试听

一次性验证渲染出的完整版：`open /tmp/ps-ab/v04-baked.mp3`
