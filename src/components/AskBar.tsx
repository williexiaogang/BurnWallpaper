import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, PencilLine, Shuffle, X } from "lucide-react";
import type { ResolvedPromptVariable, StyleOption, StylePreset } from "../types";
import {
  chooseStylePack,
  combinePacks,
  compatibleOptions,
  providerVariables,
  RANDOM_VARIABLE,
  resolveStylePromptDetailed,
  ruleContext,
  styleSupportsContent,
  type ResolvedPromptDetail,
} from "../utils/prompt";

function defaultSelections(preset: StylePreset | undefined): Record<string, string> {
  if (!preset) return {};
  return Object.fromEntries(Object.entries(preset.variables).map(([variable, config]) => [
    variable,
    preset.randomize_variables ? RANDOM_VARIABLE : config.options[0]?.value ?? "",
  ]));
}

function emptyPreview(): ResolvedPromptDetail {
  return { prompt: "", preview: "", resolved: [], omitted: [] };
}

function buildPreview(
  preset: StylePreset,
  selections: Record<string, string>,
  randomPicks: Record<string, string> = {},
): { detail: ResolvedPromptDetail; randomPicks: Record<string, string> } {
  const effective = { ...selections };
  for (const [variable, value] of Object.entries(randomPicks)) {
    if (selections[variable] === RANDOM_VARIABLE) effective[variable] = value;
  }
  const result = resolveStylePromptDetailed(preset, effective);
  const detail = {
    ...result,
    resolved: result.resolved.map((item) => ({
      ...item,
      source: selections[item.variable] === RANDOM_VARIABLE ? "random" as const : "manual" as const,
    })),
  };
  return {
    detail,
    randomPicks: Object.fromEntries(detail.resolved
      .filter((item) => selections[item.variable] === RANDOM_VARIABLE)
      .map((item) => [item.variable, item.value])),
  };
}

function PromptTokens({ text, variables, active, onSelect }: {
  text: string;
  variables: ResolvedPromptVariable[];
  active: string | null;
  onSelect: (variable: string) => void;
}) {
  interface Piece {
    text: string;
    info?: ResolvedPromptVariable;
  }
  const displayValue = (info: ResolvedPromptVariable) => info.label ?? info.value;
  let pieces: Piece[] = [{ text }];
  const ordered = variables.filter((item) => displayValue(item)).sort((a, b) => displayValue(b).length - displayValue(a).length);
  for (const info of ordered) {
    const value = displayValue(info);
    const index = pieces.findIndex((piece) => !piece.info && piece.text.includes(value));
    if (index < 0) continue;
    const piece = pieces[index];
    const at = piece.text.indexOf(value);
    const next: Piece[] = [...pieces.slice(0, index)];
    if (at > 0) next.push({ text: piece.text.slice(0, at) });
    next.push({ text: value, info });
    if (at + value.length < piece.text.length) next.push({ text: piece.text.slice(at + value.length) });
    next.push(...pieces.slice(index + 1));
    pieces = next;
  }
  return pieces.map((piece, index): ReactNode => piece.info ? (
    <button
      type="button"
      className={`prompt-token is-${piece.info.source}${active === piece.info.variable ? " is-active" : ""}`}
      key={`${piece.info.variable}-${index}`}
      onClick={() => onSelect(piece.info!.variable)}
      title={piece.info.value}
    >
      {piece.text}
    </button>
  ) : <span key={index}>{piece.text}</span>);
}

interface AskBarProps {
  busy: boolean;
  presets: StylePreset[];
  selectedStylePackIds: string[];
  onStylePackSelection: (ids: string[]) => void;
  onSubmit: (description: string, styleId: string | null, selections: Record<string, string>, stylePackId: string | null, preview?: ResolvedPromptDetail) => void;
}

