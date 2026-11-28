import { Scissors } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getCutoutJobSnapshot, subscribeCutoutJobs } from "../utils/cutout-job-store";

/** Corner badge for a model download, or for the wallpaper currently being cut out. */
export function CutoutBadge({ modelDownload }: { modelDownload: { name: string; percent: number } | null }) {
  const jobs = useSyncExternalStore(subscribeCutoutJobs, getCutoutJobSnapshot);
  const progress = jobs.progress;
  const jobIsModelLoad = progress != null && (progress.label === "下载模型" || progress.label === "加载模型" || progress.label === "准备抠像");
  const showModel = modelDownload != null && (progress == null || jobIsModelLoad);
  const showJob = progress != null && !showModel;
  if (!showModel && !showJob) return null;
  const title = showModel && modelDownload ? `${modelDownload.name} · 下载模型` : `${progress?.title ?? ""} · ${progress?.label ?? ""}`;
  const percent = showModel && modelDownload ? modelDownload.percent : progress?.percent ?? 0;
  return (
    <div className="cutout-badge" role="status" aria-live="polite">
      <Scissors size={14} aria-hidden="true" />
      <span className="cutout-badge-text">{title}</span>
      <span className="cutout-badge-pct">{percent}%</span>
      <span className="cutout-badge-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
    </div>
  );
}
