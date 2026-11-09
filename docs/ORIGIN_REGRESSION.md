# Codespaces Origin rewrite regression

## Evidence and limits

The reported browser PUT had the public HTTPS Codespaces URL as Origin, Sec-Fetch-Site: same-origin, and an application JSON 403. This rules out the cross-site Fetch Metadata branch **at the browser**. It does not reveal the header values received after the proxy or the server's APP_ORIGIN.

The [Microsoft tunnel contract](https://pkg.go.dev/github.com/microsoft/dev-tunnels/go/tunnels#TunnelOptions) documents rewriting both Host and Origin to localhost. [Microsoft's tunnel issue](https://github.com/microsoft/dev-tunnels/issues/284) includes a reproduction. This is the crucial case omitted from the previous tests, which varied Host and forwarding headers but left Origin public.

A confirmed code defect was reproduced with this server-side pattern:

```text
PUT /api/provider (also POST /api/projects)
Origin: http://localhost:3000
Host: localhost:3000
X-Forwarded-Host: creator-3000.app.github.dev
X-Forwarded-Proto: https
Sec-Fetch-Site: same-origin

Configured public origin: https://creator-3000.app.github.dev
```

Before the patch, `actual !== expected` returned 403 even when APP_ORIGIN correctly held the public origin. Rewriting to `https://localhost:3000` failed in the same way. This explains why merely setting the public APP_ORIGIN cannot fix this proxy pattern. The new regression tests failed against the old guard before it was changed.

This is a confirmed defect and reproduction, not a claim that the live proxy headers were captured. The private Codespace is inaccessible to the assistant: its URL redirects to GitHub sign-in and the GitHub integration lacks Codespaces access. The live APP_ORIGIN and deployed process cannot be independently verified here. Live acceptance remains required.

## Minimal authorization change

The usual exact full-origin comparison remains. A second path permits the documented rewrite only when **all** conditions hold:

- A server-configured Codespace identity exists.
- The configured public HTTPS hostname exactly identifies that Codespace and the internal port; no public URL port or wildcard is allowed.
- Origin is an HTTP(S) loopback URL with that explicit port and matches the backend Host authority.
- X-Forwarded-Host is one unambiguous host matching the configured public origin.
- X-Forwarded-Proto is exactly https.
- Sec-Fetch-Site is exactly same-origin.

Browser JavaScript cannot forge Sec-Fetch-Site. Other sites, including same-site sibling origins, cannot use this rewrite path. Forwarding headers alone cannot grant access. A conflicting APP_ORIGIN remains rejected, not silently overridden. Non-Codespaces deployments, JSON-only bodies, body size limits, and existing cross-site rejection stay protected. This does not add authentication: keep the forwarded port private.

Next.js allowedDevOrigins applies to internal dev/HMR resources, not these application API handlers. Changing it cannot repair the custom guard's origin comparison. No Next.js security configuration is disabled by this patch.

## Diagnostics

Rejected requests now include `code` and `originCheck` in the existing JSON error response:

- `CSRF_FETCH_SITE` identifies the Fetch Metadata rejection.
- `CSRF_ORIGIN_MISMATCH` identifies the origin comparison/rewrite-proof rejection.
- `received`, `expected`, `source`, `forwardedOrigin`, and `backendOrigin` show normalized origins and the configuration source. `backendOrigin` uses Next.js's reconstructed request scheme and Host, not an independent observation of the transport.

These fields never contain cookies, credentials, API keys, raw header dumps, URL paths, or request bodies. Invalid origin strings are represented as null. They make a remaining APP_ORIGIN conflict or unexpected proxy pattern visible in one failed request rather than inviting another generic environment change.

## Automated reproduction

```sh
npm test
npm run typecheck
npm run build
npm run test:forwarded
npm run test:e2e
```

The forwarded integration test starts the built Next.js server, sends the rewritten request through the real route handlers, creates a project, saves Gemini, generates validated scenes, checks rejected cross-site/foreign-host controls, restarts its isolated server, and checks SQLite project/history/provider persistence and export. Only Google is mocked; no paid API request is made.

The test uses Node's raw HTTP client because Node Fetch rewrites Host to its connection destination. A test that merely sets a Host option on Fetch would not actually reproduce this wire pattern. A rejection assertion verifies the backend observed localhost:3000. All test databases are temporary and do not touch the user's data directory.

## Live acceptance after deploying this commit

1. Update the existing Phase 1 checkout to the patch commit and load that version in the Codespace's running server. This is deployment of changed code, not a generic restart workaround. Keep its private port and existing SQLite data.
2. In Network, save Gemini. Expect PUT /api/provider **200**. Reload Settings and verify the selection remains Gemini.
3. Create an explicitly named test project. Expect POST /api/projects **201**. Reload and reopen it.
4. Generate a script, then edit, save, reload and export. Test both formats. A provider quota error is separate from CSRF and does not prove successful generation.
5. If either write still returns 403, capture that response's `code` and `originCheck` only. Those fields show exactly what the live server compared. No speculative configuration changes are needed before reading them.

Record the deployed commit, the two write statuses, and the reload result in PR #1. Do not mark the live issue closed solely from CI.
