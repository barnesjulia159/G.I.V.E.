import { RoleGate } from "@/components/RoleGate";
import { createClient } from "@/lib/supabase/server";
import { Profile } from "@/lib/types";

export default async function AdminUsersPage() {
  return (
    <RoleGate allowedRoles={["admin"]}>
      <AdminUsersContent />
    </RoleGate>
  );
}

async function AdminUsersContent() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const users = (data || []) as Profile[];

  return (
    <section>
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Manage Users</h1>

        <p className="mt-2 text-slate-700">
          View registered users and their platform roles.
        </p>
      </div>

      {error && <p className="alert-error mb-4">{error.message}</p>}

      <div
        className="table-scroll rounded-xl bg-white p-6 shadow-sm"
        role="region"
        aria-label="Users table"
        tabIndex={0}
      >
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-600">
              <th scope="col" className="py-3 pr-4">Name</th>
              <th scope="col" className="py-3 pr-4">Role</th>
              <th scope="col" className="py-3 pr-4">Approval</th>
              <th scope="col" className="py-3 pr-4">Status</th>
              <th scope="col" className="py-3 pr-4">Location</th>
              <th scope="col" className="py-3 pr-4">Created</th>
            </tr>
          </thead>

          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b">
                <td className="py-3 pr-4">
                  <p className="font-medium">
                    {user.display_name ||
                      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
                      "Unnamed User"}
                  </p>
                  <p className="text-xs text-slate-500">{user.id}</p>
                </td>

                <td className="py-3 pr-4 capitalize">{user.role}</td>

                <td className="py-3 pr-4 capitalize">
                  {user.approval_status}
                </td>

                <td className="py-3 pr-4">
                  {user.is_active ? "Active" : "Inactive"}
                </td>

                <td className="py-3 pr-4">
                  {[user.city, user.state].filter(Boolean).join(", ") || "N/A"}
                </td>

                <td className="py-3 pr-4">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <p className="py-6 text-slate-700">No users were found.</p>
        )}
      </div>
    </section>
  );
}
