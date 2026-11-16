import type { ResolvedPromptVariable, StylePreset } from "../types";

export const RANDOM_VARIABLE = "__random__";
export const OMIT_VARIABLE = "__omit__";

/** 规则求值上下文：已确定的提供者取值给出的标签集合。null 表示无约束（不过滤）。 */
export interface RuleContext {
  provided: ReadonlySet<string>;
}

/** 引擎内部的统一规则形态：tag_rules（新）与 scope_rules（旧）都归一化成它再求值。 */
interface NormalizedRules {
  resolveOrder: string[];
  provides: Record<string, Record<string, string[]>>;
  variableRequires: Record<string, string[]>;
  optionRequires: Record<string, Record<string, string[]>>;
}

/**
 * 归一化约束规则。引擎只认标签语义，不理解标签含义——
 * 旧 scope_rules 自动转换：master → 单元素 resolve_order，visible → provides，
 * 未标注的 master 选项视为提供全部已用标签（保持旧「未标注 = 全身可见」行为）。
 */
function normalizeRules(preset: StylePreset): NormalizedRules | null {
  if (preset.tag_rules) {
    return {
      resolveOrder: preset.tag_rules.resolve_order?.filter((variable) => variable in preset.variables) ?? [],
      provides: preset.tag_rules.provides ?? {},
      variableRequires: preset.tag_rules.variable_requires ?? {},
      optionRequires: preset.tag_rules.option_requires ?? {},
    };
  }
  const scope = preset.scope_rules;
  if (!scope || !(scope.master in preset.variables)) return null;
  const allTags = new Set<string>();
  for (const tags of Object.values(scope.variable_requires ?? {})) tags.forEach((tag) => allTags.add(tag));
  for (const entries of Object.values(scope.option_requires ?? {})) {
    for (const tags of Object.values(entries)) tags.forEach((tag) => allTags.add(tag));
  }
  const visible = scope.visible ?? {};
  const mapping: Record<string, string[]> = {};
  for (const option of preset.variables[scope.master]) {
    mapping[option] = visible[option] ?? [...allTags];
  }
  return {
    resolveOrder: [scope.master],
    provides: { [scope.master]: mapping },
    variableRequires: scope.variable_requires ?? {},
    optionRequires: scope.option_requires ?? {},
  };
}

/** 提供者变量（决定标签供给的变量），按解析顺序返回。 */
export function providerVariables(preset: StylePreset | null | undefined): string[] {
  if (!preset) return [];
  const rules = normalizeRules(preset);
  return rules ? rules.resolveOrder.filter((variable) => variable in preset.variables) : [];
}

function contextFromPicks(rules: NormalizedRules, picks: Record<string, string>): RuleContext | null {
  const provided = new Set<string>();
  let any = false;
  for (const variable of rules.resolveOrder) {
    const value = picks[variable];
    if (!value) continue;
    const tags = rules.provides[variable]?.[value];
    if (!tags) continue; // 提供者选项未标注 → 不提供标签
    any = true;
    for (const tag of tags) provided.add(tag);
  }
  return any ? { provided } : null;
}

/**
 * 由「已确定的提供者取值」求标签上下文；没有任何提供者有确定值时返回 null（不过滤）。
 * picks 里可以混入其他变量的值，只有提供者变量会被读取。
 */
export function ruleContext(preset: StylePreset, picks: Record<string, string>): RuleContext | null {
  const rules = normalizeRules(preset);
  if (!rules || rules.resolveOrder.length === 0) return null;
  return contextFromPicks(rules, picks);
}

/** 某个选项需要的标签：选项级标注覆盖变量级默认，都没标注则不构成约束。 */
export function optionRequires(preset: StylePreset, variable: string, option: string): string[] {
  const rules = normalizeRules(preset);
  if (!rules) return [];
  return rules.optionRequires[variable]?.[option] ?? rules.variableRequires[variable] ?? [];
}

/** 在给定标签上下文下过滤出兼容选项；context 为 null（无提供者取值）时不过滤。 */
export function compatibleOptions(
  preset: StylePreset,
  variable: string,
  options: string[],
  context: RuleContext | null,
): string[] {
  if (!context) return options;
  return options.filter((option) => optionRequires(preset, variable, option).every((tag) => context.provided.has(tag)));
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
  /** 實際填入非空值的變量（含來源），順序為解析順序。 */
  resolved: ResolvedPromptVariable[];
  /** 被省略的變量名：標籤衝突、optional 概率跳過、手動省略。 */
  omitted: string[];
}

