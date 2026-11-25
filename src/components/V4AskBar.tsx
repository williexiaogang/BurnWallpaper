import { useId, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { Check, ChevronDown, PencilLine, X } from "lucide-react";
import { backend, isTauri } from "../backend";
import { generationPrice, generationSettings, getGenerationModel, modelOptions } from "../data";
import type { PromptSubmitSettings } from "../types";
import { buildAiAuthoringTemplate } from "../v4/authoring";
import { V4PromptPreview } from "./V4PromptPreview";
import { checkPresetUpdate } from "../v4/preset-updates";
import { getAllPacks, getOfficialPresets, packsWarning, rawPacksBackup, readChoice, readHistory, readPacks, saveChoice, savePacks, subscribeOfficialPresets } from "../v4/storage";
import { generateV4, parseV4, type Library, type Result, type Style, type Theme } from "../v4/engine";

interface Props {
  busy: boolean;
  currentSettings: PromptSubmitSettings;
  onSubmit: (theme: Theme, result: Result, settings: PromptSubmitSettings) => void;
  management?: boolean;
}

const RANDOM = "__random__";
const OMIT = "__omit__";

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

export function V4AskBar({ busy, currentSettings, onSubmit, management = false }: Props) {
  const [packs, setPacks] = useState<(Theme | Library)[]>(readPacks);
  const official = useSyncExternalStore(subscribeOfficialPresets, getOfficialPresets);
  const { themes, libraries } = getAllPacks(official, packs);
  const defaultTheme = themes[0];
  const defaultLibrary = official.library;
  const officialPacks = [...official.themes, defaultLibrary];
  const [themeId, setThemeId] = useState(() => readChoice().themeId);
  const theme = themes.find((p) => p.id === themeId) ?? defaultTheme;
  const missingTheme = theme.id !== themeId;
  const styles = libraries.flatMap((l) => l.styles.map((style) => ({ fullId: `${l.id}/${style.id}`, style })));
  const [selected, setSelected] = useState<string[]>(() => readChoice().styles);
  const [locks, setLocks] = useState<Record<string, string | null>>({});
  const [preview, setPreview] = useState<Result | null>(null);
  const [output, setOutput] = useState(currentSettings);
  const outputModel = getGenerationModel(output.modelId);
  const promptLength = outputModel.promptLimit && preview ? Array.from(preview.prompt).length : 0;
  const tooLong = outputModel.promptLimit !== undefined && promptLength > outputModel.promptLimit;
  const [error, setError] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [presetRevision, setPresetRevision] = useState(official.revision);
  const [checkingPresets, setCheckingPresets] = useState(false);
  const [presetMessage, setPresetMessage] = useState("");
  const [aiTemplateMessage, setAiTemplateMessage] = useState("");
  const [sharingTemplate, setSharingTemplate] = useState(false);
  const [editorText, setEditorText] = useState("");
  const [editing, setEditing] = useState("");
  const headingId = useId();
  const styleOptionsId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const variablePicker = useRef<HTMLSelectElement>(null);
  if (presetRevision !== official.revision) {
    const choice = readChoice();
    setPresetRevision(official.revision);
    setThemeId(choice.themeId);
    setSelected(choice.styles);
    setPreview(null);
    setLocks({});
    setEditing("");
    setError("");
    setTestMessage("");
  }
  const embedded = theme.style?.mode === "embedded";
  const stylePool = (scheme: Theme, choices: string[]) => scheme.style?.mode === "embedded" ? []
    : styles.filter((s) => (!choices.length || choices.includes(s.fullId)) && !excludesTheme(scheme, s.style));
  const candidates = stylePool(theme, selected);
  const fixedStyle = candidates.length === 1 ? candidates[0].style : undefined;
  const displayedStyle = fixedStyle ?? preview?.styleSnapshot;
  const themeVariables = Object.entries(theme.variables);
  const styleVariables = Object.entries(displayedStyle?.variables ?? {}).map(([name, variable]) => ["style." + name, variable] as const);
  const variables = [...themeVariables, ...styleVariables];
  const active = variables.some(([key]) => key === editing) ? editing : variables[0]?.[0] ?? "";
  const activeVariable = variables.find(([key]) => key === active)?.[1];
  const activeLock = active in locks ? locks[active] ?? OMIT : RANDOM;
  const isStyleVariable = active.startsWith("style.");
  const styleVariableNeedsFixedStyle = isStyleVariable && !fixedStyle;
  const followsStyleByDefault = isStyleVariable && activeVariable?.probability === 0;
  const file = useRef<HTMLInputElement>(null);
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
  const generate = (scheme: Theme, pool: typeof styles, nextLocks: typeof locks, changedVariable?: string) => {
    try {
      const history = readHistory();
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
          result = generateV4(scheme, previousStyle ? [previousStyle] : pool, preserved, history);
        } catch {
          // A new lock can invalidate the previous random picks.
        }
      }
      setPreview(result ?? generateV4(scheme, pool, nextLocks, history));
      setError("");
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const reroll = () => {
    if (!missingTheme) generate(theme, candidates, locks);
  };
  const openPreview = () => {
    setOutput(generationSettings(currentSettings.modelId, theme.aspect_ratio, currentSettings.aspectRatio));
    if (!preview) reroll();
    dialog.current?.showModal();
  };
  const chooseTheme = (next: Theme) => {
    const choices: string[] = [];
    setThemeId(next.id);
    setOutput((current) => generationSettings(current.modelId, next.aspect_ratio, current.aspectRatio));
    setLocks({});
    setEditing("");
    setSelected(choices);
    saveChoice({ themeId: next.id, styles: choices });
    generate(next, stylePool(next, choices), {});
  };
  const changeStyles = (choices: string[]) => {
    const nextLocks = Object.fromEntries(Object.entries(locks).filter(([key]) => !key.startsWith("style.")));
    setSelected(choices);
    setLocks(nextLocks);
    saveChoice({ themeId: theme.id, styles: choices });
    if (!missingTheme) generate(theme, stylePool(theme, choices), nextLocks);
  };
  const fixPreviewStyle = () => {
    if (!preview?.styleId) return;
    const choices = [preview.styleId];
    setSelected(choices);
    saveChoice({ themeId: theme.id, styles: choices });
  };
  const runTests = () => {
    if (!theme.tests?.length) { setTestMessage("此主題沒有測試案例"); return; }
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
  const selectOption = (value: string) => {
    const next = { ...locks };
    if (value === RANDOM) delete next[active];
    else next[active] = value === OMIT ? null : value;
    setLocks(next);
    if (!missingTheme) generate(theme, candidates, next, active);
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
  const body = (
    <>
      {warning && <p role="alert">{warning} {management ? <button className="btn ghost-button" type="button" onClick={() => {
        try { downloadJson("burn-custom-packs-backup", rawPacksBackup()); }
        catch (e) { setError(String(e)); }
      }}>导出原始备份</button> : "请到「主题与画风」查看。"}</p>}
      {missingTheme && <p role="alert">上次选择的主题不可用。 <button className="btn ghost-button" type="button" onClick={() => chooseTheme(defaultTheme)}>改用默认主题</button></p>}
      <div className="prompt-theme-row">
        <label className="variable-select-label">
          <span>主题方案</span>
          <select className="select" title={missingTheme ? undefined : theme.name} value={missingTheme ? "" : theme.id} onChange={(e) => {
            const next = themes.find((item) => item.id === e.target.value);
            if (next) chooseTheme(next);
          }}>
            {missingTheme && <option value="" disabled>请选择主题</option>}
            {themes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>
      {!embedded && (
        <fieldset className={management ? "style-pack-selector" : "style-pack-selector is-compact"}>
          <legend>{management ? "画风（未选全部随机，单选固定）" : "画风"}</legend>
          <div id={styleOptionsId}>
            <div className="style-pack-options">
              {styles.map(({ fullId, style }) => {
                const excluded = excludesTheme(theme, style);
                const checked = selected[0] === fullId && !excluded;
                return (
                  <label className={"style-pack-option" + (checked ? " is-selected" : "") + (excluded ? " is-disabled" : "")} key={fullId} title={excluded ? "此画风不支持当前内容类型" : style.description}>
                    <input className="radio radio-sm" type="radio" name={styleOptionsId} checked={checked} disabled={excluded} onClick={(event) => {
                      if (checked) {
                        event.preventDefault();
                        changeStyles([]);
                      }
                    }} onChange={() => changeStyles([fullId])} />
                    <span>{style.name}{excluded ? "（不适用）" : ""}</span>
                  </label>
                );
              })}
            </div>
          </div>
          {management && preview?.styleSnapshot && <p role="status">本次画风 · {preview.styleSnapshot.name}</p>}
        </fieldset>
      )}
      <div className="prompt-workbench">
        <V4PromptPreview preview={preview} active={active} locks={locks} onEdit={(key) => {
          setEditing(key);
          variablePicker.current?.focus();
        }} onReroll={reroll} />
        <aside className="variable-options" aria-label="变量选项">
          <label className="variable-select-label">
            <span>编辑变量</span>
            <select className="select" ref={variablePicker} value={active} onChange={(e) => setEditing(e.target.value)}>
              <optgroup label="主题变量">
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
            <div className="prompt-option-list" key={active} role="radiogroup" aria-label={activeVariable.label + "候选值"}>
              {renderOption(RANDOM, followsStyleByDefault ? "随画风" : "随机")}
              {!activeVariable.required && !followsStyleByDefault && renderOption(OMIT, "省略")}
              {activeVariable.options.map((option) => renderOption(option.id, option.label, option.value))}
            </div>
          )}
        </aside>
      </div>
      {error && <p role="alert" className="prompt-submit-error">{error}</p>}
      {management && <details className="prompt-scheme-tools">
        <summary>方案管理</summary>
        <div className="v4-row">
          <button className="btn btn-ghost" type="button" disabled={checkingPresets} aria-busy={checkingPresets} onClick={() => { void updatePresets(); }}>检查预设更新</button>
          <span role="status">{checkingPresets ? "正在从 GitHub 检查更新…" : presetMessage || `官方预设第 ${official.revision} 版`}</span>
        </div>
        <div className="v4-row">
          <button className="btn ghost-button" type="button" onClick={() => file.current?.click()}>导入 v4 JSON</button>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { void importFile(e); }} />
          <button className="btn ghost-button" type="button" onClick={() => download(theme)}>导出主题</button>
          <button className="btn ghost-button" type="button" onClick={() => download(defaultLibrary)}>导出内置画风</button>
          <button className="btn ghost-button" type="button" onClick={runTests}>运行主题测试</button>
          {packs.includes(theme) && <button className="btn ghost-button" type="button" onClick={() => {
            try {
              commit(packs.filter((p) => p.kind !== "prompt_scheme" || p.id !== theme.id));
              chooseTheme(official.themes[0]);
            } catch (e) { setError(String(e)); }
          }}>删除主题</button>}
        </div>
        {testMessage && <p role="status">{testMessage}</p>}
        <div className="v4-row">
          <button className="btn ghost-button" type="button" disabled={sharingTemplate} onClick={() => { void shareAiTemplate("export"); }}>导出 AI 模板</button>
          <button className="btn ghost-button" type="button" disabled={sharingTemplate} onClick={() => { void shareAiTemplate("copy"); }}>复制 AI 指令＋示例</button>
        </div>
        {aiTemplateMessage && <p role="status">{aiTemplateMessage}</p>}
        {packs.filter((p) => p.kind === "style_library").map((pack) => (
          <div className="v4-row" key={pack.id}>
            <span>{pack.name}</span>
            <button className="btn ghost-button" type="button" onClick={() => download(pack)}>导出</button>
            <button className="btn ghost-button" type="button" onClick={() => setEditorText(JSON.stringify(pack, null, 2))}>载入编辑</button>
            <button className="btn ghost-button" type="button" onClick={() => {
              try {
                commit(packs.filter((item) => item !== pack));
                changeStyles(selected.filter((id) => !id.startsWith(pack.id + "/")));
              } catch (e) { setError(String(e)); }
            }}>移除</button>
          </div>
        ))}
        <details>
          <summary>编辑 JSON</summary>
          <p>编辑后以新的 ID 保存，或更新已有自定义方案。内置方案请先改 ID。</p>
          <div className="v4-row">
            <button className="btn ghost-button" type="button" onClick={() => setEditorText(JSON.stringify(theme, null, 2))}>载入当前主题</button>
            <button className="btn ghost-button" type="button" onClick={() => setEditorText(JSON.stringify(defaultLibrary, null, 2))}>载入内置画风库</button>
          </div>
          <textarea className="textarea v4-json-editor" aria-label="方案 JSON" value={editorText} onChange={(e) => setEditorText(e.target.value)} rows={16} />
          <button className="btn ghost-button" type="button" onClick={saveEditor}>校验并保存</button>
        </details>
      </details>}
    </>
  );

  if (management) return <section className="v4-management" aria-label="主题方案">{body}</section>;

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
          {tooLong && <p className="prompt-submit-error" role="status">
            {outputModel.name} 最多支持 {outputModel.promptLimit} 个字符，当前 {promptLength} 个。可省略部分变量或切换模型。
          </p>}
          <div className="preset-submit-row generation-toolbar">
            <label className="generation-toolbar-model">
              <span>出图模型</span>
              <span className="generation-toolbar-select">
                <select className="select" value={output.modelId} onChange={(event) => setOutput(generationSettings(event.target.value, output.aspectRatio))}>
                  {modelOptions.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            </label>
            <label className="generation-toolbar-ratio">
              <span>画幅</span>
              <span className="generation-toolbar-select">
                <select className="select" value={output.aspectRatio} onChange={(event) => setOutput(generationSettings(output.modelId, event.target.value))}>
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
              <button className="btn go-button" type="button" disabled={!preview?.prompt || tooLong || busy} onClick={() => {
                if (!preview?.prompt || tooLong || busy) return;
                dialog.current?.close();
                onSubmit(theme, preview, output);
              }}>GO</button>
            </div>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop"><button aria-label="点击外部关闭 Prompt 预览" /></form>
      </dialog>
    </section>
  );
}
