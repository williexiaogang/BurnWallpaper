export interface Rule {
  tags?: string[];
  requires_all?: string[];
  requires_any?: string[];
  excludes?: string[];
  prefer?: Record<string, number>;
}
export interface Option extends Rule { id: string; label: string; value: string; weight?: number; categories?: string[] }
export interface Variable { label: string; required: boolean; probability?: number; options: Option[] }
export interface Block { text: string; text_zh?: string; if?: string }
export interface Style extends Rule { id: string; name: string; description?: string; template: Block[]; variables: Record<string, Variable> }
export interface Library { schema_version: 4; kind: "style_library"; id: string; name: string; styles: Style[] }
export interface Theme { schema_version: 4; kind: "prompt_scheme"; id: string; name: string; description?: string; aspect_ratio: string; style?: { mode: "embedded" | "external"; recommended?: string[] }; template: Block[]; variables: Record<string, Variable>; sampling?: { candidate_count?: number; history_window?: number; repeat_penalty?: number; diversity_keys?: string[] }; tests?: { name: string; select: Record<string, string>; expect: { selected?: Record<string, string>; include?: string[]; omit?: string[]; prompt_contains?: string[]; prompt_excludes?: string[]; error?: "incompatible_selection" } }[] }
export const CUSTOM_PROMPT_OPTION = "__custom__";
export interface CustomPromptValue { text: string; baseId?: string }
export type PromptLocks = Record<string, string | null | CustomPromptValue>;
export interface HistoryEntry { themeId: string; selections: Record<string, string>; customValues?: Record<string, string>; prompt: string; at: number; themeSnapshot?: Theme; styleSnapshot?: Style; styleId?: string; settings?: { model: string; resolution: string; aspectRatio: string } }
export interface Result { themeId: string; styleId?: string; selections: Record<string, string>; customValues?: Record<string, string>; prompt: string; labels: Record<string, string>; themeSnapshot: Theme; styleSnapshot?: Style }

const promptCleanup: [RegExp, string][] = [
  [/[ \t]{2,}/g, " "],
  [/\s+([,.])/g, "$1"],
  [/,\s*,+/g, ","],
  [/,\s*(\.)/g, "$1"],
  [/^\s+|\s+$/g, ""],
  [/^,\s*|,\s*$/g, ""],
];

export function normalizePromptText(text: string, onReplace?: (start: number, length: number, retained?: number) => void): string {
  for (const [pattern, replacement] of promptCleanup) {
    if (!onReplace) {
      text = text.replace(pattern, replacement);
      continue;
    }

    let shift = 0;
    text = text.replace(pattern, (match: string, ...args: unknown[]) => {
      const start = (args.at(-2) as number) + shift;
      const keepLast = replacement === "$1";
      const value = keepLast ? match.slice(-1) : replacement;
      const retained = value ? start + (keepLast ? match.length - 1 : 0) : undefined;
      onReplace(start, match.length, retained);
      shift += value.length - match.length;
      return value;
    });
  }
  return text;
}

