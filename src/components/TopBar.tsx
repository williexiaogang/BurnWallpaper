import type { View } from "../types";
import { WindowControls } from "./WindowControls";

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

export function TopBar({ view, onNavigate }: TopBarProps) {
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
      <WindowControls />
    </header>
  );
}
