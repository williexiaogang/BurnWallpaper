import { Minus, Square, X } from "lucide-react";
import { isMacOS } from "../utils/platform";

const isTauri = "__TAURI_INTERNALS__" in window;

export function WindowControls() {
  const control = async (action: "minimize" | "toggleMaximize" | "close") => {
    if (!isTauri) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow()[action]();
  };
  const maximizeLabel = isMacOS ? "缩放窗口" : "最大化或还原";

  return (
    <div className="window-controls">
      <button className="window-button" aria-label="最小化" title={isTauri ? "最小化" : "桌面版可用"} onClick={() => control("minimize")}>
        <Minus size={16} strokeWidth={2} />
      </button>
      <button className="window-button" aria-label={maximizeLabel} title={isTauri ? maximizeLabel : "桌面版可用"} onClick={() => control("toggleMaximize")}>
        <Square size={13} strokeWidth={2} />
      </button>
      <button className="window-button close-button" aria-label="关闭" title={isTauri ? "关闭" : "桌面版可用"} onClick={() => control("close")}>
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
