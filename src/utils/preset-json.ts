import type { ContentPack, PresetBundle, PresetTest, StyleCategory, StyleOption, StylePack, StylePreset, StyleVariable, TemplateBlock, VariableGroup } from "../types";

export const presetTemplate: ContentPack = {
  schema_version: 3,
  kind: "content",
  id: "my_subject",
  name: "我的内容",
  english: "CUSTOM_CONTENT",
  description: "自定义角色、构图、服装与画面气氛",
  is_builtin: false,
  template: [
    { text: "A {FRAMING} of {SUBJECT}" },
    { if: "OUTFIT", text: ", wearing {OUTFIT}" },
    { if: "FOOTWEAR", text: ", with {FOOTWEAR}" },
    { text: ", {MOOD}, no text" },
  ],
  variables: {
    FRAMING: {
      provider: true,
      group: "presentation",
      label: "构图",
      options: [
        { value: "full body", label: "全身", provides: ["face", "torso", "legs", "feet"] },
        { value: "close-up on face", label: "面部特写", provides: ["face"] },
        { value: "close-up on foot and footwear", label: "脚部特写", provides: ["feet"] },
      ],
    },
    SUBJECT: {
      group: "content",
      label: "主体",
      options: [{ value: "an anthropomorphic wolf", label: "拟人狼" }, { value: "an anthropomorphic tiger", label: "拟人虎" }],
    },
    OUTFIT: {
      group: "content",
      label: "服装",
      requires: ["torso"],
      probability: 0.8,
      options: [{ value: "a simple cloak", label: "简易披风" }, { value: "an athletic jacket", label: "运动夹克" }],
    },
    FOOTWEAR: {
      group: "content",
      label: "鞋",
      requires: ["feet"],
      options: [{ value: "high-top sneakers", label: "高帮球鞋" }, { value: "heavy work boots", label: "厚重工靴" }],
    },
    MOOD: {
      group: "presentation",
      label: "情绪",
      options: [{ value: "quiet confidence", label: "沉静自信" }, { value: "playful curiosity", label: "俏皮好奇" }],
    },
  },
  tests: [
    {
      name: "脚部特写只保留鞋子",
      select: { FRAMING: "close-up on foot and footwear" },
      expect: { include: ["FOOTWEAR"], omit: ["OUTFIT"] },
    },
    {
      name: "面部特写省略衣服与鞋子",
      select: { FRAMING: "close-up on face" },
      expect: { omit: ["OUTFIT", "FOOTWEAR"] },
    },
    {
      name: "内容层不含材质词",
      select: { FRAMING: "full body" },
      expect: { group_excludes: [{ group: "content", words: ["glossy", "brush", "subsurface"] }] },
    },
  ],
  randomize_variables: true,
  aspect_ratio: "16:9",
  preferred_style_ids: ["core"],
};

export const stylePresetTemplate: StylePack = {
  schema_version: 3,
  kind: "style",
  id: "my_visuals",
  name: "我的画风",
  english: "CUSTOM_STYLE",
  description: "自定义画风、材质与背景处理",
  is_builtin: false,
  template: [
    { text: "{ART_STYLE}, {MATERIAL}" },
    { if: "BACKDROP", text: ", {BACKDROP}" },
  ],
  variables: {
    ART_STYLE: {
      provider: true,
      group: "style",
      label: "画风",
      options: [
        { value: "modern anime illustration", label: "现代动漫", category: "anime", provides: ["modern", "anime_2d"] },
        { value: "flat graphic poster art", label: "平面海报", category: "graphic", provides: ["flat", "graphic"] },
      ],
    },
    MATERIAL: {
      group: "style",
      label: "材质",
      options: [
        { value: "clean lineart with a polished surface", label: "干净线稿", any_of: ["modern", "anime_2d"] },
        { value: "flat color blocks with no texture", label: "平涂色块", any_of: ["flat", "graphic"] },
      ],
    },
    BACKDROP: {
      group: "style",
      label: "背景处理",
      probability: 0.6,
      options: [
        { value: "with stylized speed lines across the backdrop", label: "速度线", any_of: ["anime_2d"] },
        { value: "with a flat solid vivid red filling the backdrop", label: "纯红背景", any_of: ["flat"] },
      ],
    },
  },
  tests: [
    {
      name: "平面画风使用平涂材质",
      select: { ART_STYLE: "flat graphic poster art", MATERIAL: "flat color blocks with no texture" },
      expect: { values: { ART_STYLE: "flat graphic poster art", MATERIAL: "flat color blocks with no texture" } },
    },
    {
      name: "平面画风省略动漫线稿",
      select: { ART_STYLE: "flat graphic poster art", MATERIAL: "clean lineart with a polished surface" },
      expect: { omit: ["MATERIAL"] },
    },
  ],
  randomize_variables: true,
};

