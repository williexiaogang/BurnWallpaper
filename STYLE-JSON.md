# STYLE-JSON — 风格定义契约

版本：v2.1 ｜ 日期：2026-11-22

**目标：只用 JSON 就能定义任意风格。** 代码只提供通用表达能力，不硬编码任何画风、角色或变量名。新增一种画风、一个体型、一类背景，都只改 `src/style-presets.json`（或导入一份自定义 JSON），不需要动 `.ts` / `.tsx`。

---

## 1. 唯一入口与生效方式

| 项 | 说明 |
|---|---|
| 内置预设来源 | `src/style-presets.json`，由 `src/data.ts` 直接 import，`App.tsx` 每次启动读取 |
| 自定义预设 | 经 `src/utils/preset-json.ts` 导入，同样只写 JSON，存于 `custom_style_presets` |
| 生效 | 改完重新构建（或开发模式热更新）；内置预设不被本地缓存覆盖 |
| 校验 | `node scripts/validate-presets.mjs` —— 导入器校验 + 本地 tests + 分层禁词，**零出图额度** |
| 类型与打包 | `npm run build` |

`free` 预设的 `template` 为空，属于特殊内置项，不能作为自定义预设导入（导入器要求 template 至少一段）。

---

## 2. 三层语义边界（核心）

每个变量用 `group` 声明自己属于哪一层，UI 据此分组显示。

| 层 | group | 回答 | general 中的变量 | 只允许 | 禁止 |
|---|---|---|---|---|---|
| L1 内容 | `content` | 画什么 | ANIMAL、BODY_BUILD、COAT_PATTERN、FUR_COLOR、CLOTHING、LOWER_CLOTHING、FOOTWEAR、POSE、EXPRESSION、MARKS、ACCESSORY、PROP、SCENE | 物种、体型、动作、物件、地点、花纹 | 任何材质、笔触、画派、光质、镜头词 |
| L2 风格 | `style` | 怎么画 | ART_STYLE、MATERIAL、BRUSH、FINISH、BACKDROP、LIGHTING、LENS | 画派、材质、笔触、完成度、背景处理、打光、镜头 | 具体物件、角色身份、动作 |
| L3 呈现 | `presentation` | 怎么摆 | ANGLE、FRAMING、COMPOSITION、ATMOSPHERE、MOOD、TEXT | 视角、景别、布局、氛围、情绪、文字 | 材质、笔触、渲染词 |

**铁律**：

1. 风格不写死在 template 首句或内容变量里。改造前首句是 `A cinematic … poster of a muscular anthropomorphic {ANIMAL}`，把「肌肉猛兽 + 海报」焊死；现在首句只有 `{ANGLE} {FRAMING} {ANIMAL} {COMPOSITION}`。
2. `content` 层的 option `value` 不出现禁词。否则随机组合时会打架（平涂画风却要求油亮毛）。
3. 内容变量不依赖风格标签（`requires` / `any_of` 只引用 FRAMING 提供的 `face` / `torso` / `legs` / `feet`），这样换画风时内容不变 —— 由 `compare` 测试守住。
4. **L2 / L3 内部也要按画风族对齐**。只做「内容/风格解耦」不够：`LENS`、`LIGHTING`、`BACKDROP`、`ATMOSPHERE`、`MOOD` 若完全无条件随机，会出现「平涂画风 + 奶油虚化浅景深」「3D CGI + 半调网点」这类层内矛盾。这些选项用 `any_of` / `excludes` 引用 ART_STYLE 的标签即可，同时每組保留 1–4 個**不帶約束的通用選項**（如 `deep focus with crisp detail throughout`、`soft studio key light`），保證任何畫風下該變量池不為空。

### 画风族标签

`ART_STYLE` 的 `provides` 使用下列标签族，其他变量据此对齐：

| 族 | 标签 | 典型画风 |
|---|---|---|
| 立体渲染 | `cgi` `three_d` `soft` `realistic` | 3D 动画电影、柔和 3D、半写实 |
| 平面图形 | `flat` `graphic` `screenprint` `minimal` `psychedelic` | 平面海报、丝印、极简、迷幻向量 |
| 动漫漫画 | `anime_2d` `cel` `manga` `retro` `ink` `sticker` `commercial` | 现代动漫、赛璐璐、浓墨漫画、街潮贴纸 |
| 手绘 | `handpainted` `storybook` `painted` `engraving` | 绘本水粉、厚涂、钢笔蚀刻

### 内容层禁词表

