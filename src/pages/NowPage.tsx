import { Bookmark, Expand, MonitorUp } from "lucide-react";
import type { StylePreset, Wallpaper } from "../types";
import type { MonitorInfo } from "../backend";
import { TitleBlock } from "../components/TitleBlock";
import { AskBar } from "../components/AskBar";
import { Shelf } from "../components/Shelf";
import { MonitorPicker } from "../components/MonitorPicker";

interface NowPageProps {
  wallpaper: Wallpaper;
  items: Wallpaper[];
  presets: StylePreset[];
  appliedId: string;
  busy: boolean;
  favorite: boolean;
  monitors: MonitorInfo[];
  selectedMonitor: string | null;
  onMonitorChange: (devicePath: string | null) => void;
  onSelect: (id: string) => void;
  onAsk: (description: string, styleId: string | null, selections: Record<string, string>) => void;
  onPreview: () => void;
  onApply: () => void;
  onFavorite: () => void;
}

export function NowPage({ wallpaper, items, presets, appliedId, busy, favorite, monitors, selectedMonitor, onMonitorChange, onSelect, onAsk, onPreview, onApply, onFavorite }: NowPageProps) {
  return (
    <main id="main-content" className="now-page page-enter">
      <img className="wallpaper" src={wallpaper.image} alt={`${wallpaper.title}：${wallpaper.tags.join("、")}动漫壁纸`} width="1600" height="900" fetchPriority="high" draggable="false" />
      <div className="wallpaper-shade" aria-hidden="true" />
      <TitleBlock wallpaper={wallpaper} />
      <AskBar busy={busy} presets={presets} onSubmit={onAsk} />
      <div className="now-actions chrome">
        <MonitorPicker monitors={monitors} selected={selectedMonitor} onSelect={onMonitorChange} />
        <div className="action-row">
          <button className={`btn secondary-button icon-text-button ${favorite ? "is-favorite" : ""}`} onClick={onFavorite} aria-pressed={favorite}>
            <Bookmark size={16} fill={favorite ? "currentColor" : "none"} /> {favorite ? "已收" : "收藏"}
          </button>
          <button className="btn secondary-button" onClick={onPreview}><Expand size={16} /> 桌面预览</button>
          <button className="btn primary-button" onClick={onApply}><MonitorUp size={17} /> 上墙</button>
        </div>
      </div>
      <Shelf items={items} activeId={wallpaper.id} appliedId={appliedId} busy={busy} onSelect={onSelect} />
    </main>
  );
}
