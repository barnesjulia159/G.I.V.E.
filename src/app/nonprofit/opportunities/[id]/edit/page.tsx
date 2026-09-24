import { notFound } from "next/navigation";
import { RoleGate } from "@/components/RoleGate";
import { SubmitButton } from "@/components/SubmitButton";
import { updateOpportunity } from "@/lib/actions/opportunities";
import { createClient } from "@/lib/supabase/server";
import { Opportunity } from "@/lib/types";

type EditOpportunityPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function EditOpportunityPage({
  params,
  searchParams,
}: EditOpportunityPageProps) {
  const { id } = await params;
  const queryParams = await searchParams;

  return (
    <RoleGate allowedRoles={["nonprofit"]}>
      <EditOpportunityContent id={id} error={queryParams.error} />
    </RoleGate>
  );
}

async function EditOpportunityContent({
  id,
  error,
}: {
  id: string;
  error?: string;
}) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    notFound();
  }

  const opportunity = data as Opportunity;

  return (
    <section className="mx-auto max-w-4xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="text-3xl font-bold">Edit Opportunity</h1>

      <p className="mt-2 text-slate-700">
        Update the opportunity details, save changes as a draft, publish it, or
        close it.
      </p>

      {error && <p className="alert-error mt-4">{error}</p>}

      <form action={updateOpportunity} className="mt-6 space-y-4">
        <input type="hidden" name="opportunity_id" value={opportunity.id} />

        <div className="form-field">
          <label htmlFor="title" className="form-label">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            defaultValue={opportunity.title}
            className="form-input"
          />
        </div>

        <div className="form-field">
          <label htmlFor="description" className="form-label">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            required
            defaultValue={opportunity.description}
            className="form-input min-h-32"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="form-field">
            <label htmlFor="start_at" className="form-label">
              Start Date and Time
            </label>
            <input
              id="start_at"
              name="start_at"
              type="datetime-local"
              required
              defaultValue={toDateTimeLocal(opportunity.start_at)}
              className="form-input"
            />
          </div>

          <div className="form-field">
            <label htmlFor="end_at" className="form-label">
              End Date and Time
            </label>
            <input
              id="end_at"
              name="end_at"
              type="datetime-local"
              required
              defaultValue={toDateTimeLocal(opportunity.end_at)}
              className="form-input"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="form-field">
            <label htmlFor="capacity" className="form-label">
              Capacity
            </label>
            <input
              id="capacity"
              name="capacity"
              type="number"
              min="1"
              required
              defaultValue={opportunity.capacity}
              className="form-input"
            />
          </div>

          <div className="form-field">
            <label htmlFor="minimum_age" className="form-label">
              Minimum Age
            </label>
            <input
              id="minimum_age"
              name="minimum_age"
              type="number"
              min="0"
              defaultValue={opportunity.minimum_age ?? ""}
              className="form-input"
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="location_name" className="form-label">
            Location Name
          </label>
          <input
            id="location_name"
            name="location_name"
            defaultValue={opportunity.location_name ?? ""}
            className="form-input"
          />
        </div>

        <div className="form-field">
          <label htmlFor="address_line1" className="form-label">
            Address Line 1
          </label>
          <input
            id="address_line1"
            name="address_line1"
            defaultValue={opportunity.address_line1 ?? ""}
            className="form-input"
          />
        </div>

        <div className="form-field">
          <label htmlFor="address_line2" className="form-label">
            Address Line 2
          </label>
          <input
            id="address_line2"
            name="address_line2"
            defaultValue={opportunity.address_line2 ?? ""}
            className="form-input"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="form-field">
            <label htmlFor="city" className="form-label">
              City
            </label>
            <input
              id="city"
              name="city"
              defaultValue={opportunity.city ?? ""}
              className="form-input"
            />
          </div>

          <div className="form-field">
            <label htmlFor="state" className="form-label">
              State
            </label>
            <input
              id="state"
              name="state"
              defaultValue={opportunity.state ?? ""}
              className="form-input"
            />
          </div>

          <div className="form-field">
            <label htmlFor="zip_code" className="form-label">
              ZIP Code
            </label>
            <input
              id="zip_code"
              name="zip_code"
              defaultValue={opportunity.zip_code ?? ""}
              className="form-input"
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="requirements" className="form-label">
            Requirements
          </label>
          <textarea
            id="requirements"
            name="requirements"
            defaultValue={opportunity.requirements ?? ""}
            className="form-input min-h-24"
          />
        </div>

        <div className="form-field">
          <label htmlFor="accessibility_notes" className="form-label">
            Accessibility Notes
          </label>
          <textarea
            id="accessibility_notes"
            name="accessibility_notes"
            defaultValue={opportunity.accessibility_notes ?? ""}
            className="form-input min-h-24"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <SubmitButton
            name="submit_action"
          value="draft"
            className="bg-slate-700 hover:bg-slate-800"
          >
            Save Draft
          </SubmitButton>

          <SubmitButton name="submit_action" value="publish">
            Publish
          </SubmitButton>

          <SubmitButton
            name="submit_action"
            value="close"
            className="bg-amber-600 hover:bg-amber-700"
          >
            Close Opportunity
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);

  return localDate.toISOString().slice(0, 16);
}
