import { studioFields, type StudioRecipe } from "./studio-recipes.ts";

export interface PublishedStudioRecipe extends StudioRecipe {
  thumbnailWebp: string;
}

const slugPattern = /^[a-z][a-z0-9_-]*$/;
const idPattern = /^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)?\/[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/;
const hexColor = /^#[a-f0-9]{6}$/i;

function hasWebpImage(value: unknown): value is string {
  if (typeof value !== "string" || !value.length || value.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(value)) return false;
  let image: string;
  try { image = atob(value); } catch { return false; }
  const uint32 = (at: number) => (image.charCodeAt(at) | image.charCodeAt(at + 1) << 8
    | image.charCodeAt(at + 2) << 16 | image.charCodeAt(at + 3) << 24) >>> 0;
  if (image.length < 20 || image.slice(0, 4) !== "RIFF" || image.slice(8, 12) !== "WEBP" || uint32(4) !== image.length - 8) return false;
  let offset = 12;
  let payload = false;
  while (offset + 8 <= image.length) {
    const chunk = image.slice(offset, offset + 4);
    const length = uint32(offset + 4);
    offset += 8 + length + (length % 2);
    if (length > 0 && (chunk === "VP8 " || chunk === "VP8L" || chunk === "ANMF")) payload = true;
  }
  return payload && offset === image.length;
}

export function parseStudioCatalog(source: unknown): PublishedStudioRecipe[] {
  if (!Array.isArray(source) || !source.length || source.length > 100) throw new Error("官方工作室预设须包含 1 至 100 个配方");
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
  return source.map((item: unknown, index) => {
    const invalid = (reason: string) => new Error(`官方工作室预设第 ${index + 1} 项${reason}`);
    if (!item || typeof item !== "object" || Array.isArray(item)) throw invalid("格式错误");
    const recipe = item as Record<string, unknown>;
    const { fullId, slug, name, art, colors, thumbnailWebp } = recipe;
    if (typeof fullId !== "string" || !idPattern.test(fullId) || ids.has(fullId)) throw invalid("ID 无效或重复");
    if (typeof slug !== "string" || !slugPattern.test(slug) || slugs.has(slug)) throw invalid("文件名无效或重复");
    if (!text(name) || !text(art)) throw invalid("缺少名称或画法");
    if (!Array.isArray(colors) || !colors.length || new Set(colors).size !== colors.length
      || colors.some((color) => typeof color !== "string" || !hexColor.test(color))) throw invalid("色票无效");
    for (const [, field] of studioFields) {
      const choices = recipe[field];
      if (!Array.isArray(choices) || !choices.length || choices.length > 200
        || choices.some((choice) => !Array.isArray(choice) || choice.length !== 2 || !text(choice[0]) || !text(choice[1]))) {
        throw invalid(`的 ${field} 候选无效`);
      }
    }
    if (!hasWebpImage(thumbnailWebp)) throw invalid("的 WebP 缩图无效");
    ids.add(fullId);
    slugs.add(slug);
    return recipe as unknown as PublishedStudioRecipe;
  });
}
