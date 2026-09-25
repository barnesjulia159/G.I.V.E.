"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AVAILABILITY_DAYS } from "@/lib/types";

export async function updateVolunteerProfile(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = {
    first_name: String(formData.get("first_name") || "").trim(),
    last_name: String(formData.get("last_name") || "").trim(),
    display_name: String(formData.get("display_name") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    state: String(formData.get("state") || "").trim(),
    zip_code: String(formData.get("zip_code") || "").trim(),
    bio: String(formData.get("bio") || "").trim(),
    availability_notes: String(formData.get("availability_notes") || "").trim(),
  };

  const { error } = await supabase
    .from("profiles")
    .update(profile)
    .eq("id", user.id);

  if (error) {
    redirect(`/volunteer/profile?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/volunteer/profile?message=Profile updated.");
}

export async function updateVolunteerContact(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const contact = {
    phone: String(formData.get("phone") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    state: String(formData.get("state") || "").trim(),
    zip_code: String(formData.get("zip_code") || "").trim(),
  };

  const { error } = await supabase
    .from("profiles")
    .update(contact)
    .eq("id", user.id);

  if (error) {
    redirect(`/volunteer/profile?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/volunteer/profile?message=Contact information updated.");
}

export async function updateVolunteerBio(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const bio = String(formData.get("bio") || "").trim();

  const { error } = await supabase
    .from("profiles")
    .update({ bio })
    .eq("id", user.id);

  if (error) {
    redirect(`/volunteer/profile?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/volunteer/profile?message=Bio updated.");
}

export async function updateVolunteerAvailability(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const availability = Object.fromEntries(
    AVAILABILITY_DAYS.map((day) => [
      day,
      {
        am: formData.get(`${day}_am`) === "on",
        pm: formData.get(`${day}_pm`) === "on",
      },
    ])
  );

  const { error } = await supabase
    .from("profiles")
    .update({ availability_notes: JSON.stringify(availability) })
    .eq("id", user.id);

  if (error) {
    redirect(`/volunteer/profile?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/volunteer/profile?message=Availability updated.");
}
