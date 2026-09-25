import Link from "next/link";
import { signUp } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";

type RegisterPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;

  return (
    <section className="auth-layout auth-layout--register">
      <aside className="auth-aside">
        <span className="auth-brandmark" aria-hidden="true">G</span>
        <p className="auth-kicker">GIVE · COMMUNITY SERVICE</p>
        <h2>Find your place in the work.</h2>
        <p className="auth-aside-copy">
          Create an account to connect with local service opportunities or coordinate volunteers for your organization.
        </p>
        <p className="auth-aside-footer">One community. Many ways to help.</p>
      </aside>

      <div className="auth-card">
        <header className="auth-card-heading">
          <p className="auth-overline">GET STARTED</p>
          <h1>Create an account</h1>
          <p>Choose how you would like to take part.</p>
        </header>

        {params.error && <p className="alert-error mt-4">{params.error}</p>}

        <form action={signUp} className="auth-form">
          <div className="auth-name-fields">
            <div className="form-field">
              <label htmlFor="first_name" className="form-label">
                First Name
              </label>
              <input id="first_name" name="first_name" autoComplete="given-name" className="form-input" />
            </div>

            <div className="form-field">
              <label htmlFor="last_name" className="form-label">
                Last Name
              </label>
              <input id="last_name" name="last_name" autoComplete="family-name" className="form-input" />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="role" className="form-label">
              Account Type
            </label>
            <select id="role" name="role" className="form-input" defaultValue="volunteer">
              <option value="volunteer">Volunteer</option>
              <option value="nonprofit">Nonprofit Organization</option>
            </select>
          </div>

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
            <input id="password" name="password" type="password" autoComplete="new-password" required className="form-input" />
          </div>

          <SubmitButton className="auth-submit">Create Account</SubmitButton>
        </form>

        <p className="auth-footer">
          Already have an account?{" "}
          <Link href="/login">Log in</Link>
        </p>
      </div>
    </section>
  );
}
