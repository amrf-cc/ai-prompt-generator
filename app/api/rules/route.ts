import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { validateRules } from "@/lib/prompt-builder";
import { CONFIG_DIR } from "@/lib/paths";
import { requireUser, requireAdmin } from "@/lib/auth-helpers";

const RULES_PATH = path.join(CONFIG_DIR, "prompt-rules.json");

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  try {
    const rules = JSON.parse(fs.readFileSync(RULES_PATH, "utf-8"));
    return Response.json(rules);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    try {
      validateRules(body);
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 400 });
    }
    fs.writeFileSync(RULES_PATH, JSON.stringify(body, null, 2) + "\n");
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
