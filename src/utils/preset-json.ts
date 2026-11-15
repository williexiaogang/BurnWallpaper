import type { StylePreset } from "../types";

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

    return {
      id,
      name: item.name.trim(),
      english: typeof item.english === "string" && item.english.trim() ? item.english.trim() : "CUSTOM",
      description: typeof item.description === "string" ? item.description.trim() : "自定义风格",
      is_builtin: false,
      prompt_template: item.prompt_template.trim(),
      variables,
      ...(Object.keys(optionalVariables).length ? { optional_variables: optionalVariables } : {}),
      randomize_variables: item.randomize_variables === true,
      aspect_ratio: typeof item.aspect_ratio === "string" && ratios.includes(item.aspect_ratio) ? item.aspect_ratio : "16:9",
    };
  });
}
