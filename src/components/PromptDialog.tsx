import { useEffect, useRef, useState } from "react";
import type { PendingPrompt, PromptSubmitSettings } from "../types";

interface PromptDialogProps {
  pending: PendingPrompt;
  onCancel: () => void;
  /** 返回的 Promise resolve 表示服务器已受理（对话框随后关闭）；reject 表示提交失败（对话框保留错误并恢复可操作）。 */
  onConfirm: (prompt: string, settings: PromptSubmitSettings) => Promise<void>;
}

export function PromptDialog({ pending, onCancel, onConfirm }: PromptDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onConfirm(pending.prompt, {
        modelId: pending.modelId,
        modelName: pending.modelName,
        aspectRatio: pending.aspectRatio,
        resolution: pending.resolution,
      });
      dialog.current?.close();
    } catch (error) {
      setSubmitting(false);
      setSubmitError((error as { message?: string })?.message ?? String(error));
    }
  };

  const requestCancel = () => {
    if (!submitting) onCancel();
  };

  return (
    <dialog
      className="modal preset-dialog prompt-dialog"
      ref={dialog}
      onCancel={(event) => {
        if (submitting) event.preventDefault();
        else onCancel();
      }}
      aria-labelledby="prompt-dialog-title"
    >
      <div className={`modal-box${submitting ? " is-submitting" : ""}`}>
        <span className="prompt-confirm-kicker">{pending.styleName}</span>
        <h2 id="prompt-dialog-title">就来这一张？</h2>
        <p className="prompt-intro">按刚才的预览与出图设置提交。</p>
        {submitting && <p className="prompt-submit-status" role="status"><i className="btn-spinner" aria-hidden="true" />正在送出，等待服务器受理…</p>}
        {submitError && <p className="prompt-submit-error" role="alert">没发出去：{submitError}</p>}
        <div className="dialog-actions prompt-confirm-actions">
          <button className="btn ghost-button" onClick={requestCancel} disabled={submitting}>NO</button>
          <button className="btn primary-button" disabled={submitting} onClick={() => { void confirm(); }}>
            {submitting ? <><i className="btn-spinner is-inline" aria-hidden="true" />送出中…</> : "YES"}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop"><button aria-label="取消送出" onClick={requestCancel} disabled={submitting} /></form>
    </dialog>
  );
}
