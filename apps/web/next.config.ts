import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Linting runs once for the whole workspace (`pnpm lint` at the root).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
