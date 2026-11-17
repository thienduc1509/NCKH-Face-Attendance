import type { NextConfig } from "next";

type RemotePattern = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number]

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/api";
const apiOrigin = apiUrl.replace(/\/api\/?$/, "");
const backendOrigin = (process.env.INTERNAL_BACKEND_URL || "http://backend:8000").replace(/\/+$/, "");

const remotePatterns = (() => {
  try {
    const url = new URL(apiOrigin);

    return [
      {
        protocol: url.protocol.replace(":", ""),
        hostname: url.hostname,
        port: url.port,
        pathname: "/**",
      } as RemotePattern,
    ];
  } catch {
    return [];
  }
})();

const nextConfig: NextConfig = {
  output: "standalone",
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return {
      fallback: [
        {
          source: "/uploads/:path*",
          destination: `${backendOrigin}/uploads/:path*`,
        },
        {
          source: "/dataset/:path*",
          destination: `${backendOrigin}/dataset/:path*`,
        },
      ],
    };
  },
  images: {
    remotePatterns: [
      ...remotePatterns,
      {
        protocol: "http",
        hostname: "localhost",
        port: "5050",
        pathname: "/**",
      } as RemotePattern,
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "5050",
        pathname: "/**",
      } as RemotePattern,
    ],
  },
};

export default nextConfig;
