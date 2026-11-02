import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isTrustedRequest } from "@/lib/request-security";

export async function proxy(request: NextRequest) {
  if (!isTrustedRequest(request)) {
    return NextResponse.json(
      { message: "Cross-origin requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store", Vary: "Origin, Sec-Fetch-Site" } },
    );
  }
  if (request.method === "OPTIONS" && request.nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse(null, { status: 204 });
  }
  const response = await updateSession(request);
  const path = request.nextUrl.pathname;
  if (["/volunteer", "/notifications", "/api/notifications", "/api/volunteer", "/api/attendance"].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  )) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image).*)",
  ],
};