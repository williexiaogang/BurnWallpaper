import { useEffect, useId, useRef, useState } from "react";
import { Bookmark, ChevronDown, Copy, MonitorUp, Scissors, TextQuote, X } from "lucide-react";
import type { PromptSubmitSettings, Wallpaper } from "../types";
import { TitleBlock, TITLE_LAYOUT_OPTIONS, type TitleLayoutPreference } from "../components/TitleBlock";
import { V4AskBar } from "../components/V4AskBar";
import { ParallaxPreview } from "../components/ParallaxPreview";
import type { Result, Theme } from "../v4/engine";
import { Shelf } from "../components/Shelf";
import { useCutout } from "../hooks/useCutout";
import { peekCutout } from "../utils/cutout-cache";
import type { CutoutModel } from "../utils/cutout-models";
import { CUTOUT_MODELS, cutoutModelInfo, cutoutModelReady } from "../utils/cutout-models";
import { loadCutout, wallpaperCutoutSource } from "../utils/cutout-store";
import { copyLogs } from "../utils/logger";

interface NowPageProps {
  wallpaper: Wallpaper;
  items: Wallpaper[];
  appliedId: string;
  busy: boolean;
  favorite: boolean;
  cutoutEnabled: boolean;
  cutoutModel: CutoutModel;
  cutoutDownloaded: Set<string>;
  getCutoutPreference: (id: string) => { enabled: boolean; model: CutoutModel };
  onToggleCutout: (enabled: boolean) => void;
  onCutoutModelChange: (model: string) => void;
  onSelect: (id: string) => void;
  currentSettings: PromptSubmitSettings;
  onAskV4: (theme: Theme, result: Result, settings: PromptSubmitSettings) => void;
  onApply: () => void;
  onFavorite: () => void;
  onCopyPrompt: (prompt: string) => void;
}

const CUTOUT_BUTTON: Record<string, { label: string; title: string }> = {
  disabled: { label: "抠像：关", title: "人物抠像已关闭，点击开启" },
  pending: { label: "抠像中…", title: "正在计算人物抠像" },
  failed: { label: "抠像失败 · 重试", title: "点击查看原因" },
  empty: { label: "未侦测主体 · 停用", title: "同模型重算通常不会改变结果。点击停用此图抠像，或在右下角切换模型" },
  ready: { label: "抠像 ✓ · 重算", title: "抠像已生效，点击重新计算" },
};

type DisplayEffect = TitleLayoutPreference | "parallax";

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

