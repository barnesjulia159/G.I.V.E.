"use server";

import { headers } from "next/headers";
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
    const params = new URLSearchParams({ error: authErrorMessage(error) });
    if (error.code === "email_not_confirmed") {
      params.set("unconfirmed", email);
    }
    redirect(`/login?${params}`);
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

export async function resendConfirmation(formData: FormData) {
  const email = String(formData.get("email") || "").trim();

  if (!email) {
    redirect("/login?error=Enter your email to resend the confirmation.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/callback`,
    },
  });

  if (error) {
    console.error("Resend confirmation failed", error);
    const params = new URLSearchParams({ error: authErrorMessage(error), unconfirmed: email });
    redirect(`/login?${params}`);
  }

  redirect("/login?message=A new confirmation email has been sent. Use the newest link in your inbox.");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") || "").trim();

  if (!email) {
    redirect("/forgot-password?error=Enter your email address.");
  }

  const supabase = await createClient();
  const origin = (await headers()).get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("/callback?next=/reset-password", origin).toString(),
  });

  if (error) {
    console.error("Password reset request failed", error);
    redirect(`/forgot-password?error=${encodeURIComponent(authErrorMessage(error))}`);
  }

  // Same message whether or not the account exists, so emails can't be probed.
  redirect("/forgot-password?message=If an account exists for that email, a password reset link has been sent.");
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");

  if (password.length < 6) {
    redirect("/reset-password?error=Password must be at least 6 characters.");
  }

  if (password !== confirmPassword) {
    redirect("/reset-password?error=Passwords do not match.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/forgot-password?error=Your reset link has expired. Please request a new one.");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("Password update failed", error);
    redirect(`/reset-password?error=${encodeURIComponent(authErrorMessage(error))}`);
  }

  await supabase.auth.signOut();
  redirect("/login?message=Your password has been updated. Please log in.");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/");
}
