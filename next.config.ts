import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Accounting data changes constantly; disable component caching
  // so searchParams + Prisma queries always reflect the latest period.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
