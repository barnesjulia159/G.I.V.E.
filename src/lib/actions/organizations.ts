"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function saveOrganizationProfile(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const organization = {
    user_id: user.id,
    name: String(formData.get("name") || "").trim(),
    mission_statement: String(formData.get("mission_statement") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    contact_name: String(formData.get("contact_name") || "").trim(),
    contact_email: String(formData.get("contact_email") || "").trim(),
    contact_phone: String(formData.get("contact_phone") || "").trim(),
    website_url: String(formData.get("website_url") || "").trim(),
    address_line1: String(formData.get("address_line1") || "").trim(),
    address_line2: String(formData.get("address_line2") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    state: String(formData.get("state") || "").trim(),
    zip_code: String(formData.get("zip_code") || "").trim(),
  };

  if (!organization.name || !organization.mission_statement || !organization.contact_email) {
    redirect("/nonprofit/organization?error=Organization name, mission statement, and contact email are required.");
  }

  const { data: existing } = await supabase
    .from("organizations")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const query = existing
    ? supabase.from("organizations").update(organization).eq("id", existing.id)
    : supabase.from("organizations").insert(organization);

  const { error } = await query;

  if (error) {
    redirect(`/nonprofit/organization?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/nonprofit/dashboard?message=Organization profile saved.");
}
