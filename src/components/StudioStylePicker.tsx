import { useId, useRef, useState, type FormEvent } from "react";
import { Check, Palette, Plus, X } from "lucide-react";
import type { StudioPreset } from "../v4/studio-presets";

interface Props {
  presets: StudioPreset[];
  selected?: string;
  onSelect: (fullId: string) => void;
  onCreate: (name: string, core: string, palette: string, coreZh: string, paletteZh: string) => void;
}

export function StudioStylePicker({ presets, selected, onSelect, onCreate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const dialogTitle = useId();
  const [error, setError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const core = String(data.get("core") ?? "").trim();
    const palette = String(data.get("palette") ?? "").trim();
    const coreZh = String(data.get("coreZh") ?? "").trim();
    const paletteZh = String(data.get("paletteZh") ?? "").trim();
    if (!name || !core.replace(/[.。]+$/, "").trim()) {
      setError("请填写画风名称和画法 Prompt。");
      return;
    }
    try {
      onCreate(name, core, palette, coreZh, paletteZh);
      dialog.current?.close();
      form.reset();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="studio-library" aria-labelledby="studio-library-heading">
      <div className="studio-section-heading">
        <h2 id="studio-library-heading">画风预设</h2>
        <button className="btn ghost-button" type="button" aria-haspopup="dialog" onClick={() => {
          setError("");
          dialog.current?.showModal();
          nameInput.current?.focus();
        }}><Plus size={16} aria-hidden="true" /> 添加画风</button>
      </div>
      <div className="studio-style-grid" role="group" aria-labelledby="studio-library-heading">
        {presets.map((preset) => {
          const checked = selected === preset.fullId;
          const thumbnailSrc = preset.thumbnailSrc ?? (preset.thumbnail && `${import.meta.env.BASE_URL}style-previews/${preset.thumbnail}`);
          return (
            <button className="btn btn-ghost studio-style-card" key={preset.fullId} type="button"
              aria-pressed={checked}
              onClick={() => onSelect(preset.fullId)}>
              <span className="studio-style-preview" aria-hidden="true">
                <span className="studio-style-swatches">
                  {preset.colors ? preset.colors.map((color) => <span key={color} style={{ backgroundColor: color }} />) : <Palette size={18} />}
                </span>
                {thumbnailSrc && <img key={thumbnailSrc} src={thumbnailSrc} alt=""
                  width={384} height={288} loading="lazy" decoding="async" onError={(event) => { event.currentTarget.hidden = true; }} />}
              </span>
              <span className="studio-style-label">{preset.style.name}{checked && <Check size={15} aria-hidden="true" />}</span>
            </button>
          );
        })}
      </div>
      <dialog className="modal preset-dialog studio-style-dialog" ref={dialog} aria-labelledby={dialogTitle}>
        <div className="modal-box">
          <div className="prompt-editor-heading">
            <h2 id={dialogTitle}>添加画风</h2>
            <button className="btn ghost-button prompt-editor-close" type="button" aria-label="关闭添加画风" onClick={() => dialog.current?.close()}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <form className="studio-style-form" onSubmit={submit}>
            <label className="variable-select-label">名称<input className="input w-full" ref={nameInput} name="name" maxLength={80} required /></label>
            <label className="variable-select-label">画法 Prompt（英文）<textarea className="textarea w-full" name="core" rows={4} maxLength={1600} required
              placeholder="用英文描述线条、阴影、媒材或质感" /></label>
            <label className="variable-select-label">画法 Prompt（中文，可选）<textarea className="textarea w-full" name="coreZh" rows={4} maxLength={1600}
              placeholder="填写对应的完整中文描述；留空时使用画风名称" /></label>
            <label className="variable-select-label">默认配色（英文，可选）<input className="input w-full" name="palette" maxLength={400}
              placeholder="例如 navy ink with warm cream highlights" /></label>
            <label className="variable-select-label">默认配色（中文，可选）<input className="input w-full" name="paletteZh" maxLength={400}
              placeholder="例如藏青墨色与暖米白高光" /></label>
            {error && <p role="alert" className="prompt-submit-error">{error}</p>}
            <div className="dialog-actions"><button className="btn primary-button" type="submit">保存画风</button></div>
          </form>
        </div>
      </dialog>
    </section>
  );
}
