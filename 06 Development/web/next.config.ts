import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  distDir: process.env.SAFR_NEXT_DIST_DIR ?? ".next",
  turbopack: {
    root: resolve(process.cwd(), ".."),
  },
};

export default nextConfig;