export function NowPage({ wallpaper, items, appliedId, busy, favorite, cutoutEnabled, cutoutModel, cutoutDownloaded, getCutoutPreference, onToggleCutout, onCutoutModelChange, onSelect, currentSettings, onAskV4, onApply, onFavorite, onCopyPrompt }: NowPageProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const promptId = useId();
  const promptToggle = useRef<HTMLButtonElement>(null);
  const promptHeading = useRef<HTMLHeadingElement>(null);
  const prompt = wallpaper.prompt ?? "";
  const hasPrompt = Boolean(prompt.trim());
  useEffect(() => {
    if (showPrompt) promptHeading.current?.focus();
  }, [showPrompt]);
  const closePrompt = () => {
    setShowPrompt(false);
    promptToggle.current?.focus();
  };
  const [displayEffect, setDisplayEffect] = useState<DisplayEffect>(() => {
    try {
      const stored = localStorage.getItem("burn-title-layout");
      if (stored === "parallax") return stored;
      return TITLE_LAYOUT_OPTIONS.find((option) => option.value === stored)?.value ?? "auto";
    } catch { return "auto"; }
  });
  const changeDisplayEffect = (value: string) => {
    const next = value === "parallax" ? value : TITLE_LAYOUT_OPTIONS.find((option) => option.value === value)?.value ?? "auto";
    setDisplayEffect(next);
    try { localStorage.setItem("burn-title-layout", next); } catch { /* Keep the choice for this session. */ }
  };
  const parallax = displayEffect === "parallax";
  const parallaxCandidates = parallax ? items.flatMap((item) => {
    if (item.id === wallpaper.id) return [];
    const { enabled, model } = getCutoutPreference(item.id);
    if (!enabled) return [];
    const cached = peekCutout(item.id, item.image, model);
    const source = wallpaperCutoutSource(item.localPath, item.image);
    return [{
      key: JSON.stringify([item.id, source, model, Boolean(cached)]),
      image: item.image,
      readSubject: async () => cached?.url ?? (await loadCutout(item.id, source, model))?.url ?? null,
    }];
  }) : [];
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
    else if (cutout.state === "pending") onToggleCutout(false);
    else if (cutout.state === "empty") onToggleCutout(false);
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
    <main id="main-content" className="now-page page-enter" onKeyDown={(event) => {
      if (event.key === "Escape" && showPrompt && !(event.target as Element).closest("dialog[open]")) {
        event.preventDefault();
        closePrompt();
      }
    }}>
      <WallpaperStage
        frame={{ image: wallpaper.image, cutout: parallax ? null : cutout.url }}
        alt={`${wallpaper.title}：${wallpaper.tags.join("、")}动漫壁纸`}
      />
      {parallax && (
        <ParallaxPreview
          image={wallpaper.image}
          cutout={cutout}
          candidates={parallaxCandidates}
          onEnableCutout={() => onToggleCutout(true)}
        />
      )}
      <div className={parallax ? "wallpaper-shade is-parallax" : "wallpaper-shade"} aria-hidden="true" />
      {!parallax && !showPrompt && (
        <div className="title-layer">
          <TitleBlock wallpaper={wallpaper} preference={displayEffect} />
        </div>
      )}
      <section id={promptId} className="wallpaper-prompt" hidden={!showPrompt} aria-labelledby={promptId + "-heading"}>
        <header className="wallpaper-prompt-header">
          <h2 id={promptId + "-heading"} ref={promptHeading} tabIndex={-1}>生成 Prompt</h2>
          <div className="wallpaper-prompt-tools">
            {hasPrompt && (
              <button className="btn ghost-button" type="button" onClick={() => onCopyPrompt(prompt)} aria-label="复制本图 Prompt">
                <Copy size={15} aria-hidden="true" /> 复制
              </button>
            )}
            <button className="btn ghost-button btn-square" type="button" onClick={closePrompt} aria-label="收起本图 Prompt">
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div key={wallpaper.id} className="wallpaper-prompt-text" role="group" aria-label="Prompt 原文" tabIndex={hasPrompt ? 0 : undefined}>
          <p dir="auto">{hasPrompt ? prompt : "这张壁纸没有保存生成 Prompt。"}</p>
        </div>
      </section>
      <V4AskBar busy={busy} currentSettings={currentSettings} onSubmit={onAskV4} />
      <div className="now-actions chrome">
        <div className="cutout-dock">
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
          <label className="cutout-model-picker">
            <span className="sr-only">当前壁纸抠像模型</span>
            <select
              className="select cutout-model-select"
              value={cutoutModel}
              disabled={!cutoutEnabled}
              onChange={(event) => onCutoutModelChange(event.target.value)}
              title="为当前壁纸选择抠像模型"
            >
              {CUTOUT_MODELS.map((item) => (
                <option key={item.id} value={item.id} disabled={item.id !== cutoutModel && !cutoutModelReady(item.id, cutoutDownloaded)}>
                  {item.name}{item.id !== cutoutModel && !cutoutModelReady(item.id, cutoutDownloaded) ? "（未下载）" : ""}
                </option>
              ))}
            </select>
          </label>
          <button className={`btn ghost-button cutout-button is-${cutout.state}`} onClick={handleCutoutClick} title={cutoutTitle} aria-live="polite">
            <Scissors size={15} aria-hidden="true" /> {cutoutLabel}
          </button>
        </div>
        <div className="action-row now-primary-actions" role="group" aria-label="壁纸操作">
          <button ref={promptToggle} className="btn ghost-button wallpaper-prompt-toggle" type="button" aria-expanded={showPrompt} aria-controls={promptId} onClick={() => setShowPrompt((open) => !open)}>
            <TextQuote size={16} aria-hidden="true" /> 本图 Prompt
          </button>
          <div className="display-effect-picker">
            <select className="select btn ghost-button display-effect-select" value={displayEffect} onChange={(event) => changeDisplayEffect(event.target.value)} aria-label="显示效果" title="显示效果">
              <optgroup label="壁纸效果">
                <option value="parallax">立体视差</option>
                <option value="hidden">隐藏文字</option>
              </optgroup>
              <optgroup label="文字装饰">
                {TITLE_LAYOUT_OPTIONS.filter(({ value }) => value !== "hidden").map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </optgroup>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </div>
          <button className={`btn secondary-button icon-text-button ${favorite ? "is-favorite" : ""}`} onClick={onFavorite} aria-pressed={favorite}>
            <Bookmark size={16} fill={favorite ? "currentColor" : "none"} /> {favorite ? "已收" : "收藏"}
          </button>
          <button className="btn primary-button apply-button" type="button" onClick={onApply} title="设为桌面壁纸"><MonitorUp size={16} aria-hidden="true" /> 上墙</button>
        </div>
      </div>
      <Shelf items={items} activeId={wallpaper.id} appliedId={appliedId} busy={busy} onSelect={onSelect} />
    </main>
  );
}

