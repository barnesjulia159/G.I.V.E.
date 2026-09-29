import { RoleGate } from "@/components/RoleGate";
import { createClient } from "@/lib/supabase/server";
import { Organization } from "@/lib/types";

type AdminOrganizationsPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

type OrganizationWithProfile = Organization & {
  profiles: {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export default async function AdminOrganizationsPage({
  searchParams,
}: AdminOrganizationsPageProps) {
  const params = await searchParams;

  return (
    <RoleGate allowedRoles={["admin"]}>
      <AdminOrganizationsContent
        message={params.message}
        error={params.error}
      />
    </RoleGate>
  );
}

async function AdminOrganizationsContent({
  message,
  error,
}: {
  message?: string;
  error?: string;
}) {
  const supabase = await createClient();

  const { data, error: queryError } = await supabase
    .from("organizations")
    .select(
      `
      *,
      profiles (
        display_name,
        first_name,
        last_name
      )
    `
    )
    .order("created_at", { ascending: false });

  const organizations = (data || []) as OrganizationWithProfile[];

  return (
    <section>
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Manage Organizations</h1>

        <p className="mt-2 text-slate-700">
          Review nonprofit organization profiles.
        </p>
      </div>

      {message && <p className="alert-info mb-4">{message}</p>}
      {error && <p className="alert-error mb-4">{error}</p>}
      {queryError && <p className="alert-error mb-4">{queryError.message}</p>}

      <div className="space-y-4">
        {organizations.map((organization) => {
          const ownerName =
            organization.profiles?.display_name ||
            [
              organization.profiles?.first_name,
              organization.profiles?.last_name,
            ]
              .filter(Boolean)
              .join(" ") ||
            "Unknown owner";

          return (
            <article
              key={organization.id}
              className="rounded-xl bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {organization.name}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Owner: {ownerName}
                  </p>

                  <p className="mt-3 text-slate-700">
                    {organization.mission_statement}
                  </p>

                  <div className="mt-4 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                    <p>
                      <strong>Contact:</strong> {organization.contact_name}
                    </p>

                    <p>
                      <strong>Email:</strong> {organization.contact_email}
                    </p>

                    <p>
                      <strong>Phone:</strong>{" "}
                      {organization.contact_phone || "N/A"}
                    </p>

                    <p>
                      <strong>Location:</strong>{" "}
                      {[organization.city, organization.state]
                        .filter(Boolean)
                        .join(", ") || "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {organizations.length === 0 && (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-slate-700">No organizations were found.</p>
          </div>
        )}
      </div>
    </section>
  );
}
