import { useEffect, useState, type FormEvent } from "react";
import type { StyleOption, StylePreset } from "../types";
import { compatibleOptions, providerVariables, ruleContext, RANDOM_VARIABLE } from "../utils/prompt";

interface AskBarProps {
  busy: boolean;
  presets: StylePreset[];
  onSubmit: (description: string, styleId: string | null, selections: Record<string, string>) => void;
}

export function AskBar({ busy, presets, onSubmit }: AskBarProps) {
  const [description, setDescription] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const selectedPreset = presets.find((preset) => preset.id === selectedStyle);
  const isFree = selectedPreset?.id === "free";
  const variables = selectedPreset ? Object.entries(selectedPreset.variables) : [];
  const builtinPresets = presets.filter((preset) => preset.is_builtin);
  const customPresets = presets.filter((preset) => !preset.is_builtin);

  const providerVars = providerVariables(selectedPreset);
  const providerKey = providerVars.map((variable) => selections[variable] ?? "").join("\u0000");
  const manualPicks: Record<string, string> = {};
  for (const [variable, value] of Object.entries(selections)) {
    if (value && value !== RANDOM_VARIABLE && value !== "__omit__") manualPicks[variable] = value;
  }
  const ruleCtx = selectedPreset ? ruleContext(selectedPreset, manualPicks) : null;

  const poolFor = (variable: string, options: StyleOption[]): StyleOption[] =>
    selectedPreset ? compatibleOptions(selectedPreset, variable, options, ruleCtx) : options;

  useEffect(() => {
    if (!selectedPreset || providerVars.length === 0) return;
    setSelections((current) => {
      let changed = false;
      const next = { ...current };
      for (const [variable, config] of Object.entries(selectedPreset.variables)) {
        if (providerVars.includes(variable)) continue;
        const picked = current[variable];
        const pool = compatibleOptions(selectedPreset, variable, config.options, ruleCtx);
        if (picked && picked !== RANDOM_VARIABLE && picked !== "__omit__" && pool.length > 0 && !pool.some((option) => option.value === picked)) {
          next[variable] = selectedPreset.randomize_variables ? RANDOM_VARIABLE : (pool[0]?.value ?? "");
          changed = true;
        }
      }
      return changed ? next : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPreset, providerKey]);

  const complete = selectedPreset
    ? isFree
      ? Boolean(description.trim())
      : variables.every(([variable, config]) => poolFor(variable, config.options).length === 0 || Boolean(selections[variable]))
    : false;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!complete || busy || !selectedPreset) return;
    onSubmit(isFree ? description.trim() : "", selectedPreset.id, selections);
  };

  const selectStyle = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    const defaults = preset
      ? Object.fromEntries(Object.entries(preset.variables).map(([variable, config]) => [
          variable,
          preset.randomize_variables ? RANDOM_VARIABLE : config.options[0]?.value ?? "",
        ]))
      : {};
    setSelectedStyle(id);
    setSelections(defaults);
  };

  const renderPreset = (preset: StylePreset) => (
    <label className={`chip${selectedStyle === preset.id ? " is-selected" : ""}`} key={preset.id}>
      <input className="chip-input" type="radio" name="wallpaper-style" value={preset.id} checked={selectedStyle === preset.id} onChange={() => selectStyle(preset.id)} />
      <span>{preset.name}</span>
    </label>
  );

  const goButton = <button className="btn go-button" type="submit" disabled={!complete || busy} title={complete ? "来一张" : "先完成风格与变量选择"}>GO</button>;

  return (
    <section className={`ask-area chrome${variables.length ? " has-variables" : ""}`} aria-labelledby="ask-label">
      <span id="ask-label" className="ask-label">下一张想看什么？</span>
      {!selectedPreset && <div className="preset-placeholder"><span>先选一套风格</span><button className="btn go-button" type="button" disabled>GO</button></div>}
      {isFree && (
        <form className="ask-bar" onSubmit={submit}>
          <input className="input ask-input" id="wallpaper-ask" aria-label="自由描述" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="写下你想看的角色、场景与画面" autoComplete="off" />
          {goButton}
        </form>
      )}
      {selectedPreset && !isFree && <form className="preset-submit-row" onSubmit={submit}><p>{selectedPreset.description}</p>{goButton}</form>}
      {variables.length > 0 && selectedPreset && (
        <div className="home-variable-groups">
          {variables.map(([variable, config]) => {
            const inputId = `home-variable-${selectedPreset.id}-${variable}`;
            const pool = poolFor(variable, config.options);
            const autoOmitted = pool.length === 0;
            const isProvider = providerVars.includes(variable);
            const values = pool.map((option) => option.value);
            return (
              <div className="home-variable-group" key={variable}>
                <label htmlFor={inputId}>[{variable}]</label>
                {autoOmitted ? (
                  <span className="scope-omitted" title="当前构图下这个变量不可见，生成时会自动省略">此构图下自动省略</span>
                ) : (
                  <select className="select" id={inputId} value={selections[variable] ?? ""} onChange={(event) => setSelections((current) => ({ ...current, [variable]: event.target.value }))}>
                    <option value="" disabled>请选择</option>
                    {selectedPreset.randomize_variables && <option value={RANDOM_VARIABLE}>随机{pool.length < config.options.length ? `（已过滤 ${config.options.length - pool.length} 项）` : ""}</option>}
                    {values.map((option) => <option value={option} key={option}>{option}</option>)}
                  </select>
                )}
                {isProvider && <span className="scope-hint">选定具体取值后，下方变量会自动过滤冲突选项</span>}
                {selections[variable] === RANDOM_VARIABLE && !autoOmitted && <span className="random-candidates" title={values.join(" · ")}>可选：{values.join(" · ")}</span>}
              </div>
            );
          })}
        </div>
      )}
      {customPresets.length > 0 && <div className="custom-preset-group"><span>自定义</span><div className="chip-row" role="radiogroup" aria-label="自定义风格，单选">{customPresets.map(renderPreset)}</div></div>}
      <div className="chip-row built-in-presets" role="radiogroup" aria-label="内置风格，单选">{builtinPresets.map(renderPreset)}</div>
    </section>
  );
}
