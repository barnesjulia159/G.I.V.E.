import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const nextParam = requestUrl.searchParams.get("next");
  // Only allow same-site relative paths to prevent open redirects.
  const next = nextParam && /^\/(?!\/)/.test(nextParam) ? nextParam : null;
  const linkError =
    requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");

  const toLogin = (params: Record<string, string>) =>
    NextResponse.redirect(new URL(`/login?${new URLSearchParams(params)}`, request.url));

  if (linkError) {
    if (next === "/reset-password") {
      return NextResponse.redirect(
        new URL(`/forgot-password?${new URLSearchParams({ error: `${linkError}. Please request a new reset link.` })}`, request.url)
      );
    }
    return toLogin({
      error: `${linkError}. Request a new confirmation email below.`,
    });
  }

  if (!code && !(tokenHash && next === "/reset-password")) {
    return toLogin({ error: "Invalid confirmation link." });
  }

  const supabase = await createClient();
  const { data, error } = tokenHash && next === "/reset-password"
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    if (next === "/reset-password") {
      return NextResponse.redirect(
        new URL("/forgot-password?error=This reset link is invalid or expired. Open it in the same browser you requested it from, or request a new one.", request.url)
      );
    }
    // The email is already verified at this point; the session just couldn't be created (e.g. link opened in another browser).
    return toLogin({ message: "Your email is confirmed. Please log in." });
  }

  if (data.user?.email) {
    try {
      await prisma.profile.updateMany({
        where: { id: data.user.id },
        data: { email: data.user.email },
      });
    } catch (syncError) {
      console.error("Failed to sync profile email after confirmation", syncError);
    }
  }

  return NextResponse.redirect(new URL(next ?? "/volunteer/dashboard", request.url));
}
