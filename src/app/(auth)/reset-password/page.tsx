import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/forgot-password?error=Your reset link has expired. Please request a new one.");
  }

  return (
    <section className="auth-layout auth-layout--login">
      <aside className="auth-aside">
        <span className="auth-brandmark" aria-hidden="true">G</span>
        <p className="auth-kicker">GIVE · COMMUNITY SERVICE</p>
        <h2>Choose a new password.</h2>
        <p className="auth-aside-copy">
          Pick something you haven&apos;t used before. You&apos;ll log in with it right after.
        </p>
        <p className="auth-aside-footer">Get involved. Volunteer easily.</p>
      </aside>

      <div className="auth-card">
        <header className="auth-card-heading">
          <p className="auth-overline">ACCOUNT RECOVERY</p>
          <h1>Reset password</h1>
          <p>Resetting the password for {user.email}.</p>
          <p className="mt-2 text-sm text-slate-600">
            Updating your password signs out refresh sessions on all devices and requires a new login.
            Existing access tokens remain valid until they expire.
          </p>
        </header>

        {params.error && <p className="alert-error mt-4">{params.error}</p>}

        <ResetPasswordForm />

        <p className="auth-footer">
          <Link href="/login">Back to log in</Link>
        </p>
      </div>
    </section>
  );
}
