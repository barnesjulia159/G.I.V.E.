import Link from "next/link";
import { PublicOpportunityListing } from "@/lib/types";

type OpportunityCardProps = {
  opportunity: PublicOpportunityListing;
};

export function OpportunityCard({ opportunity }: OpportunityCardProps) {
  const startDate = new Date(opportunity.start_at);

  return (
    <article className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <div className="mb-4">
        <p className="text-sm font-medium text-emerald-700">
          {opportunity.organization_name}
        </p>

        <h2 className="mt-1 text-xl font-semibold text-slate-950">
          {opportunity.title}
        </h2>
      </div>

      <p className="line-clamp-3 flex-1 text-sm text-slate-700">
        {opportunity.description}
      </p>

      <div className="mt-4 space-y-1 text-sm text-slate-600">
        <p>
          <strong>Date:</strong> {startDate.toLocaleDateString()}
        </p>
        <p>
          <strong>Location:</strong>{" "}
          {opportunity.is_virtual
            ? "Virtual"
            : [opportunity.city, opportunity.state].filter(Boolean).join(", ") ||
              opportunity.location_name ||
              "Location TBD"}
        </p>
        <p>
          <strong>Spots remaining:</strong> {opportunity.spots_remaining}
        </p>
      </div>

      <Link
        href={`/opportunities/${opportunity.id}`}
        className="mt-5 inline-flex self-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
      >
        View Details
      </Link>
    </article>
  );
}
