import Link from "next/link";
import { VolunteerSkillsAndCausesEditor } from "@/components/VolunteerSkillsAndCausesEditor";

export default function VolunteerSkillsAndCausesPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <div className="mb-6">
        <Link
          href="/volunteer/profile"
          className="text-sm font-medium text-teal-800 underline-offset-4 hover:underline"
        >
          Back to profile
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">
          Skills &amp; Causes
        </h1>
        <p className="mt-2 text-slate-600">
          Select the skills you can offer and the causes you care about.
        </p>
      </div>

      <VolunteerSkillsAndCausesEditor />
    </section>
  );
}