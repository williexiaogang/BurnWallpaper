import { useEffect, useRef, useState, type ReactNode } from "react";
import { Shuffle, Wand2 } from "lucide-react";
import type { PendingPrompt, PromptSubmitSettings, ResolvedPromptVariable } from "../types";
import { modelOptions } from "../data";
import { backend, isTauri } from "../backend";

interface PromptDialogProps {
  pending: PendingPrompt;
  onCancel: () => void;
  /** 返回的 Promise resolve 表示服务器已受理（对话框随后关闭）；reject 表示提交失败（对话框保留错误并恢复可操作）。 */
  onConfirm: (prompt: string, settings: PromptSubmitSettings) => Promise<void>;
  onReroll?: () => void;
}

/**
 * 把變量實際填入的值在提示詞正文裡標出來：手動選擇實線、隨機虛線，懸停顯示變量名。
 * 長值優先匹配，避免短值先命中把長值切斷；已在標記內的片段不重複標記。
 */
function highlightVariables(text: string, variables: ResolvedPromptVariable[]): ReactNode[] {
  interface Piece {
    text: string;
    info?: ResolvedPromptVariable;
  }
  let pieces: Piece[] = [{ text }];
  const ordered = variables.filter((item) => item.value).sort((a, b) => b.value.length - a.value.length);
  for (const info of ordered) {
    const index = pieces.findIndex((piece) => !piece.info && piece.text.includes(info.value));
    if (index < 0) continue;
    const piece = pieces[index];
    const at = piece.text.indexOf(info.value);
    const next: Piece[] = [...pieces.slice(0, index)];
    if (at > 0) next.push({ text: piece.text.slice(0, at) });
    next.push({ text: info.value, info });
    if (at + info.value.length < piece.text.length) next.push({ text: piece.text.slice(at + info.value.length) });
    next.push(...pieces.slice(index + 1));
    pieces = next;
  }
  return pieces.map((piece, index) => piece.info
    ? (
      <mark
        key={index}
        className={`prompt-var is-${piece.info.source}`}
        title={`[${piece.info.variable}] ${piece.info.source === "manual" ? "手动选择" : "随机抽取"}`}
      >
        {piece.text}
      </mark>
    )
    : <span key={index}>{piece.text}</span>);
}

