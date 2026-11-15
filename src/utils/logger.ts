export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  time: string;
  level: LogLevel;
  source: string;
  message: string;
  detail?: string;
}

const MAX_ENTRIES = 300;
const entries: LogEntry[] = [];

function timestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function log(level: LogLevel, source: string, message: string, detail?: string) {
  entries.push({ time: timestamp(), level, source, message, detail });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  const line = `[${timestamp()}] [${level}] [${source}] ${message}${detail ? ` — ${detail}` : ""}`;
  if (level === "ERROR") console.error(line);
  else console.warn(line);
}

export const logInfo = (source: string, message: string, detail?: string) => log("INFO", source, message, detail);
export const logWarn = (source: string, message: string, detail?: string) => log("WARN", source, message, detail);
export const logError = (source: string, message: string, detail?: string) => log("ERROR", source, message, detail);

export function formatLogs(): string {
  const header = `燃 BURN 日志 · ${navigator.userAgent}\n生成于 ${timestamp()}\n`;
  if (!entries.length) return `${header}\n（暂无日志）\n`;
  return header + entries.map((entry) =>
    `[${entry.time}] [${entry.level}] [${entry.source}] ${entry.message}${entry.detail ? ` — ${entry.detail}` : ""}`,
  ).join("\n") + "\n";
}

export async function copyLogs(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(formatLogs());
    return true;
  } catch (error) {
    logError("logger", "复制日志失败", String(error));
    return false;
  }
}
