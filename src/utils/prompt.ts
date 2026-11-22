import type { ContentPack, PresetTestResult, ResolvedPromptVariable, StyleOption, StylePack, StylePreset, VariableGroup } from "../types";

export interface RuleContext {
  provided: ReadonlySet<string>;
}

export const RANDOM_VARIABLE = "__random__";
export const OMIT_VARIABLE = "__omit__";

export function providerVariables(preset: StylePreset | null | undefined): string[] {
  if (!preset) return [];
  return Object.entries(preset.variables).filter(([, variable]) => variable.provider).map(([name]) => name);
}

function selectedOption(preset: StylePreset, variable: string, value: string): StyleOption | undefined {
  return preset.variables[variable]?.options.find((option) => option.value === value);
}

function contextFromPicks(preset: StylePreset, picks: Record<string, string>, group?: VariableGroup): RuleContext | null {
  const provided = new Set<string>();
  let constrained = false;
  for (const variable of providerVariables(preset)) {
    const providerGroup = preset.variables[variable].group;
    if (group === "style" ? providerGroup !== "style" : group && providerGroup === "style") continue;
    const value = picks[variable];
    if (!value || value === RANDOM_VARIABLE || value === OMIT_VARIABLE) continue;
    const option = selectedOption(preset, variable, value);
    if (!option || option.unconstrained) continue;
    constrained = true;
    for (const tag of option.provides ?? []) provided.add(tag);
  }
  return constrained ? { provided } : null;
}

export function ruleContext(preset: StylePreset, picks: Record<string, string>, group?: VariableGroup): RuleContext | null {
  return contextFromPicks(preset, picks, group);
}

export function compatibleOptions(
  preset: StylePreset,
  variable: string,
  options: StyleOption[],
  context: RuleContext | null,
): StyleOption[] {
  if (!context) return options;
  const variableRequires = preset.variables[variable]?.requires ?? [];
  return options.filter((option) => {
    const requires = option.requires ?? variableRequires;
    if (!requires.every((tag) => context.provided.has(tag))) return false;
    if (option.any_of && !option.any_of.some((tag) => context.provided.has(tag))) return false;
    if (option.excludes?.some((tag) => context.provided.has(tag))) return false;
    return true;
  });
}

export function resolveStylePrompt(
  preset: StylePreset,
  selections: Record<string, string>,
  random: () => number = Math.random,
): string {
  return resolveStylePromptDetailed(preset, selections, random).prompt;
}

export interface ResolvedPromptDetail {
  prompt: string;
  preview: string;
  resolved: ResolvedPromptVariable[];
  omitted: string[];
}

export function resolveStylePromptDetailed(
  preset: StylePreset,
  selections: Record<string, string>,
  random: () => number = Math.random,
): ResolvedPromptDetail {
  const providers = providerVariables(preset);
  const providerSet = new Set(providers);
  const resolved: Record<string, string> = {};
  const previewResolved: Record<string, string> = {};
  const detail: ResolvedPromptVariable[] = [];
  const omitted: string[] = [];

  const pickValue = (variable: string, context: RuleContext | null): string => {
    const config = preset.variables[variable];
    const selection = selections[variable] || RANDOM_VARIABLE;
    previewResolved[variable] = "";
    const skipped = selection === OMIT_VARIABLE || (
      selection === RANDOM_VARIABLE && config.probability !== undefined && random() >= config.probability
    );
    if (skipped) {
      omitted.push(variable);
      return "";
    }
    const pool = compatibleOptions(preset, variable, config.options, context);
    if (selection !== RANDOM_VARIABLE) {
      const option = pool.find((item) => item.value === selection);
      if (option) {
        detail.push({ variable, value: selection, label: option.label, source: "manual" });
        previewResolved[variable] = option.label ?? selection;
        return selection;
      }
      omitted.push(variable);
      return "";
    }
    if (pool.length === 0) {
      omitted.push(variable);
      return "";
    }
    let option: StyleOption | undefined;
    if (pool.some((item) => (item.weight ?? 1) !== 1)) {
      const weightedPool = pool.filter((item) => Math.max(0, item.weight ?? 1) > 0);
      if (weightedPool.length === 0) {
        omitted.push(variable);
        return "";
      }
      const total = weightedPool.reduce((sum, item) => sum + Math.max(0, item.weight ?? 1), 0);
      let roll = random() * total;
      option = weightedPool[weightedPool.length - 1];
      for (const item of weightedPool) {
        roll -= Math.max(0, item.weight ?? 1);
        if (roll < 0) { option = item; break; }
      }
    } else {
      option = pool[Math.floor(random() * pool.length)];
    }
    const value = option?.value ?? "";
    if (option && value) {
      detail.push({ variable, value, label: option.label, source: "random" });
      previewResolved[variable] = option.label ?? value;
    }
    return value;
  };

  const providerPicks: Record<string, string> = {};
  for (const variable of providers) {
    const group = preset.variables[variable].group;
    const value = pickValue(variable, contextFromPicks(preset, providerPicks, group));
    resolved[variable] = value;
    if (value) providerPicks[variable] = value;
  }

  for (const variable of Object.keys(preset.variables)) {
    if (providerSet.has(variable)) continue;
    const context = contextFromPicks(preset, providerPicks, preset.variables[variable].group);
    resolved[variable] = pickValue(variable, context);
  }

  let prompt = "";
  let preview = "";
  for (const block of preset.template) {
    if (block.if && !resolved[block.if]) continue;
    let text = block.text;
    let previewText = block.text;
    for (const [variable, value] of Object.entries(resolved)) {
      text = text.replaceAll(`{${variable}}`, value);
      previewText = previewText.replaceAll(`{${variable}}`, previewResolved[variable] ?? value);
    }
    prompt += text;
    preview += previewText;
  }

  const clean = (text: string) => text
    .replace(/\{[A-Za-z0-9_]+\}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/,\s*,+/g, ",")
    .replace(/,\s*\./g, ".")
    .trim();

  return {
    prompt: clean(prompt),
    preview: clean(preview),
    resolved: detail,
    omitted,
  };
}

