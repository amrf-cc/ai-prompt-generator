import { NextRequest } from "next/server";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { buildSystemPrompt, getRulesHash, hashSystemPrompt } from "@/lib/prompt-builder";
import { getBrandContext } from "@/lib/brands";
import { saveToHistory } from "@/lib/db";
import { compressImageBase64 } from "@/lib/image-compress";
import { CONFIG_DIR } from "@/lib/paths";
import { requireUser } from "@/lib/auth-helpers";
import { listProducts, getProductFile } from "@/lib/products";
import { pickProductImages, type ProductPick } from "@/lib/product-picker";
import { createOpenRouterClient } from "@/lib/openrouter";
import { mimeTypeForExt } from "@/lib/mime";
import type { Mode, OutputTarget, Creator, ModelPreferences, ProductAsset } from "@/lib/types";
import { getDefaultTarget } from "@/lib/types";

function loadModelPrefs(): ModelPreferences {
  const prefsPath = path.join(CONFIG_DIR, "model-preferences.json");
  return JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
}

export async function POST(request: NextRequest) {
  try {
    return await handleGenerate(request);
  } catch (err) {
    // Catch-all: anything thrown above the streaming Response (request body
    // parse failure, image compression, prompt builder, brand context I/O,
    // unexpected runtime error) becomes a clean JSON error so the frontend
    // never has to parse an empty body.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/generate] uncaught:", err);
    return Response.json(
      { error: `Generation failed: ${message}` },
      { status: 500 }
    );
  }
}

