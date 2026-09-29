import Link from "next/link";
import { resendConfirmation, signIn } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
    unconfirmed?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <section className="auth-layout auth-layout--login">
      <aside className="auth-aside">
        <span className="auth-brandmark" aria-hidden="true">G</span>
        <p className="auth-kicker">GIVE · COMMUNITY SERVICE</p>
        <h2>Good work starts here.</h2>
        <p className="auth-aside-copy">
          Sign in to manage your volunteer commitments and stay connected to the causes you care about.
        </p>
        <p className="auth-aside-footer">Get involved. Volunteer easily.</p>
      </aside>

      <div className="auth-card">
        <header className="auth-card-heading">
          <p className="auth-overline">WELCOME BACK</p>
          <h1>Log in</h1>
          <p>Access your GIVE account.</p>
        </header>

        {params.error && <p className="alert-error mt-4">{params.error}</p>}
        {params.message && <p className="alert-info mt-4">{params.message}</p>}

        {(params.unconfirmed !== undefined || params.error?.includes("confirmation")) && (
          <form action={resendConfirmation} className="auth-form">
            <div className="form-field">
              <label htmlFor="resend-email" className="form-label">
                Didn&apos;t get a working link? Resend the confirmation email
              </label>
              <input
                id="resend-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={params.unconfirmed ?? ""}
                className="form-input"
              />
            </div>
            <SubmitButton className="auth-submit" pendingText="Sending...">
              Resend confirmation email
            </SubmitButton>
          </form>
        )}

        <form action={signIn} className="auth-form">
          <div className="form-field">
            <label htmlFor="email" className="form-label">
              Email
            </label>
            <input id="email" name="email" type="email" autoComplete="email" required className="form-input" />
          </div>

          <div className="form-field">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="form-input" />
            <Link href="/forgot-password" className="auth-inline-link">
              Forgot password?
            </Link>
          </div>

          <SubmitButton className="auth-submit">Log in</SubmitButton>
        </form>

        <p className="auth-footer">
          Need an account?{" "}
          <Link href="/register">Register</Link>
        </p>
      </div>
    </section>
  );
}
