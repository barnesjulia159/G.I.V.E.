"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/lib/types";
import { prisma } from "@/lib/prisma";

function authErrorMessage(error: { message?: string; status?: number }) {
  const message = error.message?.trim();
  // Network-level fetch failures surface as an empty "{}" message.
  if (!message || message === "{}") {
    return "We couldn't reach the authentication service. Please try again.";
  }
  return message;
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    redirect("/login?error=Email and password are required.");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Sign-in failed", error);
    redirect(`/login?error=${encodeURIComponent(authErrorMessage(error))}`);
  }

  redirect("/volunteer/dashboard");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const firstName = String(formData.get("first_name") || "").trim();
  const lastName = String(formData.get("last_name") || "").trim();
  const role = String(formData.get("role") || "volunteer") as UserRole;

  if (!email || !password) {
    redirect("/register?error=Email and password are required.");
  }

  const duplicateMessage = "An account with this email already exists. Please log in instead.";

  let emailTaken = false;
  try {
    emailTaken = Boolean(
      await prisma.users.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, deleted_at: null },
        select: { id: true },
      })
    );
  } catch (lookupError) {
    console.error("Duplicate email lookup failed", lookupError);
  }

  if (emailTaken) {
    redirect(`/register?error=${encodeURIComponent(duplicateMessage)}`);
  }

  if (!["volunteer", "nonprofit"].includes(role)) {
    redirect("/register?error=Invalid account type.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        Email: email,
        first_name: firstName,
        last_name: lastName,
        display_name: `${firstName} ${lastName}`.trim() || email,
        role,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/callback`,
    },
  });

  if (error) {
    console.error("Sign-up failed", error);
    const message = error.code === "user_already_exists" ? duplicateMessage : authErrorMessage(error);
    redirect(`/register?error=${encodeURIComponent(message)}`);
  }

  // Supabase returns a user with no identities (instead of an error) when the email is already registered.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    redirect(`/register?error=${encodeURIComponent(duplicateMessage)}`);
  }

  if (data.user?.email) {
    try {
      await prisma.profile.updateMany({
        where: { id: data.user.id },
        data: { email: data.user.email },
      });
    } catch (syncError) {
      console.error("Failed to sync profile email after sign-up", syncError);
    }
  }

  redirect("/login?message=Account created. Please log in.");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/");
}
