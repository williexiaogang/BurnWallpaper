import { useEffect, useState } from "react";
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
import { copyLogs } from "../utils/logger";

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
  defaultStyleId?: string;
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

/**
 * 摳像人物層。4K PNG 解碼需要時間，若在掛載時就播動畫會「解碼完直接砸出來」；
 * 改為 onLoad 後才淡入，摳像結果永遠以過渡方式出現。
 */
function CutoutLayer({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      key={url}
      className={`wallpaper-cutout${loaded ? " is-loaded" : ""}`}
      src={url}
      alt=""
      width="1600"
      height="900"
      draggable="false"
      aria-hidden="true"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
    />
  );
}

interface StageFrame {
  image: string;
  cutout: string | null;
}

/**
 * 壁紙舞台：切換時舊圖（連同舊摳像）墊底保持可見，新 4K 圖解碼完成後才淡入，
 * 消除切換瞬間的「解碼空白 + 大圖砸出來」。層級由 z-index 決定（0/1/2/3），與 DOM 順序無關。
 */
function WallpaperStage({ frame, alt }: { frame: StageFrame; alt: string }) {
  const [stage, setStage] = useState<{ current: StageFrame; previous: StageFrame | null }>({ current: frame, previous: null });
  const [ready, setReady] = useState(false);

  if (frame.image !== stage.current.image) {
    // 渲染期派生：壁紙變更 → 舊幀墊底、新幀從 0 淡入
    setStage({ current: frame, previous: stage.current });
    setReady(false);
  } else if (frame.cutout !== stage.current.cutout) {
    // 同一張壁紙的摳像結果更新（算完 / 重算），不觸發換場
    setStage((state) => ({ ...state, current: frame }));
  }

  useEffect(() => {
    if (!ready || !stage.previous) return;
    const keep = stage.current.image;
    const timer = setTimeout(() => {
      setStage((state) => (state.current.image === keep ? { ...state, previous: null } : state));
    }, 320);
    return () => clearTimeout(timer);
  }, [ready, stage.previous, stage.current.image]);

  const swapping = Boolean(stage.previous);
  return (
    <>
      {stage.previous && (
        <>
          <img className="wallpaper" src={stage.previous.image} alt="" aria-hidden="true" draggable="false" decoding="async" />
          {stage.previous.cutout && (
            <img className="wallpaper-cutout" src={stage.previous.cutout} alt="" width="1600" height="900" aria-hidden="true" draggable="false" decoding="async" />
          )}
        </>
      )}
      <img
        key={stage.current.image}
        className={`wallpaper${swapping ? ` is-swap${ready ? " is-loaded" : ""}` : ""}`}
        src={stage.current.image}
        alt={alt}
        width="1600"
        height="900"
        fetchPriority="high"
        decoding="async"
        draggable="false"
        onLoad={() => setReady(true)}
        onError={() => setReady(true)}
      />
      {stage.current.cutout && <CutoutLayer url={stage.current.cutout} />}
    </>
  );
}

export function NowPage({ wallpaper, items, presets, appliedId, busy, favorite, cutoutEnabled, cutoutModel, monitors, selectedMonitor, onMonitorChange, onToggleCutout, onSelect, onAsk, onPreview, onApply, onFavorite, defaultStyleId }: NowPageProps) {
  const cutout = useCutout(wallpaper, cutoutEnabled, cutoutModel);
  const cutoutButton = CUTOUT_BUTTON[cutout.state];
  const selectedModelName = cutoutModelInfo(cutoutModel).name;
  const [showError, setShowError] = useState(false);
  const [copied, setCopied] = useState<"reason" | "log" | null>(null);
  // 換壁紙或離開失敗態時收起失敗面板，避免殘留上一張的錯誤
  useEffect(() => {
    setShowError(false);
    setCopied(null);
  }, [wallpaper.id, cutout.state]);
  const cutoutLabel = cutout.state === "pending"
    ? cutout.progress ? `抠像 ${cutout.progress.percent}% · ${cutout.progress.label}` : "排队抠像"
    : cutout.state === "ready" && cutout.modelUsed && cutout.modelUsed !== cutoutModel
      ? `抠像 ✓ · 用 ${selectedModelName} 重算`
      : cutout.state === "failed"
        ? "抠像失败 · 查看原因"
        : cutoutButton.label;
  const cutoutTitle = cutout.state === "failed"
    ? `${cutout.error ?? "未知原因"} · 点击查看可复制的失败原因`
    : cutout.state === "pending" && cutout.progress
      ? `${cutout.progress.label} ${cutout.progress.percent}%，完成后记在本地`
      : cutout.state === "pending"
        ? "排队中：当前有其它抠像任务正在推理，完成后自动开始"
        : cutout.state === "ready"
          ? `由 ${cutout.modelUsed ? cutoutModelInfo(cutout.modelUsed).name : "未知模型"} 生成，已保存在本地 · 点击用 ${selectedModelName} 模型重算`
          : cutoutButton.title;
  const handleCutoutClick = () => {
    if (cutout.state === "disabled") onToggleCutout(true);
    else if (cutout.state === "failed") setShowError((open) => !open);
    else if (cutout.state === "ready") cutout.recompute();
  };
  const copyReason = async () => {
    if (!cutout.error) return;
    try {
      await navigator.clipboard.writeText(`抠像失败 · ${selectedModelName}\n${cutout.error}\n壁纸：${wallpaper.title}（${wallpaper.id}）`);
      setCopied("reason");
    } catch {
      setCopied(null);
    }
  };
  const copyFullLog = async () => {
    if (await copyLogs()) setCopied("log");
  };
  return (
    <main id="main-content" className="now-page page-enter">
      <WallpaperStage
        frame={{ image: wallpaper.image, cutout: cutout.url }}
        alt={`${wallpaper.title}：${wallpaper.tags.join("、")}动漫壁纸`}
      />
      <div className="wallpaper-shade" aria-hidden="true" />
      <div className="title-layer">
        <TitleBlock wallpaper={wallpaper} />
      </div>
      <AskBar busy={busy} presets={presets} defaultStyleId={defaultStyleId} onSubmit={onAsk} />
      <div className="now-actions chrome">
        {showError && cutout.state === "failed" && (
          <div className="cutout-error-panel" role="dialog" aria-label="抠像失败详情">
            <div className="cutout-error-head">
              <strong>抠像失败 · {selectedModelName}</strong>
              <button className="cutout-error-close" onClick={() => setShowError(false)} aria-label="关闭">×</button>
            </div>
            <p className="cutout-error-text">{cutout.error ?? "未知原因"}</p>
            <div className="cutout-error-actions">
              <button className="btn ghost-button" onClick={() => { void copyReason(); }} disabled={!cutout.error}>
                {copied === "reason" ? "已复制原因" : "复制原因"}
              </button>
              <button className="btn ghost-button" onClick={() => { void copyFullLog(); }}>
                {copied === "log" ? "已复制 LOG" : "复制完整 LOG"}
              </button>
              <button className="btn primary-button" onClick={() => { setShowError(false); cutout.recompute(); }}>
                用 {selectedModelName} 重试
              </button>
            </div>
          </div>
        )}
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
