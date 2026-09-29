import { RoleGate } from "@/components/RoleGate";
import { SubmitButton } from "@/components/SubmitButton";
import { saveOrganizationProfile } from "@/lib/actions/organizations";
import { createClient } from "@/lib/supabase/server";

type NonprofitOrganizationPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function NonprofitOrganizationPage({
  searchParams,
}: NonprofitOrganizationPageProps) {
  const params = await searchParams;

  return (
    <RoleGate allowedRoles={["nonprofit"]}>
      <NonprofitOrganizationContent
        message={params.message}
        error={params.error}
      />
    </RoleGate>
  );
}

async function NonprofitOrganizationContent({
  message,
  error,
}: {
  message?: string;
  error?: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: organization } = await supabase
    .from("organizations")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <section className="mx-auto max-w-4xl rounded-xl bg-white p-6 shadow-sm">
      <h1 className="text-3xl font-bold">Organization Profile</h1>
      <p className="mt-2 text-slate-700">
        This information helps volunteers understand your mission and contact
        your organization.
      </p>

      {message && <p className="alert-info mt-4">{message}</p>}
      {error && <p className="alert-error mt-4">{error}</p>}

      <form action={saveOrganizationProfile} className="mt-6 space-y-4">
        <div className="form-field">
          <label htmlFor="name" className="form-label">
            Organization Name
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={organization?.name ?? ""}
            className="form-input"
          />
        </div>

        <div className="form-field">
          <label htmlFor="mission_statement" className="form-label">
            Mission Statement
          </label>
          <textarea
            id="mission_statement"
            name="mission_statement"
            required
            defaultValue={organization?.mission_statement ?? ""}
            className="form-input min-h-28"
          />
        </div>

        <div className="form-field">
          <label htmlFor="description" className="form-label">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            defaultValue={organization?.description ?? ""}
            className="form-input min-h-28"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="form-field">
            <label htmlFor="contact_name" className="form-label">
              Contact Name
            </label>
            <input
              id="contact_name"
              name="contact_name"
              required
              defaultValue={organization?.contact_name ?? ""}
              className="form-input"
            />
          </div>

          <div className="form-field">
            <label htmlFor="contact_email" className="form-label">
              Contact Email
            </label>
            <input
              id="contact_email"
              name="contact_email"
              type="email"
              required
              defaultValue={organization?.contact_email ?? ""}
              className="form-input"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="form-field">
            <label htmlFor="contact_phone" className="form-label">
              Contact Phone
            </label>
            <input
              id="contact_phone"
              name="contact_phone"
              defaultValue={organization?.contact_phone ?? ""}
              className="form-input"
            />
          </div>

          <div className="form-field">
            <label htmlFor="website_url" className="form-label">
              Website URL
            </label>
            <input
              id="website_url"
              name="website_url"
              defaultValue={organization?.website_url ?? ""}
              className="form-input"
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="address_line1" className="form-label">
            Address Line 1
          </label>
          <input
            id="address_line1"
            name="address_line1"
            defaultValue={organization?.address_line1 ?? ""}
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
            defaultValue={organization?.address_line2 ?? ""}
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
              defaultValue={organization?.city ?? ""}
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
              defaultValue={organization?.state ?? ""}
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
              defaultValue={organization?.zip_code ?? ""}
              className="form-input"
            />
          </div>
        </div>

        <SubmitButton>Save Organization Profile</SubmitButton>
      </form>
    </section>
  );
}
