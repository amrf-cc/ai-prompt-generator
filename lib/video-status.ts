/**
 * Normalize the many provider-specific video job status spellings into the
 * closed set the client understands. Providers (via OpenRouter) report terminal
 * success as any of "completed"/"succeeded"/"success" and failure as
 * "failed"/"error"; everything else is still in flight ("pending").
 *
 * A terminal-success status with no downloadable URL is treated as a failure —
 * a video we can't deliver is not a success, and must not be billed/shown as one.
 */
export type VideoPhase = "pending" | "completed" | "failed";

export function normalizeVideoStatus(
  rawStatus: string | null | undefined,
  opts?: { hasVideoUrl?: boolean; hasError?: boolean }
): VideoPhase {
  const s = (rawStatus ?? "").toLowerCase();
  const isFailure = s === "failed" || s === "error" || opts?.hasError === true;
  if (isFailure) return "failed";

  const isSuccess = s === "completed" || s === "succeeded" || s === "success";
  if (isSuccess) {
    // Completed but the provider returned no URL → can't deliver a result.
    return opts?.hasVideoUrl === false ? "failed" : "completed";
  }

  return "pending";
}
