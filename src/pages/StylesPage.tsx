import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Copy, Download, Plus, RotateCcw, Trash2, Upload, X } from "lucide-react";
import type { StyleField, StylePreset } from "../types";
import { backend, isTauri } from "../backend";
import { parseStylePresetImport, presetTemplateText } from "../utils/preset-json";

interface StylesPageProps {
  presets: StylePreset[];
  onUpdate: (id: string, field: StyleField, value: string) => void;
  onVariableUpdate: (id: string, variable: string, value: string) => void;
  onToggleRandom: (id: string) => void;
  onOptionalChange: (id: string, variable: string, probability: number | null) => void;
  onReset: (id: string) => void;
  onAdd: (preset: StylePreset) => void;
  onDelete: (id: string) => void;
  onImport: (presets: StylePreset[]) => void;
  onToast: (text: string, detail?: string) => void;
}

export function StylesPage({ presets, onUpdate, onVariableUpdate, onToggleRandom, onOptionalChange, onReset, onAdd, onDelete, onImport, onToast }: StylesPageProps) {
  const [selectedId, setSelectedId] = useState(presets[0].id);
  const [newOptions, setNewOptions] = useState<Record<string, string>>({});
  const [newVariable, setNewVariable] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const addDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const templateDialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = presets.find((preset) => preset.id === selectedId) ?? presets[0];
  const isFree = selected.id === "free";

  const addPreset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) return;
    const preset: StylePreset = {
      id: `custom-${Date.now()}`,
      name,
      english: "CUSTOM",
      description: String(form.get("description") ?? "").trim() || "自定义风格",
      is_builtin: false,
      prompt_template: String(form.get("prompt") ?? "").trim(),
      variables: {},
      randomize_variables: false,
      aspect_ratio: "16:9",
    };
    onAdd(preset);
    setSelectedId(preset.id);
    event.currentTarget.reset();
    addDialog.current?.close();
  };

  const addVariable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const variable = newVariable.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
    if (!variable || variable in selected.variables) return;
    onVariableUpdate(selected.id, variable, "");
    setNewVariable("");
  };

  const addOption = (event: FormEvent<HTMLFormElement>, variable: string, options: string[]) => {
    event.preventDefault();
    const option = (newOptions[variable] ?? "").trim();
    if (!option || options.includes(option)) return;
    onVariableUpdate(selected.id, variable, [...options, option].join(","));
    setNewOptions((current) => ({ ...current, [variable]: "" }));
  };

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(presetTemplateText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  const exportSelected = async () => {
    const json = JSON.stringify(selected, null, 2);
    if (isTauri) {
      try {
        const saved = await backend.exportTextFile(`${selected.id}.json`, json);
        onToast(saved ? "JSON 已导出" : "已取消导出", saved ?? undefined);
      } catch (error) {
        onToast("导出失败", String(error));
      }
      return;
    }
    const link = document.createElement("a");
    link.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    link.download = `${selected.id}.json`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const imported = parseStylePresetImport(await file.text(), presets.map((preset) => preset.id));
      onImport(imported);
      setSelectedId(imported[0].id);
      onToast(`已导入 ${imported.length} 套风格`);
    } catch (error) {
      onToast("JSON 无法导入", error instanceof Error ? error.message : "请检查文件内容");
    } finally {
      input.value = "";
    }
  };

  return (
    <main id="main-content" className="styles-page page-enter">
      <div className="page-heading">
        <div><h1>风格</h1><p>每个标签，都有自己的一套打法。</p></div>
        <div className="style-heading-actions">
          <span className="preset-count"><b>{presets.length}</b> 套预设</span>
          <button className="btn primary-button" onClick={() => addDialog.current?.showModal()}><Plus size={16} /> 新增风格</button>
        </div>
      </div>
      <div className="json-toolbar">
        <span>可导入单套 preset 或数组；外部文件会成为自定义风格。</span>
        <div>
          <button className="btn ghost-button" onClick={() => { setCopyStatus("idle"); templateDialog.current?.showModal(); }}>JSON 模板</button>
          <button className="btn ghost-button" onClick={() => fileInput.current?.click()}><Upload size={15} /> 导入 JSON</button>
          <button className="btn ghost-button" onClick={() => { void exportSelected(); }}><Download size={15} /> 导出当前 JSON</button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importJson} />
        </div>
      </div>
      <div className="style-workbench">
        <nav className="preset-list" aria-label="风格预设">
          {presets.map((preset) => (
            <button
              className="preset-option"
              key={preset.id}
              aria-pressed={selected.id === preset.id}
              onClick={() => setSelectedId(preset.id)}
            >
              <span>{preset.name}</span><small>{preset.is_builtin ? preset.english : "CUSTOM"}</small>
            </button>
          ))}
        </nav>
        <section className="preset-editor" aria-labelledby="preset-title">
          <header className="preset-editor-heading">
            <div><h2 id="preset-title">{selected.name}</h2><p>{selected.is_builtin ? selected.english : "CUSTOM"}</p></div>
            <div className="preset-editor-actions">
              {selected.is_builtin && !isFree && <button className="btn ghost-button" type="button" onClick={() => onReset(selected.id)}><RotateCcw size={15} /> 恢复此风格</button>}
              {!selected.is_builtin && <button className="btn ghost-button delete-preset" type="button" onClick={() => deleteDialog.current?.showModal()}><Trash2 size={15} /> 删除风格</button>}
            </div>
          </header>
          <p className="preset-description">{selected.description}</p>
          {isFree ? (
            <div className="free-preset">
              <strong>不加预设</strong>
              <p>这里不放任何提示词。回到「此刻」，写下你想看的角色、场景与画面。</p>
              <span>空白模板 · 无变量 · 16:9</span>
            </div>
          ) : (
            <div className="preset-form">
              {!selected.is_builtin && <label className="preset-field"><span>风格名称</span><input className="input" value={selected.name} onChange={(event) => onUpdate(selected.id, "name", event.target.value)} /></label>}
              <label className="preset-field">
                <span>风格说明</span>
                <input className="input" value={selected.description} onChange={(event) => onUpdate(selected.id, "description", event.target.value)} />
              </label>
              <label className="preset-field">
                <span>提示词模板</span>
                <small>用 [变量名] 标记可以替换的位置</small>
                <textarea className="textarea" value={selected.prompt_template} onChange={(event) => onUpdate(selected.id, "prompt_template", event.target.value)} rows={5} />
              </label>
              <section className="variable-section" aria-labelledby="variables-title">
                <h3 id="variables-title">变量选项</h3>
                <p>每个选项都是独立标签，可逐一新增或移除。</p>
                {Object.entries(selected.variables).map(([variable, options]) => (
                  <div className="variable-group" key={`${selected.id}-${variable}`}>
                    <div className="variable-group-heading">
                      <span className="variable-name">[{variable}]</span>
                      <div className="optional-controls">
                        <label>出现概率
                          <input
                            className="input"
                            type="number"
                            min="0"
                            max="100"
                            value={Math.round((selected.optional_variables?.[variable] ?? 1) * 100)}
                            onChange={(event) => {
                              const percent = Math.min(100, Math.max(0, Number(event.target.value)));
                              onOptionalChange(selected.id, variable, percent >= 100 ? null : percent / 100);
                            }}
                          />%
                        </label>
                        {(selected.optional_variables?.[variable] ?? 1) < 1 && <small>低于 100% 时随机选择可能跳过</small>}
                      </div>
                    </div>
                    <div className="variable-tags">
                      {options.map((option) => (
                        <span className="variable-tag" key={option}>{option}<button type="button" aria-label={`移除 ${option}`} onClick={() => onVariableUpdate(selected.id, variable, options.filter((item) => item !== option).join(","))}><X size={13} /></button></span>
                      ))}
                    </div>
                    <form className="variable-add" onSubmit={(event) => addOption(event, variable, options)}>
                      <input className="input" aria-label={`为 ${variable} 新增选项`} value={newOptions[variable] ?? ""} onChange={(event) => setNewOptions((current) => ({ ...current, [variable]: event.target.value }))} placeholder="新增一个选项" />
                      <button className="btn ghost-button" type="submit" aria-label={`添加 ${variable} 选项`}><Plus size={15} /></button>
                    </form>
                  </div>
                ))}
                <form className="variable-create" onSubmit={addVariable}>
                  <input className="input" aria-label="新变量名称" value={newVariable} onChange={(event) => setNewVariable(event.target.value)} placeholder="新变量名，例如 COLOR" />
                  <button className="btn ghost-button" type="submit"><Plus size={15} /> 添加变量</button>
                </form>
              </section>
              <div className="preset-field-grid">
                <label className="preset-field">
                  <span>画面比例</span>
                  <select className="select" value={selected.aspect_ratio} onChange={(event) => onUpdate(selected.id, "aspect_ratio", event.target.value)}>
                    <option>16:9</option><option>21:9</option><option>32:9</option><option>9:16</option>
                  </select>
                </label>
                <label className="random-control">
                  <span>允许随机组合</span>
                  <input className="toggle" type="checkbox" checked={selected.randomize_variables} onChange={() => onToggleRandom(selected.id)} />
                </label>
              </div>
            </div>
          )}
          <p className="preset-sync">{isFree ? "自由模式只使用你在「此刻」输入的内容。" : "改动会立即同步到「此刻」的同名风格标签。"}</p>
        </section>
      </div>
      <dialog className="modal preset-dialog" ref={addDialog}>
        <div className="modal-box">
          <h2>新增风格</h2>
          <form className="preset-form" onSubmit={addPreset}>
            <label className="preset-field"><span>风格名称</span><input className="input" name="name" required autoComplete="off" /></label>
            <label className="preset-field"><span>风格说明</span><input className="input" name="description" autoComplete="off" /></label>
            <label className="preset-field"><span>提示词模板</span><textarea className="textarea" name="prompt" rows={4} /></label>
            <div className="dialog-actions"><button className="btn ghost-button" type="button" onClick={() => addDialog.current?.close()}>取消</button><button className="btn primary-button" type="submit">新增风格</button></div>
          </form>
        </div>
        <form method="dialog" className="modal-backdrop"><button aria-label="关闭新增风格窗口" /></form>
      </dialog>
      <dialog className="modal preset-dialog" ref={deleteDialog}>
        <div className="modal-box">
          <h2>丢掉「{selected.name}」？</h2>
          <p>这套自定义风格会被移除，其他预设不受影响。</p>
          <div className="dialog-actions"><button className="btn ghost-button" onClick={() => deleteDialog.current?.close()}>取消</button><button className="btn danger-button" onClick={() => { onDelete(selected.id); setSelectedId("free"); deleteDialog.current?.close(); }}>删除风格</button></div>
        </div>
        <form method="dialog" className="modal-backdrop"><button aria-label="取消删除" /></form>
      </dialog>
      <dialog className="modal preset-dialog json-dialog" ref={templateDialog}>
        <div className="modal-box">
          <h2>从 JSON 模板开始</h2>
          <div className="json-guide">
            <p>标准 JSON 不支持注释，因此说明放在这里。复制后修改引号中的内容即可。</p>
            <ul>
              <li>模板中的 <code>[SUBJECT]</code> 要与 <code>variables</code> 的键名一致。</li>
              <li><code>optional_variables</code> 的 0–1 数值代表随机加入机率。</li>
              <li>导入时不会保留 <code>is_builtin</code> 或负面提示词。</li>
            </ul>
          </div>
          <pre className="json-template">{presetTemplateText}</pre>
          {copyStatus === "error" && <p className="copy-error" role="alert">无法访问剪贴板，请直接选取上方 JSON。</p>}
          <div className="dialog-actions">
            <button className="btn ghost-button" onClick={() => templateDialog.current?.close()}>关闭</button>
            <button className="btn primary-button" onClick={copyTemplate}><Copy size={15} /> {copyStatus === "copied" ? "已复制" : "复制 JSON 模板"}</button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop"><button aria-label="关闭 JSON 模板" /></form>
      </dialog>
    </main>
  );
}
