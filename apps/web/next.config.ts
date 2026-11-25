import type { NextConfig } from "next";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Linting runs once for the whole workspace (`pnpm lint` at the root).
  eslint: { ignoreDuringBuilds: true },
  // The browser only talks to the web origin; `/api/*` is proxied to the NestJS
  // API so the session cookie is first-party and CORS is not involved.
  // Rewrites are resolved at build time, so API_BASE_URL must be set when building.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiBaseUrl}/api/:path*` }];
  },
};

export default nextConfig;
