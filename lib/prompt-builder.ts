import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Mode, OutputTarget, Creator, BrandLegal, BrandVisual, BrandVoice } from "./types";
import { getCharLimit } from "./types";
import { CONFIG_DIR } from "./paths";

interface TargetExample {
  instruction: string;
  good_output: string;
  why: string;
}

interface TargetRules {
  skeleton: string;
  output_format: string;
  must_include: string[];
  must_avoid: string[];
  vocabulary: Record<string, string[]>;
  examples: TargetExample[];
  rules: string[];
}

interface OverlayRules {
  skeleton?: string;
  output_format?: string;
  must_include?: string[];
  must_avoid?: string[];
  examples?: TargetExample[];
  rules: string[];
}

interface PromptRules {
  version: number;
  global_rules: string[];
  targets: {
    nano_banana: TargetRules;
    veo: TargetRules;
    gen4_5: TargetRules;
    firefly: TargetRules;
    gpt_image: TargetRules;
    seedance: TargetRules;
    flux2: TargetRules;
    kling: TargetRules;
    gemini_image: TargetRules;
  };
  overlays: {
    photoshop: OverlayRules;
    runway_image_to_video: OverlayRules;
  };
}

type TargetRuleKey = keyof PromptRules["targets"];

const TARGET_RULE_KEY: Record<OutputTarget, TargetRuleKey> = {
  nano_banana: "nano_banana",
  veo: "veo",
  gen4_5: "gen4_5",
  firefly: "firefly",
  gpt_image: "gpt_image",
  seedance: "seedance",
  flux2: "flux2",
  kling: "kling",
  gemini_image: "gemini_image",
};

let cachedRules: PromptRules | null = null;
let cachedRulesRaw: string | null = null;
let cachedRulesMtime: number | null = null;

const RULES_PATH = path.join(CONFIG_DIR, "prompt-rules.json");

export function validateRules(r: unknown): asserts r is PromptRules {
  const rec = r as Record<string, unknown>;
  if (!rec || typeof rec !== "object") throw new Error("prompt-rules.json: root must be an object");
  if (rec.version !== 2) {
    throw new Error(
      `prompt-rules.json: version ${String(rec.version)} not supported (expected 2). The schema changed — see lib/prompt-builder.ts for the expected shape.`
    );
  }
  if (!Array.isArray(rec.global_rules)) throw new Error("prompt-rules.json: global_rules must be an array");
  const targets = rec.targets as Record<string, Record<string, unknown>> | undefined;
  if (!targets) throw new Error("prompt-rules.json: missing targets");
  for (const key of ["nano_banana", "veo", "gen4_5", "firefly", "gpt_image", "seedance", "flux2", "kling", "gemini_image"]) {
    const t = targets[key];
    if (!t) throw new Error(`prompt-rules.json: missing targets.${key}`);
    for (const field of ["skeleton", "output_format"]) {
      if (typeof t[field] !== "string") throw new Error(`prompt-rules.json: targets.${key}.${field} must be a string`);
    }
    for (const field of ["must_include", "must_avoid", "examples", "rules"]) {
      if (!Array.isArray(t[field])) throw new Error(`prompt-rules.json: targets.${key}.${field} must be an array`);
    }
    if (!t.vocabulary || typeof t.vocabulary !== "object") {
      throw new Error(`prompt-rules.json: targets.${key}.vocabulary must be an object`);
    }
  }
  const overlays = rec.overlays as Record<string, Record<string, unknown>> | undefined;
  if (!overlays) throw new Error("prompt-rules.json: missing overlays");
  for (const key of ["photoshop", "runway_image_to_video"]) {
    const o = overlays[key];
    if (!o) throw new Error(`prompt-rules.json: missing overlays.${key}`);
    if (!Array.isArray(o.rules)) throw new Error(`prompt-rules.json: overlays.${key}.rules must be an array`);
  }
}

