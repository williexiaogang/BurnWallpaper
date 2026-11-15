import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import type { GenerationProgress } from "../types";

const STATE_LABELS: Record<string, string> = {
  in_queue: "排队中",
  in_progress: "生成中",
  completed: "收尾中",
};

export function GenerationOverlay({ progress, onHide }: { progress: GenerationProgress; onHide: () => void }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - progress.startedAt) / 1000));

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - progress.startedAt) / 1000)), 500);
    return () => clearInterval(timer);
  }, [progress.startedAt]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const queued = progress.state === "in_queue";
  const estimateSec = progress.requestId === "proto" ? 2 : 110;
  const percent = queued ? null : Math.min(95, Math.floor((elapsed / estimateSec) * 100));

  return (
    <div className="generation-overlay" role="status" aria-live="polite">
      <div className={`generation-panel ${queued ? "is-queue" : "is-working"}`}>
        <span className="generation-speed" aria-hidden="true" />
        <div className="generation-body">
          <div className="generation-heading">
            <strong>出图中</strong>
            <span className="generation-style">{progress.label}</span>
          </div>
          <div className="generation-meter" aria-hidden="true"><i style={percent === null ? undefined : { width: `${percent}%` }} /></div>
          <div className="generation-status">
            <span className="generation-state">{STATE_LABELS[progress.state] ?? "生成中"}{percent === null ? "" : ` · 约 ${percent}%`}</span>
            <span className="generation-elapsed">{mm}:{ss}</span>
          </div>
        </div>
        <button className="btn ghost-button generation-cancel" onClick={onHide} title="收起面板，出图继续在后台进行">
          <EyeOff size={15} /> 隐藏
        </button>
      </div>
    </div>
  );
}
