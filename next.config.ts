import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page in this app is per-user and read straight from the database,
  // so the classic dynamic rendering model is used and Cache Components stay off.
  //
  // PGlite (local and test database) loads WASM and data files from its own
  // package folder, and mammoth reads .docx archives with Node APIs. Both are
  // kept out of the server bundle and required from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "mammoth"],
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
