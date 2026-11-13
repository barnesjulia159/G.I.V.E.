import { NextResponse } from "next/server";
import { updatePassword } from "@/lib/actions/auth";

export async function POST(request: Request) {
  let formData: Awaited<ReturnType<Request["formData"]>>;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("Invalid password reset request:", error);
    return NextResponse.json(
      { error: "The password reset request was invalid. Please try again." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (!("get" in formData) || typeof formData.get !== "function") {
    console.error("Password reset request did not contain readable form data");
    return NextResponse.json(
      { error: "The password reset request was invalid. Please try again." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const get = formData.get;
  const result = await updatePassword({ get: (name) => get.call(formData, name) });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
