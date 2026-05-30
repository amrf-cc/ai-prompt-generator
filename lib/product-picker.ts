import OpenAI from "openai";
import type { ProductAsset, ProductImage } from "./types";
import { createOpenRouterClient } from "./openrouter";

export interface ProductPick {
  productId: string;
  productName: string;
  filename: string;
  label: string;
  description?: string;
  reason: string;
  /** True when the pick came from the LLM; false when we defaulted (single image or failure). */
  picked: boolean;
}

function defaultPick(product: ProductAsset, reason: string): ProductPick {
  const img = product.images[0];
  return {
    productId: product.id,
    productName: product.name,
    filename: img.filename,
    label: img.label,
    description: img.description,
    reason,
    picked: false,
  };
}

function buildPickerPrompt(
  product: ProductAsset,
  instruction: string
): { system: string; user: string } {
  const options = product.images
    .map((img, i) => {
      const lines = [`${i + 1}. label="${img.label}"`];
      if (img.description) lines.push(`   description: ${img.description}`);
      lines.push(`   filename: ${img.filename}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const system = `You pick the single best reference image of a product to use as visual input for an AI image-generation prompt.

Rules:
- Given the user's request and a list of available images (each with a short label and optional description), choose the ONE image that best matches what the user wants to do.
- Return ONLY a JSON object with two fields: { "index": <1-based number>, "reason": "<short reason in <= 15 words>" }
- Do not output any other text — no markdown, no preamble, no code fences.
- If the request doesn't clearly favor any image, default to image 1.`;

  const user = `Product: ${product.name}

Available images:
${options}

User request: "${instruction.trim()}"

Pick the best image. Output JSON only.`;

  return { system, user };
}

interface PickerResponse {
  index: number;
  reason: string;
}

function parsePickerOutput(raw: string, max: number): PickerResponse | null {
  if (!raw) return null;
  const text = raw.trim();
  // Try direct JSON
  const candidates = [
    text,
    // Strip code fences if present
    text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, ""),
  ];
  // Also try the first {...} block
  const match = text.match(/\{[\s\S]*\}/);
  if (match) candidates.push(match[0]);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as { index?: unknown; reason?: unknown };
      const idx = Number(parsed.index);
      const reason = typeof parsed.reason === "string" ? parsed.reason : "";
      if (Number.isInteger(idx) && idx >= 1 && idx <= max) {
        return { index: idx, reason };
      }
    } catch {
      // continue
    }
  }
  return null;
}

async function pickOne(
  client: OpenAI,
  modelId: string,
  product: ProductAsset,
  instruction: string
): Promise<ProductPick> {
  if (product.images.length === 0) {
    return defaultPick(product, "no images available");
  }
  if (product.images.length === 1) {
    return defaultPick(product, "only one image available");
  }
  const { system, user } = buildPickerPrompt(product, instruction);
  try {
    const res = await client.chat.completions.create({
      model: modelId,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      max_tokens: 120,
    });
    const raw = res.choices[0]?.message?.content ?? "";
    const parsed = parsePickerOutput(raw, product.images.length);
    if (!parsed) {
      return defaultPick(product, "picker output unparseable; defaulted to first image");
    }
    const chosen: ProductImage = product.images[parsed.index - 1];
    return {
      productId: product.id,
      productName: product.name,
      filename: chosen.filename,
      label: chosen.label,
      description: chosen.description,
      reason: parsed.reason || "selected by AI",
      picked: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return defaultPick(product, `picker failed (${msg.slice(0, 80)}); defaulted to first image`);
  }
}

/**
 * Pick the best image for each product given the user's instruction.
 * Runs picks in parallel. Always returns one pick per input product.
 */
export async function pickProductImages(
  products: ProductAsset[],
  instruction: string,
  apiKey: string,
  modelId: string
): Promise<ProductPick[]> {
  if (products.length === 0) return [];
  const client = createOpenRouterClient(apiKey);
  return Promise.all(products.map((p) => pickOne(client, modelId, p, instruction)));
}
