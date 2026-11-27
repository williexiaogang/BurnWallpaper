import { parseV4, type Library, type Option, type PromptLocks, type Result, type Style, type Theme } from "./engine.ts";
import { studioFields, studioRecipes, type StudioRecipe } from "./studio-recipes.ts";
import type { PublishedStudioRecipe } from "./studio-catalog.ts";

export interface StudioPreset {
  fullId: string;
  style: Style;
  artStyle?: string;
  thumbnail?: string;
  thumbnailSrc?: string;
  colors?: readonly string[];
  theme: Theme;
  reference: PromptLocks;
}

export type StudioVariation = "reference" | "details" | "free" | "edit";

const referenceOption = "reference";
type Draft = Pick<StudioRecipe, typeof studioFields[number][1]>;
const customDraft: Draft = {
  subject: [["原创主体", "one original subject with a clear silhouette"], ["安静小景", "a small group of everyday objects arranged together"]],
  camera: [["平视中景", "an eye-level medium view"], ["略高视角", "a slightly elevated three-quarter view"]],
  composition: [["单焦点留白", "one clear focus with generous negative space"], ["焦点偏侧", "the focal subject offset to one side"]],
  light: [["均匀柔光", "soft even lighting"], ["柔和侧光", "soft light from one side"]],
  background: [["中性简洁底", "a clean neutral backdrop"], ["有质感的底面", "a plain matte background with subtle texture"]],
  palette: [["与画风协调", "coordinate the colors with the selected artistic treatment"], ["低饱和色", "a restrained low-saturation palette"]],
  detail: [["干净轮廓", "carefully defined focal edges"], ["细小亮点", "a few subtle highlights"], ["细腻表面", "small, carefully placed surface details"]],
};

function buildPreset(id: string, fullId: string, style: Style, draft: Draft, artStyle?: string): StudioPreset {
  const draftFields = studioFields.filter(([key]) => key !== "PALETTE" || !style.variables.PALETTE);
  const theme: Theme = {
    schema_version: 4, kind: "prompt_scheme", id, name: style.name, aspect_ratio: "16:9",
    style: { mode: "external" },
    template: draftFields.map(([key, , label, english], index) => ({
      text: `${index === 0 ? "" : " "}${english}: {${key}}.`,
      text_zh: `${label}：{${key}}。`,
    })),
    variables: Object.fromEntries(draftFields.map(([key, field, label]) => [key, {
      label, required: true,
      options: draft[field].map(([label, value], index) => ({
        id: index === 0 ? referenceOption : `alternate_${index}`, label, value,
      })),
    }])),
    sampling: { history_window: 1, repeat_penalty: 0, diversity_keys: ["DETAIL"] },
  };
  return {
    fullId, style, artStyle, theme,
    reference: Object.fromEntries(draftFields.map(([key]) => [key, referenceOption])),
  };
}

function standaloneStyle(id: string, name: string, core: string, palettes?: Option[]): Style {
  return {
    id, name,
    template: [
      { text: "{ART_STYLE}.", text_zh: "{ART_STYLE}。" },
      ...(palettes ? [{ if: "PALETTE", text: " Palette: {PALETTE}.", text_zh: "配色：{PALETTE}。" }] : []),
    ],
    variables: {
      ART_STYLE: { label: "画法", required: true, options: [{ id: "core", label: name, value: core.replace(/[.。]+$/, "") }] },
      ...(palettes ? { PALETTE: { label: "配色", required: false, probability: 1, options: palettes } } : {}),
    },
  };
}

function buildReference(recipe: StudioRecipe, thumbnailWebp?: string): StudioPreset {
  return {
    ...buildPreset(`studio_${recipe.slug}`, recipe.fullId, standaloneStyle(recipe.slug, recipe.name, recipe.art), recipe, "core"),
    thumbnail: `${recipe.slug}.webp`,
    thumbnailSrc: thumbnailWebp ? `data:image/webp;base64,${thumbnailWebp}` : undefined,
    colors: recipe.colors,
  };
}

const bundledReferences = studioRecipes.map((recipe) => buildReference(recipe));

function customPreset(libraryId: string, style: Style, option?: Option): StudioPreset {
  const art = style.variables.ART_STYLE;
  const palette = style.variables.PALETTE;
  const tags = new Set([...(style.tags ?? []), ...(option?.tags ?? [])]);
  const compatible = palette?.options.filter((entry) =>
    !entry.requires_any?.every((tag) => tag.startsWith("look_palette:")) || entry.requires_any.some((tag) => tags.has(tag)));
  const scoped = option ? {
    ...style,
    name: art.options.length > 1 ? option.label : style.name,
    variables: {
      ...style.variables, ART_STYLE: { ...art, options: [option] },
      ...(compatible?.length ? { PALETTE: { ...palette, options: compatible } } : {}),
    },
  } : style;
  return buildPreset(
    `studio_${libraryId}_${style.id}${option ? "_" + option.id : ""}`,
    `${libraryId}/${style.id}${option ? ":" + option.id : ""}`,
    scoped, customDraft, option?.id,
  );
}

export function getStudioPresets(custom: Library[], studio?: readonly PublishedStudioRecipe[]): StudioPreset[] {
  const references = studio ? studio.map((recipe) => buildReference(recipe, recipe.thumbnailWebp)) : bundledReferences;
  const added = custom.flatMap((library) => library.styles.flatMap((style) => {
    const art = style.variables.ART_STYLE;
    return art ? art.options.filter((option) => option.value.trim() && option.weight !== 0)
      .map((option) => customPreset(library.id, style, option)) : [customPreset(library.id, style)];
  }));
  return [...references, ...added];
}

export function studioPromptLocks(
  preset: StudioPreset, manual: PromptLocks, variation: StudioVariation, previous?: Result | null, changed?: string,
): PromptLocks {
  const locks: PromptLocks = variation === "free" ? {} : { ...preset.reference };
  if ((variation === "details" || variation === "edit") && previous?.styleId === preset.fullId) {
    const variables = [
      ...Object.entries(preset.theme.variables),
      ...Object.entries(preset.style.variables).map(([key, variable]) => ["style." + key, variable] as const),
    ] as const;
    for (const [key, variable] of variables) {
      const choice = previous.selections[key];
      if (choice) locks[key] = previous.customValues?.[key] ? { text: previous.customValues[key] } : choice;
      else if (!variable.required) locks[key] = null;
    }
  }
  if (variation === "details") delete locks.DETAIL;
  if (changed) delete locks[changed];
  return { ...locks, ...manual, ...(preset.artStyle ? { "style.ART_STYLE": preset.artStyle } : {}) };
}

export function createStudioLibrary(id: string, name: string, core: string, palette: string): { pack: Library; preset: StudioPreset } {
  const style = standaloneStyle("visual_style", name, core, palette
    ? [{ id: "default", label: palette, value: palette }] : undefined);
  const pack = parseV4(JSON.stringify({ schema_version: 4, kind: "style_library", id, name, styles: [style] }));
  if (pack.kind !== "style_library") throw new Error("无法保存画风库");
  return { pack, preset: customPreset(pack.id, style, style.variables.ART_STYLE.options[0]) };
}
