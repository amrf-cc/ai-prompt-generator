import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { CONFIG_DIR } from "@/lib/paths";
import { requireUser, requireAdmin } from "@/lib/auth-helpers";

interface PromptTemplate {
  id: string;
  name: string;
  instruction: string;
  category: string;
  created_at: string;
}

const TEMPLATES_PATH = path.join(CONFIG_DIR, "prompt-templates.json");

const DEFAULT_TEMPLATES: PromptTemplate[] = [
  // Shot Size
  { id: "default-01", name: "Extreme Closeup", instruction: "extreme closeup", category: "Shot Size", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-02", name: "Closeup", instruction: "closeup", category: "Shot Size", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-03", name: "Medium Shot", instruction: "medium shot", category: "Shot Size", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-04", name: "Wide Shot", instruction: "wide shot", category: "Shot Size", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-05", name: "Extreme Wide", instruction: "extreme wide shot", category: "Shot Size", created_at: "2024-01-01T00:00:00.000Z" },
  // Camera Angle
  { id: "default-06", name: "Eye Level", instruction: "eye level angle", category: "Camera Angle", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-07", name: "Low Angle", instruction: "low angle, worm's eye view", category: "Camera Angle", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-08", name: "High Angle", instruction: "high angle shot", category: "Camera Angle", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-09", name: "Bird's Eye", instruction: "bird's eye view, directly overhead", category: "Camera Angle", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-10", name: "Dutch Angle", instruction: "dutch angle, tilted frame", category: "Camera Angle", created_at: "2024-01-01T00:00:00.000Z" },
  // Camera Movement
  { id: "default-11", name: "Static", instruction: "static shot, locked camera", category: "Camera Movement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-12", name: "Slow Pan", instruction: "slow pan", category: "Camera Movement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-13", name: "Dolly In", instruction: "slow dolly in", category: "Camera Movement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-14", name: "Dolly Out", instruction: "slow dolly out", category: "Camera Movement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-15", name: "Handheld", instruction: "handheld camera, slight movement", category: "Camera Movement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-16", name: "Orbit", instruction: "orbiting camera movement around subject", category: "Camera Movement", created_at: "2024-01-01T00:00:00.000Z" },
  // Lighting
  { id: "default-17", name: "Golden Hour", instruction: "golden hour lighting, warm directional sunlight", category: "Lighting", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-18", name: "Blue Hour", instruction: "blue hour, cool twilight ambient light", category: "Lighting", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-19", name: "Overcast Diffused", instruction: "overcast sky, soft diffused light, no harsh shadows", category: "Lighting", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-20", name: "Harsh Sunlight", instruction: "harsh midday sunlight, strong shadows", category: "Lighting", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-21", name: "Backlit", instruction: "backlit, rim light, silhouette effect", category: "Lighting", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-22", name: "Studio Soft", instruction: "studio softbox lighting, even exposure, minimal shadows", category: "Lighting", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-23", name: "Rim Light", instruction: "dramatic rim lighting, dark background", category: "Lighting", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-24", name: "Neon Accent", instruction: "neon accent lighting, cyberpunk color cast", category: "Lighting", created_at: "2024-01-01T00:00:00.000Z" },
  // Environment
  { id: "default-25", name: "Urban Street", instruction: "urban street environment, city backdrop", category: "Environment", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-26", name: "Natural Landscape", instruction: "natural landscape, outdoor setting", category: "Environment", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-27", name: "White Studio", instruction: "minimal white studio, clean seamless background", category: "Environment", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-28", name: "Industrial", instruction: "industrial setting, concrete and steel", category: "Environment", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-29", name: "Cozy Interior", instruction: "cozy interior, warm ambient lighting, lived-in space", category: "Environment", created_at: "2024-01-01T00:00:00.000Z" },
  // Color Mood
  { id: "default-30", name: "Warm Tones", instruction: "warm color palette, amber and orange tones", category: "Color Mood", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-31", name: "Cool Tones", instruction: "cool color palette, blue and teal tones", category: "Color Mood", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-32", name: "Monochrome", instruction: "monochrome, black and white", category: "Color Mood", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-33", name: "High Contrast", instruction: "high contrast, deep blacks and bright highlights", category: "Color Mood", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-34", name: "Desaturated", instruction: "desaturated, muted color palette", category: "Color Mood", created_at: "2024-01-01T00:00:00.000Z" },
  // Film Style
  { id: "default-35", name: "Cinematic", instruction: "cinematic, 2.39:1 anamorphic aspect ratio, film grain", category: "Film Style", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-36", name: "Editorial", instruction: "editorial photography style, clean and polished", category: "Film Style", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-37", name: "Documentary", instruction: "documentary style, natural and candid", category: "Film Style", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-38", name: "Fashion Editorial", instruction: "fashion editorial, high-gloss, stylized", category: "Film Style", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-39", name: "Fine Art", instruction: "fine art photography, painterly quality, intentional composition", category: "Film Style", created_at: "2024-01-01T00:00:00.000Z" },
  // Product Placement
  { id: "default-40", name: "Center Frame", instruction: "product centered in frame, symmetrical composition", category: "Product Placement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-41", name: "Bottom-Left Corner", instruction: "product anchored in bottom-left corner, negative space upper-right", category: "Product Placement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-42", name: "Bottom-Right Corner", instruction: "product anchored in bottom-right corner, negative space upper-left", category: "Product Placement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-43", name: "Rule of Thirds Left", instruction: "product placed on left third of frame, open space to the right", category: "Product Placement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-44", name: "Rule of Thirds Right", instruction: "product placed on right third of frame, open space to the left", category: "Product Placement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-45", name: "Foreground Hero", instruction: "product large in foreground, blurred background scene", category: "Product Placement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-46", name: "Flat Lay Top-Down", instruction: "flat lay, top-down overhead view, product on surface surrounded by props", category: "Product Placement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-47", name: "Floating / Levitating", instruction: "product floating mid-air, levitating, clean negative space around it", category: "Product Placement", created_at: "2024-01-01T00:00:00.000Z" },
  { id: "default-48", name: "In-Hand / In-Use", instruction: "product held in hand, lifestyle in-use context", category: "Product Placement", created_at: "2024-01-01T00:00:00.000Z" },
];

function loadTemplates(): PromptTemplate[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(TEMPLATES_PATH, "utf-8"));
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // file missing or invalid
  }
  saveTemplates(DEFAULT_TEMPLATES);
  return DEFAULT_TEMPLATES;
}

function saveTemplates(templates: PromptTemplate[]) {
  fs.mkdirSync(path.dirname(TEMPLATES_PATH), { recursive: true });
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2));
}

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  return Response.json(loadTemplates());
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = await request.json();
  const { name, instruction, category } = body as {
    name: string;
    instruction: string;
    category: string;
  };

  if (!name?.trim() || !instruction?.trim() || !category?.trim()) {
    return Response.json(
      { error: "Name, instruction, and category are required" },
      { status: 400 }
    );
  }

  const templates = loadTemplates();
  const template: PromptTemplate = {
    id: Math.random().toString(36).slice(2, 10),
    name: name.trim(),
    instruction: instruction.trim(),
    category: category.trim(),
    created_at: new Date().toISOString(),
  };

  templates.push(template);
  saveTemplates(templates);
  return Response.json(template);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "ID required" }, { status: 400 });
  }

  const templates = loadTemplates().filter((t) => t.id !== id);
  saveTemplates(templates);
  return Response.json({ ok: true });
}
