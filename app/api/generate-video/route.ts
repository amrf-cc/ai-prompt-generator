import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { computeCost } from "@/lib/pricing";
import { insertMediaGeneration } from "@/lib/db";
import { OPENROUTER_HEADERS } from "@/lib/openrouter";
import { normalizeVideoStatus } from "@/lib/video-status";

interface FrameImage {
  type: "image_url";
  image_url: { url: string };
  frame_type: "first_frame" | "last_frame";
}

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
      aspectRatio = "16:9",
      resolution = "1080p",
      duration = 8,
      generateAudio = false,
      frameImages = [],
      brandSlug = null,
      historyId = null,
    } = body as {
      model: string;
      prompt: string;
      aspectRatio?: string;
      resolution?: string;
      duration?: number;
      generateAudio?: boolean;
      frameImages?: FrameImage[];
      brandSlug?: string | null;
      historyId?: number | null;
    };

    if (!model || !prompt) {
      return Response.json({ error: "model and prompt are required" }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      model,
      prompt,
      aspect_ratio: aspectRatio,
      resolution,
      duration,
      generate_audio: generateAudio,
    };

    if (frameImages.length > 0) {
      payload.frame_images = frameImages;
    }

    const response = await fetch("https://openrouter.ai/api/v1/videos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...OPENROUTER_HEADERS,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as Record<string, unknown>;
      const msg = (err.message as string) || (err.error as string) || `HTTP ${response.status}`;
      return Response.json({ error: msg }, { status: response.status });
    }

    const result = await response.json() as {
      id: string;
      polling_url: string;
      status: string;
    };

    // Log a pending row up front so even a never-completing job is visible in
    // usage history. The poll endpoint finalizes cost/status when the video
    // is ready.
    const estimate = computeCost({
      modelId: model,
      durationSec: duration,
      aspectRatio,
    });

    try {
      insertMediaGeneration({
        kind: "video",
        brand_slug: brandSlug,
        model_id: model,
        prompt,
        history_id: historyId,
        duration_sec: duration,
        aspect_ratio: aspectRatio,
        cost_usd: estimate.totalUsd,
        cost_source: estimate.source,
        cost_components: estimate.components,
        status: "pending",
        job_id: result.id,
        created_by: auth.user.email,
      });
    } catch (e) {
      console.error("[/api/generate-video] failed to log pending row", e);
    }

    return Response.json(
      {
        jobId: result.id,
        pollingUrl: result.polling_url,
        status: normalizeVideoStatus(result.status),
      },
      { status: 202 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/generate-video]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
