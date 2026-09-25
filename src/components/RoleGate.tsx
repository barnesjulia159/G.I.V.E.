import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/lib/types";
import { prisma } from "@/lib/prisma";

const ROLE_HOME_PATH: Record<UserRole, string> = {
  volunteer: "/volunteer/dashboard",
  nonprofit: "/nonprofit/dashboard",
  admin: "/admin/dashboard",
};

type RoleGateProps = {
  allowedRoles: UserRole[];
  children: React.ReactNode;
};

export async function RoleGate({ allowedRoles, children }: RoleGateProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true, isActive: true },
  });

  if (!profile) {
    redirect(
      `/login?error=${encodeURIComponent("Your account profile could not be found. Please contact support.")}`
    );
  }

  if (!profile.isActive) {
    redirect(`/login?error=${encodeURIComponent("This account is inactive.")}`);
  }

  if (!allowedRoles.includes(profile.role)) {
    redirect(ROLE_HOME_PATH[profile.role]);
  }

  return <>{children}</>;
}
