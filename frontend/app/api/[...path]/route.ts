import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_BACKEND_ORIGIN = "http://backend:8000";

async function proxy(request: NextRequest): Promise<NextResponse> {
  const backendOrigin = (
    process.env.INTERNAL_BACKEND_URL || DEFAULT_BACKEND_ORIGIN
  ).replace(/\/+$/, "");

  const targetUrl = `${backendOrigin}${request.nextUrl.pathname}${request.nextUrl.search}`;

  const forwardHeaders = new Headers();
  const headerAllowlist = [
    "authorization",
    "content-type",
    "accept",
    "cookie",
    "user-agent",
  ];

  for (const name of headerAllowlist) {
    const value = request.headers.get(name);
    if (value !== null) {
      forwardHeaders.set(name, value);
    }
  }

  const host = request.headers.get("host");
  if (host) {
    forwardHeaders.set("x-forwarded-host", host);
  }
  const proto =
    request.headers.get("x-forwarded-proto") ||
    request.nextUrl.protocol.replace(":", "");
  if (proto) {
    forwardHeaders.set("x-forwarded-proto", proto);
  }

  const isBodyless = request.method === "GET" || request.method === "HEAD";
  const body = isBodyless ? undefined : await request.arrayBuffer();

  const isGoogleAuth = request.nextUrl.pathname.startsWith("/api/auth/google");

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
      redirect: isGoogleAuth ? "manual" : "follow",
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const passthroughHeaders = [
      "content-type",
      "content-disposition",
      "cache-control",
      "location",
    ];
    for (const name of passthroughHeaders) {
      const value = upstreamResponse.headers.get(name);
      if (value !== null) {
        responseHeaders.set(name, value);
      }
    }

    if (typeof upstreamResponse.headers.getSetCookie === "function") {
      for (const cookie of upstreamResponse.headers.getSetCookie()) {
        responseHeaders.append("set-cookie", cookie);
      }
    }

    if (
      upstreamResponse.status === 204 ||
      upstreamResponse.status === 205 ||
      upstreamResponse.status === 304
    ) {
      return new NextResponse(null, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    }

    const responseBuffer = await upstreamResponse.arrayBuffer();
    return new NextResponse(responseBuffer, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[API Proxy] Failed to reach backend:", targetUrl, error);
    return NextResponse.json(
      { detail: "Không thể kết nối tới máy chủ Backend nội bộ." },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
