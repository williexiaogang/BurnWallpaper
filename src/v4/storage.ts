import { parseV4, type HistoryEntry, type Library, type Result, type Theme } from "./engine";
import { bundledPresets } from "./bundled-presets";
import { parseOfficialPresets, type OfficialPresets } from "./preset-catalog";
const PACKS_KEY = "burn.v4.packs";
const HISTORY_KEY = "burn.v4.history";
const OFFICIAL_KEY = "burn.v4.official";
const officialListeners = new Set<() => void>();
let officialPresets: OfficialPresets | undefined;

function isNewerOfficial(candidate: OfficialPresets, current: OfficialPresets) {
  return candidate.revision > current.revision
    || (candidate.revision === current.revision && Boolean(candidate.studio) && !current.studio);
}

export function getOfficialPresets(): OfficialPresets {
  if (!officialPresets) {
    officialPresets = bundledPresets;
    try {
      const source = localStorage.getItem(OFFICIAL_KEY);
      if (source) {
        const cached = parseOfficialPresets(source);
        if (isNewerOfficial(cached, bundledPresets)) officialPresets = cached;
      }
    } catch { /* use the bundled catalog if the cache is unavailable */ }
  }
  return officialPresets;
}

export function subscribeOfficialPresets(listener: () => void) {
  officialListeners.add(listener);
  return () => { officialListeners.delete(listener); };
}

export function installOfficialPresets(source: string): { revision: number; updated: boolean } {
  const next = parseOfficialPresets(source);
  const current = getOfficialPresets();
  if (!isNewerOfficial(next, current)) return { revision: current.revision, updated: false };

  localStorage.setItem(OFFICIAL_KEY, JSON.stringify(next));
  officialPresets = next;
  for (const listener of officialListeners) listener();
  return { revision: next.revision, updated: true };
}
function inspectPacks(): { valid: (Theme | Library)[]; invalid: unknown[]; error: string | null } {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(PACKS_KEY) ?? "[]");
    if (!Array.isArray(data)) return { valid: [], invalid: [], error: "自訂資料格式損壞，請先匯出備份" };
    const valid: (Theme | Library)[] = [], invalid: unknown[] = [];
    for (const item of data) { try { valid.push(parseV4(JSON.stringify(item))); } catch { invalid.push(item); } }
    return { valid, invalid, error: invalid.length ? `${invalid.length} 個自訂包無法讀取，原始資料已保留` : null };
  } catch { return { valid: [], invalid: [], error: "自訂資料無法讀取，請先匯出備份" }; }
}
export function readPacks(): (Theme | Library)[] { return inspectPacks().valid; }
export function packsWarning(): string | null { return inspectPacks().error; }
export function rawPacksBackup(): string { return localStorage.getItem(PACKS_KEY) ?? ""; }
export function savePacks(packs: (Theme | Library)[]) {
  const current = inspectPacks();
  if (current.error && !current.invalid.length) throw new Error(current.error);
  localStorage.setItem(PACKS_KEY, JSON.stringify([...packs, ...current.invalid]));
}
export function readHistory(): HistoryEntry[] {
  try { const data: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); if (!Array.isArray(data)) return []; return data.filter((x): x is HistoryEntry => !!x && typeof x === "object" && typeof x.themeId === "string" && typeof x.selections === "object" && x.selections !== null && typeof x.prompt === "string" && typeof x.at === "number").slice(0, 100); } catch { return []; }
}
export function recordHistory(result: Result, prompt: string, settings?: HistoryEntry["settings"]) {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (raw !== null) {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.some((x) => !x || typeof x !== "object" || typeof x.themeId !== "string" || !x.selections || typeof x.selections !== "object" || typeof x.prompt !== "string" || typeof x.at !== "number")) throw new Error("方案歷史資料損壞，未覆蓋原始資料");
  }
  const entries: HistoryEntry[] = [{ themeId: result.themeId, styleId: result.styleId, selections: result.selections, customValues: result.customValues, prompt, prompts: result.prompts, promptLanguage: settings?.promptLanguage, at: Date.now(), themeSnapshot: result.themeSnapshot, styleSnapshot: result.styleSnapshot, settings }, ...readHistory()].slice(0, 100);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}
const CHOICE_KEY = "burn.v4.choice";
interface PresetChoice { themeId: string; styles: string[]; sceneCategory?: string }

function resolveSavedTheme(id: string): string {
  if (id !== "aj_series" && id !== "character_wallpaper_example") return id;
  const { themes } = getOfficialPresets();
  if (themes.some((theme) => theme.id === id) || !themes.some((theme) => theme.id === "general")) return id;
  return readPacks().some((pack) => pack.kind === "prompt_scheme" && pack.id === id) ? id : "general";
}

export function readChoice(studio = false): PresetChoice {
  try {
    const x = JSON.parse(localStorage.getItem(studio ? CHOICE_KEY + ".studio" : CHOICE_KEY) ?? "null");
    if (x && typeof x.themeId === "string" && Array.isArray(x.styles) && x.styles.every((s: unknown) => typeof s === "string")) {
      const choice: PresetChoice = { themeId: resolveSavedTheme(x.themeId), styles: x.styles.slice(0, 1) };
      if (typeof x.sceneCategory === "string" && /^[a-z][a-z0-9_-]*$/.test(x.sceneCategory)) choice.sceneCategory = x.sceneCategory;
      return choice;
    }
  } catch { /* use defaults */ }
  const defaultTheme = getOfficialPresets().themes[0];
  return { themeId: defaultTheme.id, styles: [] };
}
export function saveChoice(choice: PresetChoice, studio = false) { localStorage.setItem(studio ? CHOICE_KEY + ".studio" : CHOICE_KEY, JSON.stringify(choice)); }
export function getAllPacks(official = getOfficialPresets(), packs = readPacks()) {
  const themes = new Map(official.themes.map((theme) => [theme.id, theme]));
  const libraries = new Map([[official.library.id, official.library]]);
  for (const pack of packs) {
    if (pack.kind === "prompt_scheme") themes.set(pack.id, pack);
    else libraries.set(pack.id, pack);
  }
  return { themes: [...themes.values()], libraries: [...libraries.values()] };
}
export function getTagPresets() { const { themes, libraries } = getAllPacks(); return [...themes, ...libraries.flatMap((library) => library.styles)]; }
