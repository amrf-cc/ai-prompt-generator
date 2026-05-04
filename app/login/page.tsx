import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

interface LoginPageProps {
  searchParams: Promise<{ from?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  const params = await searchParams;
  const from = params.from || "/";

  if (session?.user) {
    redirect(from);
  }

  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN ?? "";
  const error = params.error;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--card)] p-8 shadow-xl">
        <h1 className="text-2xl font-semibold mb-2">AI Prompt Generator</h1>
        <p className="text-sm text-[var(--muted)] mb-6">
          {allowedDomain
            ? `Sign in with your @${allowedDomain} Google account.`
            : "Sign in with your Google account."}
        </p>

        {error === "AccessDenied" && (
          <div className="mb-4 rounded border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
            That email isn&apos;t allowed. Use your{" "}
            {allowedDomain ? `@${allowedDomain}` : "approved"} account.
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: from });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] px-4 py-2.5 text-sm font-medium text-white transition-colors"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </main>
  );
}
