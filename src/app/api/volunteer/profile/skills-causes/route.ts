import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfile } from "@/lib/authorization";
import { isActiveRole } from "@/lib/access-control";

type SkillsAndCauses = {
  skills: string[];
  causes: string[];
};

function parseSkillsAndCauses(raw: string | null): SkillsAndCauses {
  if (!raw) return { skills: [], causes: [] };
  try {
    const parsed = JSON.parse(raw);
    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      causes: Array.isArray(parsed.causes) ? parsed.causes : [],
    };
  } catch {
    return { skills: [], causes: [] };
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!isActiveRole(await getActiveProfile(user.id), ["volunteer"])) {
    return NextResponse.json({ message: "An active volunteer account is required" }, { status: 403 });
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { skillsAndCauses: true },
  });

  if (!profile) {
    return NextResponse.json({ message: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json(parseSkillsAndCauses(profile.skillsAndCauses), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!isActiveRole(await getActiveProfile(user.id), ["volunteer"])) {
    return NextResponse.json({ message: "An active volunteer account is required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const skills = Array.isArray(body?.skills) ? body.skills.filter((s: unknown) => typeof s === "string") : [];
  const causes = Array.isArray(body?.causes) ? body.causes.filter((c: unknown) => typeof c === "string") : [];

  await prisma.profile.update({
    where: { id: user.id },
    data: { skillsAndCauses: JSON.stringify({ skills, causes }) },
  });

  return NextResponse.json({ skills, causes });
}
