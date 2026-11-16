/** 模型 URL → 本地相對路徑的純映射，主線程與摳像 worker 共用（不能引入依賴 window/Tauri 的模塊）。 */

/** Hugging Face 权重地址 → data_dir/models 下的相对路径。非法路径返回 null。 */
export function modelRel(cacheKey: string): string | null {
  let url: URL;
  try {
    url = new URL(cacheKey);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (url.hostname === "huggingface.co") {
    const resolveAt = parts.indexOf("resolve");
    if (resolveAt < 2 || resolveAt + 2 >= parts.length) return null;
    const repo = parts.slice(0, resolveAt);
    const revision = parts[resolveAt + 1];
    const file = parts.slice(resolveAt + 2);
    return joinRel(["hf", ...repo, revision, ...file]);
  }
  return joinRel(["ext", url.hostname, ...parts]);
}

function joinRel(parts: string[]): string | null {
  if (parts.length === 0 || parts.length > 12) return null;
  if (parts.some((part) => !/^[A-Za-z0-9._@+-]+$/.test(part))) return null;
  return parts.join("/");
}
