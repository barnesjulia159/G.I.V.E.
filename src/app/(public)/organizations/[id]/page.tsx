import Link from "next/link";
import { notFound } from "next/navigation";
import { OpportunityCard } from "@/components/OpportunityCard";
import { createClient } from "@/lib/supabase/server";
import type { Organization, PublicOpportunityListing } from "@/lib/types";

type OrganizationPageProps = {
  params: Promise<{ id: string }>;
};

function websiteLink(value: string | null) {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

export default async function OrganizationPage({ params }: OrganizationPageProps) {
  const { id } = await params;
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id)) {
    notFound();
  }

  const supabase = await createClient({ noStore: true });
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, mission_statement, description, contact_name, contact_email, contact_phone, website_url, address_line1, address_line2, city, state, zip_code")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Public organization lookup failed:", error);
    throw new Error("Organization details could not be loaded.");
  }
  if (!data) notFound();

  const organization: Pick<Organization,
    "id" | "name" | "mission_statement" | "description" | "contact_name" |
    "contact_email" | "contact_phone" | "website_url" | "address_line1" |
    "address_line2" | "city" | "state" | "zip_code"
  > = data;
  const { data: listings, error: listingsError } = await supabase
    .from("public_opportunity_listings")
    .select("*")
    .eq("organization_id", organization.id)
    .order("start_at", { ascending: true });

  if (listingsError) {
    console.error("Organization opportunities lookup failed:", listingsError);
  }

  const opportunities: PublicOpportunityListing[] = listings ?? [];
  const now = new Date().getTime();
  const upcoming = opportunities.filter((opportunity) => Date.parse(opportunity.end_at) >= now);
  const past = opportunities.filter((opportunity) => Date.parse(opportunity.end_at) < now);
  const website = websiteLink(organization.website_url);
  const locality = [organization.city, organization.state].filter(Boolean).join(", ");
  const address = [
    organization.address_line1,
    organization.address_line2,
    [locality, organization.zip_code].filter(Boolean).join(" "),
  ].filter(Boolean).join("\n");

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <Link href="/opportunities" className="text-sm font-medium text-emerald-700 hover:underline">
        Back to opportunities
      </Link>

      <header className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 md:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Nonprofit organization
        </p>
        <h1 className="mt-2 wrap-break-word text-4xl font-bold text-slate-950">{organization.name}</h1>
        {locality && <p className="mt-3 text-slate-700">{locality}</p>}
        <a href="#organization-opportunities" className="mt-6 inline-flex rounded-md bg-emerald-700 px-4 py-3 font-medium text-white hover:bg-emerald-800">
          Volunteer with us
        </a>
      </header>

      <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-950">Our mission</h2>
            <p className="mt-4 whitespace-pre-line wrap-break-word leading-7 text-slate-700">
              {organization.mission_statement}
            </p>
          </section>
          {organization.description && (
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-semibold text-slate-950">About our organization</h2>
              <p className="mt-4 whitespace-pre-line wrap-break-word leading-7 text-slate-700">
                {organization.description}
              </p>
            </section>
          )}
        </div>

        <aside className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-950">Get in touch</h2>
          <dl className="mt-5 space-y-4 wrap-break-word text-slate-700">
            {organization.contact_name && (
              <div>
                <dt className="text-sm font-medium text-slate-500">Contact</dt>
                <dd>{organization.contact_name}</dd>
              </div>
            )}
            {organization.contact_email && (
              <div>
                <dt className="text-sm font-medium text-slate-500">Email</dt>
                <dd><a href={`mailto:${organization.contact_email}`} className="text-emerald-700 hover:underline">{organization.contact_email}</a></dd>
              </div>
            )}
            {organization.contact_phone && (
              <div>
                <dt className="text-sm font-medium text-slate-500">Phone</dt>
                <dd><a href={`tel:${organization.contact_phone}`} className="text-emerald-700 hover:underline">{organization.contact_phone}</a></dd>
              </div>
            )}
            {organization.website_url && (
              <div>
                <dt className="text-sm font-medium text-slate-500">Website</dt>
                <dd>
                  {website ? (
                    <a href={website} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">
                      {organization.website_url} <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : organization.website_url}
                </dd>
              </div>
            )}
            {address && (
              <div>
                <dt className="text-sm font-medium text-slate-500">Address</dt>
                <dd className="whitespace-pre-line">{address}</dd>
              </div>
            )}
          </dl>
        </aside>
      </div>

      <section id="organization-opportunities" className="scroll-mt-6 space-y-5">
        <h2 className="text-3xl font-bold text-slate-950">Volunteer opportunities</h2>
        <p className="text-slate-700">Find a way to support {organization.name}.</p>
        {listingsError ? (
          <p role="alert" className="alert-error">This organization&apos;s opportunities could not be loaded. Please try again.</p>
        ) : (
          <>
            <h3 className="text-xl font-semibold text-slate-950">Upcoming and ongoing opportunities</h3>
            {upcoming.length ? (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} />)}
              </div>
            ) : (
              <p className="rounded-xl bg-white p-6 text-slate-700 shadow-sm">
                No upcoming opportunities right now. Check back soon or contact us to learn how you can help.
              </p>
            )}
            {past.length > 0 && (
              <details className="rounded-xl border border-slate-200 p-5">
                <summary className="cursor-pointer text-xl font-semibold text-slate-950">Past opportunities ({past.length})</summary>
                <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {[...past].reverse().map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} />)}
                </div>
              </details>
            )}
          </>
        )}
      </section>
    </section>
  );
}
