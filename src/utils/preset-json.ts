import type { PresetTest, StyleOption, StylePreset, StyleVariable, TemplateBlock } from "../types";

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
      options: [
        { value: "full body", provides: ["face", "torso", "legs", "feet"] },
        { value: "close-up on face", provides: ["face"] },
        { value: "close-up on foot and footwear", provides: ["feet"] },
      ],
    },
    SUBJECT: {
      options: [{ value: "a muscular wolf" }, { value: "a muscular tiger" }],
    },
    OUTFIT: {
      requires: ["torso"],
      probability: 0.8,
      options: [{ value: "a simple cloak" }, { value: "an athletic jacket" }],
    },
    FOOTWEAR: {
      requires: ["feet"],
      options: [{ value: "high-top sneakers" }, { value: "heavy work boots" }],
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
  ],
  randomize_variables: true,
  aspect_ratio: "16:9",
};

export const presetTemplateText = JSON.stringify(presetTemplate, null, 2);

export const presetAiInstructions = `你要为 Burn Wallpaper 生成 schema_version 2 的风格预设 JSON。

用户需求：请在这里描述角色、构图、服装、画风与禁忌。

规则：
1. 只输出 JSON，不要 Markdown 代码围栏或解释。
2. template 由 text/if 片段组成，使用 {VARIABLE} 占位；可选描述必须放进对应 if 片段。
3. provider 变量的每个选项必须明确设置 provides 或 unconstrained: true，不能漏掉。
4. 变量用 requires 设置默认可见性，选项可用 requires 覆盖。未设置 requires 的选项始终兼容，因此姿势、表情、身体描述也要检查。
5. 可选变量使用 0–1 的 probability。
6. tests 必须覆盖每个特殊构图，检查 include/omit 变量；测试会在本地执行，不会消耗出图额度。
7. 不要引用未定义的变量、选项或标签。变量名使用大写 A–Z、0–9、下划线，标签使用小写字母开头。
8. 导入器会严格报错；如有错误，请根据错误路径完整修正 JSON。

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
  if (value.provides !== undefined) option.provides = tags(value.provides, `${path}.provides`);
  if (value.requires !== undefined) option.requires = tags(value.requires, `${path}.requires`);
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
    if (!isRecord(raw.expect)) fail(`${path}.expect`, "必须是 include/omit 对象");
    for (const key of ["include", "omit"] as const) {
      if (raw.expect[key] === undefined) continue;
      if (!Array.isArray(raw.expect[key])) fail(`${path}.expect.${key}`, "必须是变量名数组");
      const names = raw.expect[key].map((entry) => stringValue(entry, `${path}.expect.${key}`));
      for (const name of names) {
        if (!(name in variables)) fail(`${path}.expect.${key}`, `引用了未定义变量 ${name}`);
      }
      test.expect[key] = names;
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
