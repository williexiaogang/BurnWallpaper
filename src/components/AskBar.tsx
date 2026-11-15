import { useState, type FormEvent } from "react";
import type { StylePreset } from "../types";

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
  const complete = selectedPreset
    ? isFree
      ? Boolean(description.trim())
      : variables.every(([variable]) => selections[variable])
    : false;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!complete || busy || !selectedPreset) return;
    onSubmit(isFree ? description.trim() : "", selectedPreset.id, selections);
  };

  const selectStyle = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    const defaults = preset
      ? Object.fromEntries(Object.entries(preset.variables).map(([variable, options]) => [
          variable,
          preset.randomize_variables ? "__random__" : options[0] ?? "",
        ]))
      : {};
    setSelectedStyle(id);
    setSelections(defaults);
  };

  const renderPreset = (preset: StylePreset) => (
    <label className={`chip${selectedStyle === preset.id ? " is-selected" : ""}`} key={preset.id}>
      <input
        className="chip-input"
        type="radio"
        name="wallpaper-style"
        value={preset.id}
        checked={selectedStyle === preset.id}
        onChange={() => selectStyle(preset.id)}
      />
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
          <input
            className="input ask-input"
            id="wallpaper-ask"
            aria-label="自由描述"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="写下角色、场景与画面"
            autoComplete="off"
          />
          {goButton}
        </form>
      )}
      {selectedPreset && !isFree && (
        <form className="preset-submit-row" onSubmit={submit}>
          <p>{selectedPreset.description}</p>
          {goButton}
        </form>
      )}
      {variables.length > 0 && selectedPreset && (
        <div className="home-variable-groups">
          {variables.map(([variable, options]) => {
            const inputId = `home-variable-${selectedPreset.id}-${variable}`;
            return (
              <div className="home-variable-group" key={variable}>
                <label htmlFor={inputId}>[{variable}]</label>
                <select
                  className="select"
                  id={inputId}
                  value={selections[variable] ?? ""}
                  onChange={(event) => setSelections((current) => ({ ...current, [variable]: event.target.value }))}
                >
                  <option value="" disabled>请选择</option>
                  {selectedPreset.randomize_variables && <option value="__random__">随机</option>}
                  {selectedPreset.optional_variables?.[variable] !== undefined && <option value="__omit__">不加入</option>}
                  {options.map((option) => <option value={option} key={option}>{option}</option>)}
                </select>
                {selections[variable] === "__random__" && (
                  <span className="random-candidates" title={options.join(" · ")}>可选：{options.join(" · ")}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {customPresets.length > 0 && (
        <div className="custom-preset-group">
          <span>自定义</span>
          <div className="chip-row" role="radiogroup" aria-label="自定义风格，单选">{customPresets.map(renderPreset)}</div>
        </div>
      )}
      <div className="chip-row built-in-presets" role="radiogroup" aria-label="内置风格，单选">
        {builtinPresets.map(renderPreset)}
      </div>
    </section>
  );
}
