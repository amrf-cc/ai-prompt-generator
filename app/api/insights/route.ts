import { getInsights } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";

export async function GET() {
  const r = await requireUser();
  if (r.error) return r.error;
  try {
    const insights = getInsights();
    return Response.json(insights);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