export function AskBar({ busy, presets, selectedStylePackIds, onStylePackSelection, onSubmit }: AskBarProps) {
  const contentPresets = presets.filter((preset) => preset.kind === "content");
  const stylePacks = presets.filter((preset) => preset.kind === "style");
  const initialPreset = contentPresets.find((preset) => preset.id === "general") ?? contentPresets[0];
  const initialStylePack = stylePacks.find((pack) => initialPreset?.preferred_style_ids?.includes(pack.id) && selectedStylePackIds.includes(pack.id))
    ?? stylePacks.find((pack) => selectedStylePackIds.includes(pack.id))
    ?? stylePacks[0];
  const initialCombined = initialPreset && initialStylePack && initialPreset.id !== "free" ? combinePacks(initialPreset, initialStylePack) : initialPreset;
  const [description, setDescription] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<string | null>(initialPreset?.id ?? null);
  const [previewStylePackId, setPreviewStylePackId] = useState<string | null>(initialStylePack?.id ?? null);
  const [selections, setSelections] = useState<Record<string, string>>(() => defaultSelections(initialCombined));
  const [preview, setPreview] = useState<ResolvedPromptDetail>(() => initialCombined && initialCombined.id !== "free"
    ? resolveStylePromptDetailed(initialCombined, defaultSelections(initialCombined))
    : emptyPreview());
  const [randomPicks, setRandomPicks] = useState<Record<string, string>>(() => Object.fromEntries(preview.resolved
    .filter((item) => selections[item.variable] === RANDOM_VARIABLE)
    .map((item) => [item.variable, item.value])));
  const [activeVariable, setActiveVariable] = useState<string | null>(Object.keys(initialCombined?.variables ?? {})[0] ?? null);
  const [editorOpen, setEditorOpen] = useState(false);
  const editor = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = editor.current;
    if (!dialog) return;
    if (editorOpen && !dialog.open) dialog.showModal();
    else if (!editorOpen && dialog.open) dialog.close();
  }, [editorOpen, selectedStyle]);

  useEffect(() => {
    if (!busy) return;
    setEditorOpen(false);
    editor.current?.close();
  }, [busy]);

  const selectedContent = contentPresets.find((preset) => preset.id === selectedStyle);
  const compatibleStylePacks = selectedContent ? stylePacks.filter((pack) => styleSupportsContent(selectedContent, pack)) : stylePacks;
  const candidateStylePack = stylePacks.find((pack) => pack.id === previewStylePackId)
    ?? stylePacks.find((pack) => selectedStylePackIds.includes(pack.id))
    ?? stylePacks[0];
  const selectedStylePack = selectedContent?.id === "free"
    ? candidateStylePack
    : compatibleStylePacks.find((pack) => pack.id === candidateStylePack?.id)
      ?? compatibleStylePacks.find((pack) => selectedStylePackIds.includes(pack.id))
      ?? compatibleStylePacks[0];
  const selectedPreset = selectedContent && selectedStylePack && selectedContent.id !== "free" ? combinePacks(selectedContent, selectedStylePack) : selectedContent;
  const isFree = selectedPreset?.id === "free";
  const variables = selectedPreset ? Object.entries(selectedPreset.variables) : [];
  const groupLabels: Record<string, string> = {
    content: "画面内容 · 画什么",
    style: "画风呈现 · 怎么画",
    presentation: "画面呈现 · 怎么摆",
    "": "未分组",
  };
  const groupedVariables = ["content", "style", "presentation", ""]
    .map((group) => ({ group, items: variables.filter(([, config]) => (config.group ?? "") === group) }))
    .filter((entry) => entry.items.length > 0);
  const builtinPresets = contentPresets.filter((preset) => preset.is_builtin);
  const customPresets = contentPresets.filter((preset) => !preset.is_builtin);
  const providerVars = providerVariables(selectedPreset);
  const activeConfig = selectedPreset && activeVariable ? selectedPreset.variables[activeVariable] : undefined;

  const manualPicks: Record<string, string> = {};
  for (const [variable, value] of Object.entries(selections)) {
    if (value && value !== RANDOM_VARIABLE && value !== "__omit__") manualPicks[variable] = value;
  }
  for (const item of preview.resolved) {
    if (providerVars.includes(item.variable) && selections[item.variable] === RANDOM_VARIABLE) manualPicks[item.variable] = item.value;
  }
  const poolFor = (variable: string, options: StyleOption[]): StyleOption[] => {
    const group = selectedPreset?.variables[variable]?.group;
    const context = selectedPreset ? ruleContext(selectedPreset, manualPicks, group) : null;
    return selectedPreset ? compatibleOptions(selectedPreset, variable, options, context) : options;
  };
  const activePool = activeVariable && activeConfig ? poolFor(activeVariable, activeConfig.options) : [];
  const categoryLabels: Record<string, string> = {
    photography: "摄影",
    anime: "动漫 / 漫画",
    illustration: "插画 / 手绘",
    graphic: "平面 / 设计",
    three_d: "3D / 立体渲染",
    experimental: "实验 / 其他",
  };
  const activeCategories = Object.keys(categoryLabels).filter((category) => activePool.some((option) => option.category === category));

  const missingVariables = variables.filter(([variable, config]) => poolFor(variable, config.options).length > 0 && !selections[variable]);
  const goReason = !selectedPreset
    ? "请先选择内容包"
    : isFree && !description.trim()
      ? "请先写下画面描述"
      : !isFree && !selectedStylePack
        ? "此内容没有可用的相容画风包"
        : missingVariables.length
          ? `还未选择：${missingVariables.map(([variable, config]) => config.label ?? variable).join("、")}`
          : null;
  const complete = goReason === null;

  const commitSelections = (preset: StylePreset, next: Record<string, string>, preserveRandom: boolean) => {
    const result = buildPreview(preset, next, preserveRandom ? randomPicks : {});
    setSelections(next);
    setPreview(result.detail);
    setRandomPicks(result.randomPicks);
  };

  const selectStylePack = (id: string, nextSelections = selections) => {
    const pack = stylePacks.find((item) => item.id === id);
    if (!selectedContent || !pack || selectedContent.id === "free" || !styleSupportsContent(selectedContent, pack)) return;
    const combined = combinePacks(selectedContent, pack);
    setPreviewStylePackId(id);
    commitSelections(combined, { ...defaultSelections(combined), ...nextSelections }, false);
  };

  const toggleStylePack = (id: string) => {
    const pack = stylePacks.find((item) => item.id === id);
    if (!selectedContent || !pack || !styleSupportsContent(selectedContent, pack)) return;
    const activeIds = selectedStylePackIds.filter((packId) => compatibleStylePacks.some((item) => item.id === packId));
    const selected = activeIds.includes(id);
    if (selected && activeIds.length === 1) return;
    const next = selected ? activeIds.filter((item) => item !== id) : [...activeIds, id];
    onStylePackSelection(next);
    if (selected && previewStylePackId === id) selectStylePack(next[0]);
  };

  const reroll = () => {
    if (!selectedContent || selectedContent.id === "free") return;
    const pack = chooseStylePack(compatibleStylePacks, selectedStylePackIds);
    if (!pack) return;
    setPreviewStylePackId(pack.id);
    commitSelections(combinePacks(selectedContent, pack), { ...defaultSelections(combinePacks(selectedContent, pack)), ...selections }, false);
  };

  const chooseOption = (value: string) => {
    if (!selectedPreset || !activeVariable) return;
    const next = { ...selections, [activeVariable]: value };
    const providerChanged = providerVars.includes(activeVariable);
    if (providerChanged) {
      for (const [variable, config] of variables) {
        if (providerVars.includes(variable)) continue;
        const picked = next[variable];
        if (!picked || picked === RANDOM_VARIABLE || picked === "__omit__") continue;
        const nextContext = ruleContext(selectedPreset, next, config.group);
        const pool = compatibleOptions(selectedPreset, variable, config.options, nextContext);
        if (pool.length > 0 && !pool.some((option) => option.value === picked)) {
          next[variable] = selectedPreset.randomize_variables ? RANDOM_VARIABLE : pool[0]?.value ?? "";
        }
      }
    }
    commitSelections(selectedPreset, next, !providerChanged);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!complete || busy || !selectedPreset) return;
    let finalPreview = preview;
    let finalStylePackId = selectedStylePack?.id ?? null;
    if (!isFree && selectedContent && compatibleStylePacks.filter((pack) => selectedStylePackIds.includes(pack.id)).length > 1) {
      const pack = chooseStylePack(compatibleStylePacks, selectedStylePackIds);
      if (pack) {
        const contentPicks = Object.fromEntries(Object.entries(randomPicks).filter(([variable]) => variable in selectedContent.variables));
        finalPreview = buildPreview(combinePacks(selectedContent, pack), selections, contentPicks).detail;
        finalStylePackId = pack.id;
        setPreviewStylePackId(pack.id);
        setPreview(finalPreview);
        setRandomPicks(Object.fromEntries(finalPreview.resolved.filter((item) => selections[item.variable] === RANDOM_VARIABLE).map((item) => [item.variable, item.value])));
      }
    }
    onSubmit(isFree ? description.trim() : "", selectedPreset.id, selections, isFree ? null : finalStylePackId, isFree ? undefined : finalPreview);
  };

  const selectStyle = (id: string) => {
    const preset = contentPresets.find((item) => item.id === id);
    const compatible = preset ? stylePacks.filter((pack) => styleSupportsContent(preset, pack)) : [];
    const preferredPack = compatible.find((pack) => preset?.preferred_style_ids?.includes(pack.id) && selectedStylePackIds.includes(pack.id))
      ?? compatible.find((pack) => pack.id === previewStylePackId && selectedStylePackIds.includes(pack.id))
      ?? compatible.find((pack) => selectedStylePackIds.includes(pack.id))
      ?? compatible.find((pack) => preset?.preferred_style_ids?.includes(pack.id))
      ?? compatible[0];
    const combined = preset && preferredPack && preset.id !== "free" ? combinePacks(preset, preferredPack) : preset;
    setSelectedStyle(id);
    if (preferredPack) {
      setPreviewStylePackId(preferredPack.id);
      if (!compatible.some((pack) => selectedStylePackIds.includes(pack.id))) onStylePackSelection([preferredPack.id]);
    }
    setActiveVariable(Object.keys(combined?.variables ?? {})[0] ?? null);
    if (combined && combined.id !== "free") {
      commitSelections(combined, defaultSelections(combined), false);
      setEditorOpen(true);
    } else {
      setSelections({});
      setPreview(emptyPreview());
      setRandomPicks({});
      setEditorOpen(false);
    }
  };

  const renderPreset = (preset: StylePreset) => (
    <label
      className={`chip${selectedStyle === preset.id ? " is-selected" : ""}`}
      key={preset.id}
      onClick={() => { if (selectedStyle === preset.id && preset.id !== "free") setEditorOpen(true); }}
    >
      <input className="chip-input" type="radio" name="wallpaper-style" value={preset.id} checked={selectedStyle === preset.id} onChange={() => selectStyle(preset.id)} />
      <span>{preset.name}</span>
    </label>
  );

  const renderPromptOption = (option: StyleOption) => (
    <label className={`prompt-option${activeVariable && selections[activeVariable] === option.value ? " is-selected" : ""}`} key={option.value} title={option.value}>
      <input className="radio" type="radio" name={`home-${selectedPreset?.id}-${activeVariable}`} checked={Boolean(activeVariable && selections[activeVariable] === option.value)} onChange={() => chooseOption(option.value)} />
      <span>{option.label ?? option.value}</span>
      {activeVariable && selections[activeVariable] === option.value && <Check size={14} aria-hidden="true" />}
    </label>
  );

  const goButton = <button className="btn go-button" type="submit" disabled={!complete || busy} title={busy ? "正在提交出图" : goReason ?? "确认 Prompt 与出图设置"} aria-describedby={goReason ? "go-disabled-reason" : undefined}>GO</button>;

  return (
    <section className="ask-area" aria-labelledby="ask-label">
      <div className="chrome">
        <span id="ask-label" className="ask-label">下一张想看什么？</span>
        {customPresets.length > 0 && <div className="custom-preset-group"><span>自定义</span><div className="chip-row" role="radiogroup" aria-label="自定义风格，单选">{customPresets.map(renderPreset)}</div></div>}
        <div className="chip-row built-in-presets" role="radiogroup" aria-label="内置风格，单选">{builtinPresets.map(renderPreset)}</div>
        {!selectedPreset && <div className="preset-placeholder"><span>先选一套风格</span><button className="btn go-button" type="button" disabled>GO</button></div>}
        {selectedPreset && !isFree && variables.length > 0 && (
          <button className="btn ghost-button open-prompt-button" type="button" aria-haspopup="dialog" onClick={() => setEditorOpen(true)}>
            <PencilLine size={14} aria-hidden="true" /> Prompt 预览
          </button>
        )}
        {isFree && (
          <form className="ask-bar" onSubmit={submit}>
            <input className="input ask-input" id="wallpaper-ask" aria-label="自由描述" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="写下你想看的角色、场景与画面" autoComplete="off" />
            {goButton}
          </form>
        )}
      </div>
      {selectedPreset && !isFree && variables.length > 0 && (
        <dialog
          className="modal preset-dialog prompt-editor-dialog"
          ref={editor}
          onClose={() => setEditorOpen(false)}
          aria-labelledby="prompt-editor-title"
        >
          <div className="modal-box">
            <div className="prompt-editor-heading">
              <div>
                <span>{selectedContent?.name}{selectedStylePack ? ` · ${selectedStylePack.name}` : ""}</span>
                <h2 id="prompt-editor-title">Prompt 预览</h2>
                <p>点击高亮内容修改变量，悬停可查看实际英文。</p>
              </div>
              <button className="btn ghost-button prompt-editor-close" type="button" onClick={() => editor.current?.close()} aria-label="收起 Prompt 预览">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <fieldset className="style-pack-selector">
              <legend>画风包</legend>
              <div className="chip-row">
                {stylePacks.map((pack) => {
                  const compatible = selectedContent ? styleSupportsContent(selectedContent, pack) : true;
                  return (
                    <label className={`chip${selectedStylePackIds.includes(pack.id) && compatible ? " is-selected" : ""}${compatible ? "" : " is-disabled"}`} key={pack.id} title={compatible ? pack.description : `${pack.name} 不支持此内容类型`}>
                      <input className="chip-input" type="checkbox" checked={selectedStylePackIds.includes(pack.id) && compatible} disabled={!compatible} onChange={() => toggleStylePack(pack.id)} />
                      <span>{pack.name}{compatible ? "" : "（不适用）"}</span>
                    </label>
                  );
                })}
              </div>
              <p role="status">{compatibleStylePacks.filter((pack) => selectedStylePackIds.includes(pack.id)).length > 1 ? "已选多包，换一组或出图时随机使用其中一包" : "固定使用所选画风包"}；本次预览：{selectedStylePack?.name ?? "无相容包"}</p>
            </fieldset>
            <div className="prompt-workbench">
              <div className="live-prompt-panel">
                <div className="live-prompt-head">
                  <p>实线为手动选择，虚线为随机抽取</p>
                  <button className="btn ghost-button reroll-preview-button" type="button" onClick={reroll} title="保留手动选择，随机选择已启用的画风包并重新抽取变量">
                    <Shuffle size={14} aria-hidden="true" /> 换一组
                  </button>
                </div>
                <div className="live-prompt-language"><span>中文预览</span><span>实际送出英文</span></div>
                <div className="live-prompt-text">
                  <PromptTokens text={preview.preview} variables={preview.resolved} active={activeVariable} onSelect={setActiveVariable} />
                </div>
                {preview.omitted.length > 0 && <p className="live-prompt-omitted">此构图自动省略 {preview.omitted.length} 个不可见变量</p>}
              </div>
              <aside className="variable-options" aria-label="变量选项">
                <label className="variable-select-label">
                  <span>编辑变量</span>
                  <select className="select" value={activeVariable ?? ""} onChange={(event) => setActiveVariable(event.target.value)}>
                    {groupedVariables.map(({ group, items }) => (
                      <optgroup label={groupLabels[group]} key={group}>
                        {items.map(([variable, config]) => <option value={variable} key={variable}>{config.label ?? variable}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <div className="prompt-option-list" role="radiogroup" aria-label={`${activeConfig?.label ?? activeVariable ?? "变量"}候选值`}>
                  {selectedPreset.randomize_variables && activeVariable && (
                    <label className={`prompt-option${selections[activeVariable] === RANDOM_VARIABLE ? " is-selected" : ""}`}>
                      <input className="radio" type="radio" name={`home-${selectedPreset.id}-${activeVariable}`} checked={selections[activeVariable] === RANDOM_VARIABLE} onChange={() => chooseOption(RANDOM_VARIABLE)} />
                      <span>随机</span>
                      <small>保留这次结果，可换一组</small>
                    </label>
                  )}
                  {activeCategories.map((category) => (
                    <section className="prompt-option-category" key={category} aria-label={categoryLabels[category]}>
                      <h3>{categoryLabels[category]}</h3>
                      {activePool.filter((option) => option.category === category).map(renderPromptOption)}
                    </section>
                  ))}
                  {activePool.filter((option) => !option.category).map(renderPromptOption)}
                  {activePool.length === 0 && <p className="scope-omitted">此构图下自动省略</p>}
                </div>
                <p className="option-list-count">{activePool.length} 个相容选项</p>
              </aside>
            </div>
            <form className="preset-submit-row" onSubmit={submit}>
              <div><p>{selectedPreset.description}</p>{goReason && <p id="go-disabled-reason" className="prompt-go-reason" role="status">暂不能出图：{goReason}</p>}</div>
              {goButton}
            </form>
          </div>
          <form method="dialog" className="modal-backdrop"><button aria-label="点击外部收起 Prompt 预览" /></form>
        </dialog>
      )}
    </section>
  );
}
