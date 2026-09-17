import { NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin" || !profile.is_active) {
      return NextResponse.json({ error: "Only active administrators can send test emails." }, { status: 403 });
    }

    const body = await request.json();

    const {
      to,
      subject,
      message
    } = body;

    if (!to || !subject || !message) {
      return NextResponse.json(
        {
          error:
            "Recipient, subject, and message are required."
        },
        {
          status: 400
        }
      );
    }

    const resend = getResendClient();
    if (!resend) {
      return NextResponse.json(
        { error: "Email service is not configured. Set RESEND_API_KEY in the deployment environment." },
        { status: 503 }
      );
    }

    const { data, error } =
      await resend.emails.send({
        from: "GIVE <onboarding@resend.dev>",
        to: [to],
        subject,
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>${subject}</h2>
            <p>${message}</p>
          </div>
        `,
      });

    if (error) {
      console.error("Resend error:", error);

      return NextResponse.json(
        {
          error: error.message
        },
        {
          status: 500
        }
      );
    }

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error("Email API error:", error);

    return NextResponse.json(
      {
        error: "Unable to send email."
      },
      {
        status: 500
      }
    );
  }
}
