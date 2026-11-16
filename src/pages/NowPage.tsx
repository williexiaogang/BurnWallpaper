import { Bookmark, Expand, MonitorUp, Scissors } from "lucide-react";
import type { StylePreset, Wallpaper } from "../types";
import type { MonitorInfo } from "../backend";
import { TitleBlock } from "../components/TitleBlock";
import { AskBar } from "../components/AskBar";
import { Shelf } from "../components/Shelf";
import { MonitorPicker } from "../components/MonitorPicker";
import { useCutout } from "../hooks/useCutout";
import type { CutoutModel } from "../utils/cutout-models";
import { cutoutModelInfo } from "../utils/cutout-models";

interface NowPageProps {
  wallpaper: Wallpaper;
  items: Wallpaper[];
  presets: StylePreset[];
  appliedId: string;
  busy: boolean;
  favorite: boolean;
  cutoutEnabled: boolean;
  cutoutModel: CutoutModel;
  monitors: MonitorInfo[];
  selectedMonitor: string | null;
  onMonitorChange: (devicePath: string | null) => void;
  onToggleCutout: (enabled: boolean) => void;
  onSelect: (id: string) => void;
  onAsk: (description: string, styleId: string | null, selections: Record<string, string>) => void;
  onPreview: () => void;
  onApply: () => void;
  onFavorite: () => void;
}

const CUTOUT_BUTTON: Record<string, { label: string; title: string }> = {
  disabled: { label: "抠像：关", title: "人物抠像已关闭，点击开启" },
  pending: { label: "抠像中…", title: "正在计算人物抠像" },
  failed: { label: "抠像失败 · 重试", title: "点击查看原因" },
  ready: { label: "抠像 ✓ · 重算", title: "抠像已生效，点击重新计算" },
};

export function NowPage({ wallpaper, items, presets, appliedId, busy, favorite, cutoutEnabled, cutoutModel, monitors, selectedMonitor, onMonitorChange, onToggleCutout, onSelect, onAsk, onPreview, onApply, onFavorite }: NowPageProps) {
  const cutout = useCutout(wallpaper, cutoutEnabled, cutoutModel);
  const cutoutButton = CUTOUT_BUTTON[cutout.state];
  const cutoutLabel = cutout.state === "ready" && cutout.modelUsed && cutout.modelUsed !== cutoutModel
    ? "抠像 ✓ · 用当前模型重算"
    : cutoutButton.label;
  const cutoutTitle = cutout.state === "failed"
    ? `${cutout.error ?? "未知原因"} · 点击重试（可复制 LOG 反馈）`
    : cutout.state === "ready"
      ? `由 ${cutout.modelUsed ? cutoutModelInfo(cutout.modelUsed).name : "未知模型"} 生成 · 点击用当前模型重算`
      : cutoutButton.title;
  const handleCutoutClick = () => {
    if (cutout.state === "disabled") onToggleCutout(true);
    else if (cutout.state === "failed" || cutout.state === "ready") cutout.recompute();
  };
  return (
    <main id="main-content" className="now-page page-enter">
      <img className="wallpaper" src={wallpaper.image} alt={`${wallpaper.title}：${wallpaper.tags.join("、")}动漫壁纸`} width="1600" height="900" fetchPriority="high" draggable="false" />
      <div className="wallpaper-shade" aria-hidden="true" />
      <div className="title-layer">
        <TitleBlock wallpaper={wallpaper} />
      </div>
      {cutout.url && <img className="wallpaper-cutout" src={cutout.url} alt="" width="1600" height="900" draggable="false" aria-hidden="true" />}
      <AskBar busy={busy} presets={presets} onSubmit={onAsk} />
      <div className="now-actions chrome">
        <MonitorPicker monitors={monitors} selected={selectedMonitor} onSelect={onMonitorChange} />
        <div className="action-row">
          <button className={`btn ghost-button cutout-button is-${cutout.state}`} onClick={handleCutoutClick} disabled={cutout.state === "pending"} title={cutoutTitle} aria-live="polite">
            <Scissors size={15} aria-hidden="true" /> {cutoutLabel}
          </button>
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
