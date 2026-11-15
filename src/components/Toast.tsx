import { useState } from "react";
import type { ToastMessage } from "../types";
import { copyLogs } from "../utils/logger";

export function Toast({ toast }: { toast: ToastMessage | null }) {
  const [copiedFor, setCopiedFor] = useState<number | null>(null);
  if (!toast) return null;
  const copied = copiedFor === toast.id;
  const copy = async () => {
    if (await copyLogs()) {
      setCopiedFor(toast.id);
      setTimeout(() => setCopiedFor((current) => (current === toast.id ? null : current)), 1500);
    }
  };
  return (
    <div className={`burn-toast${toast.error ? " is-error" : ""}`} role="status">
      <strong>{toast.text}</strong>
      {toast.detail && <span>{toast.detail}</span>}
      {toast.error && (
        <button className="toast-log-button" onClick={() => { void copy(); }}>
          {copied ? "已复制" : "复制 LOG"}
        </button>
      )}
    </div>
  );
}
