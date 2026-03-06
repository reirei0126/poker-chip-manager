import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/poker-chip-manager',
  images: { unoptimized: true },
};

export default nextConfig;