`glossy`、`brush`、`subsurface`、`cross-hatching`、`impasto`、`bokeh`、`cel-shad`、`3d render`、`cinematic`、`poster art`、`halftone`、`speed lines`、`rim lighting`、`shallow depth of field`、`painterly`、`vector`、`engraving`、`ink wash`、`volumetric`

- 静态检查：`scripts/validate-presets.mjs` 扫描所有 `group: "content"` 的选项值。
- 运行时检查：`tests[].expect.group_excludes`，只检查该层变量解析出的值，不受风格层词汇干扰。

---

## 3. schema 字段速查（schema_version 2）

| 字段 | 位置 | 作用 |
|---|---|---|
| `label` | 变量 / 选项 | 中文对照；界面显示 label，实际 prompt 用英文 `value` |
| `group` | 变量 | `content` / `style` / `presentation`，决定 UI 分组与分层断言 |
| `provider` | 变量 | 声明为提供者，其选项的 `provides` 汇成标签集合 |
| `provides` | provider 选项 | 提供标签，可给多个，如 `["cgi", "three_d", "soft"]` |
| `unconstrained` | provider 选项 | 该选项不提供标签且取消全部约束，所有变量不过滤 |
| `requires` | 变量 / 选项 | 全部命中的标签；选项级覆盖变量级 |
| `any_of` | 选项 | 命中任一标签即可相容（与 requires 互补） |
| `excludes` | 选项 | provided 中出现任一标签即排除该选项 |
| `weight` | 选项 | 随机权重，默认 1；仅在随机模式下生效 |
| `probability` | 变量 | 0–1，随机模式下跳过该变量的概率 |
| `aspect_ratio` | preset | 白名单：`16:9` / `21:9` / `32:9` / `9:16` |

**约束判定顺序**（`utils/prompt.ts` 的 `compatibleOptions`）：`requires` 全部命中 → `any_of` 任一命中 → `excludes` 一个都不能命中。未写约束的选项始终相容。多个 provider 的标签合并成同一个集合，跨 provider 引用标签是允许的。

格式约束：变量名 `^[A-Z][A-Z0-9_]*$`，标签 `^[a-z][a-z0-9_-]*$`；provider 选项必须给 `provides` 或 `unconstrained: true`，两者不能同时出现；`template` 的占位符与 `if` 必须引用已定义变量，导入器严格报错。

---

## 4. general 预设改造摘要

| 项 | 改造前 | 改造后 |
|---|---|---|
| 模板首句 | `A cinematic … poster of a muscular anthropomorphic …` | `A {ANGLE} {FRAMING} of an anthropomorphic {ANIMAL}, {COMPOSITION}` |
| 变量数 | 23 | 26（content 13 / style 7 / presentation 6） |
| 画风 | 9 种，每个只提供 1 个标签 | 16 种，每个提供 2–3 个标签（含 3D CGI、绘本水粉、丝印、蚀刻、迷幻、贴纸、极简） |
| 质感 | 单一 `RENDERING`，一个画风常只剩 1–2 个相容项 | 拆成 `MATERIAL` / `BRUSH` / `FINISH` 三个独立变量，组合数相乘 |
| 背景 | `BACKGROUND` 场景与画法混用 | 拆成 `SCENE`（纯场景）+ `BACKDROP`（叠加式画法处理） |
| 毛发 | `FUR_DETAIL` 整变量是材质词 | 改为 `COAT_PATTERN`，只描述花纹 |
| 体型/情绪/道具 | 全肌肉、全热血、全健身 | 补圆胖 / 幼态 / 大头小身、萌系与丧萌表情、生活化道具 |
| 文字 | 28 个热血拟声，任何画风都会出 | 用 `any_of` / `excludes` 限定漫画系画风，另加 4 个中性字 |
| 性别 | 大量 `his` | 改为 `the` / 中性描述 |
| 层内对齐 | 无约束随机，平涂画风可能配上奶油虚化 | LENS / LIGHTING / BACKDROP / ATMOSPHERE / MOOD 共 47 个选项按画风族加 `any_of` / `excludes`，每组保留通用选项兜底 |
| tests | 6 条，只测 FRAMING 与画风相容 | 10 条，含分层禁词、换画风内容不变、体型×画风组合 |

---

## 5. 新增一种画风的正确姿势

只需在 `ART_STYLE` 加一项，并在材质/笔触/完成度里用 `any_of` 引用新标签；补一条 test。**不需要改任何 .ts / .tsx。**

```json
{ "value": "watercolor picture-book illustration", "label": "水彩绘本", "provides": ["watercolor", "handpainted"] }
```

```json
{ "value": "soft bleeding watercolor washes", "label": "水彩晕染", "any_of": ["watercolor"] }
```

