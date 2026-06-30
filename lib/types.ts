export type Mode =
  | "edit_single"
  | "combine_images"
  | "place_product"
  | "animate_single"
  | "animate_keyframes"
  | "video_backdrop"
  | "text_to_image"
  | "text_to_video";

export type OutputTarget =
  | "nano_banana"
  | "veo"
  | "firefly"
  | "gpt_image"
  | "seedance"
  | "gen4_5"
  | "flux2"
  | "kling"
  | "gemini_image";

export type Creator =
  | "google"
  | "adobe"
  | "openai"
  | "bytedance"
  | "runway"
  | "bfl"
  | "kuaishou";

export const MODES: { value: Mode; label: string; videoOnly: boolean }[] = [
  {
    value: "place_product",
    label: "Place object in scene",
    videoOnly: false,
  },
  {
    value: "text_to_image",
    label: "Text to image (from scratch)",
    videoOnly: false,
  },
  {
    value: "text_to_video",
    label: "Text to video (from scratch)",
    videoOnly: true,
  },
  { value: "edit_single", label: "Edit single image", videoOnly: false },
  { value: "combine_images", label: "Combine images", videoOnly: false },
  {
    value: "animate_single",
    label: "Animate from single image",
    videoOnly: true,
  },
  {
    value: "animate_keyframes",
    label: "Animate first to last frame",
    videoOnly: true,
  },
  {
    value: "video_backdrop",
    label: "Video Backdrop (multi-clip)",
    videoOnly: false,
  },
];

export const OUTPUT_TARGETS: {
  value: OutputTarget;
  label: string;
  creator: Creator;
  type: ("image" | "video")[];
}[] = [
  { value: "nano_banana", label: "Nano Banana", creator: "google", type: ["image"] },
  { value: "veo", label: "Veo", creator: "google", type: ["video"] },
  { value: "gen4_5", label: "Runway Gen 4.5", creator: "runway", type: ["video"] },
  { value: "firefly", label: "Adobe Firefly", creator: "adobe", type: ["image", "video"] },
  { value: "gpt_image", label: "GPT Image", creator: "openai", type: ["image"] },
  { value: "seedance", label: "Seedance 2.0", creator: "bytedance", type: ["video"] },
  { value: "flux2", label: "FLUX.2", creator: "bfl", type: ["image"] },
  { value: "kling", label: "Kling", creator: "kuaishou", type: ["video"] },
  { value: "gemini_image", label: "Gemini Image", creator: "google", type: ["image"] },
];

export const CREATORS: {
  value: Creator;
  label: string;
  targets: OutputTarget[];
}[] = [
  { value: "google", label: "Google", targets: ["nano_banana", "veo", "gemini_image"] },
  { value: "adobe", label: "Adobe", targets: ["firefly"] },
  { value: "openai", label: "OpenAI", targets: ["gpt_image"] },
  { value: "bytedance", label: "ByteDance", targets: ["seedance"] },
  { value: "runway", label: "Runway", targets: ["gen4_5"] },
  { value: "bfl", label: "Black Forest Labs", targets: ["flux2"] },
  { value: "kuaishou", label: "Kuaishou", targets: ["kling"] },
];

/** Map from target back to its creator. */
export function targetToCreator(target: OutputTarget): Creator {
  const entry = OUTPUT_TARGETS.find((t) => t.value === target);
  return entry?.creator ?? "google";
}

export function getModesForTypes(types: ("image" | "video")[]) {
  return MODES.filter((m) => {
    const modeType: "image" | "video" = m.videoOnly ? "video" : "image";
    return types.includes(modeType);
  });
}

export function getDefaultTarget(creator: Creator, mode: Mode): OutputTarget {
  const videoMode = MODES.find((m) => m.value === mode)?.videoOnly ?? false;
  const creatorTargets = CREATORS.find((c) => c.value === creator)?.targets ?? [];
  const wantedType: "image" | "video" = videoMode ? "video" : "image";
  const matching = creatorTargets.filter((t) =>
    OUTPUT_TARGETS.find((o) => o.value === t)?.type.includes(wantedType)
  );
  return matching[0] ?? "nano_banana";
}

