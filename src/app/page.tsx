import Link from "next/link";
import Image from "next/image";



export default function HomePage() {
  return (


<section className="grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-center">
      <div>
        <p className="text-md font-semibold uppercase tracking-wide text-teal-700">
          Get Involved. Volunteer Easily.
          <Image
            src="/images/logo2.png"
            width={300}
            height={300}
            style={{ width: "300px", height: "auto" }}
            alt="logo"
        />
        </p>

        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 md:text-3xl">
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
            className="rounded-md bg-emerald-700 px-5 py-3 font-medium text-white hover:bg-emerald-800"
          >
            Browse Opportunities
          </Link>

          <Link
            href="/register"
            className="rounded-md border border-slate-300 bg-white px-5 py-3 font-medium text-slate-800 hover:bg-slate-100"
          >
            Create Account
          </Link>

        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold">How GIVE works</h2>

        <ol className="mt-5 space-y-4 text-slate-700">
          <li>
            <strong>1. Nonprofits post opportunities.</strong> Approved organizations
            can then publish volunteer opportunities with dates, location, capacity, and requirements.
          </li>
          <li>
            <strong>2. Volunteers discover opportunities.</strong> Visitors can browse
            public listings and view details before signing up.
          </li>
          <li>
            <strong>3. Volunteers book service.</strong> Registered volunteers can reserve
            a spot and use GIVE to manage their bookings.
          </li>
          <li>
            <strong>4. Volunteers and Nonprofits can track participation.</strong> Organizations can
            review signups and record attendance.
          </li>
        </ol>
      </div>
    </section>
  );
}