export function combinePacks(content: ContentPack, style: StylePack): ContentPack {
  const duplicate = Object.keys(style.variables).find((name) => name in content.variables);
  if (duplicate) throw new Error(`内容包与画风包使用了重复变量 ${duplicate}`);
  return {
    ...content,
    template: [...content.template, ...style.template.map((block, index) => ({ ...block, text: index === 0 ? `, ${block.text}` : block.text }))],
    variables: { ...content.variables, ...style.variables },
    tests: [...content.tests, ...style.tests],
    randomize_variables: content.randomize_variables || style.randomize_variables,
  };
}

export function chooseStylePack(
  packs: StylePack[],
  selectedIds: string[],
  random: () => number = Math.random,
): StylePack | undefined {
  const candidates = packs.filter((pack) => selectedIds.includes(pack.id));
  if (!candidates.length) return undefined;
  const index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1);
  return candidates[index];
}

export function resolveWallpaperPromptDetailed(
  content: ContentPack,
  style: StylePack,
  contentSelections: Record<string, string>,
  styleSelections: Record<string, string>,
  random: () => number = Math.random,
): ResolvedPromptDetail {
  const contentResult = resolveStylePromptDetailed(content, contentSelections, random);
  const styleResult = resolveStylePromptDetailed(style, styleSelections, random);
  const join = (left: string, right: string) => [left, right].filter(Boolean).join(", ");
  return {
    prompt: join(contentResult.prompt, styleResult.prompt),
    preview: join(contentResult.preview, styleResult.preview),
    resolved: [...contentResult.resolved, ...styleResult.resolved],
    omitted: [...contentResult.omitted, ...styleResult.omitted],
  };
}

export function runPresetTests(preset: StylePreset): PresetTestResult[] {
  return preset.tests.map((test) => {
    const random = () => test.random ?? 0.1;
    const expect = test.expect ?? {};
    const result = resolveStylePromptDetailed(preset, test.select, random);
    const resolved = new Map(result.resolved.map((item) => [item.variable, item.value]));
    const failures: string[] = [];
    for (const variable of expect.include ?? []) {
      if (!resolved.has(variable)) failures.push(`應保留 ${variable}`);
    }
    for (const variable of expect.omit ?? []) {
      if (resolved.has(variable)) failures.push(`應省略 ${variable}`);
    }
    for (const [variable, expected] of Object.entries(expect.values ?? {})) {
      if (resolved.get(variable) !== expected) failures.push(`${variable} 應為 ${expected}`);
    }
    const promptLower = result.prompt.toLowerCase();
    for (const word of expect.prompt_contains ?? []) {
      if (!promptLower.includes(word.toLowerCase())) failures.push(`Prompt 應包含 ${word}`);
    }
    for (const word of expect.prompt_excludes ?? []) {
      if (promptLower.includes(word.toLowerCase())) failures.push(`Prompt 不應包含 ${word}`);
    }
    for (const rule of expect.group_excludes ?? []) {
      for (const item of result.resolved) {
        if (preset.variables[item.variable]?.group !== rule.group) continue;
        const value = item.value.toLowerCase();
        for (const word of rule.words) {
          if (value.includes(word.toLowerCase())) failures.push(`${rule.group} 層 ${item.variable} 不應含 ${word}`);
        }
      }
    }
    if (test.compare) {
      const { vary, with: alternative, stable } = test.compare;
      const alt = resolveStylePromptDetailed(preset, { ...test.select, [vary]: alternative }, random);
      const altResolved = new Map(alt.resolved.map((item) => [item.variable, item.value]));
      for (const variable of stable) {
        if (resolved.get(variable) !== altResolved.get(variable)) failures.push(`更換 ${vary} 後 ${variable} 不應改變`);
      }
    }
    return { name: test.name, passed: failures.length === 0, failures, prompt: result.prompt };
  });
}
