export type View = "now" | "favorites" | "styles" | "rotation" | "history" | "settings";

export interface Wallpaper {
  id: string;
  styleId: string;
  accent: string;
  titleColor: string;
  issue: string;
  title: string;
  english: string;
  tags: string[];
  image: string;
  originalImage?: string;
  /** Absolute path on disk for backend-generated wallpapers. */
  localPath?: string;
  resolution: string;
  subject: string;
  tone: "暖色" | "原色" | "冷色";
  light: "明亮" | "暗色";
  ratio: "wide" | "standard" | "portrait";
}

export interface StylePreset {
  id: string;
  name: string;
  english: string;
  description: string;
  is_builtin: boolean;
  prompt_template: string;
  variables: Record<string, string[]>;
  optional_variables?: Record<string, number>;
  randomize_variables: boolean;
  aspect_ratio: string;
}

export type StyleField = "name" | "description" | "prompt_template" | "aspect_ratio";

export interface PendingPrompt {
  prompt: string;
  styleName: string;
  styleId: string;
  description: string;
  selections: Record<string, string>;
  modelId: string;
  aspectRatio: string;
  resolution: string;
  modelName: string;
}

export interface ToastMessage {
  id: number;
  text: string;
  detail?: string;
  error?: boolean;
}

export interface GenerationProgress {
  requestId: string;
  label: string;
  state: string;
  startedAt: number;
}
