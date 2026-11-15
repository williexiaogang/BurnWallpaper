import { useEffect, useState } from "react";
import type { GenerationProgress } from "../types";
import { backend, isTauri } from "../backend";
import { logWarn } from "../utils/logger";

const STATE_LABELS: Record<string, string> = {
  in_queue: "排队中",
  in_progress: "生成中",
  completed: "收尾中",
};

export function GenerationOverlay({ progress, onCancel }: { progress: GenerationProgress; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - progress.startedAt) / 1000));

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - progress.startedAt) / 1000)), 500);
    return () => clearInterval(timer);
  }, [progress.startedAt]);

  const cancel = () => {
    if (isTauri && progress.requestId !== "proto") {
      backend.cancelGeneration(progress.requestId).catch((error) => logWarn("generation", "取消请求失败", String(error)));
    }
    onCancel();
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="generation-overlay" role="status" aria-live="polite">
      <div className="generation-panel">
        <span className="generation-speed" aria-hidden="true" />
        <div className="generation-info">
          <strong>出图中 · {progress.label}</strong>
          <span>{STATE_LABELS[progress.state] ?? "生成中"} · {mm}:{ss}</span>
        </div>
        <button className="btn ghost-button" onClick={cancel}>取消</button>
      </div>
    </div>
  );
}
