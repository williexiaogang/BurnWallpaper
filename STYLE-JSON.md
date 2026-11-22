# STYLE-JSON — 内容包与画风包契约

版本：v3 ｜ 日期：2026-11-22

**只接受 `schema_version: 3`，不兼容 v2。** 内容包与画风包可独立生成、导入、测试与导出；需要一次携带两者时使用 `bundle`。

## 1. 文件结构

```text
src/style-presets/
├── content/
│   ├── general.json
│   ├── concept.json
│   ├── asian_male_studio.json
│   └── aj_series.json
├── styles/
│   ├── anime.json
│   ├── illustration.json
│   ├── graphic.json
│   ├── three_d.json
│   └── photography.json
└── index.ts
```

- `content/` 负责画什么与怎么摆。
- `styles/` 负责怎么画。
- `index.ts` 统一登记内置包；新增内置包时新增 JSON 并在入口导入、加入默认导出数组。
- 自定义包通过 APP「风格」页导入，保存于 `custom_prompt_packs`。

## 2. 三种 JSON

### 内容包

```json
{
  "schema_version": 3,
  "kind": "content",
  "content_type": "anthropomorphic",
  "id": "my_subject",
  "name": "我的内容",
  "template": [{ "text": "{SUBJECT}, {FRAMING}" }],
  "variables": {},
  "tests": [],
  "randomize_variables": true,
  "aspect_ratio": "16:9",
  "preferred_style_ids": ["anime", "illustration", "graphic", "three_d"]
}
```

实际 `variables` 必须至少定义模板引用的变量。内容包只允许 `content` 与 `presentation` 分组，不得引用 `ART_STYLE`、`MATERIAL` 等画风变量。`content_type` 为 `anthropomorphic` / `human` / `abstract`。

### 画风包

```json
{
  "schema_version": 3,
  "kind": "style",
  "supported_content_types": ["anthropomorphic", "abstract"],
  "id": "my_visuals",
  "name": "我的画风",
  "template": [{ "text": "{ART_STYLE}, {MATERIAL}" }],
  "variables": {},
  "tests": [],
  "randomize_variables": true
}
```

画风包只允许 `style` 分组，不得引用内容或构图变量。`aspect_ratio` 只属于内容包。

### 组合包

```json
{
  "schema_version": 3,
  "kind": "bundle",
  "content": { "…": "完整内容包" },
  "style": { "…": "完整画风包" }
}
```

`bundle` 直接内嵌两个完整对象，不使用外部路径或引用。导入后会拆成两个独立 pack，用户仍可改选其他内置或自定义画风包。

## 3. 生成与多选规则

内容包与画风包分别解析为 `contentPrompt` 与 `stylePrompt`，最终由 APP 组合。两边的模板与占位符互不依赖。

画风包支持单选与多选：

- 单选：固定使用该包。
- 多选：建立候选池，每次出图先随机抽中一包，再解析包内变量。
- 不会把多个画风包叠加进同一张图。
- 「换一组」也会从已启用包中重新抽取。
- 历史与确认流程使用实际抽中的包，确保 Prompt 可重现。

`preferred_style_ids` 只是内容包的推荐默认画风，不限制后续选择。只有画风包的 `supported_content_types` 包含内容的 `content_type` 时才可选择；不相容包会停用，GO 会显示具体原因，bundle 也会在导入时拒绝不相容组合。

## 4. 变量与约束

| 字段 | 位置 | 说明 |
|---|---|---|
| `group` | 变量 | 必填；`content` / `style` / `presentation` |
| `provider` | 变量 | 其选项通过 `provides` 提供约束标签 |
| `provides` | provider 选项 | 提供一个或多个标签 |
| `unconstrained` | provider 选项 | 不提供标签并取消约束 |
| `requires` | 变量 / 选项 | 所有标签均命中才相容；选项级覆盖变量级 |
| `any_of` | 选项 | 任一标签命中即相容 |
| `excludes` | 选项 | 任一标签命中即排除 |
| `weight` | 选项 | 随机权重，默认 1；全零时省略变量 |
| `probability` | 变量 | 0–1，随机模式下可能跳过 |
| `category` | 画风 provider 选项 | 必填的 UI 画风分类 |
| `content_types` | 选项 | 限定可搭配的內容类型；未設定則不限，例如动物绒毛只允许 `anthropomorphic` |
| `label` | 变量 / 选项 | 中文显示名；实际 Prompt 使用英文 `value` |

变量名使用 `^[A-Z][A-Z0-9_]*$`，标签使用 `^[a-z][a-z0-9_-]*$`。provider 选项必须显式设置 `provides` 或 `unconstrained: true`。

### 分类

`category` 只控制 UI 分组，不是相容标签：

- `photography`：摄影
- `anime`：动漫／漫画
- `illustration`：插画／手绘
- `graphic`：平面／海报／极简设计
- `three_d`：3D／立体渲染
- `experimental`：实验／其他

「概念」「复古」「极简」等意象可作为标签，不必与媒介分类混为一层。

### Provider 隔离

内容变量只读取非 style provider（通常是 `FRAMING`）；画风变量只读取 style provider（通常是 `ART_STYLE`）。原始标签不会跨包隐式合并。

## 5. 模板与测试

模板由 `text` / `if` 片段组成：

```json
[
  { "text": "{SUBJECT}, {FRAMING}" },
  { "if": "OUTFIT", "text": ", wearing {OUTFIT}" }
]
```

`if` 表示变量有解析值时才加入片段。所有占位符与 `if` 必须引用本包已定义变量。内容模板先写主体或母题，再写景别、视角与构图，避免重点被长串修饰词后移。

测试字段：

- `include` / `omit`：变量是否解析。
- `values`：变量必须解析为指定值。
- `prompt_contains` / `prompt_excludes`：Prompt 必须包含或排除子串。
- `group_excludes`：指定分组的解析值不得包含禁词。
- `compare`：替换一个变量后，其他变量应保持不变。
- `random`：固定 0–1 随机值，让测试可复现。

内容层禁词：`glossy`、`brush`、`subsurface`、`cross-hatching`、`impasto`、`bokeh`、`cel-shad`、`3d render`、`cinematic`、`poster art`、`halftone`、`speed lines`、`rim lighting`、`shallow depth of field`、`painterly`、`vector`、`engraving`、`ink wash`、`volumetric`。

## 6. APP 导入、编辑与导出

「风格」页支持：

- 导入 content、style 或 bundle JSON。
- 分别编辑内容与画风包的模板、变量、选项和测试。
- 导出当前单包。
- 将当前包与默认搭配导出为 bundle。
- 切换内容／画风／组合包 AI 示例并复制指令。

v2 会直接报错，不自动迁移。APP 尚未正式发布，因此不读取旧的 `custom_style_presets`。

## 7. 开发与验证

修改现有包时编辑对应 JSON；新增内置包时还需登记 `index.ts`。

```bash
npm run validate:presets
node scripts/validate-presets.mjs --samples
node scripts/test-scope-rules.mjs
npm run build
```

验证包括严格导入、包内测试、内容层禁词、bundle 拆分与画风包随机抽选。样图工作流见 `.sample/README.md`。