/** 解析提示詞並帶出變量明細，供確認框高亮顯示哪些內容來自哪個變量。 */
export function resolveStylePromptDetailed(
  preset: StylePreset,
  selections: Record<string, string>,
  random: () => number = Math.random,
): ResolvedPromptDetail {
  const rules = normalizeRules(preset);
  const providerSet = new Set(rules?.resolveOrder ?? []);
  const resolved: Record<string, string> = {};
  const detail: ResolvedPromptVariable[] = [];
  const omitted: string[] = [];

  /** 解析单个变量。标签冲突（选项不可见 / 池被过滤空）时按省略处理。 */
  const pickValue = (variable: string, options: string[], context: RuleContext | null): string => {
    const selection = selections[variable] || RANDOM_VARIABLE;
    const inclusionProbability = preset.optional_variables?.[variable];
    const skipped = selection === OMIT_VARIABLE || (
      selection === RANDOM_VARIABLE && inclusionProbability !== undefined && random() >= inclusionProbability
    );
    if (skipped) {
      omitted.push(variable);
      return "";
    }
    const pool = compatibleOptions(preset, variable, options, context);
    if (selection !== RANDOM_VARIABLE) {
      // 手动选择：标签不满足时省略（保留会生成「特写脸 + 展示脚」这类矛盾画面）
      if (pool.includes(selection)) {
        detail.push({ variable, value: selection, source: "manual" });
        return selection;
      }
      omitted.push(variable);
      return "";
    }
    if (pool.length === 0) {
      omitted.push(variable);
      return "";
    }
    const value = pool[Math.floor(random() * pool.length)] ?? "";
    if (value) detail.push({ variable, value, source: "random" });
    return value;
  };

  // 提供者变量先解析：它们的取值供给标签，约束其余变量的可选池
  const providerPicks: Record<string, string> = {};
  if (rules) {
    for (const variable of rules.resolveOrder) {
      if (!(variable in preset.variables)) continue;
      const value = pickValue(variable, preset.variables[variable], contextFromPicks(rules, providerPicks));
      resolved[variable] = value;
      if (value) providerPicks[variable] = value;
    }
  }

  const context = rules ? contextFromPicks(rules, providerPicks) : null;
  for (const [variable, options] of Object.entries(preset.variables)) {
    if (providerSet.has(variable)) continue;
    resolved[variable] = pickValue(variable, options, context);
  }

  let prompt = preset.prompt_template;
  for (const [variable, value] of Object.entries(resolved)) {
    prompt = prompt.replaceAll(`[${variable}]`, value);
  }

  return {
    prompt: prompt
      // 模板里未定义 / 拼错的变量占位符，直接去掉而不是留在提示词里
      .replace(/\[[A-Za-z0-9_]+\]/g, "")
      // 连接词后跟空槽逗号："and ," / "with ,"
      .replace(/\b(?:and|with)\s+(?=,)/g, "")
      // 空槽留下的 ", and"（"wearing , and sneakers"）
      .replace(/,\s+and\b/g, ",")
      // 单个悬空逗号合并（"wearing , sneakers" → "wearing sneakers"）
      .replace(/(\w)\s+, /g, "$1 ")
      // 服装变量全部省略时悬空的 wearing
      .replace(/\bwearing\s*(?=[,.]|$)/gi, "")
      .replace(/\s*,\s*/g, ", ")
      .replace(/(?:,\s*){2,}/g, ", ")
      // "with and" / "and with" 叠加（两个相邻槽一个为空）
      .replace(/\b(?:and|with)\s+(?:and|with)\b/g, "$1")
      .replace(/\(\s*\)/g, "")
      // 模板写死 "a [BACKGROUND]"，遇到元音开头的选项（abstract/empty）修正为 an
      .replace(/\ba (?=[aei])/g, "an ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+\./g, ".")
      .replace(/,\s*\./g, ".")
      .replace(/^[\s,]+|[\s,]+$/g, ""),
    resolved: detail,
    omitted,
  };
}
