import { test } from "node:test";
import { request as rawRequest } from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
const root = fileURLToPath(new URL("../../", import.meta.url));
const publicOrigin = "https://creator-3000.app.github.dev";
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function start(database) {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [
      "--import",
      join(root, "tests/helpers/gemini-fetch.mjs"),
      join(root, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      stdio: "ignore",
      env: {
        ...process.env,
        APP_ORIGIN: publicOrigin,
        CODESPACE_NAME: "creator",
        GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
        AI_PROVIDER: "demo",
        DATABASE_PATH: database,
        GEMINI_API_KEY: "autotube-e2e-gemini-key",
        GEMINI_MODEL: "gemini-2.5-flash",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  );
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await exited;
  };
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base + "/api/provider")).ok) return { base, stop };
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await stop();
  throw new Error(
    "Production server did not become ready. Run npm run build first.",
  );
}
const headers = {
  "content-type": "application/json",
  origin: "http://localhost:3000",
  host: "localhost:3000",
  "x-forwarded-host": "creator-3000.app.github.dev",
  "x-forwarded-proto": "https",
  "sec-fetch-site": "same-origin",
};
async function call(server, path, method = "GET", data, changes = {}) {
  // Node Fetch rewrites Host to its connection target. Use a raw HTTP client so
  // this regression really sends the proxy's localhost Host header unchanged.
  return new Promise((resolve, reject) => {
    const req = rawRequest(
      new URL(path, server.base),
      { method, headers: { ...headers, ...changes } },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), { status: res.statusCode }),
          ),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(15000, () =>
      req.destroy(new Error("Forwarded request timed out")),
    );
    req.end(data === undefined ? undefined : JSON.stringify(data));
  });
}

test("real Next.js production routes accept the tunnel Origin rewrite and preserve project history", async () => {
  const dir = await mkdtemp(join(tmpdir(), "autotube-forwarded-"));
  const db = join(dir, "projects.sqlite");
  let server;
  try {
    server = await start(db);
    const created = await call(server, "/api/projects", "POST", {
      title: "Forwarded request regression",
      topic: "Original creative storytelling",
      language: "en",
      format: "short",
      duration: 60,
    });
    assert.equal(created.status, 201);
    const project = await created.json();
    const selected = await call(server, "/api/provider", "PUT", {
      provider: "gemini",
    });
    assert.equal(selected.status, 200);
    assert.equal((await selected.json()).id, "gemini");
    const generated = await call(
      server,
      `/api/projects/${project.id}/generate`,
      "POST",
      { version: project.version },
    );
    assert.equal(generated.status, 200);
    const saved = await generated.json();
    assert.equal(saved.provider, "gemini");
    assert.equal(saved.status, "script_ready");
    const before = await (
      await call(server, `/api/projects/${project.id}/history`)
    ).json();
    assert.equal(before.length, 3);
    const blocked = await call(
      server,
      "/api/provider",
      "PUT",
      { provider: "demo" },
      { "sec-fetch-site": "cross-site" },
    );
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).code, "CSRF_FETCH_SITE");
    const forged = await call(
      server,
      "/api/provider",
      "PUT",
      { provider: "demo" },
      { "x-forwarded-host": "attacker.example" },
    );
    assert.equal(forged.status, 403);
    const rejection = await forged.json();
    assert.equal(rejection.code, "CSRF_ORIGIN_MISMATCH");
    assert.equal(rejection.originCheck.received, "http://localhost:3000");
    assert.equal(rejection.originCheck.expected, publicOrigin);
    assert.equal(rejection.originCheck.source, "APP_ORIGIN");
    assert.equal(
      new URL(rejection.originCheck.backendOrigin).host,
      "localhost:3000",
    );
    await server.stop();
    server = await start(db);
    const reopened = await (
      await call(server, `/api/projects/${project.id}`)
    ).json();
    assert.deepEqual(reopened, saved);
    const revisions = await (
      await call(server, `/api/projects/${project.id}/history`)
    ).json();
    assert.deepEqual(revisions, before);
    assert.equal(
      (await (await call(server, "/api/provider")).json()).id,
      "gemini",
    );
    const exported = await call(
      server,
      `/api/projects/${project.id}/export?format=txt`,
    );
    assert.equal(exported.status, 200);
    assert.match(await exported.text(), /ordinary object/);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
