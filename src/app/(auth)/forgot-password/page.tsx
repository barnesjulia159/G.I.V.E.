import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;

  return (
    <section className="auth-layout auth-layout--login">
      <aside className="auth-aside">
        <span className="auth-brandmark" aria-hidden="true">G</span>
        <p className="auth-kicker">GIVE · COMMUNITY SERVICE</p>
        <h2>Let&apos;s get you back in.</h2>
        <p className="auth-aside-copy">
          Enter the email you registered with and we&apos;ll send you a link to choose a new password.
        </p>
        <p className="auth-aside-footer">Get involved. Volunteer easily.</p>
      </aside>

      <div className="auth-card">
        <header className="auth-card-heading">
          <p className="auth-overline">ACCOUNT RECOVERY</p>
          <h1>Forgot password</h1>
          <p>We&apos;ll email you a reset link.</p>
        </header>

        {params.error && <p className="alert-error mt-4">{params.error}</p>}
        {params.message && <p className="alert-info mt-4">{params.message}</p>}

        <form action={requestPasswordReset} className="auth-form">
          <div className="form-field">
            <label htmlFor="email" className="form-label">
              Email
            </label>
            <input id="email" name="email" type="email" autoComplete="email" required className="form-input" />
          </div>

          <SubmitButton className="auth-submit" pendingText="Sending...">
            Send reset link
          </SubmitButton>
        </form>

        <p className="auth-footer">
          Remembered it? <Link href="/login">Back to log in</Link>
        </p>
      </div>
    </section>
  );
}
