import { useEffect, useRef } from "react";
import { Shuffle } from "lucide-react";
import type { PendingPrompt } from "../types";

interface PromptDialogProps {
  pending: PendingPrompt;
  onCancel: () => void;
  onConfirm: () => void;
  onReroll?: () => void;
}

export function PromptDialog({ pending, onCancel, onConfirm, onReroll }: PromptDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  return (
    <dialog className="modal preset-dialog prompt-dialog" ref={dialog} onCancel={onCancel} aria-labelledby="prompt-dialog-title">
      <div className="modal-box">
        <h2 id="prompt-dialog-title">这次就这样？</h2>
        <p className="prompt-intro">确认本次实际送出的内容。随机变量已经展开。</p>
        <dl className="prompt-facts">
          <div><dt>模型</dt><dd>{pending.modelName}</dd></div>
          <div><dt>风格</dt><dd>{pending.styleName}</dd></div>
          <div><dt>比例</dt><dd>{pending.aspectRatio}</dd></div>
          <div><dt>分辨率</dt><dd>{pending.resolution}</dd></div>
        </dl>
        <pre className="json-template prompt-preview">{pending.prompt}</pre>
        <div className="dialog-actions">
          {onReroll && (
            <button className="btn ghost-button" onClick={onReroll} title="重新展开随机变量">
              <Shuffle size={16} /> 换个手气
            </button>
          )}
          <button className="btn ghost-button" onClick={onCancel}>改一下</button>
          <button className="btn primary-button" onClick={onConfirm}>确认，来一张</button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop"><button aria-label="关闭 Prompt 确认" onClick={onCancel} /></form>
    </dialog>
  );
}
