import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { CONFIG_DIR } from "@/lib/paths";
import { requireUser, requireAdmin } from "@/lib/auth-helpers";

interface PromptTemplate {
  id: string;
  name: string;
  instruction: string;
  created_at: string;
}

const TEMPLATES_PATH = path.join(CONFIG_DIR, "prompt-templates.json");

function loadTemplates(): PromptTemplate[] {
  try {
    return JSON.parse(fs.readFileSync(TEMPLATES_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveTemplates(templates: PromptTemplate[]) {
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
  const { name, instruction } = body as {
    name: string;
    instruction: string;
  };

  if (!name?.trim() || !instruction?.trim()) {
    return Response.json(
      { error: "Name and instruction are required" },
      { status: 400 }
    );
  }

  const templates = loadTemplates();
  const template: PromptTemplate = {
    id: Math.random().toString(36).slice(2, 10),
    name: name.trim(),
    instruction: instruction.trim(),
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
