import { AppError } from "./errors";

/** Parse one HTTP(S) origin, never a URL containing credentials or a path. */
function parseOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.href !== `${url.origin}/` ||
      url.hostname.includes("*")
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Trusted server configuration only. No wildcard origins or request headers. */
export function configuredAppOrigin(): string | null {
  if (process.env.APP_ORIGIN) {
    const origin = parseOrigin(process.env.APP_ORIGIN);
    if (!origin)
      throw new AppError(
        503,
        "APP_ORIGIN must be one HTTP(S) origin without a path, query, or credentials.",
      );
    return origin;
  }
  if (!process.env.CODESPACE_NAME) return null;
  const name = process.env.CODESPACE_NAME;
  const domain =
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev";
  const label = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
  if (
    !label.test(name) ||
    !domain.split(".").every((part) => label.test(part))
  ) {
    throw new AppError(
      503,
      "The Codespaces forwarding environment is invalid. Check the server configuration.",
    );
  }
  // The development container forwards port 3000. Use APP_ORIGIN for another port.
  return new URL(`https://${name}-3000.${domain}`).origin;
}

export function assertSameOrigin(request: Request): void {
  const forbidden = () =>
    new AppError(
      403,
      "Cross-site requests are not allowed. Open this Codespace’s private port 3000 URL, or set server-side APP_ORIGIN to the exact app origin and restart Next.js.",
    );
  if (request.headers.get("sec-fetch-site") === "cross-site") throw forbidden();
  const supplied = request.headers.get("origin");
  // Non-browser tools can omit Origin, as before. JSON-only bodies and Fetch
  // Metadata protection still apply; this single-user app relies on a private port.
  if (supplied === null) return;
  const actual = parseOrigin(supplied);
  const url = new URL(request.url);
  // On a direct connection Next.js can use its bind address (0.0.0.0) in the
  // request URL. Host is the browser's destination, unlike forwarded headers.
  const directOrigin = parseOrigin(
    `${url.protocol}//${request.headers.get("host") || url.host}`,
  );
  const expected = configuredAppOrigin() || directOrigin;
  // Compare the complete normalized origin (scheme, hostname and port). Codespaces
  // may rewrite Host/URL to localhost, so pin its external origin independently.
  // X-Forwarded-Host/Proto can be absent, rewritten, or comma-separated: none of
  // them may grant an origin access. Other Codespaces are not implicitly trusted.
  if (!actual || actual !== expected) throw forbidden();
}
