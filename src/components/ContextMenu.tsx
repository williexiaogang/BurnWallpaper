import { useEffect, useRef } from "react";
import { Copy, Download, MonitorUp, RefreshCw, Trash2 } from "lucide-react";
import type { Wallpaper } from "../types";

interface ContextMenuProps {
  wallpaper: Wallpaper;
  x: number;
  y: number;
  onClose: () => void;
  onApply: () => void;
  onSimilar: () => void;
  onRemove: () => void;
  onToast: (text: string) => void;
}

export function ContextMenu({ wallpaper, x, y, onClose, onApply, onSimilar, onRemove, onToast }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [onClose]);

  const copyDescription = async () => {
    await navigator.clipboard.writeText(`${wallpaper.title}：${wallpaper.tags.join("、")}，${wallpaper.subject}`);
    onToast("描述已复制");
    onClose();
  };

  return (
    <div
      className="context-menu"
      role="menu"
      aria-label={`${wallpaper.title} 操作`}
      ref={menuRef}
      style={{ left: Math.min(x, window.innerWidth - 224), top: Math.min(y, window.innerHeight - 292) }}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
    >
      <strong>{wallpaper.title} <small>{wallpaper.english}</small></strong>
      <button role="menuitem" onClick={onApply}><MonitorUp size={15} /> 上墙</button>
      <button role="menuitem" onClick={onApply}><MonitorUp size={15} /> 设为主显示器</button>
      <a role="menuitem" href={wallpaper.originalImage ?? wallpaper.image} download={`${wallpaper.english}.${(wallpaper.originalImage ?? wallpaper.image).split(".").pop()}`} onClick={onClose}><Download size={15} /> 导出原图</a>
      <button role="menuitem" onClick={copyDescription}><Copy size={15} /> 复制描述</button>
      <button role="menuitem" onClick={onSimilar}><RefreshCw size={15} /> 再来一张类似的</button>
      <button role="menuitem" className="danger-item" onClick={onRemove}><Trash2 size={15} /> 丢掉</button>
    </div>
  );
}
