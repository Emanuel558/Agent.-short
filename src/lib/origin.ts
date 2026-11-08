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

/** A narrow allowance for the tunnel's documented Host/Origin rewrite.
 * Fetch Metadata cannot be forged by cross-origin browser JavaScript. Still
 * require an exact configured Codespace host, HTTPS forwarding and matching
 * loopback Origin/Host/port. Forwarded headers alone never authorize a write.
 */
function isCodespacesRewrite(
  request: Request,
  actual: string | null,
  expected: string | null,
): boolean {
  if (
    !actual ||
    !expected ||
    !process.env.CODESPACE_NAME ||
    request.headers.get("sec-fetch-site") !== "same-origin"
  )
    return false;
  const internal = new URL(actual);
  const external = new URL(expected);
  const domain =
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev";
  if (
    !internal.port ||
    !["localhost", "127.0.0.1", "[::1]"].includes(internal.hostname)
  )
    return false;
  if (
    external.protocol !== "https:" ||
    external.port ||
    external.hostname !==
      `${process.env.CODESPACE_NAME}-${internal.port}.${domain}`.toLowerCase()
  )
    return false;
  const backend = parseOrigin(
    `${internal.protocol}//${request.headers.get("host") || ""}`,
  );
  const forwarded = parseOrigin(
    `https://${request.headers.get("x-forwarded-host") || ""}`,
  );
  return (
    backend === actual &&
    forwarded === expected &&
    request.headers.get("x-forwarded-proto") === "https"
  );
}

export class OriginRejection extends AppError {
  constructor(
    public readonly code: "CSRF_FETCH_SITE" | "CSRF_ORIGIN_MISMATCH",
    public readonly originCheck: {
      received: string | null;
      expected: string | null;
      source: "APP_ORIGIN" | "codespaces" | "direct";
      forwardedOrigin: string | null;
      backendOrigin: string | null;
    },
  ) {
    super(
      403,
      "Cross-site requests are not allowed. See the response's originCheck fields for the compared origins and configuration source.",
    );
  }
}

export function assertSameOrigin(request: Request): void {
  const supplied = request.headers.get("origin");
  const actual = supplied === null ? null : parseOrigin(supplied);
  const url = new URL(request.url);
  const directOrigin = parseOrigin(
    `${url.protocol}//${request.headers.get("host") || url.host}`,
  );
  const configured = configuredAppOrigin();
  const expected = configured || directOrigin;
  // Only normalized origins are returned for diagnosis; never echo raw headers,
  // cookies, request content, credentials or environment secret values.
  const details = {
    received: actual,
    expected,
    source: (process.env.APP_ORIGIN
      ? "APP_ORIGIN"
      : configured
        ? "codespaces"
        : "direct") as "APP_ORIGIN" | "codespaces" | "direct",
    backendOrigin: directOrigin,
    forwardedOrigin: parseOrigin(
      `https://${request.headers.get("x-forwarded-host") || ""}`,
    ),
  };
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new OriginRejection("CSRF_FETCH_SITE", details);
  // Preserve JSON CLI requests without Origin. Content-type/size checks follow.
  if (supplied === null) return;
  if (actual && actual === expected) return;
  if (isCodespacesRewrite(request, actual, configured)) return;
  throw new OriginRejection("CSRF_ORIGIN_MISMATCH", details);
}
