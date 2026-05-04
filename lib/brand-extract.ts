import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { compressImageBase64 } from "./image-compress";
import { getBrandPdfText, getStyleImagesAsBase64 } from "./brands";
import type { BrandExtractField, BrandLegal, BrandVisual, BrandVoice, ModelPreferences } from "./types";
import { CONFIG_DIR } from "./paths";

const SYSTEM_PROMPT = `You are an expert brand strategist. Given (a) the text of a brand's guidelines document and (b) a set of style-reference images, extract a structured JSON description of the brand.

Be concrete and specific. Use the brand's own language where possible. Never invent things the materials don't support — if a section is not covered, return empty arrays / empty strings rather than guessing.

Return ONLY a JSON object — no prose, no markdown fences.`;

const SCHEMA_DESCRIPTIONS: Record<BrandExtractField, string> = {
  voice: `{
  "tone_keywords": string[]      // 3-8 short adjectives, e.g. ["playful", "confident", "warm"]
  "description": string          // 2-4 sentences describing how the brand sounds in writing
  "dos":  string[]               // 3-8 concrete writing/voice rules to follow
  "donts": string[]              // 3-8 concrete writing/voice rules to avoid
}`,
  visual: `{
  "color_palette": string[]      // hex codes only, e.g. ["#1A1A1A", "#FF6A00"]
  "typography_notes": string     // 1-3 sentences about typefaces, weights, hierarchy
  "photography_style": string    // 1-3 sentences describing how images should look (lighting, composition, mood)
  "composition_rules": string    // 1-3 sentences about layout, spacing, hero treatment
}`,
  legal: `{
  "banned_words": string[]       // words/phrases never to use
  "claims_to_avoid": string[]    // marketing claims that are forbidden or risky
  "required_disclaimers": string[] // boilerplate that MUST appear
}`,
};

const ALL_FIELDS_SCHEMA = `{
  "voice": ${SCHEMA_DESCRIPTIONS.voice},
  "visual": ${SCHEMA_DESCRIPTIONS.visual},
  "legal": ${SCHEMA_DESCRIPTIONS.legal}
}`;

function loadModelPrefs(): ModelPreferences {
  const prefsPath = path.join(CONFIG_DIR, "model-preferences.json");
  return JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
}

function createClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "AI Prompt Generator",
    },
  });
}

function buildUserContent(
  pdfText: string,
  styleImages: { base64: string; mimeType: string }[],
  schema: string
): OpenAI.ChatCompletionContentPart[] {
  const parts: OpenAI.ChatCompletionContentPart[] = [];

  if (pdfText.trim()) {
    parts.push({
      type: "text",
      text: `=== Brand guidelines text ===\n${pdfText.slice(0, 60_000)}`,
    });
  } else {
    parts.push({
      type: "text",
      text: "=== Brand guidelines text ===\n(no PDF or text guidelines provided — rely on style images)",
    });
  }

  if (styleImages.length > 0) {
    parts.push({ type: "text", text: "=== Style reference images ===" });
    for (const img of styleImages) {
      parts.push({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      });
    }
  }

  parts.push({
    type: "text",
    text: `Return a JSON object matching this exact schema:\n${schema}\n\nReturn ONLY the JSON.`,
  });
  return parts;
}

function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(trimmed);
}

async function callExtract(
  pdfText: string,
  styleImages: { base64: string; mimeType: string }[],
  schema: string
): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const prefs = loadModelPrefs();
  const model = prefs.openrouter_models[0]?.id;
  if (!model) throw new Error("No models configured");

  const client = createClient(apiKey);
  const userContent = buildUserContent(pdfText, styleImages, schema);

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content ?? "";
  if (!text) throw new Error("Empty response from model");

  try {
    return tryParseJson(text);
  } catch (parseErr) {
    // One repair retry: ask the model to fix the JSON.
    const repair = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Return ONLY valid JSON. No prose." },
        {
          role: "user",
          content: `The following was supposed to be JSON matching this schema:\n${schema}\n\nBut it failed to parse with: ${(parseErr as Error).message}\n\nHere is the text:\n${text}\n\nReturn ONLY the corrected JSON object.`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const repairedText = repair.choices[0]?.message?.content ?? "";
    return tryParseJson(repairedText);
  }
}

