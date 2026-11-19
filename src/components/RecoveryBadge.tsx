import { useEffect, useState } from "react";
import { DownloadCloud } from "lucide-react";

interface RecoveryBadgeProps {
  startedAt: number;
  /** 尚未取回的待取回请求总数（含正在取回的这条）。 */
  remaining: number;
}

/** 取回 RunComfy 结果时的全局浮标：任何页面可见，带计时与剩余计数。 */
export function RecoveryBadge({ startedAt, remaining }: RecoveryBadgeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="recovery-badge" role="status" aria-live="polite">
      <DownloadCloud size={15} aria-hidden="true" />
      <span>取回中 <b>{mm}:{ss}</b></span>
      <span className="recovery-badge-count">还有 {remaining} 条待取回</span>
    </div>
  );
}
