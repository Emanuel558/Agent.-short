import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Permit HMR through this Codespace's private forwarded origin, plus local tests.
  allowedDevOrigins: [
    "127.0.0.1",
    ...(process.env.CODESPACE_NAME
      ? [
          `${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev"}`,
        ]
      : []),
  ],
};
export default config;
