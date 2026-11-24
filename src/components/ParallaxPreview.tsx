import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { CutoutResult } from "../hooks/useCutout";
import { useParallaxBackgrounds, type ParallaxCandidate } from "../hooks/useParallaxBackgrounds";
import type { InpaintStatus } from "../utils/inpaint";

interface Props {
  image: string;
  cutout: CutoutResult;
  candidates: ParallaxCandidate[];
  onEnableCutout: () => void;
}

const preparationLabels: Record<InpaintStatus, string> = {
  checking: "正在检查背景缓存…",
  downloading: "正在下载背景补全模型（首次约 198 MiB）…",
  loading: "正在加载背景补全模型…",
  inference: "正在本机补全背景…",
  saving: "正在缓存背景…",
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || document.documentElement.classList.contains("reduce-motion");
}

export function ParallaxPreview({ image, cutout, candidates, onEnableCutout }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const [asset, setAsset] = useState<{ blob: Blob; url: string } | null>(null);
  const [readyBackground, setReadyBackground] = useState<string | null>(null);
  const [failedBackground, setFailedBackground] = useState<string | null>(null);
  const [readySubject, setReadySubject] = useState<string | null>(null);
  const [failedSubject, setFailedSubject] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const subject = cutout.url;
  const job = useParallaxBackgrounds(subject ? { image, subject } : null, candidates, !reducedMotion);
  const background = asset && asset.blob === job.background ? asset.url : null;
  const active = Boolean(background && background === readyBackground && subject && subject === readySubject && !reducedMotion);

  useEffect(() => {
    if (!job.background) return;
    const url = URL.createObjectURL(job.background);
    setAsset({ blob: job.background, url });
    return () => URL.revokeObjectURL(url);
  }, [job.background]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(prefersReducedMotion());
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  const reset = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const element = stage.current;
    if (!element) return;
    for (const key of ["--parallax-x", "--parallax-y"]) element.style.removeProperty(key);
  };

  useEffect(() => { reset(); }, [active, image, subject]);
  useEffect(() => reset, []);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!active || (event.pointerType !== "mouse" && event.pointerType !== "pen")) return;
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
    const distance = Math.min(12, rect.width * .012, rect.height * .02);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      element.style.setProperty("--parallax-x", (x * distance).toFixed(2) + "px");
      element.style.setProperty("--parallax-y", (y * distance).toFixed(2) + "px");
    });
  };

  let help: string | null;
  let action: { label: string; onClick: () => void } | undefined;
  if (reducedMotion) {
    help = "已启用减少动态效果，立体移动已暂停。";
  } else if (cutout.state === "disabled") {
    help = "启用人物抠像即可体验立体视差。";
    action = { label: "启用抠像", onClick: onEnableCutout };
  } else if (subject && subject === failedSubject) {
    help = "无法加载抠像结果，可用右侧抠像按钮重算。";
  } else if (job.status) {
    help = preparationLabels[job.status];
    if (job.status !== "checking") action = { label: "取消", onClick: job.cancel };
  } else if (!subject) {
    help = cutout.state === "empty" ? "这张壁纸未检测到主体。"
      : cutout.state === "failed" ? "人物抠像失败，详情见右侧抠像按钮。"
      : "正在准备人物抠像…";
  } else if (active) {
    help = null;
  } else if (background && background === failedBackground) {
    help = "无法加载补全后的背景。";
    action = { label: "重试", onClick: () => job.retry(true) };
  } else if (job.paused) {
    help = "已暂停准备当前壁纸。";
    action = { label: "继续准备", onClick: () => job.retry() };
  } else if (job.error) {
    help = "背景补全失败：" + job.error;
    action = { label: "重试", onClick: () => job.retry() };
  } else if (job.background) {
    help = "正在加载立体视差…";
  } else if (job.modelPending) {
    help = "正在检查本地背景补全模型…";
  } else {
    help = "首次准备需下载约 198 MiB 的背景补全模型。";
    action = { label: "准备立体视差", onClick: () => job.retry() };
  }

  return (
    <>
      <div ref={stage} className={active ? "parallax-stage is-active" : "parallax-stage"} onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset} aria-hidden="true">
        {background && (
          <img key={background} className="parallax-background" src={background} alt="" draggable="false"
            onLoad={() => setReadyBackground(background)}
            onError={() => setFailedBackground(background)} />
        )}
        {subject && (
          <img key={subject} className="parallax-subject" src={subject} alt="" draggable="false"
            onLoad={() => setReadySubject(subject)}
            onError={() => setFailedSubject(subject)} />
        )}
      </div>
      {help && <div className="parallax-help chrome">
        <p role="status">{help}</p>
        {action && <button className="btn ghost-button" type="button" onClick={action.onClick}>{action.label}</button>}
      </div>}
    </>
  );
}
