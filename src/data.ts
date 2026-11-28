import type { PromptSubmitSettings, Wallpaper } from "./types";
import modelCatalog from "./model-options.json";

interface GenerationModel {
  id: string;
  name: string;
  priceUsd: number;
  ratios: string[];
  promptLimit?: number;
}

export const modelOptions: GenerationModel[] = modelCatalog;

export function getGenerationModel(id: string) {
  return modelOptions.find((model) => model.id === id) ?? modelOptions[0];
}

export function generationSettings(modelId: string, ...preferredRatios: string[]): PromptSubmitSettings {
  const model = getGenerationModel(modelId);
  const aspectRatio = preferredRatios.find((ratio) => model.ratios.includes(ratio)) ?? "16:9";
  return { modelId: model.id, modelName: model.name, aspectRatio, resolution: "4K", promptLanguage: "en" };
}

export function generationPrice(modelId: string) {
  return `$${getGenerationModel(modelId).priceUsd.toFixed(3)}`;
}

export const wallpapers: Wallpaper[] = [
  {
    id: "court-wolf",
    styleId: "general",
    accent: "#35C8FF",
    titleColor: "#EAF8FF",
    issue: "07",
    title: "Furry AJ",
    english: "WOLF · BREAK THE LINE",
    tags: ["Furry", "球鞋"],
    image: "/wallpapers/court-wolf.webp",
    originalImage: "/wallpapers/sample-wallpaper- (1).jpeg",
    resolution: "4096×2304",
    subject: "主体居右",
    tone: "冷色",
    light: "明亮",
    ratio: "standard",
  },
  {
    id: "hammer-bear",
    styleId: "general",
    accent: "#FF6B4A",
    titleColor: "#FFF1E8",
    issue: "06",
    title: "Furry AJ",
    english: "BEAR · HAMMER",
    tags: ["Furry", "球鞋"],
    image: "/wallpapers/hammer-bear.webp",
    originalImage: "/wallpapers/sample-wallpaper- (2).jpeg",
    resolution: "4096×2304",
    subject: "主体居中",
    tone: "暖色",
    light: "明亮",
    ratio: "standard",
  },
  {
    id: "forest-guard",
    styleId: "general",
    accent: "#9FCB6B",
    titleColor: "#F3F6E9",
    issue: "05",
    title: "自由",
    english: "STILL PEAK",
    tags: ["森林", "徒步"],
    image: "/wallpapers/forest-guard.webp",
    originalImage: "/wallpapers/sample-wallpaper- (1).png",
    resolution: "4864×2736",
    subject: "主体居左",
    tone: "冷色",
    light: "明亮",
    ratio: "standard",
  },
  {
    id: "street-bounce",
    styleId: "general",
    accent: "#FF4F9A",
    titleColor: "#FFF0F7",
    issue: "04",
    title: "Furry AJ",
    english: "STREET BOUNCE",
    tags: ["球鞋", "街头"],
    image: "/wallpapers/street-bounce.webp",
    originalImage: "/wallpapers/sample-wallpaper- (2).png",
    resolution: "2304×1296",
    subject: "主体居中",
    tone: "冷色",
    light: "暗色",
    ratio: "standard",
  },
];