export const presetTemplateText = JSON.stringify(presetTemplate, null, 2);
export const stylePresetTemplateText = JSON.stringify(stylePresetTemplate, null, 2);
export const createPresetBundle = (content: ContentPack, style: StylePack): PresetBundle => ({
  schema_version: 3,
  kind: "bundle",
  content,
  style,
});
export const presetBundleTemplateText = JSON.stringify(createPresetBundle(presetTemplate, stylePresetTemplate), null, 2);

export const presetAiInstructions = `你要为 Burn Wallpaper 生成 schema_version 3 的 JSON。

用户需求：请在这里描述要生成的内容包、画风包或两者。

三种输出：
- kind: "content"：只定义画什么与怎么摆，包含 content / presentation 变量、模板和测试。
- kind: "style"：只定义怎么画，包含 style 变量、模板和测试。
- kind: "bundle"：同时包含一个完整 content 对象和一个完整 style 对象。

规则：
1. 只输出一个完整 JSON 对象，不要输出数组、多个文件、index.ts、Markdown 代码围栏或解释。
2. content 与 style 必须能分别解析；content 的模板不得引用画风变量，style 的模板不得引用内容变量。
3. 每个变量必须声明 group。content 包只允许 content / presentation；style 包只允许 style。
4. provider 选项必须明确设置 provides 或 unconstrained: true。style 包的 provider 选项还要声明 category：photography / anime / illustration / graphic / three_d / experimental。
5. 变量用 requires 设置默认可见性，选项可用 requires 覆盖；any_of 命中任一标签即可，excludes 命中任一标签即排除，weight 是随机权重。全部 weight 为 0 时该变量会被省略。
6. 可选变量使用 0–1 的 probability。模板由 text/if 片段组成，可选描述必须放进对应 if 片段。
7. tests 支持 include / omit / values / prompt_contains / prompt_excludes / group_excludes / compare，全部在本地执行。
8. 不要引用未定义的变量、选项或标签。变量名使用大写 A–Z、0–9、下划线，标签使用小写字母开头。
9. value 必须是英文提示词，label 是简短中文对照。
10. bundle 的结构固定为 { "schema_version": 3, "kind": "bundle", "content": {…}, "style": {…} }。
11. 导入器只接受 schema_version 3，不兼容 v2；如有错误，请根据错误路径完整修正 JSON。

完整 content 示例：
${presetTemplateText}

完整 style 示例：
${stylePresetTemplateText}

进阶字段片段：以下不是完整输出，最终仍须输出一个完整对象。
{
  "value": "soft fuzzy fur",
  "any_of": ["cgi", "storybook"],
  "excludes": ["flat"],
  "weight": 2
}

分层禁词断言示例：
{
  "name": "内容层不含材质词",
  "select": { "FRAMING": "full body" },
  "expect": { "group_excludes": [{ "group": "content", "words": ["glossy", "brush", "subsurface"] }] }
}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function fail(path: string, message: string): never {
  throw new Error(`${path} ${message}`);
}

function stringValue(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string") fail(path, "必须是字符串");
  const text = value.trim();
  if (!allowEmpty && !text) fail(path, "不能为空");
  return text;
}

function tags(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) fail(path, "必须是标签数组");
  return value.map((tag, index) => {
    const parsed = stringValue(tag, `${path}[${index}]`);
    if (!/^[a-z][a-z0-9_-]*$/.test(parsed)) fail(`${path}[${index}]`, "标签必须以小写字母开头，只能含小写字母、数字、_、-");
    return parsed;
  });
}

const categories: StyleCategory[] = ["photography", "anime", "illustration", "graphic", "three_d", "experimental"];

function parseOption(value: unknown, path: string, provider: boolean, categoryRequired: boolean): StyleOption {
  if (!isRecord(value)) fail(path, "必须是选项对象");
  const option: StyleOption = { value: stringValue(value.value, `${path}.value`) };
  if (value.label !== undefined) option.label = stringValue(value.label, `${path}.label`);
  if (value.provides !== undefined) option.provides = tags(value.provides, `${path}.provides`);
  if (value.requires !== undefined) option.requires = tags(value.requires, `${path}.requires`);
  if (value.any_of !== undefined) option.any_of = tags(value.any_of, `${path}.any_of`);
  if (value.excludes !== undefined) option.excludes = tags(value.excludes, `${path}.excludes`);
  if (value.weight !== undefined) {
    if (typeof value.weight !== "number" || !Number.isFinite(value.weight) || value.weight < 0) fail(`${path}.weight`, "必须是非负数字");
    option.weight = value.weight;
  }
  if (value.category !== undefined) {
    const category = stringValue(value.category, `${path}.category`);
    if (!categories.includes(category as StyleCategory)) fail(`${path}.category`, `只能是 ${categories.join(" / ")}`);
    option.category = category as StyleCategory;
  }
  if (categoryRequired && option.category === undefined) fail(`${path}.category`, "画风包的 provider 选项必须声明分类");
  if (value.unconstrained !== undefined) {
    if (typeof value.unconstrained !== "boolean") fail(`${path}.unconstrained`, "必须是布尔值");
    option.unconstrained = value.unconstrained;
  }
  if (provider && option.provides === undefined && option.unconstrained !== true) {
    fail(path, "provider 选项必须明确设置 provides 或 unconstrained: true");
  }
  if (!provider && option.provides !== undefined) fail(`${path}.provides`, "只有 provider 变量的选项能提供标签");
  if (option.unconstrained && option.provides?.length) fail(path, "unconstrained 与 provides 不能同时设置");
  return option;
}

function parseVariables(value: unknown, path: string, kind: "content" | "style"): Record<string, StyleVariable> {
  if (!isRecord(value)) fail(path, "必须是变量对象");
  const variables: Record<string, StyleVariable> = {};
  for (const [name, raw] of Object.entries(value)) {
    const variablePath = `${path}.${name}`;
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) fail(variablePath, "变量名必须以大写字母开头，只能含大写字母、数字、下划线");
    if (!isRecord(raw)) fail(variablePath, "必须是变量配置对象");
    if (raw.provider !== undefined && typeof raw.provider !== "boolean") fail(`${variablePath}.provider`, "必须是布尔值");
    const provider = raw.provider === true;
    const variable: StyleVariable = { options: [] };
    if (raw.label !== undefined) variable.label = stringValue(raw.label, `${variablePath}.label`);
    const group = stringValue(raw.group, `${variablePath}.group`);
    if (group !== "content" && group !== "style" && group !== "presentation") fail(`${variablePath}.group`, "只能是 content / style / presentation");
    if (kind === "content" && group === "style") fail(`${variablePath}.group`, "内容包不能包含 style 变量");
    if (kind === "style" && group !== "style") fail(`${variablePath}.group`, "画风包只能包含 style 变量");
    variable.group = group;
    if (provider) variable.provider = true;
    if (raw.requires !== undefined) variable.requires = tags(raw.requires, `${variablePath}.requires`);
    if (raw.probability !== undefined) {
      if (typeof raw.probability !== "number" || !Number.isFinite(raw.probability) || raw.probability < 0 || raw.probability > 1) {
        fail(`${variablePath}.probability`, "必须是 0–1 的数字");
      }
      variable.probability = raw.probability;
    }
    if (!Array.isArray(raw.options) || raw.options.length === 0) fail(`${variablePath}.options`, "至少需要一个选项");
    const values = new Set<string>();
    variable.options = raw.options.map((option, index) => {
      const parsed = parseOption(option, `${variablePath}.options[${index}]`, provider, kind === "style" && provider);
      if (values.has(parsed.value)) fail(`${variablePath}.options[${index}]`, `选项值重复：${parsed.value}`);
      values.add(parsed.value);
      return parsed;
    });
    variables[name] = variable;
  }
  return variables;
}

function parseTemplate(value: unknown, variables: Record<string, StyleVariable>): TemplateBlock[] {
  if (!Array.isArray(value) || value.length === 0) fail("template", "至少需要一个模板片段");
  return value.map((raw, index) => {
    const path = `template[${index}]`;
    if (!isRecord(raw)) fail(path, "必须是模板片段对象");
    const block: TemplateBlock = { text: stringValue(raw.text, `${path}.text`, true) };
    if (raw.if !== undefined) {
      block.if = stringValue(raw.if, `${path}.if`);
      if (!(block.if in variables)) fail(`${path}.if`, `引用了未定义变量 ${block.if}`);
    }
    for (const match of block.text.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
      if (!(match[1] in variables)) fail(`${path}.text`, `引用了未定义变量 {${match[1]}}`);
    }
    return block;
  });
}

function parseTests(value: unknown, variables: Record<string, StyleVariable>): PresetTest[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail("tests", "必须是测试数组");
  return value.map((raw, index) => {
    const path = `tests[${index}]`;
    if (!isRecord(raw)) fail(path, "必须是测试对象");
    const test: PresetTest = { name: stringValue(raw.name, `${path}.name`), select: {}, expect: {} };
    if (!isRecord(raw.select)) fail(`${path}.select`, "必须是变量选择对象");
    for (const [variable, selection] of Object.entries(raw.select)) {
      if (!(variable in variables)) fail(`${path}.select.${variable}`, "引用了未定义变量");
      const value = stringValue(selection, `${path}.select.${variable}`);
      if (value !== "__random__" && value !== "__omit__" && !variables[variable].options.some((option) => option.value === value)) {
        fail(`${path}.select.${variable}`, `选项不存在：${value}`);
      }
      test.select[variable] = value;
    }
    if (raw.random !== undefined) {
      if (typeof raw.random !== "number" || raw.random < 0 || raw.random > 1) fail(`${path}.random`, "必须是 0–1 的数字");
      test.random = raw.random;
    }
    const expectRaw = raw.expect;
    if (!isRecord(expectRaw)) fail(`${path}.expect`, "必须是断言对象");
    for (const key of ["include", "omit"] as const) {
      if (expectRaw[key] === undefined) continue;
      if (!Array.isArray(expectRaw[key])) fail(`${path}.expect.${key}`, "必须是变量名数组");
      const names = expectRaw[key].map((entry) => stringValue(entry, `${path}.expect.${key}`));
      for (const name of names) if (!(name in variables)) fail(`${path}.expect.${key}`, `引用了未定义变量 ${name}`);
      test.expect[key] = names;
    }
    if (expectRaw.values !== undefined) {
      if (!isRecord(expectRaw.values)) fail(`${path}.expect.values`, "必须是变量值对象");
      const values: Record<string, string> = {};
      for (const [variable, expected] of Object.entries(expectRaw.values)) {
        if (!(variable in variables)) fail(`${path}.expect.values.${variable}`, "引用了未定义变量");
        const text = stringValue(expected, `${path}.expect.values.${variable}`);
        if (!variables[variable].options.some((option) => option.value === text)) fail(`${path}.expect.values.${variable}`, `选项不存在：${text}`);
        values[variable] = text;
      }
      test.expect.values = values;
    }
    for (const key of ["prompt_contains", "prompt_excludes"] as const) {
      if (expectRaw[key] === undefined) continue;
      if (!Array.isArray(expectRaw[key])) fail(`${path}.expect.${key}`, "必须是字符串数组");
      test.expect[key] = expectRaw[key].map((entry, entryIndex) => stringValue(entry, `${path}.expect.${key}[${entryIndex}]`));
    }
    if (expectRaw.group_excludes !== undefined) {
      if (!Array.isArray(expectRaw.group_excludes)) fail(`${path}.expect.group_excludes`, "必须是分组禁词规则数组");
      test.expect.group_excludes = expectRaw.group_excludes.map((rule, ruleIndex) => {
        const rulePath = `${path}.expect.group_excludes[${ruleIndex}]`;
        if (!isRecord(rule)) fail(rulePath, "必须是规则对象");
        const group = stringValue(rule.group, `${rulePath}.group`);
        if (group !== "content" && group !== "style" && group !== "presentation") fail(`${rulePath}.group`, "只能是 content / style / presentation");
        if (!Array.isArray(rule.words)) fail(`${rulePath}.words`, "必须是字符串数组");
        return { group: group as VariableGroup, words: rule.words.map((word, wordIndex) => stringValue(word, `${rulePath}.words[${wordIndex}]`)) };
      });
    }
    if (raw.compare !== undefined) {
      if (!isRecord(raw.compare)) fail(`${path}.compare`, "必须是对比对象");
      const vary = stringValue(raw.compare.vary, `${path}.compare.vary`);
      if (!(vary in variables)) fail(`${path}.compare.vary`, "引用了未定义变量");
      const alternative = stringValue(raw.compare.with, `${path}.compare.with`);
      if (!variables[vary].options.some((option) => option.value === alternative)) fail(`${path}.compare.with`, `选项不存在：${alternative}`);
      if (!Array.isArray(raw.compare.stable)) fail(`${path}.compare.stable`, "必须是变量名数组");
      const stable = raw.compare.stable.map((entry, entryIndex) => {
        const name = stringValue(entry, `${path}.compare.stable[${entryIndex}]`);
        if (!(name in variables)) fail(`${path}.compare.stable[${entryIndex}]`, "引用了未定义变量");
        return name;
      });
      test.compare = { vary, with: alternative, stable };
    }
    return test;
  });
}

function parsePack(item: unknown, path: string, usedIds: Set<string>): StylePreset {
  if (!isRecord(item)) fail(path, "必须是 JSON 对象");
  if (item.schema_version !== 3) fail(`${path}.schema_version`, "必须是 3；此版本不兼容旧 JSON 格式");
  const kind = stringValue(item.kind, `${path}.kind`);
  if (kind !== "content" && kind !== "style") fail(`${path}.kind`, "只能是 content / style");
  const idValue = stringValue(item.id, `${path}.id`);
  const baseId = idValue.replace(/[^a-zA-Z0-9_-]/g, "-") || "imported";
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
  usedIds.add(id);
  const variables = parseVariables(item.variables, `${path}.variables`, kind);
  const base = {
    schema_version: 3 as const,
    kind,
    id,
    name: stringValue(item.name, `${path}.name`),
    english: typeof item.english === "string" && item.english.trim() ? item.english.trim() : "CUSTOM",
    description: typeof item.description === "string" ? item.description.trim() : "自定义包",
    is_builtin: false,
    template: parseTemplate(item.template, variables),
    variables,
    tests: parseTests(item.tests, variables),
    randomize_variables: item.randomize_variables === true,
  };
  if (kind === "style") return { ...base, kind: "style" };
  const ratios = ["16:9", "21:9", "32:9", "9:16"];
  const content: ContentPack = {
    ...base,
    kind: "content",
    aspect_ratio: typeof item.aspect_ratio === "string" && ratios.includes(item.aspect_ratio) ? item.aspect_ratio : "16:9",
  };
  if (item.preferred_style_ids !== undefined) {
    if (!Array.isArray(item.preferred_style_ids)) fail(`${path}.preferred_style_ids`, "必须是画风包 ID 数组");
    content.preferred_style_ids = item.preferred_style_ids.map((entry, index) => stringValue(entry, `${path}.preferred_style_ids[${index}]`));
  }
  return content;
}

export function parseStylePresetImport(text: string, existingIds: string[]): StylePreset[] {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("JSON 格式不正确，请检查逗号、引号与括号");
  }
  const items = Array.isArray(input) ? input : [input];
  if (!items.length) throw new Error("文件中没有可导入的包");
  const usedIds = new Set(existingIds);
  return items.flatMap((item, index) => {
    const path = Array.isArray(input) ? `[${index}]` : "preset";
    if (!isRecord(item)) fail(path, "必须是 JSON 对象");
    if (item.kind === "bundle") {
      if (item.schema_version !== 3) fail(`${path}.schema_version`, "必须是 3；此版本不兼容旧 JSON 格式");
      return [
        parsePack(item.content, `${path}.content`, usedIds),
        parsePack(item.style, `${path}.style`, usedIds),
      ];
    }
    return [parsePack(item, path, usedIds)];
  });
}
