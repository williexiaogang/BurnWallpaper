import type { PresetTest, StyleOption, StylePreset, StyleVariable, TemplateBlock, VariableGroup } from "../types";

export const presetTemplate: StylePreset = {
  schema_version: 2,
  id: "my_style",
  name: "我的风格",
  english: "CUSTOM",
  description: "自定义角色、构图、服装与画面气氛",
  is_builtin: false,
  template: [
    { text: "A cinematic {FRAMING} poster of {SUBJECT}" },
    { if: "OUTFIT", text: ", wearing {OUTFIT}" },
    { if: "FOOTWEAR", text: ", with {FOOTWEAR}" },
    { text: ", dramatic lighting, no text" },
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
};

export const presetTemplateText = JSON.stringify(presetTemplate, null, 2);

export const presetAiInstructions = `你要为 Burn Wallpaper 生成一套 schema_version 2 的风格预设 JSON。

用户需求：请在这里描述角色、构图、服装、画风与禁忌。

规则：
1. 只输出一个完整的 preset JSON 对象，不要输出数组、多个文件、index.ts、Markdown 代码围栏或解释。这个对象可直接在 APP 的「风格」页导入。
2. template 由 text/if 片段组成，使用 {VARIABLE} 占位；可选描述必须放进对应 if 片段。
3. provider 变量的每个选项必须明确设置 provides 或 unconstrained: true，不能漏掉；provides 可给多个标签。
4. 变量用 requires 设置默认可见性，选项可用 requires 覆盖；选项还可用 any_of（命中任一标签即可）、excludes（命中任一标签即排除）、weight（随机权重，默认 1）。未设置约束的选项始终兼容，因此姿势、表情、身体描述也要检查。同一变量在随机模式下至少保留一个正权重选项；全部 weight 为 0 时该变量会被省略。
5. 每个变量用 group 声明语义分层：content 只描述画什么（物种、体型、动作、物件、场景），style 只描述怎么画（画风、材质、笔触、光、背景处理），presentation 描述怎么摆（构图、视角、氛围、情绪、文字）。content 层禁止出现 glossy、brush、subsurface、cel、3D、bokeh 等材质或画风词；风格不得写死在 template 首句或内容变量里。
6. 可选变量使用 0–1 的 probability。
7. tests 支持 include / omit / values / prompt_contains / prompt_excludes / group_excludes / compare，在本地执行，不消耗出图额度；用 group_excludes 检查分层禁词，用 compare 验证更换画风后内容层不变。
8. 不要引用未定义的变量、选项或标签。变量名使用大写 A–Z、0–9、下划线，标签使用小写字母开头。
9. 变量与选项都可以加 label 中文对照（选填）：界面显示 label，实际 prompt 仍使用 value。value 必须是英文提示词，label 是简短中文。
10. 导入器会严格报错；如有错误，请根据错误路径完整修正 JSON。

导入与导出都以单套 preset 为单位，不需要包含其他内置预设。只有要把生成结果加入内置预设时，才需另外保存为 src/style-presets/<id>.json 并在 src/style-presets/index.ts 登记；不要在导入用 JSON 中添加文件路径或注册信息。

完整基础示例：
${presetTemplateText}

进阶写法：以下只是字段片段，按需使用，不要把片段当作最终输出；最终仍须输出一份完整 preset。

1. 选项级 requires：只有 provider 当前提供 torso 标签时，这个服装选项才可用。
{
  "value": "an athletic jacket",
  "requires": ["torso"]
}

2. provider 选项的 unconstrained：表示该选项不提供标签，并且不过滤任何依赖标签的变量。
{
  "value": "an abstract close-up",
  "unconstrained": true
}

3. 固定 random 的测试：random 是 0–1 的确定性随机值。以下示例验证 probability 为 0.8 的 OUTFIT 在 random 为 0.9 时被省略。
{
  "name": "随机值较高时省略服装",
  "select": { "FRAMING": "full body" },
  "random": 0.9,
  "expect": { "omit": ["OUTFIT"] }
}

4. 选项级 any_of / excludes / weight：适用于 cgi 或 storybook 画风，但不适用于 flat，随机权重加倍。
{
  "value": "soft fuzzy fur",
  "any_of": ["cgi", "storybook"],
  "excludes": ["flat"],
  "weight": 2
}

5. 变量分层：内容层只写画什么，不写材质。
{
  "group": "content",
  "label": "体型",
  "options": [{ "value": "a chubby rounded build", "label": "圆胖" }]
}

6. 分层禁词断言：检查 content 组变量解析值里没有材质词。
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

function parseOption(value: unknown, path: string, provider: boolean): StyleOption {
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

function parseVariables(value: unknown, path: string): Record<string, StyleVariable> {
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
    if (raw.group !== undefined) {
      const group = stringValue(raw.group, `${variablePath}.group`);
      if (group !== "content" && group !== "style" && group !== "presentation") fail(`${variablePath}.group`, "只能是 content / style / presentation");
      variable.group = group;
    }
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
      const parsed = parseOption(option, `${variablePath}.options[${index}]`, provider);
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
    const test: PresetTest = {
      name: stringValue(raw.name, `${path}.name`),
      select: {},
      expect: {},
    };
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
      for (const name of names) {
        if (!(name in variables)) fail(`${path}.expect.${key}`, `引用了未定义变量 ${name}`);
      }
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
        return {
          group: group as VariableGroup,
          words: rule.words.map((word, wordIndex) => stringValue(word, `${rulePath}.words[${wordIndex}]`)),
        };
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

export function parseStylePresetImport(text: string, existingIds: string[]): StylePreset[] {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("JSON 格式不正确，请检查逗号、引号与括号");
  }
  const items = Array.isArray(input) ? input : [input];
  if (!items.length) throw new Error("文件中没有可导入的预设");
  const usedIds = new Set(existingIds);

  return items.map((item, index) => {
    const path = Array.isArray(input) ? `[${index}]` : "preset";
    if (!isRecord(item)) fail(path, "必须是 JSON 对象");
    if (item.schema_version !== 2) fail(`${path}.schema_version`, "必须是 2；此版本不支持旧 JSON 格式");
    const idValue = stringValue(item.id, `${path}.id`);
    const name = stringValue(item.name, `${path}.name`);
    const variables = parseVariables(item.variables, `${path}.variables`);
    const template = parseTemplate(item.template, variables);
    const tests = parseTests(item.tests, variables);

    const baseId = idValue.replace(/[^a-zA-Z0-9_-]/g, "-") || `imported-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    const ratios = ["16:9", "21:9", "32:9", "9:16"];

    return {
      schema_version: 2,
      id,
      name,
      english: typeof item.english === "string" && item.english.trim() ? item.english.trim() : "CUSTOM",
      description: typeof item.description === "string" ? item.description.trim() : "自定义风格",
      is_builtin: false,
      template,
      variables,
      tests,
      randomize_variables: item.randomize_variables === true,
      aspect_ratio: typeof item.aspect_ratio === "string" && ratios.includes(item.aspect_ratio) ? item.aspect_ratio : "16:9",
    };
  });
}
