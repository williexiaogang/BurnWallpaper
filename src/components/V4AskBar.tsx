import { useRef, useState, type ChangeEvent } from "react";
import { defaultLibrary, defaultTheme, defaultThemes, packsWarning, rawPacksBackup, readChoice, readHistory, readPacks, saveChoice, savePacks } from "../v4/storage";
import { generateV4, parseV4, type Library, type Result, type Theme } from "../v4/engine";

interface Props { busy: boolean; onSubmit: (theme: Theme, result: Result) => void; management?: boolean }
export function V4AskBar({ busy, onSubmit, management = false }: Props) {
  const [packs, setPacks] = useState<(Theme | Library)[]>(readPacks);
  const themes = [...defaultThemes, ...packs.filter((p): p is Theme => p.kind === "prompt_scheme")];
  const libraries = [defaultLibrary, ...packs.filter((p): p is Library => p.kind === "style_library")];
  const [themeId, setThemeId] = useState(() => readChoice().themeId);
  const theme = themes.find((p) => p.id === themeId) ?? defaultTheme;
  const missingTheme = theme.id !== themeId;
  const styles = libraries.flatMap((l) => l.styles.map((style) => ({ fullId: `${l.id}/${style.id}`, style })));
  const [selected, setSelected] = useState<string[]>(() => readChoice().styles);
  const [locks, setLocks] = useState<Record<string, string | null>>({});
  const [preview, setPreview] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [editorText, setEditorText] = useState("");
  const [open, setOpen] = useState(management);
  const fixedStyle = selected.length === 1 ? styles.find((s) => s.fullId === selected[0])?.style : undefined;
  const contentTypeTags = theme.variables.CONTENT_TYPE?.options.length === 1 ? theme.variables.CONTENT_TYPE.options[0].tags ?? [] : [];
  const file = useRef<HTMLInputElement>(null);
  const commit = (next: (Theme | Library)[]) => { savePacks(next); setPacks(next); };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    try {
      const item = input.files?.[0]; if (!item) return; if (item.size > 1024 * 1024) throw new Error("JSON 不得超過 1 MB");
      const pack = parseV4(await item.text());
      if ([...defaultThemes, defaultLibrary, ...packs].some((p) => p.kind === pack.kind && p.id === pack.id)) throw new Error(`ID ${pack.id} 已存在，請更改 ID 後再導入`);
      commit([...packs, pack]);
      if (pack.kind === "prompt_scheme") { setThemeId(pack.id); setLocks({}); setSelected(pack.style?.recommended ?? []); saveChoice({ themeId: pack.id, styles: pack.style?.recommended ?? [] }); }
      setPreview(null); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { input.value = ""; }
  };
  const generate = () => {
    try { if (missingTheme) throw new Error("所选主题不可用，请先重新选择主题"); const result = generateV4(theme, styles.filter((s) => selected.includes(s.fullId)), locks, readHistory()); setPreview(result); setError(""); }
    catch (e) { setPreview(null); setError(e instanceof Error ? e.message : String(e)); }
  };
  const runTests = () => {
    if (!theme.tests?.length) { setTestMessage("此主題沒有測試案例"); return; }
    const candidates = styles.filter((s) => selected.includes(s.fullId));
    if (theme.style?.mode !== "embedded" && !candidates.length) { setTestMessage("請先選擇測試要使用的畫風"); return; }
    const failures: string[] = [];
    for (const test of theme.tests) {
      try {
        let seed = 1234567; const rng = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
        const result = generateV4(theme, candidates, test.select, [], rng);
        const expected = test.expect;
        if (expected.error || Object.entries(expected.selected ?? {}).some(([key, id]) => result.selections[key] !== id)
          || (expected.include ?? []).some((key) => !result.selections[key]) || (expected.omit ?? []).some((key) => !!result.selections[key])
          || (expected.prompt_contains ?? []).some((text) => !result.prompt.toLowerCase().includes(text.toLowerCase()))
          || (expected.prompt_excludes ?? []).some((text) => result.prompt.toLowerCase().includes(text.toLowerCase()))) failures.push(test.name);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (test.expect.error !== "incompatible_selection" || !message.startsWith("沒有符合條件")) failures.push(`${test.name}（${message}）`);
      }
    }
    setTestMessage(failures.length ? `測試未通過：${failures.join("、")}` : `全部 ${theme.tests.length} 個測試通過`);
  };
  const setLock = (key: string, value: string) => {
    const next = { ...locks }; if (value === "__random__") delete next[key]; else next[key] = value === "__omit__" ? null : value;
    setLocks(next); setPreview(null);
  };
  const download = (pack: Theme | Library) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${pack.id}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const warning = packsWarning();
  return <section className={management ? "v4-management" : "v4-panel chrome"} aria-label="主題方案">
    {!management && <button className="btn ghost-button" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>主題與畫風 {open ? "收起" : "展開"}</button>}
    {open && <div className="v4-content">
      {warning && <p role="alert">{warning} <button type="button" onClick={() => { try { const url = URL.createObjectURL(new Blob([rawPacksBackup()], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "burn-custom-packs-backup.json"; link.click(); URL.revokeObjectURL(url); } catch (e) { setError(String(e)); } }}>匯出原始備份</button></p>}
      {missingTheme && <p role="alert">上次選擇的主題不可用。 <button type="button" onClick={() => { setThemeId(defaultTheme.id); setSelected(defaultTheme.style?.recommended ?? []); saveChoice({ themeId: defaultTheme.id, styles: defaultTheme.style?.recommended ?? [] }); setLocks({}); setPreview(null); }}>改用預設主題</button></p>}
      <div className="v4-row"><label>主題 <select className="select" value={theme.id} onChange={(e) => { const next = themes.find((t) => t.id === e.target.value)!; const choices = next.style?.recommended ?? []; setThemeId(next.id); setLocks({}); setSelected(choices); saveChoice({ themeId: next.id, styles: choices }); setPreview(null); setError(""); }}>{themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <button className="btn" type="button" onClick={() => file.current?.click()}>匯入 v4 JSON</button><input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { void importFile(e); }} />
      <button className="btn" type="button" onClick={() => download(theme)}>匯出主題</button>
      <button className="btn" type="button" onClick={() => download(defaultLibrary)}>匯出內置畫風</button>
      {!defaultThemes.some((p) => p.id === theme.id) && <button type="button" className="btn ghost-button" onClick={() => { try { commit(packs.filter((p) => p.kind !== "prompt_scheme" || p.id !== theme.id)); setThemeId(defaultTheme.id); setSelected(defaultTheme.style?.recommended ?? []); saveChoice({themeId: defaultTheme.id, styles: defaultTheme.style?.recommended ?? []}); setLocks({}); setPreview(null); } catch (e) { setError(String(e)); } }}>刪除主題</button>}</div>
      {theme.style?.mode !== "embedded" && <fieldset><legend>畫風（單選固定，多選隨機）</legend><div className="v4-row">{styles.map(({ fullId, style }) => { const excluded = (style.excludes ?? []).some((tag) => contentTypeTags.includes(tag)); return <label key={fullId} title={excluded ? "此畫風不支援目前的內容類型" : style.description}><input type="checkbox" checked={selected.includes(fullId) && !excluded} disabled={excluded} onChange={(e) => { const choices = e.target.checked ? [...selected, fullId] : selected.filter((s) => s !== fullId); setSelected(choices); setLocks(Object.fromEntries(Object.entries(locks).filter(([key]) => !key.startsWith("style.")))); saveChoice({ themeId: theme.id, styles: choices }); setPreview(null); }} /> {style.name}{excluded ? "（不適用）" : ""}</label>; })}</div></fieldset>}
      {theme.style?.mode === "embedded" && <p>使用主題自帶畫風</p>}
      <details><summary>鎖定主題變量</summary><div className="v4-locks">{Object.entries(theme.variables).map(([key, variable]) => <label key={key}>{variable.label}<select className="select" value={locks[key] === null ? "__omit__" : locks[key] ?? "__random__"} onChange={(e) => setLock(key, e.target.value)}><option value="__random__">隨機</option>{!variable.required && <option value="__omit__">省略</option>}{variable.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>)}</div></details>
      {fixedStyle && <details><summary>鎖定畫風變量</summary><div className="v4-locks">{Object.entries(fixedStyle.variables).map(([name, variable]) => { const key = `style.${name}`; return <label key={key}>{variable.label}<select className="select" value={locks[key] === null ? "__omit__" : locks[key] ?? "__random__"} onChange={(e) => setLock(key, e.target.value)}><option value="__random__">隨機</option>{!variable.required && <option value="__omit__">省略</option>}{variable.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>; })}</div></details>}
      {packs.filter((p) => p.kind === "style_library").map((p) => <p key={p.id}>自訂畫風庫：{p.name} <button type="button" onClick={() => download(p)}>匯出</button> {management && <button type="button" onClick={() => setEditorText(JSON.stringify(p, null, 2))}>載入編輯</button>} <button type="button" onClick={() => { try { commit(packs.filter((v) => v !== p)); const choices = selected.filter((id) => !id.startsWith(`${p.id}/`)); setSelected(choices); saveChoice({ themeId: theme.id, styles: choices }); setPreview(null); } catch (e) { setError(String(e)); } }}>移除</button></p>)}
      {management && <details><summary>編輯 JSON</summary><p>編輯後以新的 ID 儲存，或更新已有自訂方案。內置方案請先改 ID。</p><button className="btn" type="button" onClick={() => setEditorText(JSON.stringify(theme, null, 2))}>載入目前主題</button><button className="btn" type="button" onClick={() => setEditorText(JSON.stringify(defaultLibrary, null, 2))}>載入內置畫風庫</button><textarea className="textarea v4-json-editor" value={editorText} onChange={(e) => setEditorText(e.target.value)} rows={16} /><button className="btn" type="button" onClick={() => { try { const pack = parseV4(editorText); if ([...defaultThemes, defaultLibrary].some((p) => p.kind === pack.kind && p.id === pack.id)) throw new Error("內置 ID 不可覆蓋，請改用新的 ID"); commit([...packs.filter((p) => !(p.kind === pack.kind && p.id === pack.id)), pack]); if (pack.kind === "prompt_scheme") { setThemeId(pack.id); setSelected(pack.style?.recommended ?? []); saveChoice({themeId: pack.id, styles: pack.style?.recommended ?? []}); } setPreview(null); setError(""); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>校驗並儲存</button></details>}
      <div className="v4-row"><button type="button" className="btn" onClick={generate}>抽取預覽</button><button type="button" className="btn" onClick={runTests}>執行主題測試</button>{!management && <button type="button" className="btn go-button" disabled={!preview || busy} onClick={() => { if (preview) onSubmit(theme, preview); }}>GO</button>}</div>
      {error && <p role="alert" className="prompt-submit-error">{error}</p>}
      {testMessage && <p role="status">{testMessage}</p>}
      {preview && <div className="v4-preview"><p>{preview.prompt}</p><small>畫風：{styles.find((s) => s.fullId === preview.styleId)?.style.name ?? "主題自帶"} · {Object.entries(preview.labels).map(([key, value]) => `${theme.variables[key]?.label ?? key}: ${value}`).join("、")}</small></div>}
    </div>}
  </section>;
}
