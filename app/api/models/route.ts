import fs from "fs";
import path from "path";
import { CONFIG_DIR } from "@/lib/paths";

export async function GET() {
  try {
    const prefs = JSON.parse(
      fs.readFileSync(path.join(CONFIG_DIR, "model-preferences.json"), "utf-8")
    );
    return Response.json({ selector_models: prefs.selector_models ?? [] });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
