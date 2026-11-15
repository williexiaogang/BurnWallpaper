import { Monitor } from "lucide-react";
import type { MonitorInfo } from "../backend";

interface MonitorPickerProps {
  monitors: MonitorInfo[];
  selected: string | null;
  onSelect: (devicePath: string | null) => void;
}

export function MonitorPicker({ monitors, selected, onSelect }: MonitorPickerProps) {
  if (!monitors.length) {
    return (
      <div className="monitor-picker">
        <Monitor size={16} aria-hidden="true" />
        <button className="monitor-shape" aria-label="显示器 1，已选择" aria-pressed="true">
          <span>1</span>
        </button>
        <span className="monitor-copy">主显示器<br /><b>3840×2160</b></span>
      </div>
    );
  }
  const activeIndex = selected === null
    ? -1
    : monitors.findIndex((monitor) => monitor.devicePath === selected);
  const shown = activeIndex >= 0 ? monitors[activeIndex] : null;
  return (
    <div className="monitor-picker">
      <Monitor size={16} aria-hidden="true" />
      <button
        className={`monitor-shape ${selected === null ? "is-selected" : ""}`}
        aria-label="全部显示器"
        aria-pressed={selected === null}
        title="全部显示器"
        onClick={() => onSelect(null)}
      >
        <span>ALL</span>
      </button>
      {monitors.map((monitor, index) => (
        <button
          key={monitor.devicePath}
          className={`monitor-shape ${selected === monitor.devicePath ? "is-selected" : ""}`}
          aria-label={`显示器 ${index + 1}，${monitor.width}×${monitor.height}`}
          aria-pressed={selected === monitor.devicePath}
          title={`显示器 ${index + 1}`}
          onClick={() => onSelect(monitor.devicePath)}
        >
          <span>{index + 1}</span>
        </button>
      ))}
      <span className="monitor-copy">
        {shown ? `显示器 ${activeIndex + 1}` : "全部显示器"}<br />
        <b>{shown ? `${shown.width}×${shown.height}` : monitors.length > 1 ? `${monitors.length} 块屏幕` : `${monitors[0].width}×${monitors[0].height}`}</b>
      </span>
    </div>
  );
}
