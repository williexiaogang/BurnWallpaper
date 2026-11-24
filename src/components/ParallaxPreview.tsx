import { useEffect, useRef, useState, type PointerEvent } from "react";
import { X } from "lucide-react";
import type { CutoutResult } from "../hooks/useCutout";
import { prepareParallaxBackground, type InpaintStatus } from "../utils/inpaint";

interface Props {
  image: string;
  title: string;
  cutout: CutoutResult;
  onEnableCutout: () => void;
  onClose: () => void;
}

/** A two-layer preview using the existing subject cutout; no exported image is produced. */
export function ParallaxPreview({ image, title, cutout, onEnableCutout, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const preparation = useRef<AbortController | null>(null);
  const [background, setBackground] = useState<{ image: string; subject: string; url: string } | null>(null);
  const [status, setStatus] = useState<InpaintStatus | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const [loadedCutout, setLoadedCutout] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [failedCutout, setFailedCutout] = useState<string | null>(null);
  const cleanBackground = background && background.image === image && background.subject === cutout.url ? background.url : null;
  const displayImage = cleanBackground ?? image;
  const imageReady = loadedImage === displayImage;
  const cutoutReady = Boolean(cutout.url && loadedCutout === cutout.url);
  const imageFailed = failedImage === displayImage;
  const cutoutFailed = Boolean(cutout.url && failedCutout === cutout.url);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, []);

  useEffect(() => {
    preparation.current?.abort();
    preparation.current = null;
    setBackground(null);
    setStatus(null);
    setPrepareError(null);
    return () => { preparation.current?.abort(); preparation.current = null; };
  }, [image, cutout.url]);

  useEffect(() => {
    if (!background) return;
    return () => URL.revokeObjectURL(background.url);
  }, [background]);

  const prepare = async () => {
    if (!cutout.url || preparation.current) return;
    const controller = new AbortController();
    preparation.current = controller;
    setPrepareError(null);
    try {
      const result = await prepareParallaxBackground(image, cutout.url, controller.signal, setStatus);
      if (controller.signal.aborted) return;
      setBackground({ image, subject: cutout.url, url: URL.createObjectURL(result) });
    } catch (error) {
      if (!controller.signal.aborted) setPrepareError(error instanceof Error ? error.message : String(error));
    } finally {
      if (preparation.current === controller) { preparation.current = null; setStatus(null); }
    }
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches || document.documentElement.classList.contains("reduce-motion"));
    update();
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { media.removeEventListener("change", update); observer.disconnect(); };
  }, []);

  const reset = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const element = stage.current;
    if (!element) return;
    for (const key of ["--parallax-background-x", "--parallax-background-y", "--parallax-subject-x", "--parallax-subject-y"]) element.style.setProperty(key, "0px");
  };

  useEffect(() => { reset(); }, [reducedMotion, cutout.url, image, cleanBackground]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    if (reducedMotion || !cleanBackground || !cutout.url || !cutoutReady || !imageReady) return;
    const element = stage.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      element.style.setProperty("--parallax-background-x", `${(-x * 2).toFixed(2)}px`);
      element.style.setProperty("--parallax-background-y", `${(-y * 2).toFixed(2)}px`);
      element.style.setProperty("--parallax-subject-x", `${(x * 5).toFixed(2)}px`);
      element.style.setProperty("--parallax-subject-y", `${(y * 5).toFixed(2)}px`);
    });
  };

  return (
    <dialog ref={dialog} className="modal preset-dialog parallax-dialog" aria-labelledby="parallax-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="modal-box parallax-box">
        <div className="parallax-heading">
          <div><span>互动预览</span><h2 id="parallax-title">{title} · 立体视差</h2></div>
          <button className="btn ghost-button" type="button" aria-label="关闭立体预览" onClick={onClose}><X size={18} /></button>
        </div>
        <div ref={stage} className={`parallax-stage${cleanBackground && cutout.url && cutoutReady && imageReady && !reducedMotion ? " is-interactive" : ""}`} onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset} aria-label={`${title}的立体预览`}>
          <img key={displayImage} className="parallax-background" src={displayImage} alt={title} draggable="false" onLoad={() => { setLoadedImage(displayImage); setFailedImage(null); }} onError={() => { setLoadedImage(null); setFailedImage(displayImage); }} />
          {cutout.url && <img key={cutout.url} className="parallax-subject" src={cutout.url} alt="" aria-hidden="true" draggable="false" onLoad={() => { setLoadedCutout(cutout.url); setFailedCutout(null); }} onError={() => { setLoadedCutout(null); setFailedCutout(cutout.url); }} />}
        </div>
        <div className="parallax-help" role="status" aria-live="polite">
          {imageFailed ? "无法加载预览图，请关闭预览后重试。" : cutoutFailed ? "无法加载抠像结果，请关闭预览后重试。" : status ? <span>{status === "downloading" ? "正在下载背景补全模型（首次约 198 MiB），请稍候…" : status === "inference" ? "正在本机补全背景，可能需要一些时间…" : status === "saving" ? "正在缓存背景…" : "正在准备背景…"} <button className="btn ghost-button" type="button" onClick={() => preparation.current?.abort()}>取消</button></span> : reducedMotion ? "已启用减少动态效果，立体移动已暂停。" : cutout.state === "disabled" ? <span>启用人物抠像后即可体验立体视差。 <button className="btn ghost-button" type="button" onClick={onEnableCutout}>启用抠像</button></span> : cutout.state === "pending" && !cutout.url ? "正在准备人物抠像。" : cutout.state === "empty" ? "没有检测到主体，当前显示原图。" : cutout.state === "failed" && !cutout.url ? "人物抠像失败，请返回主页查看原因并重试。" : prepareError ? <span>背景补全失败：{prepareError} <button className="btn ghost-button" type="button" onClick={() => { void prepare(); }}>重试</button></span> : cleanBackground && cutoutReady && imageReady ? "移动鼠标，让主体与已补全背景产生视差。" : cutout.url && cutoutReady && imageReady && !cleanBackground ? <span>先补全主体背后的背景，以减少重影。首次使用需下载约 198 MiB 模型。 <button className="btn ghost-button" type="button" onClick={() => { void prepare(); }}>准备立体预览</button></span> : "正在加载预览…"}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop"><button aria-label="关闭立体预览" onClick={onClose} /></form>
    </dialog>
  );
}
