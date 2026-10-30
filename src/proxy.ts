import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isTrustedRequest } from "@/lib/request-security";

export async function proxy(request: NextRequest) {
  if (!isTrustedRequest(request, process.env.NEXT_PUBLIC_SITE_URL)) {
    return NextResponse.json(
      { message: "Cross-origin requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store", Vary: "Origin, Sec-Fetch-Site" } },
    );
  }
  if (request.method === "OPTIONS" && request.nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse(null, { status: 204 });
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image).*)",
  ],
};