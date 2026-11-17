import { useRef, useState, type PointerEvent } from "react";
import { FileText, Folder, Grid3X3, Image, Monitor, Trash2, X } from "lucide-react";
import type { Wallpaper } from "../types";

interface DesktopPreviewProps {
  wallpaper: Wallpaper;
  onClose: () => void;
  onApply: (cropped: Blob) => void;
}

const desktopIcons = [
  { name: "此电脑", icon: Monitor },
  { name: "素材", icon: Folder },
  { name: "作品", icon: Image },
  { name: "笔记", icon: FileText },
  { name: "回收站", icon: Trash2 },
];

async function renderCrop(wallpaper: Wallpaper, offset: { x: number; y: number }): Promise<Blob> {
  const response = await fetch(wallpaper.image);
  if (!response.ok) throw new Error("原图读取失败");
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const aspect = Math.max(1, window.screen.width) / Math.max(1, window.screen.height);
    const canvas = document.createElement("canvas");
    canvas.width = aspect >= 1 ? 4096 : Math.round(4096 * aspect);
    canvas.height = aspect >= 1 ? Math.round(4096 / aspect) : 4096;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建裁切画布");
    const coverScale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height) * 1.08;
    const width = bitmap.width * coverScale;
    const height = bitmap.height * coverScale;
    const offsetX = offset.x / Math.max(1, window.innerWidth) * canvas.width;
    const offsetY = offset.y / Math.max(1, window.innerHeight) * canvas.height;
    context.drawImage(
      bitmap,
      (canvas.width - width) / 2 + offsetX,
      (canvas.height - height) / 2 + offsetY,
      width,
      height,
    );
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("裁切图片编码失败")), "image/jpeg", 0.94);
    });
  } finally {
    bitmap.close();
  }
}

export function DesktopPreview({ wallpaper, onClose, onApply }: DesktopPreviewProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, startX: offset.x, startY: offset.y };
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const maxX = window.innerWidth * 0.08;
    const maxY = window.innerHeight * 0.08;
    const nextX = drag.current.startX + event.clientX - drag.current.x;
    const nextY = drag.current.startY + event.clientY - drag.current.y;
    setOffset({
      x: Math.max(-maxX, Math.min(maxX, nextX)),
      y: Math.max(-maxY, Math.min(maxY, nextY)),
    });
  };

  const applyCrop = async () => {
    if (applying) return;
    setApplying(true);
    setError(null);
    try {
      onApply(await renderCrop(wallpaper, offset));
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : String(cropError));
    } finally {
      setApplying(false);
    }
  };

  return (
    <section
      className="desktop-preview"
      aria-label="桌面预览与裁切"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
    >
      <img
        className="preview-wallpaper"
        src={wallpaper.image}
        alt={`${wallpaper.title} 桌面取景预览`}
        width="1600"
        height="900"
        draggable="false"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(1.08)` }}
      />
      <div className="desktop-icons" aria-label="模拟桌面图标">
        {desktopIcons.map(({ name, icon: Icon }) => (
          <div className="desktop-icon" key={name}><Icon size={28} strokeWidth={1.5} /><span>{name}</span></div>
        ))}
      </div>
      <div className="taskbar" aria-label="模拟 Windows 任务栏">
        <div className="windows-mark"><i /><i /><i /><i /></div>
        <Folder size={20} /><FileText size={20} /><Image size={20} />
      </div>
      {showGrid && <div className="thirds-grid" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>}
      <div className="preview-top-actions">
        <button className={`btn preview-tool ${showGrid ? "is-active" : ""}`} aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}>
          <Grid3X3 size={16} /> 三分线
        </button>
        <button className="btn preview-tool" onClick={onClose}><X size={16} /> 退出预览 <kbd>ESC</kbd></button>
      </div>
      <div className="crop-dock">
        <span>{error ?? "按住画面拖动，让人物避开图标"}</span>
        {error && <span className="sr-only" role="alert">{error}</span>}
        <button className="btn reset-button" onClick={() => setOffset({ x: 0, y: 0 })}>重置取景</button>
        <button className="btn primary-button" onClick={() => { void applyCrop(); }} disabled={applying} title={applying ? "正在生成裁切图片" : undefined}>
          {applying ? "生成裁切中…" : "确认并上墙"}
        </button>
      </div>
    </section>
  );
}
