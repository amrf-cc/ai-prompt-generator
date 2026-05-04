export type Mode =
  | "edit_single"
  | "combine_images"
  | "place_product"
  | "animate_single"
  | "animate_keyframes"
  | "video_backdrop"
  | "text_to_image"
  | "text_to_video";

export type OutputTarget = "nano_banana" | "veo" | "firefly";

export type Software = "photoshop" | "firefly" | "runway";

export const MODES: { value: Mode; label: string; videoOnly: boolean }[] = [
  { value: "edit_single", label: "Edit single image", videoOnly: false },
  { value: "combine_images", label: "Combine images", videoOnly: false },
  {
    value: "place_product",
    label: "Place product in scene",
    videoOnly: false,
  },
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
];

export const OUTPUT_TARGETS: { value: OutputTarget; label: string; type: "image" | "video" }[] = [
  { value: "nano_banana", label: "Nano Banana", type: "image" },
  { value: "veo", label: "Veo", type: "video" },
  { value: "firefly", label: "Adobe Firefly", type: "image" },
];

export const SOFTWARES: {
  value: Software;
  label: string;
  description: string;
  supportsVideo: boolean;
  availableTargets: OutputTarget[];
}[] = [
  {
    value: "photoshop",
    label: "Photoshop",
    description: "Generative Fill / Expand — selection-based, very short prompts",
    supportsVideo: false,
    availableTargets: ["firefly", "nano_banana"],
  },
  {
    value: "firefly",
    label: "Adobe Firefly (web)",
    description: "Firefly web app — descriptive prompts, ≤1000 characters",
    supportsVideo: true,
    availableTargets: ["firefly", "nano_banana", "veo"],
  },
  {
    value: "runway",
    label: "Runway",
    description:
      "RunwayML — Nano Banana for images (≤1000 chars), Veo for video (≤2000 chars)",
    supportsVideo: true,
    availableTargets: ["nano_banana", "veo"],
  },
];

export function getAvailableModes(software: Software): typeof MODES {
  if (software === "photoshop") {
    return MODES.filter((m) => m.value === "edit_single");
  }
  const sw = SOFTWARES.find((s) => s.value === software)!;
  let modes = sw.supportsVideo ? MODES : MODES.filter((m) => !m.videoOnly);
  // Video Backdrop is Runway-only
  if (software !== "runway") {
    modes = modes.filter((m) => m.value !== "video_backdrop");
  }
  return modes;
}

export function getAvailableTargets(
  software: Software,
  mode: Mode
): OutputTarget[] {
  const sw = SOFTWARES.find((s) => s.value === software)!;
  const isVideoMode = MODES.find((m) => m.value === mode)!.videoOnly;
  const wantedType: "image" | "video" = isVideoMode ? "video" : "image";
  return OUTPUT_TARGETS.filter(
    (t) => t.type === wantedType && sw.availableTargets.includes(t.value)
  ).map((t) => t.value);
}

export function getDefaultTarget(software: Software, mode: Mode): OutputTarget {
  const targets = getAvailableTargets(software, mode);
  if (targets.length === 0) {
    return MODES.find((m) => m.value === mode)!.videoOnly ? "veo" : "nano_banana";
  }
  if (software === "photoshop" && targets.includes("firefly")) return "firefly";
  if (software === "firefly" && targets.includes("firefly")) return "firefly";
  return targets[0];
}

export function getCharLimit(
  software: Software,
  target: OutputTarget
): { hard: number; soft: string } {
  if (software === "photoshop") {
    return { hard: 500, soft: "2-4 descriptive sentences (~400 characters)" };
  }
  if (software === "firefly") {
    return { hard: 1000, soft: "800–1000 characters (use the full budget)" };
  }
  if (software === "runway") {
    if (target === "veo") {
      return { hard: 5000, soft: "600–750 words / ~3800–4700 characters of dense cinematographic detail" };
    }
    return { hard: 5000, soft: "3800–4700 characters (use the full budget)" };
  }
  if (target === "veo") {
    return { hard: 2000, soft: "220–290 words / ~1500–1850 characters of dense cinematographic detail" };
  }
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
}

export type BrandExtractField = "voice" | "visual" | "legal";

export type HistoryStatus = "used" | "discarded" | null;

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
  description: string;
}

export interface ModelPreferences {
  openrouter_models: ModelConfig[];
}
