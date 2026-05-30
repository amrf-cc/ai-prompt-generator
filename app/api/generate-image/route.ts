import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { computeCost } from "@/lib/pricing";
import { insertMediaGeneration } from "@/lib/db";
import { getProductFile } from "@/lib/products";
import { createOpenRouterClient } from "@/lib/openrouter";
import { mimeTypeForExt } from "@/lib/mime";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENROUTER_API_KEY not set" }, { status: 500 });
    }

    const body = await request.json();
    const {
      model,
      prompt,
      aspectRatio = "1:1",
      imageSize = "1K",
      imageOnly = false,
      primaryImages = [],
      productPicks = [],
      brandSlug = null,
      historyId = null,
    } = body as {
      model: string;
      prompt: string;
      aspectRatio?: string;
      imageSize?: string;
      imageOnly?: boolean;
      primaryImages?: { base64: string; mimeType: string }[];
      productPicks?: { productId: string; filename: string }[];
      brandSlug?: string | null;
      historyId?: number | null;
    };

    if (!model || !prompt) {
      return Response.json({ error: "model and prompt are required" }, { status: 400 });
    }

    // Load picked product images from disk and prepend them as references so the
    // image model sees the actual product, not just the text description of it.
    const productImages: { base64: string; mimeType: string }[] = [];
    if (brandSlug && productPicks.length > 0) {
      for (const pick of productPicks) {
        if (!pick?.filename) continue;
        const file = getProductFile(brandSlug, pick.filename);
        if (!file) continue;
        productImages.push({
          base64: file.buffer.toString("base64"),
          mimeType: mimeTypeForExt(file.ext),
        });
      }
    }

    const client = createOpenRouterClient(apiKey);

    type ContentPart =
      | { type: "image_url"; image_url: { url: string } }
      | { type: "text"; text: string };

    const content: ContentPart[] = [];
    for (const img of [...productImages, ...primaryImages]) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      });
    }
    content.push({ type: "text", text: prompt });

    const response = await (client.chat.completions.create as Function)({
      model,
      messages: [{ role: "user", content }],
      modalities: imageOnly ? ["image"] : ["image", "text"],
      image_config: { aspect_ratio: aspectRatio, image_size: imageSize },
      usage: { include: true },
    });

    const message = response.choices?.[0]?.message as Record<string, unknown> | undefined;
    const images = message?.images as { image_url?: { url: string } }[] | undefined;

    if (!images || images.length === 0) {
      return Response.json({ error: "No image returned from model" }, { status: 502 });
    }

    const url = images[0].image_url?.url;
    if (!url) {
      return Response.json({ error: "Image URL missing in response" }, { status: 502 });
    }

    const usage = response.usage as
      | { prompt_tokens?: number; completion_tokens?: number; cost?: number }
      | undefined;
    const providerCost =
      typeof usage?.cost === "number" ? usage.cost : null;

    const breakdown = computeCost(
      {
        modelId: model,
        aspectRatio,
        imageSize,
        imageCount: 1,
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
      },
      providerCost
    );

    try {
      insertMediaGeneration({
        kind: "image",
        brand_slug: brandSlug,
        model_id: model,
        prompt,
        history_id: historyId,
        aspect_ratio: aspectRatio,
        image_size: imageSize,
        image_count: 1,
        input_tokens: usage?.prompt_tokens ?? null,
        output_tokens: usage?.completion_tokens ?? null,
        cost_usd: breakdown.totalUsd,
        cost_source: breakdown.source,
        cost_components: breakdown.components,
        status: "success",
        result_url: url,
        created_by: auth.user.email,
      });
    } catch (e) {
      console.error("[/api/generate-image] failed to log usage", e);
    }

    return Response.json({
      url,
      cost: {
        usd: breakdown.totalUsd,
        source: breakdown.source,
        components: breakdown.components,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/generate-image]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
