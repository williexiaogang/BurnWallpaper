import type { StylePreset } from "../types";

export const RANDOM_VARIABLE = "__random__";
export const OMIT_VARIABLE = "__omit__";

export function resolveStylePrompt(
  preset: StylePreset,
  selections: Record<string, string>,
  random: () => number = Math.random,
): string {
  let prompt = preset.prompt_template;

  for (const [variable, options] of Object.entries(preset.variables)) {
    const selection = selections[variable] || RANDOM_VARIABLE;
    const inclusionProbability = preset.optional_variables?.[variable];
    const omitted = selection === OMIT_VARIABLE || (
      selection === RANDOM_VARIABLE && inclusionProbability !== undefined && random() >= inclusionProbability
    );
    const value = omitted
      ? ""
      : selection === RANDOM_VARIABLE
        ? options[Math.floor(random() * options.length)] ?? ""
        : selection;
    prompt = prompt.replaceAll(`[${variable}]`, value);
  }

  return prompt
    .replace(/(\w)\s+, /g, "$1 ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/\b(?:and|with)\s+(?=,)/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/,\s*\./g, ".")
    .replace(/^[\s,]+|[\s,]+$/g, "");
}
