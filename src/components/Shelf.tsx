import { useSyncExternalStore } from "react";
import type { Wallpaper } from "../types";
import { getCutoutJobSnapshot, subscribeCutoutJobs } from "../utils/cutout-jobs";

interface ShelfProps {
  items: Wallpaper[];
  activeId: string;
  appliedId: string;
  busy: boolean;
  onSelect: (id: string) => void;
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
            <img src={wallpaper.image} alt="" width="1600" height="900" draggable="false" />
            <span className="thumbnail-name">{wallpaper.title}</span>
            {appliedId === wallpaper.id && <span className="on-badge">ON</span>}
            {runningId === wallpaper.id && jobs.progress && <span className="cutout-mini">{jobs.progress.percent}%</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
