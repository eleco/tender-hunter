import { NextRequest, NextResponse } from "next/server";

function unauthorizedResponse() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Tender Hunter Admin"',
    },
  });
}

export function middleware(request: NextRequest) {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    return new NextResponse("Admin auth is not configured.", { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) {
    return unauthorizedResponse();
  }

  let decoded = "";
  try {
    decoded = atob(authorization.slice(6));
  } catch {
    return unauthorizedResponse();
  }

  const separatorIndex = decoded.indexOf(":");
  const providedUsername = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;
  const providedPassword = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

  if (providedUsername !== username || providedPassword !== password) {
    return unauthorizedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
