import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="home-page">
      <section className="home-intro">
        <div className="home-brand">
          <Image
            src="/images/logo2.png"
            width={112}
            height={112}
            className="home-logo"
            alt="GIVE"
            priority
          />
          <p className="home-eyebrow">GET INVOLVED. VOLUNTEER EASILY.</p>
        </div>

        <h1>Find meaningful ways to serve your community.</h1>
        <p className="home-summary">
          GIVE connects volunteers with local nonprofit organizations that need support.
          Discover opportunities, reserve your place, and help create lasting community impact.
        </p>

        <div className="home-actions">
          <Link href="/opportunities" className="home-primary-action">
            Browse opportunities
          </Link>
          <Link href="/register" className="home-secondary-action">
            Create an account
          </Link>
          <Link href="/login" className="home-secondary-action">
            Log in
          </Link>
        </div>
      </section>

      <section className="home-process" aria-labelledby="home-process-title">
        <div className="home-process-heading">
          <p className="home-eyebrow">A SIMPLE WAY TO MAKE A DIFFERENCE</p>
          <h2 id="home-process-title">How GIVE works</h2>
        </div>

        <ol className="home-steps">
          <li>
            <span className="home-step-number">01</span>
            <div>
              <h3>Organizations share a need</h3>
              <p>Nonprofits publish volunteer opportunities with the details you need.</p>
            </div>
          </li>
          <li>
            <span className="home-step-number">02</span>
            <div>
              <h3>Volunteers find a fit</h3>
              <p>Explore local opportunities and choose a cause that matters to you.</p>
            </div>
          </li>
          <li>
            <span className="home-step-number">03</span>
            <div>
              <h3>Everyone tracks the impact</h3>
              <p>Manage bookings and record participation in one place.</p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