function loadRules(): PromptRules {
  const stat = fs.statSync(RULES_PATH);
  if (cachedRules && cachedRulesMtime === stat.mtimeMs) {
    return cachedRules;
  }
  const raw = fs.readFileSync(RULES_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  validateRules(parsed);
  cachedRules = parsed;
  cachedRulesRaw = raw;
  cachedRulesMtime = stat.mtimeMs;
  return parsed;
}

export function getRulesHash(): string {
  if (!cachedRulesRaw) loadRules();
  return crypto.createHash("sha256").update(cachedRulesRaw!).digest("hex").slice(0, 16);
}

export function hashSystemPrompt(systemPrompt: string): string {
  return crypto.createHash("sha256").update(systemPrompt).digest("hex").slice(0, 16);
}

const MODE_DESCRIPTIONS: Record<Mode, string> = {
  edit_single:
    "The user wants to edit a single image. The primary image shows what exists now; the instruction describes the desired modification. Write a prompt describing the fully realized result — not a list of edits, but the scene as it should look after the edit is applied.",

  combine_images:
    "The user wants to combine multiple images into one cohesive scene. The primary images are the source elements to merge. Write a prompt describing the final unified composition: how the elements relate spatially, the shared lighting, and the unified atmosphere.",

  place_product:
    "The user wants to place a product into a scene. The primary image is the product; reference images show the desired environment or scene. Write a prompt describing the final composited shot: product placement (use compositional language — rule of thirds, foreground/background, corner placement), surface the product rests on, how light falls on it, and the surrounding scene. CRITICAL: The product must appear EXACTLY as shown in the primary image — do not suggest any modifications to its shape, color, finish, texture, logo, labels, typography, or packaging.",

  animate_single:
    "The user wants to animate a single still image into a video (Image to Video). The primary image is the starting frame — it already defines the composition, subject matter, lighting, and style. Your prompt should focus almost exclusively on MOTION: describe how the scene moves, what the camera does, and how subjects act. Do NOT re-describe what is already visible in the image. Only add visual descriptions when introducing new elements, requesting dramatic changes, specifying transformations, or describing interactions between elements.",

  animate_keyframes:
    "The user wants to create a video that transitions from a first keyframe to a last keyframe (Animate Frames). The first primary image is the opening frame; the second is the ending frame. Write a prompt describing the motion path, subject changes, and camera work that bridges the two frames. Focus on what CHANGES between frames — do not re-describe static elements that are the same in both.",

  video_backdrop:
    "The user wants to replace the background of multiple video clips using Runway's Video Backdrop feature. Each uploaded image represents a frame extracted from a different 5-second video clip. The user will paste one prompt per clip into Runway Video Backdrop, which replaces only the background while keeping the foreground subject intact.",

  text_to_image:
    "The user wants to generate an image from scratch (text-to-image). The instruction defines the SUBJECT and SCENE. Any uploaded images or videos are STYLE HINTS ONLY — use them strictly to inform aesthetic choices like color palette, lighting quality, mood, texture, composition language, or art-direction tone. Do NOT describe the contents of the references as if they were the subject. Do NOT copy specific people, products, locations, or objects from the references into the prompt. Build the prompt around the user's instruction; let the references quietly shape the look and feel.",

  text_to_video:
    "The user wants to generate a video from scratch (text-to-video) — there is no source frame to animate. The instruction defines the SUBJECT, SCENE, and what should happen. Any uploaded images or videos are STYLE HINTS ONLY — use them strictly to inform aesthetic choices like cinematography, color palette, lighting quality, mood, pacing, or art-direction tone. Do NOT describe the contents of the references as if they were the literal scene. Do NOT copy specific people, products, locations, or objects from the references. Write a full text-to-video prompt covering subject, action, environment, and camera motion, with the references quietly shaping the visual style.",
};

const TARGET_NAMES: Record<OutputTarget, string> = {
  nano_banana: "Google Nano Banana (accessed via RunwayML or Google's tools)",
  veo: "Google Veo (accessed via RunwayML)",
  gen4_5: "Runway Gen 4.5 (Runway's native video generation model, accessed via RunwayML)",
  firefly: "Adobe Firefly (used in the Firefly web app or Photoshop)",
  gpt_image: "OpenAI GPT Image (accessed via ChatGPT on the web)",
  seedance: "Seedance 2.0 (accessed via Higgsfield AI at higgsfield.ai)",
  flux2: "Black Forest Labs FLUX.2 (image generation — prose-style prompts with industry-leading text rendering)",
  kling: "Kuaishou Kling (video generation — strong on action, anime, and first/last-frame keyframing)",
  gemini_image: "Google Gemini Image (conversational multimodal image generation with strong text rendering)",
};

const TARGET_SHORT: Record<OutputTarget, string> = {
  nano_banana: "Nano Banana",
  veo: "Veo",
  gen4_5: "Runway Gen 4.5",
  firefly: "Adobe Firefly",
  gpt_image: "GPT Image",
  seedance: "Seedance 2.0",
  flux2: "FLUX.2",
  kling: "Kling",
  gemini_image: "Gemini Image",
};

function isAudioRule(text: string): boolean {
  return /\baudio\b|\bsound\b|\bdialogue\b|\bsubtitles\b|\bsoundscape\b|\bfoley\b/i.test(text);
}

function renderVocabulary(vocab: Record<string, string[]>): string {
  const lines: string[] = [];
  for (const [key, values] of Object.entries(vocab)) {
    if (!values?.length) continue;
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    lines.push(`${label}: ${values.join(", ")}`);
  }
  return lines.join("\n");
}

function renderExamples(examples: TargetExample[]): string {
  return examples
    .map(
      (ex, i) =>
        `Example ${i + 1}:\nInstruction: "${ex.instruction}"\nGood output: "${ex.good_output}"\nWhy this works: ${ex.why}`
    )
    .join("\n\n");
}

export function buildSystemPrompt(
  mode: Mode,
  outputTarget: OutputTarget,
  hasPaintedImages: boolean,
  includeAudio: boolean,
  brandContext?: {
    notes: string;
    textContent: string;
    voice?: BrandVoice;
    visual?: BrandVisual;
    legal?: BrandLegal;
    hasStyleImages?: boolean;
  },
  charBudget?: number
): string {
  const rules = loadRules();
  const targetFull = TARGET_NAMES[outputTarget];
  const targetShort = TARGET_SHORT[outputTarget];
  const target = rules.targets[TARGET_RULE_KEY[outputTarget]];

  // Veo-specific audio handling: when audio is disabled, strip audio mentions
  // from must_include and rules so they don't conflict with the explicit "no audio" instruction.
  let mustInclude = target.must_include;
  let detailedRules = target.rules;
  if (outputTarget === "veo" && !includeAudio) {
    mustInclude = mustInclude.filter((r) => !isAudioRule(r));
    detailedRules = detailedRules.filter((r) => !isAudioRule(r));
    detailedRules = [
      ...detailedRules,
      "Do NOT include any audio, sound design, dialogue, or soundtrack cues in the prompt — the user will handle audio separately",
    ];
  }

  const charLimit = getCharLimit(outputTarget);
  const effectiveHard = charBudget
    ? Math.min(charBudget, charLimit.hard)
    : charLimit.hard;
  const effectiveSoft = charBudget
    ? `${Math.round(effectiveHard * 0.85)}–${effectiveHard} characters`
    : charLimit.soft;

  let systemPrompt = `You are an expert prompt engineer. The user will generate the final output directly inside this app's built-in generator, which routes the prompt to the ${targetFull} model. Your sole job is to write one single polished prompt that will be sent verbatim to that model.

Output ONLY the prompt — no preamble, no explanation, no markdown formatting, no quotes around the prompt, no labels.

## Length target (use the full budget)
Aim for ${effectiveSoft}. The interface enforces a ${effectiveHard}-character hard ceiling — stay under it, but DO use most of the available room. A short, sparse prompt is a FAILURE: this model accepts ${effectiveHard} characters because rich, specific detail produces better generations.

Pack the prompt with concrete, named detail across every dimension the format calls for: subject (materials, surfaces, micro-textures, wear, age, posture, expression), environment (architecture, props, weather, time of day, atmospheric haze, depth cues), lighting (source, direction, quality, color temperature, contrast, shadow shape), composition (framing, camera height, lens, depth of field, foreground/midground/background layering), and style (medium, mood, color palette, era references where allowed by platform rules). Every clause should add information the generator can act on; only cut a word if it is a true filler ("very", "really", "somewhat") or a duplicate of something already stated.

## Output format
${target.output_format}

## What the user is trying to do (mode)
${MODE_DESCRIPTIONS[mode]}

## Required structure (your prompt MUST instantiate this template)
${target.skeleton}

## Must include (every prompt has all of these)
${mustInclude.map((r) => `- ${r}`).join("\n")}

## Anti-patterns (NEVER do these — they are known failure modes for this model)
${target.must_avoid.map((r) => `- ${r}`).join("\n")}

## Vocabulary (prefer these exact terms over synonyms)
${renderVocabulary(target.vocabulary)}

## Examples of strong prompts for ${targetShort}
${renderExamples(target.examples)}

## Universal rules (apply to all prompts)
${rules.global_rules.map((r) => `- ${r}`).join("\n")}

## Detailed ${targetShort} rules (apply alongside the structure above)
${detailedRules.map((r) => `- ${r}`).join("\n")}`;

  if (hasPaintedImages) {
    systemPrompt += `\n\n## User-highlighted areas
The user has painted colored brush strokes (typically magenta) on one or more uploaded images to mark the areas they want you to focus on. Treat those highlighted regions as the subject of the edit/animation. Describe ONLY what should happen in those marked areas; ignore unmarked regions unless they are essential context. The colored strokes themselves are annotations — do not mention or describe the strokes in the output prompt.`;
  }

  if (mode === "video_backdrop") {
    systemPrompt += `\n\n## Video Backdrop — multi-clip output format (OVERRIDES the single-prompt instruction above)
You are generating background/environment prompts for Runway's Video Backdrop feature.

CRITICAL REQUIREMENTS:
1. Generate exactly ONE background prompt for EACH uploaded image/clip — number them to match the upload order.
2. ALL prompts MUST describe the EXACT same environment, location, spatial layout, and atmosphere so the final clips look like they were shot in one continuous location.
3. Each prompt describes ONLY the background/environment — never describe the foreground subject (person, object). Runway keeps the subject; you are replacing everything behind it.
4. Analyze each clip's subject lighting (direction, color temperature, intensity) and adapt the environment's lighting to match naturally, but keep the environment itself identical across clips.
5. Be specific about surfaces, materials, depth, and spatial cues so the backdrop looks physically grounded — not like a flat wallpaper.
6. Each individual prompt should aim for ${effectiveSoft} — use the full budget for rich descriptive detail without exceeding the ${effectiveHard}-character hard limit.

OUTPUT FORMAT — follow exactly:
===CLIP 1===
[background prompt for clip 1]

===CLIP 2===
[background prompt for clip 2]

(continue for each clip)

Output ONLY the clip markers and prompts. No preamble, no explanation, no other text.`;
  }

  if (mode === "place_product") {
    systemPrompt += `\n\n## PRODUCT PRESERVATION — NON-NEGOTIABLE
The primary image shows the product exactly as it must appear in the final output. The written prompt must describe placing this product into a scene — it must NEVER suggest, imply, or instruct any change to the product itself.

Preserve without exception:
- Shape and silhouette — do not alter proportions, form, or outline
- Color — exact hues, values, and finishes (matte, gloss, metallic, transparent)
- Surface texture and material — packaging substrate, label paper, container material
- Logo, wordmark, and typographic elements — position, size, color, and rendering
- Graphic elements — illustrations, patterns, iconography, barcodes, regulatory marks
- Structural details — caps, closures, seams, embossing, debossing, cutouts

The only things that may differ are the ENVIRONMENT (background, surface, lighting, atmosphere) and the COMPOSITION (where the product sits in the frame). The product itself is immutable — treat it as a fixed asset being photographed, not redesigned.`;
  }

  if (brandContext) {
    const sections = renderBrandSections(brandContext);
    if (sections) {
      systemPrompt += `\n\n## Brand context (incorporate this into the prompt)${sections}\n\nThe generated prompt must reflect this brand's visual identity, tone, and any do's/don'ts specified above — while still respecting the length constraint above.`;
    }
  }

  return systemPrompt;
}

function renderBrandSections(ctx: {
  notes: string;
  textContent: string;
  voice?: BrandVoice;
  visual?: BrandVisual;
  legal?: BrandLegal;
  hasStyleImages?: boolean;
}): string {
  const out: string[] = [];

  if (ctx.voice) {
    const v = ctx.voice;
    const lines: string[] = [];
    if (v.tone_keywords?.length) lines.push(`Tone: ${v.tone_keywords.join(", ")}`);
    if (v.description) lines.push(`Voice: ${v.description}`);
    if (v.dos?.length) lines.push(`Do:\n${v.dos.map((d) => `  - ${d}`).join("\n")}`);
    if (v.donts?.length) lines.push(`Don't:\n${v.donts.map((d) => `  - ${d}`).join("\n")}`);
    if (lines.length) out.push(`### Voice & tone\n${lines.join("\n")}`);
  }

  if (ctx.visual) {
    const v = ctx.visual;
    const lines: string[] = [];
    if (v.color_palette?.length) lines.push(`Color palette: ${v.color_palette.join(", ")}`);
    if (v.typography_notes) lines.push(`Typography: ${v.typography_notes}`);
    if (v.photography_style) lines.push(`Photography style: ${v.photography_style}`);
    if (v.composition_rules) lines.push(`Composition: ${v.composition_rules}`);
    if (lines.length) out.push(`### Visual identity\n${lines.join("\n")}`);
  }

  if (ctx.legal) {
    const l = ctx.legal;
    const lines: string[] = [];
    if (l.banned_words?.length) lines.push(`Never use these words/phrases: ${l.banned_words.join(", ")}`);
    if (l.claims_to_avoid?.length) lines.push(`Avoid these claims:\n${l.claims_to_avoid.map((d) => `  - ${d}`).join("\n")}`);
    if (l.required_disclaimers?.length) lines.push(`Required disclaimers:\n${l.required_disclaimers.map((d) => `  - ${d}`).join("\n")}`);
    if (lines.length) out.push(`### Taboos & legal\n${lines.join("\n")}`);
  }

  if (ctx.notes?.trim()) {
    out.push(`### Notes\n${ctx.notes.trim()}`);
  }

  if (ctx.textContent?.trim()) {
    out.push(`### Reference material from brand files\n${ctx.textContent.trim()}`);
  }

  if (ctx.hasStyleImages) {
    out.push(`### Style references\nStyle reference images are attached below. Treat them as visual style hints — palette, lighting, photography style, composition — but do NOT copy specific subjects from them into the prompt.`);
  }

  if (out.length === 0) return "";
  return "\n\n" + out.join("\n\n");
}
