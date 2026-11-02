import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isActiveRole } from "@/lib/access-control";

export async function getActiveProfile(userId: string) {
  return prisma.profile.findUnique({
    where: { id: userId, isActive: true },
    select: { id: true, role: true, isActive: true },
  });
}

export async function requireSignedInAccount(
  roles: readonly ("admin" | "nonprofit" | "volunteer")[] = ["admin", "nonprofit", "volunteer"],
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getActiveProfile(user.id);
  if (!profile || !isActiveRole(profile, roles)) {
    redirect("/login?error=An active account with the required role is needed.");
  }

  return { supabase, user, profile };
}

export async function requireActionAccount(role: "nonprofit" | "volunteer") {
  return requireSignedInAccount([role]);
}

export async function requireNonprofitOrganization() {
  const { supabase, user } = await requireActionAccount("nonprofit");
  const { data: organization, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Organization authorization lookup failed:", error);
    redirect("/nonprofit/dashboard?error=Organization access could not be verified.");
  }
  if (!organization) {
    redirect("/nonprofit/organization?error=Create an organization profile before managing opportunities.");
  }
  return { supabase, user, organization };
}
