import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Copy, Download, FlaskConical, Plus, RotateCcw, Trash2, Upload, X } from "lucide-react";
import type { ContentPack, PresetTestResult, StyleField, StylePack, StylePreset, StyleVariable, TemplateBlock } from "../types";
import { backend, isTauri } from "../backend";
import { createPresetBundle, parseStylePresetImport, presetAiInstructions, presetBundleTemplateText, presetTemplateText, stylePresetTemplateText } from "../utils/preset-json";
import { providerVariables, runPresetTests } from "../utils/prompt";

interface StylesPageProps {
  presets: StylePreset[];
  onUpdate: (id: string, field: StyleField, value: string) => void;
  onTemplateUpdate: (id: string, template: TemplateBlock[]) => void;
  onVariableUpdate: (id: string, variable: string, value: string) => void;
  onToggleRandom: (id: string) => void;
  onOptionalChange: (id: string, variable: string, probability: number | null) => void;
  onReset: (id: string) => void;
  onDelete: (id: string) => void;
  onImport: (presets: StylePreset[]) => void;
  onToast: (text: string, detail?: string) => void;
}

function TemplateEditor({ preset, onChange }: { preset: StylePreset; onChange: (template: TemplateBlock[]) => void }) {
  const [draft, setDraft] = useState(() => JSON.stringify(preset.template, null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(JSON.stringify(preset.template, null, 2));
    setError(null);
  }, [preset.id, preset.template]);

  const apply = () => {
    try {
      const parsed: unknown = JSON.parse(draft);
      if (!Array.isArray(parsed) || !parsed.every((block) => typeof block?.text === "string" && (block.if === undefined || typeof block.if === "string"))) {
        throw new Error("模板必须是 text/if 片段数组");
      }
      onChange(parsed as TemplateBlock[]);
      setError(null);
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : String(templateError));
    }
  };

  return (
    <label className="preset-field">
      <span>提示词模板（v3 条件片段）</span>
      <small>text 使用 {"{VARIABLE}"}；if 指定变量非空时才加入该片段，编辑完成后离开输入框生效。</small>
      <textarea className="textarea" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={apply} rows={8} aria-invalid={Boolean(error)} aria-describedby={error ? "template-error" : undefined} />
      {error && <small id="template-error" className="prompt-submit-error" role="alert">{error}</small>}
    </label>
  );
}