export function PromptDialog({ pending, onCancel, onConfirm, onReroll }: PromptDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [enhanceOn, setEnhanceOn] = useState(false);
  const [enhanced, setEnhanced] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 出圖設置草稿：確認後才寫回全局，取消不打擾原有選擇
  const [draftModelId, setDraftModelId] = useState(pending.modelId);
  const [draftRatio, setDraftRatio] = useState(pending.aspectRatio);
  const [draftResolution, setDraftResolution] = useState(pending.resolution);
  const selectedModel = modelOptions.find((option) => option.id === draftModelId) ?? modelOptions[0];

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  // 換個手氣改了原文後，若開著增強就重新改寫
  useEffect(() => {
    setEnhanced(null);
    if (!enhanceOn || !isTauri) return;
    let alive = true;
    setEnhancing(true);
    backend.enhancePrompt(pending.prompt)
      .then((result) => { if (alive) setEnhanced(result); })
      .catch(() => { if (alive) setEnhanceOn(false); })
      .finally(() => { if (alive) setEnhancing(false); });
    return () => { alive = false; };
  }, [pending.prompt, enhanceOn]);

  const changeDraftModel = (modelId: string) => {
    const option = modelOptions.find((item) => item.id === modelId) ?? modelOptions[0];
    setDraftModelId(option.id);
    setDraftResolution(option.defaultResolution);
    setDraftRatio((current) => option.ratios.includes(current) ? current : "16:9");
  };

  const shownPrompt = enhanceOn && enhanced ? enhanced : pending.prompt;
  const finalPrompt = enhanceOn && enhanced ? enhanced : pending.prompt;
  // 提示詞增強後是整段改寫，變量高亮不再適用
  const useHighlight = !(enhanceOn && enhanced) && pending.resolvedVariables.length > 0;

  const confirm = async () => {
    if (submitting || enhancing) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onConfirm(finalPrompt, {
        modelId: selectedModel.id,
        modelName: selectedModel.name,
        aspectRatio: draftRatio,
        resolution: draftResolution,
      });
      // 成功後 App 會清掉 pendingPrompt 卸載對話框；這裡補一次 close 兜底
      dialog.current?.close();
    } catch (error) {
      setSubmitting(false);
      setSubmitError((error as { message?: string })?.message ?? String(error));
    }
  };

  const requestCancel = () => {
    if (submitting) return;
    onCancel();
  };

  return (
    <dialog
      className="modal preset-dialog prompt-dialog"
      ref={dialog}
      onCancel={(event) => {
        // 送出中禁止 ESC / 系統關閉
        if (submitting) event.preventDefault();
        else onCancel();
      }}
      aria-labelledby="prompt-dialog-title"
    >
      <div className={`modal-box${submitting ? " is-submitting" : ""}`}>
        <h2 id="prompt-dialog-title">这次就这样？</h2>
        <p className="prompt-intro">确认本次实际送出的内容。随机变量已经展开，出图参数可在这里临时调整。</p>
        <dl className="prompt-facts">
          <div><dt>风格</dt><dd>{pending.styleName}</dd></div>
          <div>
            <dt>模型</dt>
            <dd>
              <select className="select" aria-label="模型" value={selectedModel.id} disabled={submitting} onChange={(event) => changeDraftModel(event.target.value)}>
                {modelOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
              </select>
            </dd>
          </div>
          <div>
            <dt>比例</dt>
            <dd>
              <select className="select" aria-label="画面比例" value={draftRatio} disabled={submitting} onChange={(event) => setDraftRatio(event.target.value)}>
                {selectedModel.ratios.map((ratio) => <option value={ratio} key={ratio}>{ratio}</option>)}
              </select>
            </dd>
          </div>
          <div>
            <dt>分辨率</dt>
            <dd>
              <select className="select" aria-label="输出分辨率" value={draftResolution} disabled={submitting} onChange={(event) => setDraftResolution(event.target.value)}>
                {selectedModel.resolutions.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </dd>
          </div>
        </dl>
        <pre className="json-template prompt-preview">
          {useHighlight ? highlightVariables(pending.prompt, pending.resolvedVariables) : shownPrompt}
        </pre>
        {useHighlight && pending.omittedVariables.length > 0 && (
          <p className="prompt-omitted" title="这些变量在当前构图下不可见或未抽中，生成时整体省略">
            此构图下自动省略：{pending.omittedVariables.join(" · ")}
          </p>
        )}
        {useHighlight && <p className="prompt-legend">高亮 = 变量填充内容（实线：手动选择 · 虚线：随机抽取，悬停可看变量名）</p>}
        {enhancing && <p className="prompt-enhance-status" role="status">RunComfy 改写中…</p>}
        {submitting && <p className="prompt-submit-status" role="status"><i className="btn-spinner" aria-hidden="true" />正在送出，等待服务器受理…</p>}
        {submitError && <p className="prompt-submit-error" role="alert">没发出去：{submitError}</p>}
        <div className="dialog-actions">
          {onReroll && (
            <button className="btn ghost-button" onClick={onReroll} disabled={submitting} title="重新展开随机变量">
              <Shuffle size={16} /> 换个手气
            </button>
          )}
          <label className="prompt-enhance-toggle">
            <input
              type="checkbox"
              checked={enhanceOn}
              disabled={enhancing || submitting || !isTauri}
              onChange={(event) => setEnhanceOn(event.target.checked)}
            />
            <Wand2 size={15} aria-hidden="true" />
            提示词增强
          </label>
          <button className="btn ghost-button" onClick={requestCancel} disabled={submitting}>改一下</button>
          <button className="btn primary-button" disabled={enhancing || submitting} onClick={() => { void confirm(); }}>
            {submitting
              ? <><i className="btn-spinner is-inline" aria-hidden="true" />送出中…</>
              : enhancing ? "增强中…" : "确认，来一张"}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop"><button aria-label="关闭 Prompt 确认" onClick={requestCancel} disabled={submitting} /></form>
    </dialog>
  );
}
