import type { NextConfig } from "next";
import { configuredAppOrigin } from "./src/lib/origin";
const appOrigin = configuredAppOrigin();
const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Permit HMR through this Codespace's private forwarded origin, plus local tests.
  allowedDevOrigins: [
    "127.0.0.1",
    ...(appOrigin ? [new URL(appOrigin).hostname] : []),
  ],
};
export default config;