export function getCharLimit(target: OutputTarget): { hard: number; soft: string } {
  if (target === "veo") {
    return {
      hard: 2000,
      soft: "220–290 words / ~1500–1850 characters of dense cinematographic detail",
    };
  }
  if (target === "gpt_image") {
    return {
      hard: 1500,
      soft: "moderate detail (~700–1000 characters), ordered scene → subject → key details → constraints — iterate, don't overload",
    };
  }
  if (target === "seedance") {
    return {
      hard: 6000,
      soft: "800–1500 words — include beat-by-beat choreography, timed shot breakdowns, and a metadata line at the end (Total: 15s / N shots / 16:9)",
    };
  }
  if (target === "kling") {
    return {
      hard: 1500,
      soft: "150–220 words of comma-separated clauses — subject + active verb up front, one camera motion, named lighting, single style anchor",
    };
  }
  if (target === "gemini_image") {
    return {
      hard: 1500,
      soft: "moderate detail (~700–1100 characters) in natural-language prose, ordered scene → subject → composition/lighting/medium → constraints",
    };
  }
  if (target === "flux2") {
    return {
      hard: 1200,
      soft: "natural-prose paragraph (~600–1000 characters); two to five sentences with concrete materials, lighting, and a single committed medium",
    };
  }
  // nano_banana, firefly, gen4_5
  return { hard: 1000, soft: "800–1000 characters (use the full budget)" };
}

export interface BrandVoice {
  tone_keywords: string[];
  description: string;
  dos: string[];
  donts: string[];
}

export interface BrandVisual {
  color_palette: string[];
  typography_notes: string;
  photography_style: string;
  composition_rules: string;
}

export interface BrandLegal {
  banned_words: string[];
  claims_to_avoid: string[];
  required_disclaimers: string[];
}

export interface StyleUrlRef {
  url: string;
  fetched_at: string;
  cached_files: string[];
}

export interface BrandProfile {
  name: string;
  slug: string;
  created_at: string;
  notes: string;
  files: string[];
  style_files?: string[];
  style_urls?: StyleUrlRef[];
  voice?: BrandVoice;
  visual?: BrandVisual;
  legal?: BrandLegal;
  /** Email of the user who created/owns this brand. Missing on legacy brands → admin-only. */
  owner_email?: string;
  /** When true, every authenticated user can see (but not necessarily edit) this brand. */
  shared?: boolean;
}

export interface ProductImage {
  filename: string;
  label: string;
  description?: string;
  url: string;
}

export interface ProductAsset {
  id: string;
  name: string;
  /** First image's filename — kept for display fallbacks. */
  filename: string;
  /** First image's URL — kept for display fallbacks. */
  url: string;
  categories: string[];
  brandSlug: string;
  /** All images for this product, in display order. The first is the default. */
  images: ProductImage[];
}

export type BrandExtractField = "voice" | "visual" | "legal";

export type HistoryStatus = "used" | "discarded" | null;

export interface HistoryMediaEntry {
  id: number;
  kind: "image" | "video";
  result_url: string | null;
  model_id: string;
  timestamp: string;
}

export interface HistoryEntry {
  id: number;
  timestamp: string;
  mode: Mode;
  output_target: OutputTarget;
  brand_slug: string | null;
  instruction: string;
  generated_prompt: string;
  image_paths: string;
  rating: number | null;
  model_used: string | null;
  rules_hash: string | null;
  system_prompt_hash: string | null;
  tags: string | null;
  notes: string | null;
  status: HistoryStatus;
  created_by: string | null;
  media?: HistoryMediaEntry[];
}

export const FEEDBACK_TAGS = [
  "nailed it",
  "on-brand",
  "off-brand",
  "model misunderstood",
  "too vague",
  "too long",
  "wrong style",
] as const;
export type FeedbackTag = (typeof FEEDBACK_TAGS)[number];

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  preview: string;
  base64: string;
  originalBase64?: string;
  paintData?: string;
  /** When set, this file was fetched from a URL the user pasted (not uploaded from disk). */
  sourceUrl?: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  description?: string;
}

export interface SelectorModel {
  id: string;
  name: string;
  provider: string;
}

export interface ModelPreferences {
  /** Model used to pick the best reference image per product (server-side). */
  product_picker_model?: string;
  selector_models: SelectorModel[];
  openrouter_models: ModelConfig[];
}

export type MediaModelTier = "auto" | "pro" | "budget";

export interface MediaModel {
  id: string;
  name: string;
  provider: string;
  tier: MediaModelTier;
  priceNote: string;
  supportsImageInput: boolean;
  /** Which prompt rules to use when generating a prompt for this model */
  promptTarget: OutputTarget;
  /** False for image-only models (FLUX, Sourceful, Seedream) that don't accept modalities: ["image","text"] */
  textOutput?: boolean;
  /** Video only: supports passing first/last frame images */
  supportsFirstLastFrame?: boolean;
  /** Video only: supports native audio generation */
  supportsAudio?: boolean;
  /** Video only: maximum duration in seconds */
  maxDuration?: number;
}

export interface MediaModelsConfig {
  image: MediaModel[];
  video: MediaModel[];
}
