export async function GET() {
  const hasKey = !!process.env.OPENROUTER_API_KEY;
  return Response.json({ ok: true, hasKey });
}