async function handleGenerate(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const apiKey = process.env.OPENROUTER_API_KEY;
  const prefs = loadModelPrefs();

  const body = await request.json();
  const {
    mode,
    creator,
    outputTarget: clientOutputTarget,
    brandSlug,
    instruction,
    primaryImages,
    referenceImages,
    hasPaintedImages,
    includeAudio,
    selectedModel,
    charBudget,
    selectedProductIds,
  } = body as {
    mode: Mode;
    creator?: string;
    outputTarget?: OutputTarget;
    brandSlug: string | null;
    instruction: string;
    primaryImages: { base64: string; mimeType: string; sourceUrl?: string }[];
    referenceImages: { base64: string; mimeType: string; sourceUrl?: string }[];
    hasPaintedImages?: boolean;
    includeAudio?: boolean;
    selectedModel?: string;
    charBudget?: number;
    selectedProductIds?: string[];
  };

  if (!apiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not set in .env.local" },
      { status: 500 }
    );
  }

  if (!instruction) {
    return Response.json(
      { error: "Instruction is required" },
      { status: 400 }
    );
  }

  // Resolve selected products → assets, pick best image per product based on instruction.
  // List the brand's products once and look ids up in a Map (getProduct would
  // re-scan the whole products dir per id).
  const selectedProducts: ProductAsset[] = [];
  if (brandSlug && Array.isArray(selectedProductIds) && selectedProductIds.length > 0) {
    const byId = new Map(listProducts(brandSlug).map((p) => [p.id, p]));
    for (const id of selectedProductIds) {
      if (typeof id !== "string") continue;
      const p = byId.get(id);
      if (p && p.images.length > 0) selectedProducts.push(p);
    }
  }

  let productPicks: ProductPick[] = [];
  if (selectedProducts.length > 0) {
    productPicks = await pickProductImages(
      selectedProducts,
      instruction,
      apiKey,
      prefs.product_picker_model ?? "google/gemini-2.5-flash-lite"
    );
  }

  // Load picked product images from disk → base64 so they can be sent to the model
  const productPrimaryImages: { base64: string; mimeType: string }[] = [];
  for (const pick of productPicks) {
    const product = selectedProducts.find((p) => p.id === pick.productId);
    if (!product) continue;
    const file = getProductFile(product.brandSlug, pick.filename);
    if (!file) continue;
    productPrimaryImages.push({
      base64: file.buffer.toString("base64"),
      mimeType: mimeTypeForExt(file.ext),
    });
  }

  const combinedPrimary = [...productPrimaryImages, ...(primaryImages ?? [])];

  const isTextToMode = mode === "text_to_image" || mode === "text_to_video";
  if (!isTextToMode && combinedPrimary.length === 0) {
    return Response.json(
      { error: "At least one primary image is required" },
      { status: 400 }
    );
  }

  const resolvedCreator = (creator ?? "google") as Creator;
  const outputTarget: OutputTarget =
    clientOutputTarget ?? getDefaultTarget(resolvedCreator, mode);

  const brandCtx = brandSlug ? await getBrandContext(brandSlug) : undefined;

  let systemPrompt = buildSystemPrompt(
    mode,
    outputTarget,
    Boolean(hasPaintedImages),
    Boolean(includeAudio),
    brandCtx
      ? {
          notes: brandCtx.notes,
          textContent: brandCtx.textContent,
          voice: brandCtx.voice,
          visual: brandCtx.visual,
          legal: brandCtx.legal,
          hasStyleImages: (brandCtx.styleImages?.length ?? 0) > 0,
        }
      : undefined,
    charBudget
  );

  if (selectedProducts.length > 1) {
    const names = selectedProducts.map((p) => `"${p.name}"`).join(", ");
    systemPrompt += `\n\n## Multi-product composition (REQUIRED)
The user selected ${selectedProducts.length} products: ${names}. The first ${selectedProducts.length} primary images attached are these products (in upload order). The final image MUST include ALL of these products together in a single cohesive composition. Describe how they relate spatially (placement, scale, foreground/background) and ensure each product is clearly visible and identifiable. Preserve each product's appearance exactly as shown — do not alter shape, color, packaging, logos, or labels.`;
  } else if (selectedProducts.length === 1) {
    const pick = productPicks[0];
    if (pick) {
      systemPrompt += `\n\n## Selected product reference
The first primary image attached is "${selectedProducts[0].name}" (variant: "${pick.label}"${pick.description ? ` — ${pick.description}` : ""}). Treat this product as the immutable subject of the composition: preserve its shape, color, packaging, logos, and labels exactly as shown.`;
    }
  }

  const rulesHash = getRulesHash();
  const systemPromptHash = hashSystemPrompt(systemPrompt);

  const processImage = (img: { base64: string; mimeType: string }) =>
    compressImageBase64(img.base64);

  const userContent: OpenAI.ChatCompletionContentPart[] = [];

  // Compress a group of images concurrently (sharp is CPU-bound; awaiting each
  // serially would block for the sum of all encodes), then append in order.
  const pushImages = async (images: { base64: string; mimeType: string }[]) => {
    const processed = await Promise.all(images.map(processImage));
    for (const p of processed) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${p.mimeType};base64,${p.base64}` },
      });
    }
  };

  if (combinedPrimary.length > 0) {
    userContent.push({
      type: "text",
      text: isTextToMode
        ? "=== Style references (do NOT copy contents — use only as visual style hints) ==="
        : "=== Images to edit/animate ===",
    });
    await pushImages(combinedPrimary);
  }

  if (referenceImages?.length > 0) {
    // Split URL-derived (mood-board-like) references from uploaded files so the
    // model treats scraped sets like Pinterest boards as loose visual cues
    // rather than literal scene references.
    const refFileImages = referenceImages.filter((i) => !i.sourceUrl);
    const refUrlImages = referenceImages.filter((i) => i.sourceUrl);

    if (refFileImages.length > 0) {
      userContent.push({
        type: "text",
        text: "=== Style/scene references ===",
      });
      await pushImages(refFileImages);
    }

    if (refUrlImages.length > 0) {
      userContent.push({
        type: "text",
        text: "=== Mood references (loose visual cues only — palette, lighting, atmosphere; do NOT literally describe individual images or copy their subjects into the prompt) ===",
      });
      await pushImages(refUrlImages);
    }
  }

  if (brandCtx?.imageFiles?.length) {
    userContent.push({
      type: "text",
      text: "=== Brand reference images ===",
    });
    await pushImages(brandCtx.imageFiles);
  }

  if (brandCtx?.styleImages?.length) {
    userContent.push({
      type: "text",
      text: "=== Brand style references (visual style hints only — do not copy subjects from these into the prompt) ===",
    });
    await pushImages(brandCtx.styleImages);
  }

  userContent.push({
    type: "text",
    text: `=== User instruction ===\n${instruction}`,
  });

  const baseModels = prefs.openrouter_models;
  const models = selectedModel
    ? [{ id: selectedModel, name: selectedModel }, ...baseModels.filter((m) => m.id !== selectedModel)]
    : baseModels;
  const CONNECT_TIMEOUT = 300_000; // 5 minutes
  let lastError: string = "";

  for (const model of models) {
    const modelLabel = model.id;
    try {
      const client = createOpenRouterClient(apiKey);

      const createParams: OpenAI.ChatCompletionCreateParamsStreaming = {
        model: model.id,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        stream: true,
      };

      // Race the initial connection against a timeout
      const stream = await Promise.race([
        client.chat.completions.create(createParams),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), CONNECT_TIMEOUT)
        ),
      ]);

      let fullResponse = "";
      let receivedFirstChunk = false;

      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            // Send an initial "connecting" event so the UI knows which model is active
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ status: "connected", model: modelLabel })}\n\n`)
            );

            if (productPicks.length > 0) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ productPicks })}\n\n`
                )
              );
            }

            for await (const chunk of stream) {
              receivedFirstChunk = true;
              const text = chunk.choices[0]?.delta?.content || "";
              if (text) {
                fullResponse += text;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text, model: modelLabel })}\n\n`)
                );
              }
            }

            if (!receivedFirstChunk || !fullResponse.trim()) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ error: `${modelLabel} returned an empty response` })}\n\n`)
              );
              controller.close();
              return;
            }

            let historyId: number | null = null;
            try {
              const result = saveToHistory({
                mode,
                output_target: outputTarget,
                brand_slug: brandSlug,
                instruction,
                generated_prompt: fullResponse,
                image_paths: [],
                model_used: modelLabel,
                rules_hash: rulesHash,
                system_prompt_hash: systemPromptHash,
                created_by: auth.user.email,
              });
              historyId = result.lastInsertRowid as number;
            } catch {
              // History save failure is non-critical
            }

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ done: true, model: modelLabel, historyId })}\n\n`
              )
            );
            controller.close();
          } catch (err) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: String(err) })}\n\n`
              )
            );
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = `${modelLabel}: ${message}`;
      continue;
    }
  }

  return Response.json(
    {
      error: `All models failed. Last error: ${lastError}`,
    },
    { status: 502 }
  );
}
