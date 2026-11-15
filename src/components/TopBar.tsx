import { Minus, Square, X } from "lucide-react";
import type { View } from "../types";

interface TopBarProps {
  view: View;
  onNavigate: (view: View) => void;
}

const navItems: { id: View; label: string }[] = [
  { id: "now", label: "此刻" },
  { id: "favorites", label: "收藏" },
  { id: "styles", label: "风格" },
  { id: "rotation", label: "轮换" },
  { id: "history", label: "记录" },
  { id: "settings", label: "设置" },
];

const isTauri = "__TAURI_INTERNALS__" in window;

export function TopBar({ view, onNavigate }: TopBarProps) {
  const control = async (action: "minimize" | "toggleMaximize" | "close") => {
    if (!isTauri) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow()[action]();
  };

  return (
    <header className="topbar chrome" data-tauri-drag-region>
      <button className="brand" onClick={() => onNavigate("now")} aria-label="燃 BURN 首页">
        <span className="brand-mark">燃</span>
        <span className="brand-name">BURN</span>
      </button>
      <nav className="main-nav" aria-label="主导航">
        {navItems.map((item) => (
          <button
            key={item.id}
            className="nav-item"
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="window-controls">
        <button className="window-button" aria-label="最小化" title={isTauri ? "最小化" : "桌面版可用"} onClick={() => control("minimize")}>
          <Minus size={16} strokeWidth={2} />
        </button>
        <button className="window-button" aria-label="最大化或还原" title={isTauri ? "最大化或还原" : "桌面版可用"} onClick={() => control("toggleMaximize")}>
          <Square size={13} strokeWidth={2} />
        </button>
        <button className="window-button close-button" aria-label="关闭" title={isTauri ? "关闭" : "桌面版可用"} onClick={() => control("close")}>
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
