import { parseV4, type HistoryEntry, type Library, type Result, type Theme } from "./engine";
import themeData from "./default-theme.json";
import libraryData from "./default-styles.json";
import general from "./themes/general.json";
import concept from "./themes/concept.json";
import asian from "./themes/asian_male_studio.json";
import aj from "./themes/aj_series.json";
const PACKS_KEY = "burn.v4.packs";
const HISTORY_KEY = "burn.v4.history";
export const defaultThemes = [general, concept, asian, aj, themeData].map((data) => parseV4(JSON.stringify(data)) as Theme);
export const defaultTheme = defaultThemes[0];
export const defaultLibrary = parseV4(JSON.stringify(libraryData)) as Library;
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
  const entries: HistoryEntry[] = [{ themeId: result.themeId, styleId: result.styleId, selections: result.selections, prompt, at: Date.now(), themeSnapshot: result.themeSnapshot, styleSnapshot: result.styleSnapshot, settings }, ...readHistory()].slice(0, 100);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}
const CHOICE_KEY = "burn.v4.choice";
export function readChoice(): { themeId: string; styles: string[] } {
  try { const x = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? "null"); if (x && typeof x.themeId === "string" && Array.isArray(x.styles) && x.styles.every((s: unknown) => typeof s === "string")) return x; } catch { /* use defaults */ }
  return { themeId: defaultTheme.id, styles: defaultTheme.style?.recommended ?? [] };
}
export function saveChoice(choice: { themeId: string; styles: string[] }) { localStorage.setItem(CHOICE_KEY, JSON.stringify(choice)); }
export function getAllPacks() { const packs = readPacks(); return { themes: [...defaultThemes, ...packs.filter((p): p is Theme => p.kind === "prompt_scheme")], libraries: [defaultLibrary, ...packs.filter((p): p is Library => p.kind === "style_library")] }; }
export function getTagPresets() { const { themes, libraries } = getAllPacks(); return [...themes, ...libraries.flatMap((library) => library.styles)]; }
