import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { computeCost } from "@/lib/pricing";
import { findMediaGenerationByJobId, updateMediaGeneration } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENROUTER_API_KEY not set" }, { status: 500 });
    }

    const { jobId } = await params;

    const response = await fetch(`https://openrouter.ai/api/v1/videos/${jobId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Wondr Forge",
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as Record<string, unknown>;
      const msg = (err.message as string) || (err.error as string) || `HTTP ${response.status}`;
      return Response.json({ error: msg }, { status: response.status });
    }

    const result = await response.json() as {
      status: string;
      unsigned_urls?: string[];
      error?: string;
      usage?: { cost?: number; total_cost?: number };
      duration?: number;
    };

    const videoUrl = result.unsigned_urls?.[0] ?? null;
    const isTerminal =
      result.status === "completed" ||
      result.status === "succeeded" ||
      result.status === "success" ||
      result.status === "failed" ||
      result.status === "error";

    if (isTerminal) {
      const existing = findMediaGenerationByJobId(jobId);
      if (existing && existing.status === "pending") {
        const failed =
          result.status === "failed" || result.status === "error" || !!result.error;
        if (failed) {
          updateMediaGeneration(existing.id, {
            status: "failed",
            error: result.error ?? "video generation failed",
            cost_usd: 0,
            cost_source: "unknown",
          });
        } else {
          const providerCost =
            typeof result.usage?.cost === "number"
              ? result.usage.cost
              : typeof result.usage?.total_cost === "number"
                ? result.usage.total_cost
                : null;
          const duration = result.duration ?? existing.duration_sec ?? undefined;
          const breakdown = computeCost(
            {
              modelId: existing.model_id,
              durationSec: duration,
              aspectRatio: existing.aspect_ratio ?? undefined,
            },
            providerCost
          );
          updateMediaGeneration(existing.id, {
            status: "success",
            result_url: videoUrl,
            duration_sec: duration ?? null,
            cost_usd: breakdown.totalUsd,
            cost_source: breakdown.source,
            cost_components: breakdown.components,
          });
        }
      }
    }

    return Response.json({
      status: result.status,
      videoUrl,
      error: result.error ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/poll-video]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
