import { Scissors } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getCutoutJobSnapshot, subscribeCutoutJobs } from "../utils/cutout-jobs";

/** Corner badge for the wallpaper currently being cut out in the background. */
export function CutoutBadge() {
  const jobs = useSyncExternalStore(subscribeCutoutJobs, getCutoutJobSnapshot);
  const progress = jobs.progress;
  if (!progress) return null;
  return (
    <div className="cutout-badge" role="status" aria-live="polite">
      <Scissors size={14} aria-hidden="true" />
      <span className="cutout-badge-text">{progress.title} · {progress.label}</span>
      <span className="cutout-badge-pct">{progress.percent}%</span>
      <span className="cutout-badge-bar" aria-hidden="true"><i style={{ width: `${progress.percent}%` }} /></span>
    </div>
  );
}
