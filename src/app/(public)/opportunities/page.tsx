import Link from "next/link";
import { OpportunityCard } from "@/components/OpportunityCard";
import { createClient } from "@/lib/supabase/server";
import { PublicOpportunityListing } from "@/lib/types";

type OpportunitiesPageProps = {
  searchParams: Promise<{
    search?: string;
    city?: string;
    date?: string;
    skill?: string | string[];
    cause?: string | string[];
    error?: string;
  }>;
};

export default async function OpportunitiesPage({
  searchParams,
}: OpportunitiesPageProps) {
  const params = await searchParams;

  const search = params.search?.trim() || "";
  const city = params.city?.trim() || "";
  const date = params.date || "";
  const selectedSkills = Array.isArray(params.skill) ? params.skill : params.skill ? [params.skill] : [];
  const selectedCauses = Array.isArray(params.cause) ? params.cause : params.cause ? [params.cause] : [];

  const supabase = await createClient();
  const [{ data: skills, error: skillsError }, { data: causes, error: causesError }] = await Promise.all([
    supabase.from("skills").select("id, name").order("name"),
    supabase.from("causes").select("id, name").order("name"),
  ]);

  const skillIds = selectedSkills.filter((id) => skills?.some((skill) => skill.id === id));
  const causeIds = selectedCauses.filter((id) => causes?.some((cause) => cause.id === id));
  const [{ data: skillMatches, error: skillMatchError }, { data: causeMatches, error: causeMatchError }] = await Promise.all([
    skillIds.length
      ? supabase.from("opportunity_skills").select("opportunity_id").in("skill_id", skillIds)
      : Promise.resolve({ data: null, error: null }),
    causeIds.length
      ? supabase.from("opportunity_causes").select("opportunity_id").in("cause_id", causeIds)
      : Promise.resolve({ data: null, error: null }),
  ]);
  const filterError = skillsError || causesError || skillMatchError || causeMatchError;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;

  let query = supabase
    .from("public_opportunity_listings")
    .select("*")
    .order("start_at", { ascending: true });

  if (search) {
    query = query.or(
      `title.ilike.%${search}%,description.ilike.%${search}%,organization_name.ilike.%${search}%`
    );
  }

  if (city) {
    query = query.ilike("city", `%${city}%`);
  }

  if (validDate) {
    const nextDay = new Date(`${date}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    query = query.lt("start_at", nextDay.toISOString()).gt("end_at", `${date}T00:00:00Z`);
  }

  const matchingSkills = [...new Set(skillMatches?.map((match) => match.opportunity_id) ?? [])];
  const matchingCauses = [...new Set(causeMatches?.map((match) => match.opportunity_id) ?? [])];
  if (skillIds.length && matchingSkills.length) query = query.in("id", matchingSkills);
  if (causeIds.length && matchingCauses.length) query = query.in("id", matchingCauses);

  const hasMatches =
    selectedSkills.length === skillIds.length &&
    selectedCauses.length === causeIds.length &&
    (!skillIds.length || matchingSkills.length > 0) &&
    (!causeIds.length || matchingCauses.length > 0);
  const { data, error } = !filterError && hasMatches && (!date || validDate)
    ? await query
    : { data: null, error: null };

  const opportunities = (data || []) as PublicOpportunityListing[];

  return (
    <section>
      <div className="mb-8">
        <h1 className="text-4xl font-bold">Volunteer Opportunities</h1>

        <p className="mt-2 text-slate-700">
          Search for public opportunities posted by our partner nonprofit
          organizations.
        </p>
      </div>

      {params.error && <p className="alert-error mb-4">{params.error}</p>}
      {error && <p className="alert-error mb-4">{error.message}</p>}
      {filterError && <p className="alert-error mb-4">Filters could not be loaded. Please try again.</p>}

      <form className="mb-8 grid grid-cols-1 gap-4 rounded-xl bg-white p-4 shadow-sm md:grid-cols-2">
        <div className="form-field">
          <label htmlFor="search" className="form-label">
            Search
          </label>
          <input
            id="search"
            name="search"
            defaultValue={search}
            className="form-input"
            placeholder="Keyword, title, or organization"
          />
        </div>

        <div className="form-field">
          <label htmlFor="city" className="form-label">
            City
          </label>
          <input
            id="city"
            name="city"
            defaultValue={city}
            className="form-input"
            placeholder="Search by city"
          />
        </div>

        <div className="form-field">
          <label htmlFor="date" className="form-label">Date</label>
          <input id="date" name="date" type="date" defaultValue={date} className="form-input" />
        </div>

        <details className="md:self-end" open={skillIds.length > 0}>
          <summary className="form-label cursor-pointer">Skills{skillIds.length ? ` (${skillIds.length})` : ""}</summary>
          <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
            {(skills ?? []).map((skill) => (
              <label key={skill.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="skill" value={skill.id} defaultChecked={selectedSkills.includes(skill.id)} />
                {skill.name}
              </label>
            ))}
          </div>
        </details>

        <details open={causeIds.length > 0}>
          <summary className="form-label cursor-pointer">Causes{causeIds.length ? ` (${causeIds.length})` : ""}</summary>
          <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
            {(causes ?? []).map((cause) => (
              <label key={cause.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="cause" value={cause.id} defaultChecked={selectedCauses.includes(cause.id)} />
                {cause.name}
              </label>
            ))}
          </div>
        </details>

        <div className="flex flex-wrap items-end gap-3 md:col-span-2">
          <button className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800">Search</button>
          <Link href="/opportunities" className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100">Clear filters</Link>
        </div>
      </form>

      {!error && !filterError && opportunities.length === 0 ? (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-slate-700">
            No volunteer opportunities match your search yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {opportunities.map((opportunity) => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} />
          ))}
        </div>
      )}
    </section>
  );
}
