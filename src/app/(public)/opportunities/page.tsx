import Link from "next/link";
import { OpportunityCard } from "@/components/OpportunityCard";
import { createClient } from "@/lib/supabase/server";
import { PublicOpportunityListing } from "@/lib/types";
import { easternDayBounds } from "@/lib/date-format";

type OpportunitiesPageProps = {
  searchParams: Promise<{
    search?: string;
    city?: string;
    date?: string;
    skill?: string | string[];
    cause?: string | string[];
    error?: string;
    page?: string;
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
  const pageSize = 24;
  const pageNumber = params.page === undefined ? 1 : Number(params.page);
  const validPage = params.page === undefined ||
    (/^[1-9]\d*$/.test(params.page) && Number.isSafeInteger(pageNumber) && pageNumber <= 100000);
  const currentPage = validPage ? pageNumber : 1;
  const offset = (currentPage - 1) * pageSize;

  const supabase = await createClient({ noStore: true });
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
  const dayBounds = easternDayBounds(date);

  let query = supabase
    .from("public_opportunity_listings")
    .select("*")
    .gt("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + pageSize);

  if (search) {
    const literal = `%${search.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&")}%`;
    const pattern = JSON.stringify(literal);
    query = query.or(
      `title.ilike.${pattern},description.ilike.${pattern},organization_name.ilike.${pattern}`
    );
  }

  if (city) {
    const pattern = JSON.stringify(`%${city.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&")}%`);
    query = query.or(
      `city.ilike.${pattern},and(or(city.is.null,city.eq.""),location_name.ilike.${pattern})`
    );
  }

  if (dayBounds) {
    query = query.lt("start_at", dayBounds.end.toISOString()).gt("end_at", dayBounds.start.toISOString());
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
  const invalidFilters =
    !validPage ? "Choose a valid page number between 1 and 100000." :
    date && !dayBounds ? "Choose a valid date." :
    selectedSkills.length !== skillIds.length || selectedCauses.length !== causeIds.length
      ? "One or more selected skills or causes are unavailable. Clear filters and choose current options." : null;
  const { data, error } = !filterError && hasMatches && !invalidFilters
    ? await query
    : { data: null, error: null };

  const results = (data || []) as PublicOpportunityListing[];
  const hasNextPage = results.length > pageSize;
  const opportunities = results.slice(0, pageSize);
  function pageHref(page: number) {
    const queryParams = new URLSearchParams();
    if (search) queryParams.set("search", search);
    if (city) queryParams.set("city", city);
    if (date) queryParams.set("date", date);
    selectedSkills.forEach((skill) => queryParams.append("skill", skill));
    selectedCauses.forEach((cause) => queryParams.append("cause", cause));
    queryParams.set("page", String(page));
    return `/opportunities?${queryParams.toString()}`;
  }

  return (
    <section>
      <div className="mb-8">
        <h1 className="text-4xl font-bold">Volunteer Opportunities</h1>

        <p className="mt-2 text-slate-700">
          Search for public opportunities posted by our partner nonprofit
          organizations.
        </p>
      </div>

      {params.error && <p role="alert" className="alert-error mb-4">{params.error}</p>}
      {error && <p role="alert" className="alert-error mb-4">{error.message}</p>}
      {filterError && <p role="alert" className="alert-error mb-4">Filters could not be loaded. Please try again.</p>}
      {invalidFilters && <p role="alert" className="alert-error mb-4">{invalidFilters}</p>}

      <form key={JSON.stringify([search, city, date, selectedSkills, selectedCauses])} className="opportunity-filters mb-8 grid grid-cols-1 gap-4 rounded-xl bg-white p-4 shadow-sm md:grid-cols-2">
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
          <label htmlFor="date" className="form-label">Date (Eastern)</label>
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

      {!error && !filterError && !invalidFilters && opportunities.length === 0 ? (
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
      {!error && !filterError && !invalidFilters && (currentPage > 1 || hasNextPage) && (
        <nav aria-label="Opportunity pages" className="mt-6 flex flex-wrap items-center justify-center gap-4">
          {currentPage > 1 && <Link href={pageHref(currentPage - 1)} className="font-medium text-emerald-700 hover:underline">Previous page</Link>}
          <span aria-current="page">Page {currentPage}</span>
          {hasNextPage && <Link href={pageHref(currentPage + 1)} className="font-medium text-emerald-700 hover:underline">Next page</Link>}
        </nav>
      )}
    </section>
  );
}
