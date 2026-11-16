import type { ScopeRules, StylePreset, TagRules } from "../types";

export const presetTemplate: StylePreset = {
  id: "my_style",
  name: "我的风格",
  english: "CUSTOM",
  description: "自定义角色、服装与画面气氛",
  is_builtin: false,
  prompt_template: "A cinematic poster of [SUBJECT], wearing [ACCESSORY], dramatic lighting, no text.",
  variables: {
    SUBJECT: ["a muscular wolf", "a muscular tiger"],
    ACCESSORY: ["a metal wristband", "a chain necklace"],
  },
  optional_variables: { ACCESSORY: 0.35 },
  randomize_variables: true,
  aspect_ratio: "16:9",
};

export const presetTemplateText = JSON.stringify(presetTemplate, null, 2);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const parseRegionList = (value: unknown): string[] | null =>
  Array.isArray(value) && value.length > 0 && value.every((region) => typeof region === "string" && /^[a-z][a-z0-9_-]*$/.test(region))
    ? value.map(String)
    : null;

/** 解析可选的 tag_rules（通用标签约束）；引用不存在变量/选项的标注会被丢弃（可能已被编辑）。 */
function parseTagRules(value: unknown, variables: Record<string, string[]>, presetName: string): TagRules | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${presetName} 的 tag_rules 必须是对象`);

  const tagRules: TagRules = {};
  if (value.resolve_order !== undefined) {
    if (!Array.isArray(value.resolve_order) || value.resolve_order.some((entry) => typeof entry !== "string")) {
      throw new Error(`${presetName} 的 tag_rules.resolve_order 必须是变量名数组`);
    }
    const order = (value.resolve_order as string[]).filter((entry) => entry in variables);
    if (order.length) tagRules.resolve_order = order;
  }

  if (value.provides !== undefined) {
    if (!isRecord(value.provides)) throw new Error(`${presetName} 的 tag_rules.provides 必须是对象`);
    const provides: Record<string, Record<string, string[]>> = {};
    for (const [variable, entries] of Object.entries(value.provides)) {
      if (!isRecord(entries) || !(variable in variables)) continue;
      const parsedEntries: Record<string, string[]> = {};
      for (const [option, tags] of Object.entries(entries)) {
        const parsed = parseRegionList(tags);
        if (parsed && variables[variable].includes(option)) parsedEntries[option] = parsed;
      }
      if (Object.keys(parsedEntries).length) provides[variable] = parsedEntries;
    }
    if (Object.keys(provides).length) tagRules.provides = provides;
  }

  if (value.variable_requires !== undefined) {
    if (!isRecord(value.variable_requires)) throw new Error(`${presetName} 的 tag_rules.variable_requires 必须是对象`);
    const variableRequires: Record<string, string[]> = {};
    for (const [variable, tags] of Object.entries(value.variable_requires)) {
      const parsed = parseRegionList(tags);
      if (parsed && variable in variables) variableRequires[variable] = parsed;
    }
    if (Object.keys(variableRequires).length) tagRules.variable_requires = variableRequires;
  }

  if (value.option_requires !== undefined) {
    if (!isRecord(value.option_requires)) throw new Error(`${presetName} 的 tag_rules.option_requires 必须是对象`);
    const optionRequires: Record<string, Record<string, string[]>> = {};
    for (const [variable, entries] of Object.entries(value.option_requires)) {
      if (!isRecord(entries) || !(variable in variables)) continue;
      const parsedEntries: Record<string, string[]> = {};
      for (const [option, tags] of Object.entries(entries)) {
        const parsed = parseRegionList(tags);
        if (parsed && variables[variable].includes(option)) parsedEntries[option] = parsed;
      }
      if (Object.keys(parsedEntries).length) optionRequires[variable] = parsedEntries;
    }
    if (Object.keys(optionRequires).length) tagRules.option_requires = optionRequires;
  }

  return Object.keys(tagRules).length ? tagRules : undefined;
}

/** 解析可选的 scope_rules；master 必须是已定义变量，引用不存在选项的标注会被丢弃（选项可能已被编辑）。 */
function parseScopeRules(value: unknown, variables: Record<string, string[]>, presetName: string): ScopeRules | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.master !== "string" || !(value.master in variables)) {
    throw new Error(`${presetName} 的 scope_rules.master 必须是 variables 中的变量名`);
  }
  const master = value.master;

  const visible: Record<string, string[]> = {};
  if (value.visible !== undefined) {
    if (!isRecord(value.visible)) throw new Error(`${presetName} 的 scope_rules.visible 必须是对象`);
    for (const [option, regions] of Object.entries(value.visible)) {
      const parsed = parseRegionList(regions);
      if (parsed && variables[master]?.includes(option)) visible[option] = parsed;
    }
  }

  const variableRequires: Record<string, string[]> = {};
  if (value.variable_requires !== undefined) {
    if (!isRecord(value.variable_requires)) throw new Error(`${presetName} 的 scope_rules.variable_requires 必须是对象`);
    for (const [variable, regions] of Object.entries(value.variable_requires)) {
      const parsed = parseRegionList(regions);
      if (parsed && variable in variables) variableRequires[variable] = parsed;
    }
  }

  const optionRequires: Record<string, Record<string, string[]>> = {};
  if (value.option_requires !== undefined) {
    if (!isRecord(value.option_requires)) throw new Error(`${presetName} 的 scope_rules.option_requires 必须是对象`);
    for (const [variable, entries] of Object.entries(value.option_requires)) {
      if (!isRecord(entries) || !(variable in variables)) continue;
      const parsedEntries: Record<string, string[]> = {};
      for (const [option, regions] of Object.entries(entries)) {
        const parsed = parseRegionList(regions);
        if (parsed && variables[variable].includes(option)) parsedEntries[option] = parsed;
      }
      if (Object.keys(parsedEntries).length) optionRequires[variable] = parsedEntries;
    }
  }

  return {
    master,
    ...(Object.keys(visible).length ? { visible } : {}),
    ...(Object.keys(variableRequires).length ? { variable_requires: variableRequires } : {}),
    ...(Object.keys(optionRequires).length ? { option_requires: optionRequires } : {}),
  };
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
    if (!isRecord(item)) throw new Error(`第 ${index + 1} 套预设不是 JSON 对象`);
    if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.prompt_template !== "string") {
      throw new Error(`第 ${index + 1} 套预设需要 id、name 与 prompt_template 字符串`);
    }
    if (!item.id.trim() || !item.name.trim()) throw new Error(`第 ${index + 1} 套预设的 id 与 name 不能为空`);
    if (!isRecord(item.variables)) throw new Error(`${item.name} 的 variables 必须是对象`);

    const variables: Record<string, string[]> = {};
    for (const [variable, options] of Object.entries(item.variables)) {
      if (!Array.isArray(options) || options.some((option) => typeof option !== "string")) {
        throw new Error(`${item.name} 的 ${variable} 必须是字符串数组`);
      }
      variables[variable] = options.map((option) => option.trim()).filter(Boolean);
    }

    const optionalVariables: Record<string, number> = {};
    if (item.optional_variables !== undefined) {
      if (!isRecord(item.optional_variables)) throw new Error(`${item.name} 的 optional_variables 必须是对象`);
      for (const [variable, probability] of Object.entries(item.optional_variables)) {
        if (variable in variables && typeof probability === "number" && Number.isFinite(probability)) {
          optionalVariables[variable] = Math.min(1, Math.max(0, probability));
        }
      }
    }

    const baseId = item.id.trim().replace(/[^a-zA-Z0-9_-]/g, "-") || `imported-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    const ratios = ["16:9", "21:9", "32:9", "9:16"];
    const scopeRules = parseScopeRules(item.scope_rules, variables, item.name);
    const tagRules = parseTagRules(item.tag_rules, variables, item.name);

    return {
      id,
      name: item.name.trim(),
      english: typeof item.english === "string" && item.english.trim() ? item.english.trim() : "CUSTOM",
      description: typeof item.description === "string" ? item.description.trim() : "自定义风格",
      is_builtin: false,
      prompt_template: item.prompt_template.trim(),
      variables,
      ...(Object.keys(optionalVariables).length ? { optional_variables: optionalVariables } : {}),
      ...(scopeRules ? { scope_rules: scopeRules } : {}),
      ...(tagRules ? { tag_rules: tagRules } : {}),
      randomize_variables: item.randomize_variables === true,
      aspect_ratio: typeof item.aspect_ratio === "string" && ratios.includes(item.aspect_ratio) ? item.aspect_ratio : "16:9",
    };
  });
}
