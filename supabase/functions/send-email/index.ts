import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Auth <onboarding@resend.dev>"; // change later
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET")?.replace("v1,whsec_", "");

function hookError(status: number, message: string) {
  return new Response(
    JSON.stringify({ error: { http_code: status, message } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

interface EmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new?: string;
  token_hash_new?: string;
}

interface HookPayload {
  user: {
    id: string;
    email: string;
    // other user fields...
  };
  email_data: EmailData;
}

serve(async (req: Request) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!HOOK_SECRET) {
    return hookError(500, "SEND_EMAIL_HOOK_SECRET is not configured");
  }

  try {
    const body = await req.text();
    let payload: HookPayload;
    try {
      payload = new Webhook(HOOK_SECRET).verify(
        body,
        Object.fromEntries(req.headers)
      ) as HookPayload;
    } catch {
      return hookError(401, "Invalid hook signature");
    }
    const { user, email_data } = payload;

    if (!user?.email || !email_data) {
      return hookError(400, "Missing user or email_data");
    }

    // Verification endpoint lives on the Supabase project, not the app's site_url.
    const confirmationUrl = `${SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(email_data.token_hash)}&type=${encodeURIComponent(email_data.email_action_type)}&redirect_to=${encodeURIComponent(email_data.redirect_to)}`;

    // Decide subject + HTML based on the action type
    let subject = "Confirm your email";
    let html = `
      <h2>Confirm your signup</h2>
      <p>Thanks for signing up! Click the link below to confirm your email address:</p>
      <p><a href="${confirmationUrl}">Confirm email address</a></p>
      <p>Or copy and paste this URL into your browser:</p>
      <p>${confirmationUrl}</p>
    `;

    switch (email_data.email_action_type) {
      case "signup":
        subject = "Confirm your signup";
        break;
      case "magiclink":
        subject = "Your magic link";
        html = `
          <h2>Your magic link</h2>
          <p>Click the link below to sign in:</p>
          <p><a href="${confirmationUrl}">Sign in</a></p>
          <p>This link expires soon.</p>
        `;
        break;
      case "recovery":
        subject = "Reset your password";
        html = `
          <h2>Reset your password</h2>
          <p>Click the link below to reset your password:</p>
          <p><a href="${confirmationUrl}">Reset password</a></p>
        `;
        break;
      case "invite":
        subject = "You’ve been invited";
        html = `
          <h2>You have been invited</h2>
          <p>Click the link below to accept the invitation:</p>
          <p><a href="${confirmationUrl}">Accept invite</a></p>
        `;
        break;
      case "email_change":
        subject = "Confirm email change";
        html = `
          <h2>Confirm email change</h2>
          <p>Click the link below to confirm your new email address:</p>
          <p><a href="${confirmationUrl}">Confirm new email</a></p>
        `;
        break;
      default:
        subject = "Authentication email";
    }

    // Send email via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [user.email],
        subject,
        html,
      }),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text();
      console.error("Resend error:", errorData);
      return hookError(resendResponse.status, `Resend rejected the email: ${errorData}`);
    }

    const data = await resendResponse.json();
    console.log("Email sent successfully:", data.id);

    // Important: return 200 so Supabase knows the hook succeeded
    return new Response(
      JSON.stringify({ message: "Email sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Hook error:", error);
    return hookError(500, error instanceof Error ? error.message : String(error));
  }
});