async function loadInputs(slug: string): Promise<{
  pdfText: string;
  styleImages: { base64: string; mimeType: string }[];
}> {
  const pdfText = await getBrandPdfText(slug);
  const rawStyle = getStyleImagesAsBase64(slug);
  const styleImages: { base64: string; mimeType: string }[] = [];
  for (const img of rawStyle) {
    const compressed = await compressImageBase64(img.base64);
    styleImages.push({ base64: compressed.base64, mimeType: compressed.mimeType });
  }
  return { pdfText, styleImages };
}

export async function extractAllFields(slug: string): Promise<{
  voice?: BrandVoice;
  visual?: BrandVisual;
  legal?: BrandLegal;
}> {
  const { pdfText, styleImages } = await loadInputs(slug);
  if (!pdfText.trim() && styleImages.length === 0) {
    throw new Error("Need a brand-guidelines PDF or at least one style image to extract.");
  }
  const parsed = await callExtract(pdfText, styleImages, ALL_FIELDS_SCHEMA);
  return validateAll(parsed);
}

export async function extractField(
  slug: string,
  field: BrandExtractField
): Promise<BrandVoice | BrandVisual | BrandLegal> {
  const { pdfText, styleImages } = await loadInputs(slug);
  if (!pdfText.trim() && styleImages.length === 0) {
    throw new Error("Need a brand-guidelines PDF or at least one style image to extract.");
  }
  const wrapped = `{ "${field}": ${SCHEMA_DESCRIPTIONS[field]} }`;
  const parsed = await callExtract(pdfText, styleImages, wrapped);
  return validateField(parsed, field);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function validateAll(raw: unknown): {
  voice?: BrandVoice;
  visual?: BrandVisual;
  legal?: BrandLegal;
} {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    voice: r.voice ? coerceVoice(r.voice) : undefined,
    visual: r.visual ? coerceVisual(r.visual) : undefined,
    legal: r.legal ? coerceLegal(r.legal) : undefined,
  };
}

function validateField(
  raw: unknown,
  field: BrandExtractField
): BrandVoice | BrandVisual | BrandLegal {
  if (!raw || typeof raw !== "object") {
    throw new Error("Model did not return a JSON object");
  }
  const r = raw as Record<string, unknown>;
  const inner = r[field] ?? r;
  if (field === "voice") return coerceVoice(inner);
  if (field === "visual") return coerceVisual(inner);
  return coerceLegal(inner);
}

function coerceVoice(v: unknown): BrandVoice {
  const r = (v ?? {}) as Record<string, unknown>;
  return {
    tone_keywords: asStringArray(r.tone_keywords),
    description: asString(r.description),
    dos: asStringArray(r.dos),
    donts: asStringArray(r.donts),
  };
}

function coerceVisual(v: unknown): BrandVisual {
  const r = (v ?? {}) as Record<string, unknown>;
  const palette = asStringArray(r.color_palette).map((s) => s.toUpperCase()).filter((s) => /^#?[0-9A-F]{3,8}$/i.test(s)).map((s) => (s.startsWith("#") ? s : `#${s}`));
  return {
    color_palette: palette,
    typography_notes: asString(r.typography_notes),
    photography_style: asString(r.photography_style),
    composition_rules: asString(r.composition_rules),
  };
}

function coerceLegal(v: unknown): BrandLegal {
  const r = (v ?? {}) as Record<string, unknown>;
  return {
    banned_words: asStringArray(r.banned_words),
    claims_to_avoid: asStringArray(r.claims_to_avoid),
    required_disclaimers: asStringArray(r.required_disclaimers),
  };
}