const idPattern = /^[a-z][a-z0-9_-]*$/;
const tagPattern = /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/;
const varPattern = /^[A-Z][A-Z0-9_]*$/;
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
function fail(path: string, message: string): never { throw new Error(`${path}: ${message}`); }
function string(x: unknown, path: string, empty = false): string { if (typeof x !== "string" || (!empty && !x.trim())) return fail(path, "必須是非空文字"); return x; }
function ident(x: unknown, path: string): string { const s = string(x, path); if (!idPattern.test(s)) fail(path, "ID 只能包含小寫英文字母、數字、下劃線和連字號，且須以字母開頭"); return s; }
function number(x: unknown, path: string, min: number, max: number): number { if (typeof x !== "number" || !Number.isFinite(x) || x < min || x > max) return fail(path, `數值須介於 ${min} 與 ${max}`); return x; }
function rule(x: Record<string, unknown>, path: string) {
  for (const key of ["tags", "requires_all", "requires_any", "excludes"]) if (x[key] !== undefined) {
    const list = x[key]; if (!Array.isArray(list) || (key !== "tags" && !list.length)) fail(`${path}.${key}`, "必須是非空標籤陣列");
    for (const tag of list as unknown[]) if (typeof tag !== "string" || !tagPattern.test(tag)) fail(`${path}.${key}`, "標籤格式須為 namespace:value");
  }
  if (x.prefer !== undefined) { if (!record(x.prefer)) fail(`${path}.prefer`, "必須是物件"); for (const [tag, value] of Object.entries(x.prefer as Record<string, unknown>)) { if (!tagPattern.test(tag)) fail(`${path}.prefer`, "標籤格式錯誤"); number(value, `${path}.prefer.${tag}`, 0.001, 1000); } }
}
function content(x: Record<string, unknown>, path: string) {
  if (!record(x.variables) || !Object.keys(x.variables).length) fail(`${path}.variables`, "至少需要一個變量");
  const vars = x.variables as Record<string, unknown>;
  if (Object.keys(vars).length > 32) fail(`${path}.variables`, "最多 32 個變量");
  for (const [name, raw] of Object.entries(vars)) {
    const p = `${path}.variables.${name}`; if (!varPattern.test(name) || !record(raw)) fail(p, "變量名稱或內容無效");
    const v = raw as Record<string, unknown>; string(v.label, `${p}.label`); if (typeof v.required !== "boolean") fail(`${p}.required`, "必須是布林值");
    if (v.probability !== undefined) { const prob = number(v.probability, `${p}.probability`, 0, 1); if (v.required && prob !== 1) fail(`${p}.probability`, "必填變量的機率必須為 1"); }
    if (!Array.isArray(v.options) || !v.options.length || v.options.length > 200) fail(`${p}.options`, "需要 1 至 200 個選項");
    const seen = new Set<string>(); for (const [i, item] of (v.options as unknown[]).entries()) {
      if (!record(item)) fail(`${p}.options[${i}]`, "必須是物件"); const o = item as Record<string, unknown>; const id = ident(o.id, `${p}.options[${i}].id`); if (seen.has(id)) fail(p, `重複選項 ${id}`); seen.add(id);
      string(o.label, `${p}.${id}.label`); string(o.value, `${p}.${id}.value`, true); if (o.weight !== undefined) number(o.weight, `${p}.${id}.weight`, 0, 1000000); rule(o, `${p}.${id}`);
      if (o.categories !== undefined && (!Array.isArray(o.categories) || !o.categories.length || o.categories.some((category) => typeof category !== "string" || !idPattern.test(category)) || new Set(o.categories).size !== o.categories.length)) fail(`${p}.${id}.categories`, "分類須為互不重複的 ID 陣列");
    }
  }
  if (!Array.isArray(x.template) || !x.template.length) fail(`${path}.template`, "至少需要一個片段");
  for (const [i, raw] of x.template.entries()) {
    const blockPath = `${path}.template[${i}]`;
    if (!record(raw)) fail(blockPath, "必須是物件");
    if (raw.if !== undefined && (typeof raw.if !== "string" || !(raw.if in vars))) fail(`${blockPath}.if`, "未知變量");
    for (const field of ["text", "text_zh"] as const) {
      if (field === "text_zh" && raw[field] === undefined) continue;
      const text = string(raw[field], `${blockPath}.${field}`, true);
      for (const match of text.matchAll(/\{([^{}]+)\}/g)) {
        if (!(match[1] in vars)) fail(blockPath, `未知變量 ${match[1]}`);
      }
    }
  }
}
export function parseV4(source: string): Theme | Library {
  const x: unknown = JSON.parse(source); if (!record(x)) fail("JSON", "必須是物件"); const root = x as Record<string, unknown>;
  if (root.schema_version !== 4) fail("schema_version", "只接受 4"); ident(root.id, "id"); string(root.name, "name");
  if (root.kind === "prompt_scheme") {
    string(root.aspect_ratio, "aspect_ratio"); content(root, "theme");
    if (root.style !== undefined) { if (!record(root.style) || !["external", "embedded"].includes(String(root.style.mode))) fail("style", "mode 必須是 external 或 embedded"); if (root.style.mode === "embedded" && root.style.recommended !== undefined) fail("style.recommended", "自帶畫風不能推薦外部畫風"); if (root.style.recommended !== undefined && (!Array.isArray(root.style.recommended) || root.style.recommended.some((s) => typeof s !== "string" || !/^[a-z][a-z0-9_-]*\/[a-z][a-z0-9_-]*$/.test(s)))) fail("style.recommended", "畫風 ID 格式錯誤"); }
    if (root.sampling !== undefined) { if (!record(root.sampling)) fail("sampling", "必須是物件"); const s = root.sampling; if (s.history_window !== undefined) number(s.history_window, "sampling.history_window", 0, 100); if (s.repeat_penalty !== undefined) number(s.repeat_penalty, "sampling.repeat_penalty", 0, 1); if (s.candidate_count !== undefined) number(s.candidate_count, "sampling.candidate_count", 1, 1000); if (s.diversity_keys !== undefined && (!Array.isArray(s.diversity_keys) || s.diversity_keys.some((k) => typeof k !== "string" || !(k === "STYLE" || k.startsWith("style.") || k in (root.variables as object))))) fail("sampling.diversity_keys", "含未知變量"); }
    if (root.tests !== undefined) {
      if (!Array.isArray(root.tests) || root.tests.length > 100) fail("tests", "必須是最多 100 項的陣列");
      for (const [i, test] of (root.tests as unknown[]).entries()) {
        const p = `tests[${i}]`; if (!record(test)) fail(p, "必須是物件");
        string(test.name, `${p}.name`); if (!record(test.select) || !record(test.expect)) fail(p, "需要 select 與 expect 物件");
        const vars = root.variables as Record<string, Variable>;
        const selections = test.select as Record<string, unknown>;
        for (const [name, id] of Object.entries(selections)) if (!vars[name]?.options.some((o) => o.id === id)) fail(`${p}.select.${name}`, "未知選項");
        const expect = test.expect as Record<string, unknown>;
        if (expect.error !== undefined && expect.error !== "incompatible_selection") fail(`${p}.expect.error`, "不支持的錯誤類型");
        for (const key of ["include", "omit", "prompt_contains", "prompt_excludes"]) if (expect[key] !== undefined) { const values = expect[key]; if (!Array.isArray(values) || values.some((v) => typeof v !== "string" || !v || ((key === "include" || key === "omit") && !vars[v]))) fail(`${p}.expect.${key}`, "含無效值"); }
        if (expect.selected !== undefined) { if (!record(expect.selected)) fail(`${p}.expect.selected`, "必須是物件"); for (const [name, id] of Object.entries(expect.selected)) if (!vars[name]?.options.some((o) => o.id === id)) fail(`${p}.expect.selected.${name}`, "未知選項"); }
      }
    }
    return root as unknown as Theme;
  }
  if (root.kind === "style_library") { if (!Array.isArray(root.styles) || !root.styles.length || root.styles.length > 100) fail("styles", "需要 1 至 100 個畫風"); const seen = new Set<string>(); for (const [i, raw] of root.styles.entries()) { if (!record(raw)) fail(`styles[${i}]`, "必須是物件"); const s = raw as Record<string, unknown>; const id = ident(s.id, `styles[${i}].id`); if (seen.has(id)) fail("styles", `重複畫風 ${id}`); seen.add(id); string(s.name, `styles.${id}.name`); rule(s, `styles.${id}`); content(s, `styles.${id}`); } return root as unknown as Library; }
  return fail("kind", "必須是 prompt_scheme 或 style_library");
}

