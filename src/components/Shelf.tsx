import { useSyncExternalStore } from "react";
import type { Wallpaper } from "../types";
import { getCutoutJobSnapshot, subscribeCutoutJobs } from "../utils/cutout-jobs";
import { useThumbnailUrl } from "../hooks/useThumbnailUrl";

interface ShelfProps {
  items: Wallpaper[];
  activeId: string;
  appliedId: string;
  busy: boolean;
  onSelect: (id: string) => void;
}

/** 列表縮略圖：480px webp，生成期間回退 4K 原圖（僅首次會話），避免列表解碼風暴。 */
function ShelfThumb({ image }: { image: string }) {
  const thumb = useThumbnailUrl(image);
  return <img src={thumb ?? image} alt="" width="1600" height="900" draggable="false" loading="lazy" decoding="async" />;
}

export function Shelf({ items, activeId, appliedId, busy, onSelect }: ShelfProps) {
  const jobs = useSyncExternalStore(subscribeCutoutJobs, getCutoutJobSnapshot);
  const runningId = jobs.progress?.wallpaperId;
  return (
    <section className="shelf chrome" aria-labelledby="recent-label">
      <h2 id="recent-label" className="shelf-label">RECENT</h2>
      <div
        className="shelf-track"
        onWheel={(event) => {
          if (event.deltaY !== 0) event.currentTarget.scrollLeft += event.deltaY;
        }}
      >
        {busy && <div className="thumbnail-loading" role="status" aria-label="新作品准备中"><span /></div>}
        {items.map((wallpaper) => (
          <button
            key={wallpaper.id}
            className="thumbnail"
            aria-pressed={activeId === wallpaper.id}
            aria-label={`查看 ${wallpaper.title} ${wallpaper.english}`}
            onClick={() => onSelect(wallpaper.id)}
          >
            <ShelfThumb image={wallpaper.image} />
            <span className="thumbnail-name">{wallpaper.title}</span>
            {appliedId === wallpaper.id && <span className="on-badge">ON</span>}
            {runningId === wallpaper.id && jobs.progress && jobs.progress.label !== "下载模型" && jobs.progress.label !== "加载模型" && jobs.progress.label !== "准备抠像" && <span className="cutout-mini">{jobs.progress.percent}%</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
