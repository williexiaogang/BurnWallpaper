import type { StylePreset } from "../types";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isStoredPreset(value: unknown): value is StylePreset {
  if (typeof value !== "object" || value === null) return false;
  const preset = value as Partial<StylePreset>;
  return typeof preset.id === "string"
    && preset.id.length > 0
    && typeof preset.name === "string"
    && typeof preset.prompt_template === "string"
    && typeof preset.is_builtin === "boolean"
    && typeof preset.randomize_variables === "boolean"
    && typeof preset.variables === "object"
    && preset.variables !== null
    && Object.values(preset.variables).every(isStringArray);
}

export function parseStoredPresets(raw: string | null): StylePreset[] | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    const presets = data.filter(isStoredPreset);
    return presets.length ? presets : null;
  } catch {
    return null;
  }
}

/** Builtins keep their ids from the app JSON. Saved edits override them. Custom presets are appended. */
export function mergeStylePresets(defaults: StylePreset[], saved: StylePreset[] | null): StylePreset[] {
  if (!saved?.length) return defaults.map((item) => structuredClone(item));
  const defaultIds = new Set(defaults.map((item) => item.id));
  const savedById = new Map(saved.map((item) => [item.id, item]));
  const merged = defaults.map((item) => structuredClone(savedById.get(item.id) ?? item));
  for (const item of saved) {
    if (!item.is_builtin && !defaultIds.has(item.id)) merged.push(structuredClone(item));
  }
  return merged;
}