function lockedOption(variable: Variable, lock: PromptLocks[string]): Option | undefined {
  if (typeof lock === "string") return variable.options.find((option) => option.id === lock);
  const text = lock?.text.trim();
  if (!text) return undefined;
  const base = variable.options.find((option) => option.value === text)
    ?? variable.options.find((option) => option.id === lock?.baseId);
  if (base) return { ...base, id: CUSTOM_PROMPT_OPTION, label: text, value: text };
  const first = variable.options[0];
  const common = (key: "tags" | "requires_all" | "excludes") => (first?.[key] ?? [])
    .filter((tag) => variable.options.every((option) => option[key]?.includes(tag)));
  const any = first?.requires_any;
  const requiresAny = any?.length && variable.options.every((option) =>
    option.requires_any?.length === any.length && any.every((tag) => option.requires_any?.includes(tag)));
  return { id: CUSTOM_PROMPT_OPTION, label: text, value: text, tags: common("tags"), requires_all: common("requires_all"), excludes: common("excludes"), requires_any: requiresAny ? any : undefined };
}

export function generateV4(theme: Theme, styles: { fullId: string; style: Style }[], locks: PromptLocks = {}, history: HistoryEntry[] = [], random: () => number = Math.random, maxAttempts = 20000): Result {
  const candidates = theme.style?.mode === "embedded" ? [{ fullId: "", style: null }] : styles;
  if (!candidates.length) throw new Error("沒有選擇畫風，請先選擇至少一個畫風");
  const historyWindow = history.filter((h) => h.themeId === theme.id).slice(0, Math.floor(theme.sampling?.history_window ?? 5));
  const target = Math.min(100, Math.max(1, Math.floor(theme.sampling?.candidate_count ?? 24)));
  let found = 0, chosen: Result | undefined, fallback: Result | undefined, logTotal = -Infinity, fallbackTotal = -Infinity;
  const logAdd = (a: number, b: number) => a === -Infinity ? b : b === -Infinity ? a : Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b)));
  for (const [key, value] of Object.entries(locks)) {
    const variable = key.startsWith("style.") ? undefined : theme.variables[key];
    if (!variable && !key.startsWith("style.")) throw new Error(`未知變量 ${key}`);
    if (variable && value === null && variable.required) throw new Error(`${variable.label} 是必填變量`);
    if (variable && value !== null && !lockedOption(variable, value)) throw new Error(`${variable.label} 的選項不存在`);
  }
  const customValues = Object.fromEntries(Object.entries(locks).flatMap(([key, lock]) => lock && typeof lock !== "string" ? [[key, lock.text.trim()]] : []));
  const possible = candidates.some(({ style }) => {
    const vars = [...Object.entries(theme.variables).map(([key, variable]) => ({ key, variable })), ...Object.entries(style?.variables ?? {}).map(([key, variable]) => ({ key: `style.${key}`, variable }))];
    const guaranteed: Rule[] = style ? [style] : [];
    const available = new Set(style?.tags ?? []);
    for (const { key, variable } of vars) {
      const locked = Object.prototype.hasOwnProperty.call(locks, key);
      const explicit = locked ? lockedOption(variable, locks[key]) : undefined;
      if (locked && locks[key] !== null && !explicit) return false;
      if (explicit) guaranteed.push(explicit);
      const options = locked ? (explicit ? [explicit] : []) : variable.options.filter((o) => (o.weight ?? 1) > 0);
      for (const option of options) for (const tag of option.tags ?? []) available.add(tag);
    }
    const guaranteedTags = new Set(guaranteed.flatMap((r) => r.tags ?? []));
    return guaranteed.every((r) => (r.requires_all ?? []).every((tag) => available.has(tag)) && (!r.requires_any || r.requires_any.some((tag) => available.has(tag))) && !(r.excludes ?? []).some((tag) => guaranteedTags.has(tag)));
  });
  if (!possible) throw new Error("沒有符合條件的組合；手動選擇與主題／畫風約束衝突");
  for (let attempt = 0; attempt < maxAttempts && found < target; attempt++) {
    const entry = candidates[Math.floor(random() * candidates.length)];
    const style = entry.style;
    const vars = [...Object.entries(theme.variables).map(([name, variable]) => ({ key: name, variable })), ...Object.entries(style?.variables ?? {}).map(([name, variable]) => ({ key: `style.${name}`, variable }))];
    const picked: Record<string, Option> = {};
    let invalid = false;
    for (const { key, variable } of vars) {
      const locked = Object.prototype.hasOwnProperty.call(locks, key);
      const lock = locks[key];
      if (locked && lock === null) { if (variable.required) invalid = true; continue; }
      if (locked) { const option = lockedOption(variable, lock); if (!option) { invalid = true; break; } picked[key] = option; continue; }
      if (!variable.required && random() >= (variable.probability ?? 1)) continue;
      const pool = variable.options.filter((o) => (o.weight ?? 1) > 0);
      if (!pool.length) { if (variable.required) invalid = true; continue; }
      const sum = pool.reduce((n, o) => n + (o.weight ?? 1), 0);
      let roll = random() * sum; let chosen = pool[pool.length - 1];
      for (const option of pool) { roll -= option.weight ?? 1; if (roll < 0) { chosen = option; break; } }
      picked[key] = chosen;
    }
    if (invalid) continue;
    const getRules = (): Rule[] => [...(style ? [style] : []), ...Object.values(picked)];
    const valid = (rule: Rule, tags: Set<string>) => (rule.requires_all ?? []).every((tag) => tags.has(tag)) && (!rule.requires_any || rule.requires_any.some((tag) => tags.has(tag))) && !(rule.excludes ?? []).some((tag) => tags.has(tag));
    // A non-locked optional selection may be omitted if its requirements fail.
    for (let pass = 0; pass < vars.length; pass++) {
      const tags = new Set(getRules().flatMap((item) => item.tags ?? []));
      const removable = vars.find(({ key, variable }) => picked[key] && !variable.required && !(key in locks) && !valid(picked[key], tags));
      if (!removable) break;
      delete picked[removable.key];
    }
    const rules = getRules();
    const tags = new Set(rules.flatMap((item) => item.tags ?? []));
    if (!rules.every((rule) => valid(rule, tags))) continue;
    found++;
    let score = 0;
    for (const item of rules) for (const [tag, multiplier] of Object.entries(item.prefer ?? {})) if (rules.some((other) => other !== item && other.tags?.includes(tag))) score += Math.log(multiplier);
    const render = (blocks: Block[], prefix: string) => normalizePromptText(blocks.map((block) => {
      if (block.if && !picked[prefix + block.if]?.value) return "";
      return block.text.replace(/\{([A-Z][A-Z0-9_]*)\}/g, (_, name: string) => picked[prefix + name]?.value ?? "");
    }).join(""));
    const selections: Record<string, string> = {}; if (style) selections.STYLE = entry.fullId;
    for (const [key, option] of Object.entries(picked)) selections[key] = option.id;
    const result: Result = { themeId: theme.id, styleId: style ? entry.fullId : undefined, selections, themeSnapshot: theme, styleSnapshot: style ?? undefined, labels: Object.fromEntries(Object.entries(picked).map(([k, o]) => [k, o.label])), prompt: [render(theme.template, ""), ...(style ? [render(style.template, "style.")] : [])].filter(Boolean).join(", ") };
    if (Object.keys(customValues).length) result.customValues = customValues;
    fallbackTotal = logAdd(fallbackTotal, score);
    if (!fallback || random() < Math.exp(score - fallbackTotal)) fallback = result;
    let repeats = 0;
    for (const h of historyWindow) for (const key of theme.sampling?.diversity_keys ?? []) if (selections[key] && selections[key] === h.selections[key] && (!key.startsWith("style.") || selections.STYLE === h.selections.STYLE) && !(key in locks) && !(key === "STYLE" && candidates.length === 1)) repeats++;
    const penalty = theme.sampling?.repeat_penalty ?? 0.5;
    if (penalty === 0 && repeats) continue;
    score += repeats * Math.log(penalty || 1);
    logTotal = logAdd(logTotal, score);
    if (!chosen || random() < Math.exp(score - logTotal)) chosen = result;
  }
  if (!found) throw new Error("沒有找到符合條件的組合（搜尋次數已達上限）；請檢查手動選擇及主題／畫風約束");
  return (chosen ?? fallback)!;
}
