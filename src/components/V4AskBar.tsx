import { useId, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { Check, ChevronDown, PencilLine, X } from "lucide-react";
import { backend, isTauri } from "../backend";
import { generationPrice, generationSettings, getGenerationModel, modelOptions } from "../data";
import type { PromptSubmitSettings } from "../types";
import { buildAiAuthoringTemplate } from "../v4/authoring";
import { StudioStylePicker } from "./StudioStylePicker";
import { V4PromptPreview } from "./V4PromptPreview";
import { checkPresetUpdate } from "../v4/preset-updates";
import { sceneCategories, sceneCategoryName, sceneOptions, scopeScenes } from "../v4/scenes";
import { getAllPacks, getOfficialPresets, packsWarning, rawPacksBackup, readChoice, readHistory, readPacks, saveChoice, savePacks, subscribeOfficialPresets } from "../v4/storage";
import { createStudioLibrary, getStudioPresets, studioPromptLocks, type StudioPreset, type StudioVariation } from "../v4/studio-presets";
import { generateV4, parseV4, type CustomPromptValue, type Library, type PromptLocks, type Result, type Style, type Theme } from "../v4/engine";

interface Props {
  busy: boolean;
  currentSettings: PromptSubmitSettings;
  onSubmit: (theme: Theme, result: Result, settings: PromptSubmitSettings) => void;
  management?: boolean;
  studio?: boolean;
}

const RANDOM = "__random__";
const OMIT = "__omit__";

function studioReferencePreview(preset?: StudioPreset): Result | null {
  if (!preset) return null;
  try {
    return generateV4(preset.theme, [preset], studioPromptLocks(preset, {}, "reference"));
  } catch {
    return null;
  }
}

function excludesTheme(theme: Theme, style: Style) {
  const content = theme.variables.CONTENT_TYPE;
  const tags = content?.required && content.options.length === 1 ? content.options[0].tags ?? [] : [];
  return (style.excludes ?? []).some((tag) => tags.includes(tag));
}

function downloadFile(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const downloadJson = (id: string, data: string) => downloadFile(id + ".json", data, "application/json");

function PackChoice({ label, checked, onClick, disabled = false, title }: { label: string; checked: boolean; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button className={`btn btn-ghost btn-sm style-pack-option justify-start${checked ? " is-selected" : ""}`}
      type="button" aria-pressed={checked} disabled={disabled} title={title} onClick={onClick}>
      {checked && <Check size={14} aria-hidden="true" />}
      {label}
    </button>
  );
}

export function V4AskBar({ busy, currentSettings, onSubmit, management = false, studio = false }: Props) {
  const [packs, setPacks] = useState<(Theme | Library)[]>(readPacks);
  const official = useSyncExternalStore(subscribeOfficialPresets, getOfficialPresets);
  const { themes, libraries } = getAllPacks(official, packs);
  const defaultTheme = themes[0];
  const defaultLibrary = official.library;
  const officialPacks = [...official.themes, defaultLibrary];
  const [themeId, setThemeId] = useState(() => readChoice(studio).themeId);
  const theme = themes.find((p) => p.id === themeId) ?? defaultTheme;
  const missingTheme = !studio && theme.id !== themeId;
  const styles = libraries.flatMap((library) => library.styles.map((style) => ({ fullId: `${library.id}/${style.id}`, style })));
  const studioPresets = useMemo(() => studio ? getStudioPresets(packs.filter((pack) => pack.kind === "style_library"), official.studio) : [],
    [studio, packs, official.studio]);
  const [selected, setSelected] = useState<string[]>(() => readChoice(studio).styles);
  const [sceneCategory, setSceneCategory] = useState(() => studio ? undefined : readChoice().sceneCategory);
  const embedded = theme.style?.mode === "embedded";
  const stylePool = (scheme: Theme, choices: string[]) => scheme.style?.mode === "embedded" ? []
    : styles.filter((s) => (!choices.length || choices.includes(s.fullId)) && !excludesTheme(scheme, s.style));
  const studioPreset = studioPresets.find((preset) => preset.fullId === selected[0]);
  const candidates = studio ? (studioPreset ? [studioPreset] : []) : stylePool(theme, selected);
  const editorTheme = studio ? studioPreset?.theme : theme;
  const [locks, setLocks] = useState<PromptLocks>({});
  const [customEditor, setCustomEditor] = useState<{ key: string; text: string } | null>(null);
  const [preview, setPreview] = useState<Result | null>(() => studioReferencePreview(studioPreset));
  const [output, setOutput] = useState(() => studio
    ? { ...generationSettings(currentSettings.modelId, studioPreset?.theme.aspect_ratio ?? "16:9", currentSettings.aspectRatio), promptLanguage: currentSettings.promptLanguage }
    : currentSettings);
  const outputModel = getGenerationModel(output.modelId);
  const submittedPrompt = preview ? preview.prompts[output.promptLanguage] ?? preview.prompt : "";
  const promptLength = outputModel.promptLimit ? Array.from(submittedPrompt).length : 0;
  const tooLong = outputModel.promptLimit !== undefined && promptLength > outputModel.promptLimit;
  const [error, setError] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [previousOfficial, setPreviousOfficial] = useState(official);
  const [checkingPresets, setCheckingPresets] = useState(false);
  const [presetMessage, setPresetMessage] = useState("");
  const [aiTemplateMessage, setAiTemplateMessage] = useState("");
  const [sharingTemplate, setSharingTemplate] = useState(false);
  const [editorText, setEditorText] = useState("");
  const [editing, setEditing] = useState(() => studioPreset ? "SCENE" : "");
  const headingId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const variablePicker = useRef<HTMLSelectElement>(null);
  if (previousOfficial !== official) {
    setPreviousOfficial(official);
    if (!studio && previousOfficial.revision !== official.revision) {
      const choice = readChoice();
      setThemeId(choice.themeId);
      setSelected(choice.styles);
      setSceneCategory(choice.sceneCategory);
      setPreview(null);
      setLocks({});
      setCustomEditor(null);
      setEditing("");
      setError("");
      setTestMessage("");
    } else if (studio && previousOfficial.studio !== official.studio && (!studioPreset || studioPreset.thumbnail)) {
      setPreview(studioReferencePreview(studioPreset));
      setLocks({});
      setCustomEditor(null);
      setEditing(studioPreset ? "SCENE" : "");
      setError("");
    }
  }
  const categories = studio ? [] : sceneCategories(theme);
  const fixedStyle = candidates.length === 1 ? candidates[0].style : undefined;
  const displayedStyle = fixedStyle ?? preview?.styleSnapshot;
  const themeVariables = Object.entries(editorTheme?.variables ?? {});
  const styleVariables = Object.entries(displayedStyle?.variables ?? {})
    .filter(([name]) => !studio || name !== "ART_STYLE")
    .map(([name, variable]) => ["style." + name, variable] as const);
  const variables = [...themeVariables, ...styleVariables];
  const active = variables.some(([key]) => key === editing) ? editing : variables[0]?.[0] ?? "";
  const activeVariable = variables.find(([key]) => key === active)?.[1];
  const activeOptions = active === "SCENE" && !studio ? sceneOptions(theme, sceneCategory) : activeVariable?.options ?? [];
  const activeLock = active in locks ? locks[active] ?? OMIT
    : studio && preview ? preview.selections[active] ?? (activeVariable?.required ? RANDOM : OMIT) : RANDOM;
  const isStyleVariable = active.startsWith("style.");
  const customValue = typeof activeLock === "object" ? activeLock.text : undefined;
  const activeTemplate = isStyleVariable ? displayedStyle?.template : editorTheme?.template;
  const canWriteCustom = activeTemplate?.some((block) => block.text.en.includes(`{${isStyleVariable ? active.slice(6) : active}}`));
  const customInput = customEditor?.key === active ? customEditor : null;
  const styleVariableNeedsFixedStyle = isStyleVariable && !fixedStyle;
  const followsStyleByDefault = isStyleVariable && activeVariable?.probability === 0;
  const file = useRef<HTMLInputElement>(null);
  const jsonEditor = useRef<HTMLDetailsElement>(null);
  const commit = (next: (Theme | Library)[]) => { savePacks(next); setPacks(next); };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    try {
      const item = input.files?.[0]; if (!item) return; if (item.size > 1024 * 1024) throw new Error("JSON 不得超過 1 MB");
      const pack = parseV4(await item.text());
      const currentPacks = readPacks();
      const official = getOfficialPresets();
      if ([...official.themes, official.library, ...currentPacks].some((p) => p.kind === pack.kind && p.id === pack.id)) throw new Error(`ID ${pack.id} 已存在，請更改 ID 後再導入`);
      commit([...currentPacks, pack]);
      if (pack.kind === "prompt_scheme") chooseTheme(pack);
      else { setPreview(null); setError(""); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { input.value = ""; }
  };
  const generate = (scheme: Theme, pool: typeof styles, nextLocks: PromptLocks, category: string | undefined, changedVariable?: string) => {
    try {
      const scopedScheme = scopeScenes(scheme, category);
      const history = readHistory();
      if (studio && preview?.styleId === pool[0]?.fullId && preview) history.unshift({ ...preview, at: Date.now() });
      let result: Result | undefined;
      if (changedVariable && preview) {
        const previousStyle = pool.find((entry) => entry.fullId === preview.styleId);
        const preserved = { ...nextLocks };
        for (const [key, variable] of variables) {
          if (key === changedVariable || key in preserved) continue;
          const choice = preview.selections[key];
          if (choice || !variable.required) preserved[key] = choice ?? null;
        }
        try {
          result = generateV4(scopedScheme, previousStyle ? [previousStyle] : pool, preserved, history);
        } catch {
          // A new lock can invalidate the previous random picks.
        }
      }
      result ??= generateV4(scopedScheme, pool, nextLocks, history);
      setPreview({ ...result, themeSnapshot: scheme });
      setError("");
    } catch (e) {
      setPreview(null);
      const message = e instanceof Error ? e.message : String(e);
      setError(category && /^沒有(?:找到)?符合條件/.test(message)
        ? `「${sceneCategoryName(category)}」场景暂时找不到相容组合。请调整已固定的选项或场景分类。`
        : message);
    }
  };
  const generateStudio = (preset: StudioPreset, manual: PromptLocks, variation: StudioVariation, changed?: string) => {
    generate(preset.theme, [preset], studioPromptLocks(preset, manual, variation, preview, changed), undefined);
  };
  const reroll = () => {
    if (studioPreset) generateStudio(studioPreset, locks, preview ? "details" : "reference");
    else if (!studio && !missingTheme) generate(theme, candidates, locks, sceneCategory);
  };
  const openPreview = () => {
    setOutput({ ...generationSettings(currentSettings.modelId, theme.aspect_ratio, currentSettings.aspectRatio), promptLanguage: currentSettings.promptLanguage });
    if (!preview) reroll();
    dialog.current?.showModal();
  };
  const chooseTheme = (next: Theme) => {
    setThemeId(next.id);
    setOutput((current) => ({ ...generationSettings(current.modelId, next.aspect_ratio, current.aspectRatio), promptLanguage: current.promptLanguage }));
    setLocks({});
    setCustomEditor(null);
    setEditing("");
    setSelected([]);
    setSceneCategory(undefined);
    saveChoice({ themeId: next.id, styles: [] });
    if (management) {
      setError("");
      setTestMessage("");
    } else {
      generate(next, stylePool(next, []), {}, undefined);
    }
  };
  const changeSceneCategory = (choice?: string) => {
    const next = choice === sceneCategory ? undefined : choice;
    if (next === sceneCategory) return;
    const nextLocks = { ...locks };
    delete nextLocks.SCENE;
    setSceneCategory(next);
    setLocks(nextLocks);
    setEditing("SCENE");
    saveChoice({ themeId: theme.id, styles: selected, sceneCategory: next });
    generate(theme, candidates, nextLocks, next, "SCENE");
  };
  const changeStyles = (choices: string[]) => {
    const nextLocks = Object.fromEntries(Object.entries(locks).filter(([key]) => !key.startsWith("style.")));
    setSelected(choices);
    setLocks(nextLocks);
    setCustomEditor(null);
    saveChoice({ themeId: theme.id, styles: choices, sceneCategory });
    if (!missingTheme) generate(theme, stylePool(theme, choices), nextLocks, sceneCategory);
  };
  const chooseStudioPreset = (preset: StudioPreset) => {
    saveChoice({ themeId: preset.theme.id, styles: [preset.fullId] }, true);
    setSelected([preset.fullId]);
    setLocks({});
    setEditing("SCENE");
    setCustomEditor(null);
    generateStudio(preset, {}, "reference");
  };
  const addStudioStyle = (name: string, core: string, palette: string, coreZh: string, paletteZh: string) => {
    const { pack, preset } = createStudioLibrary(`studio_${crypto.randomUUID()}`, name, core, palette, coreZh, paletteZh);
    commit([...readPacks(), pack]);
    chooseStudioPreset(preset);
  };
  const fixPreviewStyle = () => {
    if (!preview?.styleId) return;
    const choices = [preview.styleId];
    setSelected(choices);
    saveChoice({ themeId: theme.id, styles: choices, sceneCategory });
  };
  const runTests = () => {
    if (!theme.tests?.length) { setTestMessage("此主題沒有測試案例"); return; }
    const testStyles = stylePool(theme, []);
    if (theme.style?.mode !== "embedded" && !testStyles.length) { setTestMessage("此主题没有可用于测试的画风"); return; }
    const failures: string[] = [];
    for (const test of theme.tests) {
      try {
        let seed = 1234567; const rng = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
        const result = generateV4(theme, testStyles, test.select, [], rng);
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
  const selectOption = (value: string | CustomPromptValue) => {
    const next = { ...locks };
    if (value === RANDOM) delete next[active];
    else next[active] = value === OMIT ? null : value;
    if (typeof value === "string") setCustomEditor(null);
    setLocks(next);
    if (studioPreset) generateStudio(studioPreset, next, "edit", active);
    else if (!studio && !missingTheme) generate(theme, candidates, next, sceneCategory, active);
  };
  const download = (pack: Theme | Library) => downloadJson(pack.id, JSON.stringify(pack, null, 2));
  const updatePresets = async () => {
    setCheckingPresets(true);
    setPresetMessage("");
    try {
      const { updated, revision } = await checkPresetUpdate();
      setPresetMessage(updated ? `已更新到预设第 ${revision} 版` : `预设已是最新版本（第 ${revision} 版）`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setPresetMessage(`预设更新失败，继续使用本地版本。${detail}`);
    } finally {
      setCheckingPresets(false);
    }
  };
  const shareAiTemplate = async (action: "copy" | "export") => {
    setSharingTemplate(true);
    setAiTemplateMessage("");
    try {
      const template = buildAiAuthoringTemplate();
      if (action === "copy") {
        await navigator.clipboard.writeText(template);
        setAiTemplateMessage("已复制 v4 AI 指令和示例");
        return;
      }
      const filename = "burn-wallpaper-v4-ai-template.md";
      if (isTauri) {
        const saved = await backend.exportTextFile(filename, template);
        if (!saved) return;
      } else {
        downloadFile(filename, template, "text/markdown;charset=utf-8");
      }
      setAiTemplateMessage("已导出 v4 AI 模板");
    } catch (error) {
      setAiTemplateMessage(action === "copy" ? "复制失败，可使用导出 AI 模板。" : "导出 AI 模板失败：" + String(error));
    } finally {
      setSharingTemplate(false);
    }
  };
  const renderOption = (value: string, label: string, title?: string) => {
    const checked = activeLock === value;
    const current = preview?.selections[active] === value;
    return (
      <label className={checked ? "prompt-option is-selected" : "prompt-option"} key={value} title={title}>
        <input className="radio" type="radio" name={headingId + "-variable"} checked={checked} onChange={() => selectOption(value)} />
        <span>{label}{current && !checked && <small>本次抽中</small>}</span>
        {checked && <Check size={14} aria-hidden="true" />}
      </label>
    );
  };

  const saveEditor = () => {
    try {
      const pack = parseV4(editorText);
      const samePack = (p: Theme | Library) => p.kind === pack.kind && p.id === pack.id;
      if (officialPacks.some(samePack) && !packs.some(samePack)) throw new Error("内置 ID 不可覆盖，请改用新的 ID");
      commit([...packs.filter((p) => !samePack(p)), pack]);
      if (pack.kind === "prompt_scheme") chooseTheme(pack);
      else {
        setLocks({});
        setPreview(null);
        setError("");
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const warning = packsWarning();
  const themeSelect = (label: string, onChange: (next: Theme) => void) => (
    <label className="variable-select-label">
      <span>{label}</span>
      <select className="select" title={missingTheme ? undefined : theme.name} value={missingTheme ? "" : theme.id} onChange={(event) => {
        const next = themes.find((item) => item.id === event.target.value);
        if (next) onChange(next);
      }}>
        {missingTheme && <option value="" disabled>请选择主题</option>}
        {themes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
  );

  if (management) {
    const loadEditor = (pack: Theme | Library) => {
      setEditorText(JSON.stringify(pack, null, 2));
      setError("");
      if (jsonEditor.current) {
        jsonEditor.current.open = true;
        jsonEditor.current.querySelector("textarea")?.focus();
      }
    };
    return <section className="v4-management" aria-label="主题方案">
      {warning && <p role="alert">{warning} <button className="btn ghost-button" type="button" onClick={() => {
        try { downloadJson("burn-custom-packs-backup", rawPacksBackup()); }
        catch (e) { setError(String(e)); }
      }}>导出原始备份</button></p>}
      <details className="prompt-scheme-tools" open>
        <summary>方案管理</summary>
        <div className="v4-row">{themeSelect("管理主题", (next) => {
          setThemeId(next.id);
          setTestMessage("");
          setError("");
        })}</div>
        <div className="v4-row">
          <button className="btn btn-ghost" type="button" disabled={checkingPresets} aria-busy={checkingPresets} onClick={() => { void updatePresets(); }}>检查预设更新</button>
          <span role="status">{checkingPresets ? "正在从 GitHub 检查更新…" : presetMessage || `官方预设第 ${official.revision} 版`}</span>
        </div>
        <div className="v4-row">
          <button className="btn ghost-button" type="button" onClick={() => file.current?.click()}>导入 v4 JSON</button>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={(event) => { void importFile(event); }} />
          <button className="btn ghost-button" type="button" onClick={() => download(theme)}>导出主题</button>
          <button className="btn ghost-button" type="button" onClick={() => download(defaultLibrary)}>导出内置画风</button>
          <button className="btn ghost-button" type="button" onClick={runTests}>运行主题测试</button>
          {packs.includes(theme) && <button className="btn ghost-button" type="button" onClick={() => {
            try {
              commit(packs.filter((pack) => pack.kind !== "prompt_scheme" || pack.id !== theme.id));
              if (readChoice().themeId === theme.id) saveChoice({ themeId: official.themes[0].id, styles: [] });
              setThemeId(official.themes[0].id);
              setTestMessage("");
              setError("");
            } catch (e) { setError(String(e)); }
          }}>删除主题</button>}
        </div>
        {testMessage && <p role="status">{testMessage}</p>}
        <div className="v4-row">
          <button className="btn ghost-button" type="button" disabled={sharingTemplate} onClick={() => { void shareAiTemplate("export"); }}>导出 AI 模板</button>
          <button className="btn ghost-button" type="button" disabled={sharingTemplate} onClick={() => { void shareAiTemplate("copy"); }}>复制 AI 指令＋示例</button>
        </div>
        {aiTemplateMessage && <p role="status">{aiTemplateMessage}</p>}
        {packs.filter((pack) => pack.kind === "style_library").map((pack) => (
          <div className="v4-row" key={pack.id}>
            <span>{pack.name}</span>
            <button className="btn ghost-button" type="button" onClick={() => download(pack)}>导出</button>
            <button className="btn ghost-button" type="button" onClick={() => loadEditor(pack)}>载入编辑</button>
            <button className="btn ghost-button" type="button" onClick={() => {
              try {
                commit(packs.filter((item) => item !== pack));
                const choice = readChoice();
                const nextStyles = choice.styles.filter((id) => !id.startsWith(pack.id + "/"));
                if (nextStyles.length !== choice.styles.length) saveChoice({ ...choice, styles: nextStyles });
                setError("");
              } catch (e) { setError(String(e)); }
            }}>移除</button>
          </div>
        ))}
      </details>
      <details className="prompt-scheme-tools" ref={jsonEditor}>
        <summary>编辑 JSON</summary>
        <p>编辑后以新的 ID 保存，或更新已有自定义方案。内置方案请先改 ID。</p>
        <div className="v4-row">
          <button className="btn ghost-button" type="button" onClick={() => loadEditor(theme)}>载入当前主题</button>
          <button className="btn ghost-button" type="button" onClick={() => loadEditor(defaultLibrary)}>载入内置画风库</button>
        </div>
        <textarea className="textarea v4-json-editor" aria-label="方案 JSON" value={editorText} onChange={(event) => setEditorText(event.target.value)} rows={16} />
        <button className="btn ghost-button" type="button" onClick={saveEditor}>校验并保存</button>
      </details>
      {error && <p role="alert" className="prompt-submit-error">{error}</p>}
    </section>;
  }

  const editingBackground = studio && active === "SCENE";
  const customOption = activeVariable && canWriteCustom && <div>
    <button className={`btn btn-ghost prompt-option w-full justify-start${customValue ? " is-selected" : ""}`} type="button"
      aria-expanded={Boolean(customInput)} onClick={() => setCustomEditor(customInput ? null : { key: active, text: customValue ?? "" })}>
      <span>{editingBackground ? "自定义背景" : "自定义填写"}{customValue && <small>已固定</small>}</span>
      {customValue && <Check size={14} aria-hidden="true" />}
    </button>
    {customInput && <form className="prompt-custom-editor" onSubmit={(event) => {
      event.preventDefault();
      const text = customInput.text.trim();
      if (!text) return;
      const tagged = isStyleVariable ? activeVariable.options.filter((option) => option.tags?.length) : [];
      const baseId = typeof activeLock === "object" ? activeLock.baseId
        : (tagged.find(({ id }) => id === preview?.selections[active]) ?? tagged[0])?.id;
      selectOption({ text, baseId });
    }}>
      <label className="variable-select-label">
        <span>自定义{activeVariable.label}</span>
        <input className="input input-sm w-full" type="text" value={customInput.text} autoFocus
          onChange={(event) => setCustomEditor({ key: active, text: event.target.value })} />
      </label>
      <button className="btn btn-ghost btn-sm" type="submit" disabled={!customInput.text.trim()}>应用</button>
    </form>}
  </div>;
  const body = (
    <>
      {warning && <p role="alert">{warning} 请到「风格」查看。</p>}
      {missingTheme && <p role="alert">上次选择的主题不可用。 <button className="btn ghost-button" type="button" onClick={() => chooseTheme(defaultTheme)}>改用默认主题</button></p>}
      {!studio && <div className="prompt-theme-row">{themeSelect("主题方案", chooseTheme)}</div>}
      {!studio && !missingTheme && (categories.length > 0 || sceneCategory) && (
        <fieldset className="style-pack-selector is-compact">
          <legend>场景分类</legend>
          <div className="style-pack-options">
            {[undefined, ...categories].map((id) => <PackChoice key={id ?? ""} label={id ? sceneCategoryName(id) : "全部场景"}
              checked={sceneCategory === id} onClick={() => changeSceneCategory(id)} />)}
          </div>
        </fieldset>
      )}
      {!embedded && !studio && (
        <fieldset className="style-pack-selector is-compact">
          <legend>画风</legend>
          <div className="style-pack-options">
              <PackChoice label="全部画风" checked={!selected.length} onClick={() => { if (selected.length) changeStyles([]); }} />
              {styles.map(({ fullId, style }) => {
                const excluded = excludesTheme(theme, style);
                const checked = selected[0] === fullId && !excluded;
                return (
                  <PackChoice key={fullId} label={style.name} checked={checked} disabled={excluded}
                    title={excluded ? "此画风不支持当前内容类型" : style.description} onClick={() => changeStyles(checked ? [] : [fullId])} />
                );
              })}
          </div>
        </fieldset>
      )}
      <div className="prompt-workbench">
        <V4PromptPreview preview={preview} active={active} locks={locks} outputLanguage={output.promptLanguage} onEdit={(key) => {
          setEditing(key);
          variablePicker.current?.focus();
        }} onReroll={reroll} fixedArtStyle={studio} requiresStyle={studio && !candidates.length} />
        {variables.length > 0 && <aside className="variable-options" aria-label="变量选项">
          <label className="variable-select-label">
            <span>编辑变量</span>
            <select className="select" ref={variablePicker} value={active} onChange={(e) => setEditing(e.target.value)}>
              <optgroup label={studio ? "画面变量" : "主题变量"}>
                {themeVariables.map(([key, variable]) => <option value={key} key={key}>{variable.label}</option>)}
              </optgroup>
              {styleVariables.length > 0 && <optgroup label="画风变量">
                {styleVariables.map(([key, variable]) => <option value={key} key={key}>{variable.label}</option>)}
              </optgroup>}
            </select>
          </label>
          {styleVariableNeedsFixedStyle ? (
            <div className="prompt-style-lock">
              <p>固定本次画风后，即可编辑此变量。</p>
              <button className="btn ghost-button" type="button" onClick={fixPreviewStyle}>固定 {displayedStyle?.name}</button>
            </div>
          ) : activeVariable && (
            <div className="prompt-option-list" key={active}>
              {editingBackground && customOption}
              <div className="grid gap-1" role="radiogroup" aria-label={activeVariable.label + "候选值"}>
                {renderOption(RANDOM, followsStyleByDefault ? "随画风" : studio ? "随机此项" : "随机")}
                {!activeVariable.required && !followsStyleByDefault && renderOption(OMIT, "省略")}
                {activeOptions.map((option) => renderOption(option.id,
                  editingBackground && studioPreset?.thumbnail && option.id === studioPreset.reference.SCENE
                    ? `缩略图背景 · ${option.label}` : option.label, option.value.en))}
              </div>
              {!editingBackground && customOption}
            </div>
          )}
        </aside>}
      </div>
      {error && <p role="alert" className="prompt-submit-error">{error}</p>}
    </>
  );

  const submission = (
    <>
      {tooLong && <p className="prompt-submit-error" role="status">
        {outputModel.name} 最多支持 {outputModel.promptLimit} 个字符，当前 {promptLength} 个。可省略部分变量或切换模型。
      </p>}
      <div className="preset-submit-row generation-toolbar">
        <label className="generation-toolbar-model">
          <span>出图模型</span>
          <span className="generation-toolbar-select">
            <select className="select" value={output.modelId} onChange={(event) => setOutput({ ...generationSettings(event.target.value, output.aspectRatio), promptLanguage: output.promptLanguage })}>
              {modelOptions.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </label>
        <label className="generation-toolbar-language">
          <span>Prompt 语言</span>
          <span className="generation-toolbar-select">
            <select className="select" value={output.promptLanguage} onChange={(event) => setOutput({ ...output, promptLanguage: event.target.value === "zh" ? "zh" : "en" })}>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </label>
        <label className="generation-toolbar-ratio">
          <span>画幅</span>
          <span className="generation-toolbar-select">
            <select className="select" value={output.aspectRatio} onChange={(event) => setOutput({ ...generationSettings(output.modelId, event.target.value), promptLanguage: output.promptLanguage })}>
              {outputModel.ratios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </label>
        <div className="generation-toolbar-submit">
          <output className="generation-toolbar-price" aria-live="polite" title="按 RunComfy 公示单图价估算">
            <small>4K · 单张预估</small>
            <strong>{generationPrice(output.modelId)}</strong>
          </output>
          <button className="btn go-button" type="button" disabled={!submittedPrompt || tooLong || busy} onClick={() => {
            if (!preview || !submittedPrompt || tooLong || busy) return;
            dialog.current?.close();
            onSubmit(preview.themeSnapshot, preview, output);
          }}>{studio ? "生成图片" : "GO"}</button>
        </div>
      </div>
    </>
  );

  if (studio) return (
    <>
      <StudioStylePicker presets={studioPresets} selected={studioPreset?.fullId}
        onSelect={(id) => {
          const next = studioPresets.find((preset) => preset.fullId === id);
          if (next && studioPreset?.fullId !== id) chooseStudioPreset(next);
          else if (!preview) reroll();
        }} onCreate={addStudioStyle} />
      <section className="studio-prompt" aria-labelledby={headingId}>
        <div className="studio-section-heading">
          <div>
            <h2 id={headingId}>Prompt 预览</h2>
            {studioPreset && <p role="status">已固定画法 · {studioPreset.style.name}</p>}
          </div>
          {studioPreset && <div className="v4-row" role="group" aria-label="变奏操作">
            <button className="btn ghost-button" type="button" onClick={() => generateStudio(studioPreset, locks, "free")}
              title="重抽画面变量，保留手动设置和固定画法">自由变奏</button>
            <button className="btn ghost-button" type="button" onClick={() => chooseStudioPreset(studioPreset)}>
              {studioPreset.thumbnail ? "恢复参考" : "恢复默认"}
            </button>
          </div>}
        </div>
        {body}
        {submission}
      </section>
    </>
  );

  return (
    <section className="ask-area" aria-label="下一张壁纸">
      <div className="chrome">
        <span className="ask-label">下一张想看什么？</span>
        <button className="btn ghost-button open-prompt-button" type="button" aria-haspopup="dialog" onClick={openPreview}>
          <PencilLine size={14} aria-hidden="true" /> Prompt 预览
        </button>
      </div>
      <dialog className="modal preset-dialog prompt-editor-dialog" ref={dialog} aria-labelledby={headingId}>
        <div className="modal-box">
          <div className="prompt-editor-heading">
            <h2 id={headingId}>Prompt 预览</h2>
            <button className="btn ghost-button prompt-editor-close" type="button" onClick={() => dialog.current?.close()} aria-label="关闭 Prompt 预览">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="prompt-editor-body">{body}</div>
          {submission}
        </div>
        <form method="dialog" className="modal-backdrop"><button aria-label="点击外部关闭 Prompt 预览" /></form>
      </dialog>
    </section>
  );
}
