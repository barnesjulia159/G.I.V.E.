import Link from "next/link";
import { redirect } from "next/navigation";
import { updatePassword } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/SubmitButton";

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
        </header>

        {params.error && <p className="alert-error mt-4">{params.error}</p>}

        <form action={updatePassword} className="auth-form">
          <div className="form-field">
            <label htmlFor="password" className="form-label">
              New password
            </label>
            <input id="password" name="password" type="password" autoComplete="new-password" minLength={6} required className="form-input" />
          </div>

          <div className="form-field">
            <label htmlFor="confirm_password" className="form-label">
              Confirm new password
            </label>
            <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" minLength={6} required className="form-input" />
          </div>

          <SubmitButton className="auth-submit">Update password</SubmitButton>
        </form>

        <p className="auth-footer">
          <Link href="/login">Back to log in</Link>
        </p>
      </div>
    </section>
  );
}