export function StylesPage({ presets, onUpdate, onTemplateUpdate, onVariableUpdate, onToggleRandom, onOptionalChange, onReset, onDelete, onImport, onToast }: StylesPageProps) {
  const [selectedId, setSelectedId] = useState(presets[0].id);
  const [newOptions, setNewOptions] = useState<Record<string, string>>({});
  const [newVariable, setNewVariable] = useState("");
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSource, setImportSource] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<PresetTestResult[] | null>(null);
  const [exampleKind, setExampleKind] = useState<"content" | "style" | "bundle">("content");
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const templateDialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = presets.find((preset) => preset.id === selectedId) ?? presets[0];
  const exampleText = exampleKind === "content" ? presetTemplateText : exampleKind === "style" ? stylePresetTemplateText : presetBundleTemplateText;
  const isFree = selected.id === "free";
  const providers = providerVariables(selected);

  const copy = async (action: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedAction(action);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  };

  const feedbackForAi = () => {
    const failures = testResults?.filter((result) => !result.passed)
      .map((result) => `${result.name}: ${result.failures.join("、")}\n${result.prompt}`).join("\n\n");
    const source = importSource ?? JSON.stringify(selected, null, 2);
    return `${presetAiInstructions}\n\n目前 JSON：\n${source}\n\n${importError ? `匯入錯誤：\n${importError}` : ""}${failures ? `\n測試失敗：\n${failures}` : ""}\n请完整修正并只输出 JSON。`;
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

  const groupLabels: Record<string, string> = {
    content: "画面内容 · 画什么",
    style: "画风呈现 · 怎么画",
    presentation: "画面呈现 · 怎么摆",
    "": "未分组",
  };
  const groupedVariables = ["content", "style", "presentation", ""]
    .map((group) => ({ group, items: Object.entries(selected.variables).filter(([, config]) => (config.group ?? "") === group) }))
    .filter((entry) => entry.items.length > 0);

  const renderVariableEditor = (variable: string, config: StyleVariable) => {
    const values = config.options.map((option) => option.value);
    const probability = config.probability ?? 1;
    return (
      <div className="variable-group" key={`${selected.id}-${variable}`}>
        <div className="variable-group-heading">
          <span className="variable-name">{"{"}{variable}{"}"}</span>
          {config.label && <span className="variable-label">{config.label}</span>}
          <div className="optional-controls">
            <label>出现概率<input className="input" type="number" min="0" max="100" value={Math.round(probability * 100)} onChange={(event) => {
              const percent = Math.min(100, Math.max(0, Number(event.target.value)));
              onOptionalChange(selected.id, variable, percent >= 100 ? null : percent / 100);
            }} />%</label>
            {probability < 1 && <small>低于 100% 时随机选择可能跳过</small>}
          </div>
        </div>
        <div className="variable-tags">
          {config.options.map((option) => (
            <span className="variable-tag" key={option.value} title={option.value}>{option.label ?? option.value}<button type="button" aria-label={`移除 ${option.value}`} onClick={() => onVariableUpdate(selected.id, variable, values.filter((item) => item !== option.value).join(","))}><X size={13} /></button></span>
          ))}
        </div>
        <form className="variable-add" onSubmit={(event) => addOption(event, variable, values)}>
          <input className="input" aria-label={`为 ${variable} 新增选项`} value={newOptions[variable] ?? ""} onChange={(event) => setNewOptions((current) => ({ ...current, [variable]: event.target.value }))} placeholder="新增一个选项" />
          <button className="btn ghost-button" type="submit" aria-label={`添加 ${variable} 选项`}><Plus size={15} /></button>
        </form>
      </div>
    );
  };

  const runTests = () => {
    const results = runPresetTests(selected);
    setTestResults(results);
    const failures = results.filter((result) => !result.passed).length;
    onToast(results.length === 0 ? "此风格还没有测试案例" : failures ? `${failures} 组测试未通过` : `全部 ${results.length} 组测试通过`);
  };

  const exportJson = async (id: string, value: unknown) => {
    const json = JSON.stringify(value, null, 2);
    if (isTauri) {
      try {
        const saved = await backend.exportTextFile(`${id}.json`, json);
        onToast(saved ? "JSON 已导出" : "已取消导出", saved ?? undefined);
      } catch (error) {
        onToast("导出失败", String(error));
      }
      return;
    }
    const link = document.createElement("a");
    link.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    link.download = `${id}.json`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  };

  const exportSelected = () => exportJson(selected.id, selected);
  const exportBundle = () => {
    const content = selected.kind === "content" ? selected : presets.find<ContentPack>((preset): preset is ContentPack => preset.kind === "content" && preset.id === "general");
    const preferredStyleId = content?.preferred_style_ids?.[0] ?? "anime";
    const style = selected.kind === "style" ? selected : presets.find<StylePack>((preset): preset is StylePack => preset.kind === "style" && preset.id === preferredStyleId);
    if (!content || !style) return;
    return exportJson(`${content.id}-${style.id}`, createPresetBundle(content, style));
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const source = await file.text();
      setImportSource(source);
      const imported = parseStylePresetImport(source, presets.map((preset) => preset.id));
      onImport(imported);
      setSelectedId(imported[0].id);
      setTestResults(runPresetTests(imported[0]));
      setImportError(null);
      setImportSource(null);
      onToast(`已导入 ${imported.length} 套风格`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "请检查文件内容";
      setImportError(message);
      onToast("JSON 无法导入", message);
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
        </div>
      </div>
      <div className="json-toolbar">
        <span>仅接受 schema_version 3 的内容包、画风包或 bundle；生成后先验证，再本地测试 Prompt。</span>
        <div>
          <button className="btn ghost-button" onClick={() => { setCopyError(false); templateDialog.current?.showModal(); }}>JSON / AI 模板</button>
          <button className="btn primary-button" onClick={() => fileInput.current?.click()}><Upload size={15} /> 导入 JSON</button>
          <button className="btn ghost-button" onClick={() => { void exportSelected(); }}><Download size={15} /> 导出当前包</button>
          {!isFree && <button className="btn ghost-button" onClick={() => { void exportBundle(); }}><Download size={15} /> 导出组合包</button>}
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importJson} />
        </div>
      </div>
      {importError && (
        <div className="scope-note" role="alert">
          <p>导入错误：{importError}</p>
          <button className="btn ghost-button" onClick={() => { void copy("import-feedback", feedbackForAi()); }}><Copy size={14} />{copiedAction === "import-feedback" ? "已复制" : "复制错误与 JSON 给 AI"}</button>
        </div>
      )}
      <div className="style-workbench">
        <nav className="preset-list" aria-label="内容与画风包">
          {presets.map((preset) => (
            <button className="preset-option" key={preset.id} aria-pressed={selected.id === preset.id} onClick={() => { setSelectedId(preset.id); setTestResults(null); setImportError(null); }}>
              <span>{preset.name}</span><small>{preset.kind === "content" ? "内容包" : "画风包"} · {preset.is_builtin ? preset.english : "CUSTOM"}</small>
            </button>
          ))}
        </nav>
        <section className="preset-editor" aria-labelledby="preset-title">
          <header className="preset-editor-heading">
            <div><h2 id="preset-title">{selected.name}</h2><p>{selected.kind === "content" ? "内容包" : "画风包"} · {selected.is_builtin ? selected.english : "CUSTOM"} · schema v3</p></div>
            <div className="preset-editor-actions">
              {!isFree && <button className="btn ghost-button" onClick={runTests}><FlaskConical size={15} /> 测试当前风格</button>}
              {selected.is_builtin && !isFree && <button className="btn ghost-button" type="button" onClick={() => onReset(selected.id)}><RotateCcw size={15} /> 恢复此风格</button>}
              {!selected.is_builtin && <button className="btn ghost-button delete-preset" type="button" onClick={() => deleteDialog.current?.showModal()}><Trash2 size={15} /> 删除风格</button>}
            </div>
          </header>
          <p className="preset-description">{selected.description}</p>
          {isFree ? (
            <div className="free-preset"><strong>不加预设</strong><p>这里不放任何提示词。回到「此刻」，写下你想看的角色、场景与画面。</p><span>空白模板 · 无变量 · 16:9</span></div>
          ) : (
            <div className="preset-form">
              {!selected.is_builtin && <label className="preset-field"><span>风格名称</span><input className="input" value={selected.name} onChange={(event) => onUpdate(selected.id, "name", event.target.value)} /></label>}
              <label className="preset-field"><span>风格说明</span><input className="input" value={selected.description} onChange={(event) => onUpdate(selected.id, "description", event.target.value)} /></label>
              <TemplateEditor preset={selected} onChange={(template) => onTemplateUpdate(selected.id, template)} />
              <section className="variable-section" aria-labelledby="variables-title">
                <h3 id="variables-title">变量选项</h3>
                <p>变量用 group 声明分层（content / style / presentation）；选项的 provides、requires、any_of、excludes 会随文字一起保存到 JSON。分层与风格完全由 JSON 决定。</p>
                {providers.length > 0 && <p className="scope-note">提供者变量：{providers.map((name) => `{${name}}`).join("、")}。新增 provider 选项后，请在导出 JSON 中补 provides 或 unconstrained。</p>}
                {groupedVariables.map(({ group, items }) => (
                  <div className="variable-layer" key={group}>
                    <h4 className="variable-layer-title">{groupLabels[group]}<span>{items.length} 组变量</span></h4>
                    {items.map(([variable, config]) => renderVariableEditor(variable, config))}
                  </div>
                ))}
                <form className="variable-create" onSubmit={addVariable}>
                  <input className="input" aria-label="新变量名称" value={newVariable} onChange={(event) => setNewVariable(event.target.value)} placeholder="新变量名，例如 COLOR" />
                  <button className="btn ghost-button" type="submit"><Plus size={15} /> 添加变量</button>
                </form>
              </section>
              <div className="preset-field-grid">
                {selected.kind === "content" && <label className="preset-field"><span>画面比例</span><select className="select" value={selected.aspect_ratio} onChange={(event) => onUpdate(selected.id, "aspect_ratio", event.target.value)}><option>16:9</option><option>21:9</option><option>32:9</option><option>9:16</option></select></label>}
                <label className="random-control"><span>允许随机组合</span><input className="toggle" type="checkbox" checked={selected.randomize_variables} onChange={() => onToggleRandom(selected.id)} /></label>
              </div>
            </div>
          )}
          {testResults && (
            <section className="variable-section" aria-labelledby="test-results-title">
              <h3 id="test-results-title">本地测试结果</h3>
              {testResults.length === 0 && <p>尚未定义 tests。复制 AI 指令，让 AI 为每种特殊构图补测试。</p>}
              {testResults.map((result) => (
                <details key={result.name} className="scope-note">
                  <summary>{result.passed ? "通过" : "未通过"} · {result.name}</summary>
                  {!result.passed && <p>{result.failures.join("、")}</p>}
                  <p>{result.prompt}</p>
                </details>
              ))}
              <button className="btn ghost-button" onClick={() => { void copy("test-feedback", feedbackForAi()); }}><Copy size={14} />{copiedAction === "test-feedback" ? "已复制" : "复制测试结果与 JSON 给 AI"}</button>
            </section>
          )}
          <p className="preset-sync">{isFree ? "自由模式只使用你在「此刻」输入的内容。" : "改动会立即同步到「此刻」的同名风格标签。"}</p>
        </section>
      </div>
      <dialog className="modal preset-dialog" ref={deleteDialog}>
        <div className="modal-box">
          <h2>丢掉「{selected.name}」？</h2><p>这套自定义风格会被移除，其他预设不受影响。</p>
          <div className="dialog-actions"><button className="btn ghost-button" onClick={() => deleteDialog.current?.close()}>取消</button><button className="btn danger-button" onClick={() => { onDelete(selected.id); setSelectedId("free"); deleteDialog.current?.close(); }}>删除风格</button></div>
        </div>
        <form method="dialog" className="modal-backdrop"><button aria-label="取消删除" /></form>
      </dialog>
      <dialog className="modal preset-dialog json-dialog" ref={templateDialog}>
        <div className="modal-box">
          <h2>JSON 示例与 AI 生成指令</h2>
          <div className="json-guide">
            <p>内容包负责画什么与怎么摆，画风包负责怎么画；bundle 则同时携带两者。三者都使用单个 JSON 对象，不包含 <code>index.ts</code>。复制 AI 指令后，在「用户需求」位置说明要生成哪一种。</p>
            <ul>
              <li>内容包只含 content / presentation 变量，画风包只含 style 变量，两者的模板不能互相引用。</li>
              <li>若要加入内置库，分别保存到 <code>content/</code> 或 <code>styles/</code> 并在 <code>index.ts</code> 登记。</li>
              <li>provider 的每个选项必须明确写 <code>provides</code> 或 <code>unconstrained</code>；画风 provider 还需声明 <code>category</code>。</li>
              <li><code>tests</code> 会在本地检查变量与 Prompt，不会请求出图 API。</li>
              <li>仅接受 <code>schema_version: 3</code>，不兼容 v2。</li>
            </ul>
            <label className="preset-field"><span>示例类型</span><select className="select" value={exampleKind} onChange={(event) => setExampleKind(event.target.value as "content" | "style" | "bundle")}><option value="content">内容包</option><option value="style">画风包</option><option value="bundle">组合包</option></select></label>
          </div>
          <pre className="json-template">{exampleText}</pre>
          {copyError && <p className="copy-error" role="alert">无法访问剪贴板，请直接选取上方内容。</p>}
          <div className="dialog-actions">
            <button className="btn ghost-button" onClick={() => templateDialog.current?.close()}>关闭</button>
            <button className="btn ghost-button" onClick={() => { void copy("json", exampleText); }}><Copy size={16} />{copiedAction === "json" ? "已复制示例" : "复制示例 JSON"}</button>
            <button className="btn primary-button" onClick={() => { void copy("ai", presetAiInstructions); }}><Copy size={16} />{copiedAction === "ai" ? "已复制 AI 指令" : "复制 AI 指令＋示例"}</button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop"><button aria-label="关闭 JSON 模板" /></form>
      </dialog>
    </main>
  );
}