```json
{
  "name": "水彩画风可配圆胖体型",
  "select": { "FRAMING": "full body", "ART_STYLE": "watercolor picture-book illustration", "BODY_BUILD": "a chubby rounded build with short limbs" },
  "expect": { "include": ["ART_STYLE", "BODY_BUILD"] }
}
```

---

## 6. tests 断言速查

| 断言 | 检查对象 | 用途 |
|---|---|---|
| `include` / `omit` | 变量是否被解析 | 特殊景别下可见性（原有用例） |
| `values` | 变量解析为指定值 | 固定组合，防止约束误过滤 |
| `prompt_contains` / `prompt_excludes` | 最终 prompt 子串 | 验证某词绝不出现（如平涂画风不配绒毛） |
| `group_excludes` | 指定 group 的变量解析值 | 「内容层不含材质词」这类分层约束 |
| `compare` | 换掉 `vary` 变量后 `stable` 变量值不变 | 验证换画风后内容层不受影响 |
| `random` | 固定 0–1 随机值 | 让含 probability 的测试可复现 |

所有断言在 `runPresetTests` 里本地执行，不调用出图接口。

---

## 7. 工作流

1. 改 `src/style-presets.json`（或写一份自定义 JSON 从风格页导入）。
2. 同步检查 `template` 的占位符与 `if` 片段 —— 删变量必须删引用。
3. 跑 `npm run validate:presets`，必须 `ALL OK`；加 `--samples` 可打印 4 种画风的实际 prompt，肉眼检查层内是否打架：`node scripts/validate-presets.mjs --samples`。
4. 跑 `npm run build`，确认类型与打包无误。
5. 在 APP 的「风格」页点「运行测试」复核，或直接到「此刻」随机几组看多样性。

未声明 `group` 的变量会在 UI 归入「未分组」，建议在 JSON 里显式声明。自定义预设在风格页编辑选项时，`group`、`any_of` 等字段会被保留。

`SCENE` 与 `BACKDROP` 是「环境场景 + 叠加式背景处理」两个独立变量，随机时可能组合出语义偏挤的搭配（如森林 + 纯艳红铺底）。若需要纯色海报感，把 `SCENE` 固定为 `a plain seamless studio backdrop` 或 `an empty color field` 再配纯色 `BACKDROP`；也可在自定义预设里给这两组加标签约束。

相关文件：`.sample/README.md`（样图工作流 SOP）、`.sample/INDEX.md`（图片 hash 台账与落地状态）、`.sample/batches/*/PROMPTS.md`（各批次反推 PROMPT 与变量候选）、`scripts/scan-samples.mjs`（增量盘点）、`DESIGN.md`（产品与视觉蓝图）。

---

## 8. 从样图到预设：增量工作流

新样图会持续加入 `.sample/`。为避免「已经分析过的图再分析一遍」，`.sample/` 采用 **inbox 物理隔离 + 内容 hash 台账 + 扫描脚本兜底** 三重机制；完整 SOP 见 `.sample/README.md`。

| 步骤 | 动作 | 命令 / 文件 |
|---|---|---|
| 0 | 新图丢进 `.sample/inbox/` | 无需改名、无需分类 |
| 1 | **分析前必须盘点**，只处理 🆕 未登记项 | `npm run samples:status` |
| 2 | 逐图写 PROMPT | `batches/<批次>/PROMPTS.md`（一批一份，固定五节） |
| 3 | 归档图片 + 登记 hash | `node scripts/scan-samples.mjs --register <批次>` |
| 4 | 把变量建议并入 `general` 预设 | `src/style-presets.json` + 补 tests |
| 5 | 校验、台账状态改 `verified` | `npm run validate:presets` / `npm run build` |

**去重键是图片内容的 sha256 前 12 位，不是文件名** —— 首批文件名虽是 32 位 hex，但实测并非内容哈希，改名或复制都靠 sha12 挡住。台账状态机 `pending → prompted → landed → verified` 用来区分「分析过」和「已加进 APP」，只有 `verified` 视为结案；`prompted` / `landed` 下次盘点仍会提醒。

**新增画风时仍然只改 JSON**：把批次 `PROMPTS.md` 第三节的变量建议按本文 §2 三层边界落位 —— 画风进 `ART_STYLE`（并给 2–3 个族标签），材质／笔触／完成度进 `MATERIAL`／`BRUSH`／`FINISH` 并用 `any_of` 对齐标签族，场景与背景处理分别进 `SCENE`／`BACKDROP`；每组建约束时保留通用选项兜底。**不要新建预设**（会把角色和风格重新绑死），也不要把材质词写进 `content` 层。
