import OpenAI from "openai";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Shared OpenRouter attribution headers. Keep the app name in ONE place so
 * OpenRouter's per-app analytics/rate-limit accounting isn't fragmented across
 * routes (this used to drift between "AI Prompt Generator" and "Wondr Forge").
 */
export const OPENROUTER_HEADERS: Record<string, string> = {
  "HTTP-Referer": "http://localhost:3000",
  "X-Title": "Wondr Forge",
};

/** Construct an OpenAI client pointed at OpenRouter with the shared headers. */
export function createOpenRouterClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: { ...OPENROUTER_HEADERS },
  });
}
