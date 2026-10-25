> 本文是 score 0.1 的原始设计规范，2026-10-25 写于 [Innei/resume](https://github.com/Innei/resume)（`docs/superpowers/specs/2026-10-25-score-dsl-v0.1-design.md`），原样搬来。之后的变化：图例里 `inner` 的解释改为 "engraved as a voice of its own on the staff"；谱表与 MIDI 的通用规则见 `docs/grammar.md` 和 README。

# 乐谱 DSL v0.1：一套语法，脱离站点

**Date:** 2026-10-25
**Status:** 设计草稿，待确认
**Scope:** 定义 `score 0.1` 语法，取代现在的两套方言（`movement`，由 `score.ts` 解析；`piece`，由 `piece.ts` 解析）；把 `bgm.score` 和 `road.score` 改写成新语法；说明本站怎样改用新解析器。本文只写设计，不改代码。

## 1. 为什么做

现在已经用这套 DSL 写了两份谱子，但它其实是两套语法：

- `movement`（bgm.score）：循环播放，按站点场景切换钢琴织体。form 行写**乐器名**，表示音量层。
- `piece`（road.score）：从头播到尾。form 行写**声部名**，带力度、百分比和小节范围。
- 两套语法共用音符、cue 和小节行的写法，但有几处不一样：
  - 低音上五度：一份写 `bass+5th`，另一份写 `fifth`，两种写法的意思不同。
  - 只弹第 1、3 拍：一份写在 part 头上，另一份写在 form 行里。
  - cue part 的重复单位：一份每个和弦重复一次，另一份每小节重复一次。

另外，解析器和这个站点绑得很紧：

- 场景名写死成 `overview/browse/read/cosmos`。
- 只有 5 种乐器，而且 `pizz` 被当成一种乐器。
- 报错前缀写死成 `bgm.score line`。
- `stream` 这个声部名被特殊处理。
- 校验要求每个场景都有乐章演奏，而且每段必须 8 小节。

目标是把 DSL 做成可以单独公开的东西。v0.1 只做**统一**和**解绑**，再补上三个已经确定需要的能力：loop、variant、doubles。

## 2. 成功标准

1. 一份 `score 0.1` 文件既能写 bgm.score 那种循环、多场景的音乐，也能写 road.score 那种一次播完的单曲，不需要两种顶层关键字。
2. 语法里没有任何本站专有的名字：场景、乐器、声部名、文件名都由谱子自己声明。
3. 解析器的输出是一份与宿主无关的事件数据（§7）；本站、MIDI 导出、五线谱都从这份数据出发。
4. 把 bgm.score 和 road.score 改写成 v0.1 后，播放结果和现在一致。只允许 §9 列出的有意差异。
5. 一位懂乐理的人只读谱子和谱头图例，就能读懂它，这一点和原规范一样。

## 3. 目标 / 非目标 / 反目标

**目标**
- 一套语法，覆盖循环播放与一次播完、多变体与单一版本。
- `loop`：整段循环，或者前奏只播一次、之后从某段开始循环。
- `variant`：同一首曲子的几个版本共用一条时间线，切换时不丢位置（取代"场景"）。
- `doubles`：一个声部照抄另一个声部的音，只改乐器、力度、演奏法。
- 乐器、变体、混音都在谱子里声明，解析器不内置。
- 标准图例：所有 v0.1 谱子共用同一份记号说明。

**非目标（留给 v0.2 以后）**
- 4/4 以外的拍号、十六分音符位置的拍点（`1e`、`1a`）、连音、跨小节线的连音线。
- 速度变化（rit.、accel.、fermata）、渐强渐弱记号、断奏/保持音/连线/倚音。
- 反复记号与跳房子（volta）、D.C.、segno。
- 一个和弦短于一小节；同一组和弦里每个和弦长度不同。
- 跨文件 import。
- 打击乐。
- 新仓库的搭建和采样授权。本文只定语法和数据边界，开仓库是下一步。

**反目标（即使能跑也算失败）**
- 谱子里出现编程概念：`step`、`velocity 0.42`、MIDI 数字、`+12`、数组下标。
- 解析器里出现任何具体的场景名、声部名、乐器名或文件名。
- 同一条音乐信息写两遍（现在的 `violin-theme` 就把 `theme` 抄了一遍）。
- 混音参数和音乐写在一起、分不出来。

## 4. 文件结构

```
score 0.1
# 注释与图例

title    <作品名>
by       <作者>
after    <致敬 / 改编自>          — 可选

instruments
  <名字>   <family>               — 每件乐器一行

piece <id>  <标题>
  meter / tempo / key
  variants                        — 可选
  chords <名字> …                 — 一组或多组
  part <名字> …                   — 若干声部
  form [loop [from <段>]]
  mix                             — 可选
piece …                           — 一个文件可以有多首
```

### 4.1 谱头

- 第一行非注释内容必须是 `score 0.1`。解析器遇到不认识的版本号就报错，不猜。
- `title`、`by`、`after` 属于整份文件。bgm.score 的"来路与星河，乐章 I / II"写成一个文件里的两个 `piece`。
- 缩进仍然有意义：顶层 0 格，piece 内 2 格，块内 4 格。这和现在一致。

### 4.2 instruments

```
instruments
  piano    piano
  cello    cello
  violins  violins
  harp     harp
```

- 左边是谱子里使用的名字，右边是 family，取自固定词表：`piano harp violins violas cello bass flute oboe clarinet bassoon horn trumpet voice synth`。v0.1 先给这些，后续可以扩充。
- family 只决定三个默认值：五线谱谱号、MIDI 音色号，以及这件乐器是否有延音踏板（只有 `piano`）。具体用哪个采样由宿主决定。
- 乐器名和声部名不能重名。现在 bgm.score 里有一个叫 `harp` 的声部，改写时改名为 `harp-wash`。
- `pizz` 不再是一种乐器，改为演奏法（§5.3）。

### 4.3 piece

```
piece road  来路  The Road Behind
  meter   4/4
  tempo   q = 80
  key     D major
```

- `piece` 后面第一个词是 id（ASCII，供宿主选曲用），其余是标题。标题里不写乐章序号（"I."），序号由宿主按顺序加上。
- `meter` 仍然只接受 `4/4`，写别的会报错并说明原因。
- `key` 的调式取自 `major minor dorian lydian mixolydian`，这和现在一致。

## 5. 音乐内容

### 5.1 chords

```
  chords theme  — bass | voicing
    D        D2  | D4 F#4 A4
    A/C#     C#2 | C#4 E4 A4

  chords stars  two bars each
    Dmaj9(#11)  D2  | D3 A3 F#4 C#5 E5 G#5
    E/D         D2  | E3 B3 E4 G#4 B4 E5
    F#m9        F#2 | F#3 C#4 E4 A4 C#5 G#5
    E/D
```

- 每组和弦必须有名字。不写时长就是每个和弦一小节；`two bars each` 表示每个和弦两小节，数字写成 one 到 four，或者阿拉伯数字。
- 只写和弦记号的一行，沿用这个记号在本 piece 里最近一次写出的排列（采纳 road.score 现在的规则）。
- 这组和弦有多少小节，用到它的段落就有多少小节。不再有"8 bars per section"这种单独的声明。

### 5.2 和弦相对音高

和现在一样：`bass`、`t1`–`t4`、`v1`–`v6`、`top`、`chord`、`upper`、`fifth`。

现在最容易混淆的两个写法，在图例里分开说清楚，语义都不变：

- `fifth` 是一个**和弦音**：取最接近低音上方五度的那个和弦音。
- `+5th` 是一个**音程移位**：固定往上纯五度，不管和弦里有没有这个音。

移位记号为 `+5th +8va +15ma +8vb`，再加上 `+15mb`。

### 5.3 part

声部有四种，用 part 头和正文的写法来区分：

| 种类 | 正文写法 | 用途 |
|---|---|---|
| 旋律线（line） | `\| F#5 h  E5 q … \|` | 按小节写的具体音 |
| 音型（cues） | `1&  t2  q.  soft` | 按和弦套用的音型；一行一个拍点 |
| 一次性（once） | part 头写 `once`，正文同上，拍点写成 `3.2&` | 只在段落里的指定位置出现一次 |
| 偶然（ad lib.） | part 头写 `ad lib.`，正文为字段 | 按概率随机出音 |

part 头可以写的词（顺序不限，`—` 后面是写给读者的话）：

- 一件已声明的乐器，可选跟一个演奏法：`violins pizz.`。v0.1 的演奏法只有 `pizz.` 和 `arco`。
- 力度，以及 `overlap X`、`ring X`、`once`、`lead`。
- `inner`：五线谱上把这个声部排成同一谱表里的内声部。它取代代码里对 `stream` 的特殊处理。
- `doubles <声部>`，可选跟一个移位（§5.4）。
- `ad lib.`（§5.6）。

两条语义调整：

- **音型的重复单位统一为"每个和弦"。** `2.1` 表示这个和弦的第二小节第 1 拍（cosmos 现在就是这样用的）。road.score 的和弦都是一小节，所以改了之后听起来没有区别。
- **cue 行里的乐器仍然可选。** `1.1  piano  G1  w  mf` 这种一行指定乐器的写法保留，lift、coda-entry、final 这几段都在用。

### 5.4 doubles

```
  part violin-theme  violins  doubles theme  overlap s
```

- 照抄 `theme` 写出的音，包括旋律线的音、cue 的拍点和音高。乐器、力度、overlap、ring、演奏法用自己 part 头写的；没写的沿用被抄声部的设置。
- `doubles theme 8vb` 表示抄完整体移一个八度。
- form 行给被抄声部加的选项**不会**传给 double：A3 行写 `theme 8va, violin-theme mf` 时，小提琴仍然在原八度，这正是 road.score 现在的效果。
- 被抄声部本身不能是 double，避免链式引用；也不能抄 `ad lib.` 声部。

### 5.5 pedal

- 正文写 `1  Ped.` 和 `4&  *`，和现在一样。
- 踏板作用于本 piece 里 family 为 `piano` 的乐器。如果有不止一件，part 头必须写明是哪一件，否则报错。
- `breath` 和 `cut` 同时会抬起踏板，和现在一样。

### 5.6 ad lib.

```
  part sparkle  harp  ad lib.  — on each eighth where the quote is silent
    chance   22%
    notes    D lydian, D6 to C#7, 8va 30% of the time
    dynamic  pppp-pp
    length   h.
    timing   anywhere within the eighth
    avoid    quote
```

- 从现在挂在乐章上的 `ad lib.` 块改成一种声部，所以 form 行可以控制它在哪些段落出现、出现时多大声。
- 字段与现在一样。`avoid` 改成单独一行，而且可以省略。

## 6. 曲式、循环、变体、混音

### 6.1 form

```
  form  loop from A1
    Intro  prelude  — 序
      wash mp, stream p 85%, drone pp 85% bars 1-2, pedal, breath, pickup-d
    A1  theme  — 来路 I
      flow p 85%, theme 85%, pedal
    A5  theme in E
      …
```

- 采用 road.score 的写法：每行依次是段落标记、和弦组名、可选的 `in <调>`，`—` 后面写段落标签；下一行缩进列出这一段有哪些声部，以及各自的选项。
- 声部选项和 road.score 一样：力度、`85%`、`92%-75%`、`bars 3-4`、`on 1 and 3`、移位；另有 `breath` 和 `cut`。
- form 行只写声部名，不再写乐器名。没有写在这一行里的声部，这一段就不出声，也**不生成音符**（见 §9 第 1 条）。
- 删掉"一个声部如果从未在 form 里出现就每段都演奏"这条隐式规则：每个声部都要在 form 里写出来。

### 6.2 loop

| form 头 | 含义 |
|---|---|
| `form` | 从头播到尾，然后结束（road.score） |
| `form  loop` | 整段 form 无限循环（bgm.score 的两个乐章） |
| `form  loop from A1` | 先从头播到尾，之后从 A1 开始无限循环 |

循环接缝处的规则：

- 最后一段结束时还在响的音照常延续，与循环起点新弹的音叠在一起。
- 计算踏板延音时，把循环起点那一段当作最后一段的下一段。现在的 `pedalUntil` 就是这样按取模处理的。
- 每次重新进入循环起点那一段时，这一行的 `cut` 都会生效，切掉的是上一轮留下的尾音。
- `ad lib.` 声部每一轮都重新抽签（§7.2）。
- 循环要不要停、怎样淡出，是宿主的事，语法里没有结尾记号。

### 6.3 variants

```
  variants
    overview
    browse   drop stream
    read     drop stream, sparse for flow, melody on 1 and 3
```

- 第一个变体是默认变体，它照 form 原样演奏。
- 其他变体是一串编辑，套用到 form 的**每一行**上：
  - `drop <声部>`：这个声部在所有段落都不出声。
  - `<新> for <旧>`：只要某一行写了旧声部，就换成新声部，选项原样继承。上面的 `read` 里，A1 行的 `flow p 80%` 会变成 `sparse p 80%`。
  - `<声部> <选项>`：在这个声部出现的每一行，追加这些选项。
  - 编辑里提到不存在的声部要报错；如果 `Q for P` 遇到某一行同时写了 P 和 Q，也要报错。
- 所有变体共用同一条时间线和同一份 form，所以宿主在变体之间切换时位置不变。切换时机（例如只在小节线上切）由宿主决定。
- 不同 piece 之间怎样切换、切换后从哪里接着播，同样由宿主决定，不进语法。现在的"离开 cosmos 后，主题从 cosmos 已播的八分音符数接着播"就是一条宿主规则。

### 6.4 mix

```
  mix  — playback balance; notation and MIDI ignore it
    violin-theme   +13 dB  attack 200ms
    pizz           +16 dB
    piano          75%
```

- 每行写一个声部名或乐器名，后面跟 `±N dB`、`N%` 或 `attack X`。
- 现在散在 part 头里的 `+13 dB` 和 `attack 200ms` 全部移到这里，part 头不再接受这两个词。这样音乐人可以整块跳过 mix，读到的只有音乐。
- 乐器的基础音色参数（现在 `INSTRUMENTS` 里的 db、attack、release）仍然由宿主提供，mix 只是在此基础上调整。
- cosmos 现在的乐器音量层（`piano 75%, cello 95%, harp 90%`）全程不变，属于平衡，所以搬到 mix 里。主题乐章里按段落变化的百分比（A4 的 `85%`）属于曲式，留在 form 行里。

## 7. 解析器输出（与宿主的边界）

### 7.1 数据

解析结果是可以序列化成 JSON 的纯数据，不含函数。字段名由 builder 定，内容至少包括：

- 文件：版本、title、by、after、instruments（名字和 family）、pieces。
- piece：id、标题、tempo、tonic、mode、变体名列表、`loop`（无，或者起止小节）、`sections`（标记、标签、起始小节、小节数、本段主音）、每小节的和弦、mix。
- 事件（每个变体一份）：
  - 位置：起始的八分音符序号、偏移量（滚奏、late）。
  - 音：乐器、演奏法、声部名、和弦角色、音高（MIDI 数字只出现在这里，不出现在谱子里）。
  - 时值与力度：实际时值、记谱时值、踏板延长前的时值、level、velocity、是否滚奏。
  - 排谱提示：`lead`、`inner`。
- 踏板事件。
- `ad lib.` 声部的规则（不是展开后的音，见下）。

### 7.2 随机

- 确定性的事件一次全部算出来。
- `ad lib.` 的音由一个纯函数生成：输入是（种子、第几轮、第几个八分音符），输出是这一格的音，或者没有音。
- 播放时每一轮换一个种子；导出 MIDI 和五线谱时用固定种子，和现在一样。

### 7.3 报错

- 解析器接收文件名，报错格式为 `<文件名> line N: <能看懂的话>`。
- 一次只报第一个错，和现在一样。v0.1 不做一次报出多个错误。

## 8. 标准图例（v0.1 的全部记号）

每份谱子在开头附上这段图例，可以原样复制，也可以删掉用不到的行。命令行工具（新仓库提供）可以打印它。图例以 `score.ts` 和 road.score 现有的图例为基础合并，用英文：

```
# Legend (score 0.1)
#   Pitches sound as written. Durations w h q e s, "." dotted, "+" ties (w+s), r = rest.
#   Counts 1 & 2 & 3 & 4 &; "2.3&" = bar 2 of the chord (or of the section, in a "once" part).
#   Chord tones: bass; t1-t4 / v1-v6 low to high; top; chord = all; upper = all but the lowest;
#     fifth = the chord tone nearest a fifth above the bass.
#   Shifts: +5th (a perfect fifth up, in the chord or not) +8va +15ma +8vb +15mb.
#   Dynamics: pppp .10  ppp .16  pp .22  p .32  mp .42  mf .50  f .55;
#     ">" accent +.08, soft -.07, softer -.14; "ppp-mf" on a roll rises across its notes.
#   roll X: notes enter X apart. late X: enters X after the count.
#   overlap X: each note rings X past its value. ring X: each note rings for X.
#   "1 Ped." presses or changes the sustain pedal; "4& *" lifts it.
#   doubles P: plays P's notes on its own instrument. inner: engraved as an inner voice.
#   Form: a row plays only the parts it names. 85% shades a part; "92%-75%" shades bar by bar;
#     "bars 3-4"; "on 1 and 3"; breath = all but lead and once parts stop for the last eighth;
#     cut = whatever still rings stops at the downbeat. "in E" moves the section to E.
#   form loop / loop from A1: the form repeats, from the top or from A1.
#   Variants edit every form row: "drop P", "Q for P", "P <options>".
#   mix: playback balance only. Text after "—" is a note to the reader.
```

## 9. 有意的行为变化

改写后的 bgm.score 和 road.score 用 v0.1 解析器跑出的结果，与现在相比只允许以下差异：

1. **不出声的乐器不再生成音符。**（作者已于 2026-10-25 确认接受。） 现在 bgm 的大提琴、小提琴长音每段都生成，靠音量层设成 0 来静音；音量层切换有 0.4 秒渐变，所以 A3→A4 交界处会短暂听到小提琴长音。v0.1 里没写在 form 行的声部就没有音，这段尾音会消失。如果宿主想保留段落之间的淡入淡出，可以根据 sections 里各声部的百分比自己做渐变。
2. **cosmos 的乐器音量层改由 mix 表达。** 数值相同，听感应该一致；具体实现由宿主决定，可以是增益，也可以是乘进力度。
3. **cue part 改为每个和弦重复一次。** 当前两份谱子不受影响。
4. **主题乐章的五线谱力度记号按"打过百分比之后的力度"来写。** 以前主题段落的百分比是不进谱面的音量层；现在和 road.score 一样乘进力度。所以 A1 的钢琴（`p 80%`）记成 pp，A4 的钢琴（`mp 85%`）和大提琴（`f 50%`）记成 p。播放和 MIDI 不变。
5. **cosmos 的 MIDI 力度不再包含 mix 里的平衡**（钢琴 75%、大提琴 95%、竖琴 90%），这符合"mix 只管播放"的规定。播放不变。

## 10. 验证

- 改写前，先把旧解析器的输出存成快照：
  - bgm：四个场景各一整轮。
  - road：整首曲子。
  - 随机部分用固定种子。
- 新解析器的输出逐项比较：乐器、音高、时值完全一致，起音误差在 ±10 ms 以内，力度误差在 ±0.03 以内（与上一份规范相同）。§9 列出的差异逐条列出并说明。
- `pluck` / `chime` 用到的和弦音高与现在一致。
- 人工试听三处：主题三个变体、cosmos 彩蛋、/lab/score/ 上的来路单曲。五线谱和 MIDI 导出各看一遍。

## 11. 本站的迁移

- `score.ts` 和 `piece.ts` 合并成一个 v0.1 解析器。按 500 行上限拆成几个文件：词法与音高、声部、form 与变体、事件展开。
- `arrangement.ts` 只保留宿主的内容：
  - `INSTRUMENTS` 音色、`reverbFor`、`PENTATONIC`。
  - 场景对应关系：`overview/browse/read → theme 的三个变体`，`cosmos → stars`。
  - 场景切换的时机，以及切换后的位置规则。
  - 实时的 `eventsAt(step, scene)`：从解析结果按位置取事件，并按 loop 取模。
- 对外接口（`eventsAt`、`chordAt`、`passAt`、`EIGHTH` 等）尽量保持不变，这样 `audio.ts` 和 `tools/bgm-mixer` 改动最小。`PASSES` 和 `COSMOS_LAYERS` 改为从 sections 和 mix 推出来。
- `sheet/*` 用 instruments 的 family 决定谱表和 MIDI 音色，用 `lead` 和 `inner` 决定声部排版，不再看声部名或 `pizz` 乐器。
- 拨弦按"乐器 + 演奏法"处理：
  - 五线谱仍然单独排一行 "Violins pizz."，和现在一样。
  - MIDI 用 45 号音色。
  - 播放时，宿主把（violins, pizz.）对应到现在的 pizz 采样。
- Vite 插件改为校验所有 `src/canvas/*.score` 文件，不再写死两个文件名。

## 12. 附录 A：bgm.score 改写成 v0.1（全文）

```
score 0.1
# 来路与星河  The Road Behind, the River of Stars
#   I.  来路  The Road Behind   variants: overview, browse, read
#   II. 星河  River of Stars
# (Legend: §8)

title   来路与星河  The Road Behind, the River of Stars
by      Innei & Claude
after   邱有句《云村的天边》《云村的风》《云村的告别》

instruments
  piano    piano
  cello    cello
  violins  violins
  harp     harp

piece theme  来路  The Road Behind
  meter   4/4
  tempo   q = 80
  key     D major

  variants
    overview
    browse   drop stream
    read     drop stream, sparse for flow, melody on 1 and 3

  chords theme  — bass | voicing
    D        D2  | D4 F#4 A4
    A/C#     C#2 | C#4 E4 A4
    Bm       B1  | B3 D4 F#4
    F#m/A    A1  | A3 C#4 F#4
    G        G2  | B3 D4 G4
    D/F#     F#2 | A3 D4 F#4
    Em7      E2  | B3 D4 E4 G4
    A        A2  | A3 C#4 E4 A4

  part melody  piano  mf  overlap e  lead
    | F#5 h   E5 q   D5 q  | E5 h.   A4 q         | D5 h    F#5 h       | A5 h    F#5 q   E5 q |
    | D5 h    B4 q   D5 q  | F#5 h   A5 q   F#5 q | E5 h    D5 q   B4 q | E5 w                 |

  part flow  piano  — dynamic from the form
    1     bass        w   >
    1&    bass+5th    q.  soft
    2     bass+8va    q.
    2&    t2          q.  soft
    3     t3          q.
    3&    t2          q.  soft
    4     bass+8va    q.
    4&    t1          q.  soft

  part stream  piano  inner
    1     t1+8va      q   softer  late s
    1&    t3          q   softer  late s
    2     t2+8va      q   softer  late s
    2&    t1+8va      q   softer  late s
    3     t3+8va      q   softer  late s
    3&    t2+8va      q   softer  late s
    4     t1+8va      q   softer  late s
    4&    t3          q   softer  late s

  part sparse  piano
    1     bass        w   >
    1     chord       h   soft    roll 30ms
    3     upper       h   softer  roll 40ms

  part cello-pad  cello  f
    1     bass+8va    w+s

  part violin-pad  violins  mp
    1     t2+8va      w+s   late 40ms
    1     top+8va     w+s   late 75ms

  part harp-wash  harp  once  mf
    1.1   D4 F#4 A4 D5 F#5 A5 D6   h.  roll s

  part pizz  violins pizz.  mf
    2     t1+8va      e
    4     t3+8va      e

  part pedal  — a change with every chord
    1     Ped.

  form  loop
    A1  theme
      flow p 80%, stream p 80%, pedal
    A2  theme
      flow mp, stream mp, melody, cello-pad, pedal
    A3  theme
      flow mp, stream mp, melody 8va, cello-pad, violin-pad, harp-wash, pedal
    A4  theme
      flow mp 85%, stream mp 85%, cello-pad 50%, pizz, pedal

piece stars  星河  River of Stars
  meter   4/4
  tempo   q = 48
  key     D lydian

  chords stars  two bars each  — bass | voicing
    Dmaj9(#11)  D2  | D3 A3 F#4 C#5 E5 G#5
    E/D         D2  | E3 B3 E4 G#4 B4 E5
    F#m9        F#2 | F#3 C#4 E4 A4 C#5 G#5
    E/D

  part pads  — long notes ring into the next chord
    1.1   piano     bass       w+w+q  mp
    1.1   piano     bass+8vb   w+w+q  pp
    1.1   cello     bass+8va   w+w+q  mf
    1.1   cello     v2         w+w+q  p       late 250ms
    1.1   violins   v4+8va     w+w+q  p
    1.1   violins   v5+8va     w+w+q  pp  >   late 190ms
    1.1   violins   v6+8va     w+w+q  pp      late 375ms
    1.1   harp      v3+8va v4+8va v5+8va v6+8va v3+15ma v4+15ma v5+15ma v6+15ma   h.  pp   roll 220ms
    2.1   harp      v6+8va v5+8va v4+8va   h.  ppp  roll 250ms
    2.1   piano     v6+8va     w      ppp     late 125ms

  part pedal  — a change with every chord
    1     Ped.

  part quote  harp  p  ring w  — the opening of the melody, an octave higher
    | r w | r w | r w | r w | F#6 w | E6 h   D6 h | E6 w | r h   A5 h |

  part sparkle  harp  ad lib.  — on each eighth where the quote is silent
    chance   22%
    notes    D lydian, D6 to C#7, 8va 30% of the time
    dynamic  pppp-pp
    length   h.
    timing   anywhere within the eighth
    avoid    quote

  form  loop
    A  stars
      pads, pedal, quote, sparkle

  mix
    piano    75%
    cello    95%
    harp     90%
```

对照旧版需要注意三点：

- 旧版 A3 的 `harp` 在 v0.1 里是 `harp-wash`。旧版每段都会生成这串琶音，只是靠音量层静音；v0.1 只在 A3 生成。
- 旧版 A4 的 `pizz` 每段都生成，只在 A4 有音量；v0.1 只在 A4 生成。
- 旧版 `piano p 80%` 同时作用于 `flow` 和 `stream`，所以 v0.1 的 A1 行把两者都写出来。

## 13. 附录 B：road.score 的改动（只列差异）

| 位置 | 现在 | v0.1 |
|---|---|---|
| 文件开头 | 注释 + `piece  来路  The Road Behind` | `score 0.1`、`title`/`by`/`after`、`instruments`，然后 `piece road  来路  The Road Behind` |
| `violin-theme` | 把 theme 的 8 小节重抄一遍，part 头带 `attack 200ms +13 dB` | `part violin-theme  violins  doubles theme  overlap s  lead`；mix 里写 `violin-theme  +13 dB  attack 200ms` |
| `violin-turn` | 重抄 turn | `doubles turn`；mix 里写 `+13 dB  attack 220ms` |
| `stream` | 靠声部名排成内声部 | part 头加 `inner` |
| `pizz` | `part pizz  mf  +16 dB`（乐器隐含为 pizz） | `part pizz  violins pizz.  mf`；mix 里写 `pizz  +16 dB` |
| `violin-pad` | `+6 dB` | 移到 mix |
| `lift-strings`、`coda-strings` | part 头带 attack 和 dB | 移到 mix |
| form | `form  — mark, chords, then who plays` | 不变（`form` 表示播一遍就结束） |

其余内容（和弦组、旋律、音型、once 段、form 每一行）原样保留。

## 14. 留给 builder 决定

- 解析器内部结构、IR 的字段名、TypeScript 类型怎样组织。
- mix 里的百分比在宿主中实现成增益还是乘进力度（需满足 §10 的容差）。
- family 词表对应的默认 MIDI 音色号和谱号。
- 快照对照脚本放在哪里、用什么跑（不进生产构建）。

## 15. 设计者自己做的决定（未经作者确认）

- 用 `score 0.1` 版本行，不兼容旧格式；两份旧谱子一次性改写，旧解析器删掉。
- 一个文件可以有多首 piece；`piece` 后面的第一个词是给宿主用的 id。
- 场景改名为 variant，只能对 form 行做三种编辑（drop、for、追加选项），不能另写音符。
- form 行只写声部名。（"没写的声部不生成音符"已经由作者确认，见 §9 第 1 条。）
- 音型统一为每个和弦重复一次。
- double 不继承被抄声部在 form 行里的选项。
- `+5th` 和 `fifth` 都保留，靠图例区分。
- mix 写在同一文件里的独立块，不另开文件。
- `pizz` 改为演奏法；v0.1 的演奏法只有 `pizz.` 和 `arco`。
- 乐器名和声部名不能重名。
