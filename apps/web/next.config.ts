import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them.
  transpilePackages: ["@studypulse/core", "@studypulse/db"],
};

export default nextConfig;
