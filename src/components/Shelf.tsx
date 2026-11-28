import { useSyncExternalStore } from "react";
import type { Wallpaper } from "../types";
import { getCutoutJobSnapshot, subscribeCutoutJobs } from "../utils/cutout-job-store";
import { useThumbnailUrl, type ImageLoadError } from "../hooks/useThumbnailUrl";

interface ShelfProps {
  items: Wallpaper[];
  activeId: string;
  appliedId: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onImageError: ImageLoadError;
}

/** 列表縮略圖：480px webp，生成期間回退 4K 原圖（僅首次會話），避免列表解碼風暴。 */
function ShelfThumb({ wallpaper, onImageError }: { wallpaper: Wallpaper; onImageError: ImageLoadError }) {
  const { id, image } = wallpaper;
  const thumb = useThumbnailUrl(image, id, onImageError);
  return <img src={thumb ?? image} alt="" width="1600" height="900" draggable="false" loading="lazy" decoding="async" onError={() => onImageError(id, image)} />;
}

export function Shelf({ items, activeId, appliedId, busy, onSelect, onImageError }: ShelfProps) {
  const jobs = useSyncExternalStore(subscribeCutoutJobs, getCutoutJobSnapshot);
  const runningId = jobs.progress?.wallpaperId;
  const nextIssue = Math.max(0, ...items.map((item) => Number(item.issue)).filter(Number.isFinite)) + 1;
  const issueLabel = String(nextIssue).padStart(2, "0");
  return (
    <section className="shelf chrome" aria-labelledby="recent-label">
      <h2 id="recent-label" className="shelf-label">RECENT</h2>
      <div
        className="shelf-track"
        onWheel={(event) => {
          if (event.deltaY !== 0) event.currentTarget.scrollLeft += event.deltaY;
        }}
      >
        {busy && (
          <div className="thumbnail-loading" role="status" aria-label={`第 ${nextIssue} 期新作品绘制中`}>
            <span className="loading-speed" aria-hidden="true" />
            <span className="loading-issue" aria-hidden="true">{issueLabel}</span>
            <span className="loading-copy"><b>新一期</b><small>绘制中</small></span>
            <span className="loading-slash" aria-hidden="true" />
            <span className="loading-fuse" aria-hidden="true" />
          </div>
        )}
        {items.slice(0, 10).map((wallpaper) => (
          <button
            key={wallpaper.id}
            className="thumbnail"
            aria-pressed={activeId === wallpaper.id}
            aria-label={`查看 ${wallpaper.title} ${wallpaper.english}`}
            onClick={() => onSelect(wallpaper.id)}
          >
            <ShelfThumb wallpaper={wallpaper} onImageError={onImageError} />
            <span className="thumbnail-name">{wallpaper.title}</span>
            {appliedId === wallpaper.id && <span className="on-badge">ON</span>}
            {runningId === wallpaper.id && jobs.progress && jobs.progress.label !== "下载模型" && jobs.progress.label !== "加载模型" && jobs.progress.label !== "准备抠像" && <span className="cutout-mini">{jobs.progress.percent}%</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
