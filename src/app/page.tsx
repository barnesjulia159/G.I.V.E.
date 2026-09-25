import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <section className="grid gap-10 md:grid-cols-[1.15fr_0.85fr] md:items-center">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-sm md:p-10">
        <div className="mb-6 flex items-center gap-4">
          <Image
            src="/images/logo2.png"
            width={88}
            height={88}
            className="rounded-2xl border border-slate-200 bg-white object-contain p-2"
            alt="GIVE logo"
          />
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-800">
            Get Involved. Volunteer Easily.
          </p>
        </div>

        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
          Find meaningful ways to serve your community.
        </h1>

        <p className="mt-5 max-w-2xl text-lg text-slate-700">
          GIVE connects volunteers with local nonprofit organizations that need support.
          Browse opportunities, book opportunities, and help local organizations create real
          impact.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/opportunities"
            className="rounded-lg bg-teal-800 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-teal-900"
          >
            Browse Opportunities
          </Link>

          <Link
            href="/register"
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 transition hover:border-teal-800 hover:text-teal-900"
          >
            Create Account
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm md:p-8">
        <h2 className="text-2xl font-semibold">How GIVE works</h2>

        <ol className="mt-5 space-y-4 text-slate-200">
          <li>
            <strong className="text-white">1. Nonprofits post opportunities.</strong> Approved organizations
            can then publish volunteer opportunities with dates, location, capacity, and requirements.
          </li>
          <li>
            <strong className="text-white">2. Volunteers discover opportunities.</strong> Visitors can browse
            public listings and view details before signing up.
          </li>
          <li>
            <strong className="text-white">3. Volunteers book service.</strong> Registered volunteers can reserve
            a spot and use GIVE to manage their bookings.
          </li>
          <li>
            <strong className="text-white">4. Volunteers and nonprofits track participation.</strong> Organizations can
            review signups and record attendance.
          </li>
        </ol>
      </div>
    </section>
  );
}
