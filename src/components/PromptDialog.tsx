import { useEffect, useRef, useState } from "react";
import { Shuffle, Wand2 } from "lucide-react";
import type { PendingPrompt } from "../types";
import { backend, isTauri } from "../backend";

interface PromptDialogProps {
  pending: PendingPrompt;
  onCancel: () => void;
  onConfirm: (prompt: string) => void;
  onReroll?: () => void;
}

export function PromptDialog({ pending, onCancel, onConfirm, onReroll }: PromptDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [enhanceOn, setEnhanceOn] = useState(false);
  const [enhanced, setEnhanced] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);

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

  const shownPrompt = enhanceOn && enhanced ? enhanced : pending.prompt;
  const finalPrompt = enhanceOn && enhanced ? enhanced : pending.prompt;

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
        <pre className="json-template prompt-preview">{shownPrompt}</pre>
        {enhancing && <p className="prompt-enhance-status" role="status">RunComfy 改写中…</p>}
        <div className="dialog-actions">
          {onReroll && (
            <button className="btn ghost-button" onClick={onReroll} title="重新展开随机变量">
              <Shuffle size={16} /> 换个手气
            </button>
          )}
          <label className="prompt-enhance-toggle">
            <input
              type="checkbox"
              checked={enhanceOn}
              disabled={enhancing || !isTauri}
              onChange={(event) => setEnhanceOn(event.target.checked)}
            />
            <Wand2 size={15} aria-hidden="true" />
            提示词增强
          </label>
          <button className="btn ghost-button" onClick={onCancel}>改一下</button>
          <button className="btn primary-button" disabled={enhancing} onClick={() => onConfirm(finalPrompt)}>
            {enhancing ? "增强中…" : "确认，来一张"}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop"><button aria-label="关闭 Prompt 确认" onClick={onCancel} /></form>
    </dialog>
  );
}
