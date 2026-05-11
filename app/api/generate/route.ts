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
import type { Mode, OutputTarget, Software, ModelPreferences } from "@/lib/types";
import { getDefaultTarget } from "@/lib/types";

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
    software,
    outputTarget: clientOutputTarget,
    brandSlug,
    instruction,
    primaryImages,
    referenceImages,
    hasPaintedImages,
    includeAudio,
    selectedModel,
  } = body as {
    mode: Mode;
    software?: Software;
    outputTarget?: OutputTarget;
    brandSlug: string | null;
    instruction: string;
    primaryImages: { base64: string; mimeType: string; sourceUrl?: string }[];
    referenceImages: { base64: string; mimeType: string; sourceUrl?: string }[];
    hasPaintedImages?: boolean;
    includeAudio?: boolean;
    selectedModel?: string;
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

  const isTextToMode = mode === "text_to_image" || mode === "text_to_video";
  if (!isTextToMode && !primaryImages?.length) {
    return Response.json(
      { error: "At least one primary image is required" },
      { status: 400 }
    );
  }

  const resolvedSoftware: Software = software ?? "other";
  const outputTarget: OutputTarget =
    clientOutputTarget ?? getDefaultTarget(resolvedSoftware, mode);

  const brandCtx = brandSlug ? await getBrandContext(brandSlug) : undefined;

  const systemPrompt = buildSystemPrompt(
    mode,
    outputTarget,
    resolvedSoftware,
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
      : undefined
  );

  const rulesHash = getRulesHash();
  const systemPromptHash = hashSystemPrompt(systemPrompt);

  const processImage = (img: { base64: string; mimeType: string }) =>
    compressImageBase64(img.base64);

  const userContent: OpenAI.ChatCompletionContentPart[] = [];

  if (primaryImages?.length > 0) {
    userContent.push({
      type: "text",
      text: isTextToMode
        ? "=== Style references (do NOT copy contents — use only as visual style hints) ==="
        : "=== Images to edit/animate ===",
    });
    for (const img of primaryImages) {
      const processed = await processImage(img);
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${processed.mimeType};base64,${processed.base64}`,
        },
      });
    }
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
      for (const img of refFileImages) {
        const processed = await processImage(img);
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${processed.mimeType};base64,${processed.base64}`,
          },
        });
      }
    }

    if (refUrlImages.length > 0) {
      userContent.push({
        type: "text",
        text: "=== Mood references (loose visual cues only — palette, lighting, atmosphere; do NOT literally describe individual images or copy their subjects into the prompt) ===",
      });
      for (const img of refUrlImages) {
        const processed = await processImage(img);
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${processed.mimeType};base64,${processed.base64}`,
          },
        });
      }
    }
  }

  if (brandCtx?.imageFiles?.length) {
    userContent.push({
      type: "text",
      text: "=== Brand reference images ===",
    });
    for (const img of brandCtx.imageFiles) {
      const processed = await processImage(img);
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${processed.mimeType};base64,${processed.base64}`,
        },
      });
    }
  }

  if (brandCtx?.styleImages?.length) {
    userContent.push({
      type: "text",
      text: "=== Brand style references (visual style hints only — do not copy subjects from these into the prompt) ===",
    });
    for (const img of brandCtx.styleImages) {
      const processed = await processImage(img);
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${processed.mimeType};base64,${processed.base64}`,
        },
      });
    }
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
      const client = createClient(apiKey);

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
