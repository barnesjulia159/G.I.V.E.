import { OpportunityCard } from "@/components/OpportunityCard";
import { createClient } from "@/lib/supabase/server";
import { PublicOpportunityListing } from "@/lib/types";

type OpportunitiesPageProps = {
  searchParams: Promise<{
    search?: string;
    city?: string;
    error?: string;
  }>;
};

export default async function OpportunitiesPage({
  searchParams,
}: OpportunitiesPageProps) {
  const params = await searchParams;

  const search = params.search?.trim() || "";
  const city = params.city?.trim() || "";

  const supabase = await createClient();

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

  const { data, error } = await query;

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

      <form className="mb-8 grid gap-4 rounded-xl bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]">
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

        <div className="flex items-end">
          <button className="w-full rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800">
            Search
          </button>
        </div>
      </form>

      {opportunities.length === 0 ? (
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
