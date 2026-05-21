import { NextRequest } from "next/server";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import type {
  OutputTarget,
  ModelPreferences,
} from "@/lib/types";
import { getCharLimit, OUTPUT_TARGETS } from "@/lib/types";
import { CONFIG_DIR } from "@/lib/paths";
import { requireUser } from "@/lib/auth-helpers";

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
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const apiKey = process.env.OPENROUTER_API_KEY;
  const prefs = loadModelPrefs();

  const body = await request.json();
  const {
    currentPrompt,
    refinement,
    outputTarget,
    charBudget,
  } = body as {
    currentPrompt: string;
    refinement: string;
    outputTarget: OutputTarget;
    charBudget?: number;
  };

  if (!apiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not set in .env.local" },
      { status: 500 }
    );
  }

  if (!currentPrompt || !refinement) {
    return Response.json(
      { error: "Current prompt and refinement instruction are required" },
      { status: 400 }
    );
  }

  const charLimit = getCharLimit(outputTarget);
  const effectiveHard = charBudget ? Math.min(charBudget, charLimit.hard) : charLimit.hard;
  const effectiveSoft = charBudget
    ? `${Math.round(effectiveHard * 0.85)}–${effectiveHard} characters`
    : charLimit.soft;

  const targetEntry = OUTPUT_TARGETS.find((t) => t.value === outputTarget);
  const targetLabel = targetEntry
    ? `${targetEntry.label} ${targetEntry.type.join(" & ")} generation`
    : `${outputTarget} generation`;

  const systemPrompt = `You are a prompt editor. You are refining an AI generation prompt for ${targetLabel}, used in this app's built-in generator.

Aim for ${effectiveSoft}. The hard ceiling is ${effectiveHard} characters — stay under it, but use most of the available room. Don't strip detail unless the user's refinement explicitly asks for that; a short, sparse prompt is a failure when the platform accepts much more.

Output ONLY the refined prompt — no preamble, no explanation, no markdown formatting, no quotes around the prompt, no labels like "Here is the refined prompt:". Just the prompt text.`;

  const userMessage = `Here is the current prompt:\n\n${currentPrompt}\n\nRefinement request: ${refinement}`;

  const models = prefs.openrouter_models;
  let lastError = "";

  for (const model of models) {
    try {
      const client = createClient(apiKey);

      const stream = await Promise.race([
        client.chat.completions.create({
          model: model.id,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          stream: true,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Connection timeout")),
            120_000
          )
        ),
      ]);

      let fullResponse = "";
      const encoder = new TextEncoder();

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const text = chunk.choices[0]?.delta?.content || "";
              if (text) {
                fullResponse += text;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ text })}\n\n`
                  )
                );
              }
            }
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ done: true })}\n\n`
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
      lastError = `${model.id}: ${message}`;
      continue;
    }
  }

  return Response.json(
    { error: `All models failed. Last error: ${lastError}` },
    { status: 502 }
  );
}
