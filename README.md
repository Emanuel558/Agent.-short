# AutoTube AI

A browser-based workspace for original YouTube video scripts and scene planning. **Phase 1 only.** Built with Next.js App Router, TypeScript, Tailwind CSS, Node.js and SQLite.

No paid subscription, API key, local software installation, or YouTube account is required for the basic workflow. The default **template demo is not AI-generated or researched**. It produces labeled, localized outline prompts for you to replace with verified content. It does not render videos.

## Start in GitHub Codespaces (all in your browser)

1. Open [this repository on the Phase 1 branch](https://github.com/Emanuel558/Agent.-short/tree/feat/autotube-phase-1).
2. Select **Code → Codespaces → Create codespace on feat/autotube-phase-1**. If needed, select the branch first. Choose the standard 2-core machine.
3. Wait for setup. The dev container installs dependencies using `npm ci` and starts `npm run dev` automatically.
4. Open **Ports → 3000 → Open in Browser**. Keep its visibility **Private**. This prototype has no sign-in or multi-user isolation.
5. If the server is not running, use the Codespaces terminal (startup logs are in `/tmp/autotube-dev.log`):

   ```sh
   npm ci
   npm run dev
   ```

The forwarded browser address will look like `https://<codespace-name>-3000.app.github.dev`. Nothing needs to be installed on your school computer. Your school must allow GitHub Codespaces and its forwarded domains.

Codespaces has account-specific included usage and storage limits; it is not unlimited free hosting. Stop the Codespace when done. The demo workflow has no third-party API cost.

## First project

1. Click **Create a video** and enter a name and topic.
2. Choose **Shorts (9:16)** or **long-form (16:9)**, language, and a target duration. Shorts support 15–180 seconds; long-form supports 60–3,600 seconds.
3. Click **Create project**, then **Generate demo script**.
4. Edit each scene’s narration under **Script**. Edit headings, visual notes, and duration under **Scene plan**. Scene durations must add up to the target duration.
5. Click **Save changes**. Return to **Projects**, reopen your project, and continue editing.
6. Download **JSON** or **TXT** from the editor. Exports include the latest **saved** version, provider label, narration, scene plan, and project settings. Save edits first.
7. Open **History** to preview saved revisions. **Load revision as draft** copies its title and scenes into the editor; click **Save changes** to keep them.

Project format, language, topic, and target duration are fixed after creation in Phase 1. Create another project to change the brief. Script text is assembled from scene narration, so the script and scene plan stay consistent. Duration values are editorial planning targets, not measured audio or rendered video lengths. Long demo outlines are intentionally sparse, not full-length narration.

## Gemini cloud AI, optional Ollama, and Demo

**Script Studio (beside Generate Script) or Settings → Script provider → Save provider** chooses Gemini, Ollama, or Demo. This choice persists in SQLite and takes precedence over `AI_PROVIDER`. Changing selection does not rewrite projects or history. Each script retains the provider that generated it. Selecting a provider does not send a request; **Generate with Gemini** does when Gemini is selected. Demo remains the initial no-key default unless `AI_PROVIDER` is configured.

### Gemini setup (all inside Codespaces)

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/api-keys) for a project using Google's free tier. Do not enable or upgrade billing if you only want free usage. Eligibility and quotas depend on Google; Codespaces itself also has account usage limits.
2. Add a **Codespaces secret** named `GEMINI_API_KEY` with access to this repository, then restart the Codespace. Alternatively, add the key to ignored `.env.local` using the browser editor. Do not paste it in chat, Settings, Git, or a `NEXT_PUBLIC_` variable. Preserve any existing `.env.local` contents.
3. The server defaults to the requested model. Optional environment values:

   ```dotenv
   AI_PROVIDER=gemini
   GEMINI_MODEL=gemini-2.5-flash
   # GEMINI_API_KEY is supplied as a Codespaces secret or in .env.local
   ```

4. If you have already saved the secret, ensure it is allowed for `Emanuel558/Agent.-short`, then stop and reopen the **same Codespace** to load it into the server environment. Reopen your project or Settings. The provider controls must show **Gemini API key: loaded on server** and model **gemini-2.5-flash**. This indicates key presence, not that Google has accepted the key.
5. Beside the project's generation button, select **Google Gemini → Save provider**. The active-provider label changes to **Google Gemini** and the button to **Generate with Gemini**. Click it to make the actual request. Narration text appears in Script, and visual direction/timing in Scene plan. No voice audio is produced in Phase 1.
6. Look for **Gemini-generated draft · review required**, then edit, fact-check, save, reload, and export. Repeat with one Short and one long-form project. If quota, key access, or model availability fails, the app reports that error and preserves your saved script; it never presents Demo as a Gemini result.

**Model discovery:** Click **Check available Gemini models** beside the provider controls. It queries Google's official models endpoint using the existing server key, filters for `generateContent`, and offers reviewed free-tier candidates. Prefer `gemini-2.5-flash-lite` if listed. Choose explicitly and **Save Gemini model**; the key stays unchanged and no restart or inference request is needed to save the selection. Saved model selection overrides `GEMINI_MODEL`; **Use server GEMINI_MODEL setting** clears that override. Unknown-pricing/paid-only models are blocked in this workflow. Model listing does not guarantee free quota, billing status or generation access.

The old “model unavailable or request unsupported” message combined HTTP 400 and 404. New errors include the actual upstream status and a safe diagnosis. The latest reported failure is Google HTTP 404 / NOT_FOUND during generation; browser HTTP 502 is AutoTube's wrapper. Generation diagnostics now include the saved SQLite model, normalized model actually sent, source, API version and exact request path. After a 404, a metadata-only discovery check uses the same captured key to report whether that exact ID advertises `generateContent`. No generation is retried or alternate model selected. See [Gemini diagnosis and the single targeted live test](docs/GEMINI_DIAGNOSIS.md#investigating-the-reported-generation-404). A successful list does not establish access to generate with a particular model; the live cause remains unverified until these request-specific fields are collected.

The adapter calls the **official Gemini REST `generateContent` API** with structured JSON output. Keys are sent only in a server-side `x-goog-api-key` header to Google's fixed HTTPS endpoint. It uses a 60-second timeout, validates scene structure, nonempty narration/visuals and exact duration totals, and saves only validated output. Quota errors, unavailable models, access failures, blocked content and truncated responses are shown clearly. Failed generation preserves the existing script and history. No automatic retries, model upgrades, cloud fallback, or billing setup are performed.

**Availability limitation:** Google's current [model pricing documentation](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash) marks `gemini-2.5-flash` deprecated and announces provider-side rerouting from December 1, 2026. We retain your requested ID as the default. The app cannot control Google's aliases or detect whether your Google project already has billing. Check the current model availability and pricing for your account before use; a billed project can incur charges. You can explicitly set `GEMINI_MODEL` to another reviewed free-tier model or select Demo. The app never changes model IDs automatically.

The [Gemini API reference](https://ai.google.dev/api/generate-content) and [structured output guide](https://ai.google.dev/gemini-api/docs/structured-output) describe the official protocol. Live Gemini access has not been verified with your key; tests mock Google's HTTP responses. No key is bundled.

### If Gemini appears missing in your Codespace

The integration lives on the existing **Phase 1 branch**, not on `main` until PR #1 is merged. Update the running checkout in the Codespaces terminal:

```sh
git switch feat/autotube-phase-1
git pull --ff-only origin feat/autotube-phase-1
```

Stop and reopen the same Codespace, open private port 3000, and hard-refresh. The editor and Settings must now show the provider selector and Gemini key status. If those controls are absent, check `pwd` and `git log -1 --oneline`: the open URL may belong to another Codespace or checkout. Never delete `data/` to update the app.

If the key status says **not loaded on server**, check the secret's repository access and restart the Codespace. A safe terminal check for a Codespaces secret is:

```sh
node -e 'console.log(process.env.GEMINI_API_KEY?.trim() ? "Gemini secret is available" : "Gemini secret is not available")'
```

This prints only presence. Never run `echo` on the secret or paste it into browser code, logs, or chat. Keys from `.env.local` are loaded by Next.js rather than this standalone Node check.

### Ollama (optional local inference)

Ollama uses its native `/api/chat` structured-output endpoint. Configure server-side:

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

You must separately start Ollama and pull the model **on the Codespace or server you control**, never on your school computer. Nothing is installed automatically. Small Codespaces may lack the RAM/CPU for a model, and inference can exceed the timeout. A localhost address refers to the Codespace, not your school computer. Select Ollama in Settings and save; if it is unreachable, an explicit error is shown. Demo needs no server or key.

The earlier `AI_PROVIDER=openai-compatible`, `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` configuration is retained for compatibility. Existing projects and revisions generated with it remain readable.

### Recover Demo generation

Select **Demo** in Settings and save. It works independently of Gemini/Ollama configuration and performs no model network calls. Output remains a clearly labeled outline, not researched AI narration. Valid unsaved edits are now saved before generating; an edited title no longer silently disables generation. Invalid scene timing still produces an error without replacing your script.

If you see **Cross-site requests are not allowed**, generation has not reached a model. Read the response's `code` and `originCheck`: it reports the normalized origins compared and whether the expected value came from `APP_ORIGIN`, Codespaces, or the direct request. The tunnel can rewrite **Origin as well as Host** to localhost; the narrow Codespaces rewrite path handles that without a wildcard or a global localhost allowance. See [the reproduction and live acceptance guide](docs/ORIGIN_REGRESSION.md) before changing configuration.

## Data and privacy

- Default SQLite file: `data/autotube.sqlite`, with WAL and shared-memory sidecars. Change with server-only `DATABASE_PATH`.
- Projects and immutable revision snapshots persist across server restarts in the **same** Codespace. History shows the latest 100 revisions; older snapshots remain in the database. Deleting the Codespace deletes local data. New Codespaces have separate empty databases. Export important scripts or back up the complete database safely with the server stopped.
- The app is a **single-user development prototype**. Keep the forwarded port private. Public/multi-user deployment requires authentication and per-user authorization first.
- `.gitignore` excludes secrets, SQLite files, test output, and generated media. Do not commit personal project exports or private research notes.
- Scripts are never sent to a model in demo mode. The configured remote model receives your project brief in AI mode. No YouTube, voice, media, or analytics service is connected.

## Validation (inside Codespaces)

```sh
npm test
npm run typecheck
npm run build
```

Browser tests:

```sh
npx playwright install --with-deps chromium
npm run test:e2e
```

These install browser-test dependencies **inside Codespaces**, never on your computer. E2E tests start their own development server on port 3001 with an isolated, ignored database. They override any inherited key with an obvious test-only dummy key and preload `tests/helpers/gemini-fetch.mjs` to intercept Google requests. The real browser → API route → provider → SQLite path is exercised for Shorts, long-form, and quota recovery without calling Google. This fixture is never loaded by normal `npm run dev` or `npm start`, and cannot establish that your live account/key works. Close any other process using that port first. On a Linux environment with Chromium already installed, you may use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`.

After `npm run build`, run `npm run test:forwarded` to exercise the production Next.js routes with a raw HTTP client reproducing the tunnel Origin/Host rewrite. GitHub Actions runs Vitest, TypeScript checks, a production build, this forwarded integration test, and Chromium workflow tests on Node 22. The lockfile pins installed dependencies. For production-mode testing in your private Codespace, use `npm run build` then `npm start`.

## Architecture

| Location                        | Responsibility                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `src/app`                       | Next.js shell, Tailwind styles, API route handlers                             |
| `src/components/workspace.tsx`  | Dashboard, project creation, script editor, history, settings                  |
| `src/lib/schema.ts`             | Shared strict validation and domain types                                      |
| `src/lib/db.ts`                 | SQLite repository, atomic updates and revisions, optimistic version checks     |
| `src/lib/services/projects.ts`  | Generation lifecycle and saving rules                                          |
| `src/lib/providers`             | Replaceable text interface, Gemini, Ollama, Demo and compatible-model adapters |
| `src/lib/services/contracts.ts` | Unimplemented future voice, research and media service boundaries              |
| `tests`                         | Vitest domain/provider/API-boundary tests and Playwright browser tests         |
| `.devcontainer`                 | Browser-only Codespaces setup                                                  |

REST endpoints: `GET/POST /api/projects`, `GET/PUT /api/projects/:id`, `POST /api/projects/:id/generate`, `GET /api/projects/:id/history`, `GET /api/projects/:id/export?format=json|txt`, and `GET /api/provider`.

Saving and generation require the current project `version`. Conflicts return HTTP 409 and do not overwrite another tab’s work. Projects move through `draft`, `generating`, `script_ready`, and `failed`. Generation is a synchronous request with a 60-second provider timeout. Interrupted `generating` projects recover to `failed` when read after two minutes, allowing retry. No background task queue is implemented.

See [the six-phase development plan](docs/DEVELOPMENT_PLAN.md) and [Phase 1 acceptance guide](docs/ACCEPTANCE.md). **Do not begin Phase 2 until Phase 1 is approved.**

## Codespaces origin checks and browser extensions

The API compares the complete browser origin (scheme, hostname, and port). In a Codespace, its one allowed public origin is derived from `CODESPACE_NAME` and `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` for forwarded port **3000**. An unchanged public Origin is checked directly. A rewritten loopback Origin requires matching backend Host/port, one exact pinned X-Forwarded-Host, HTTPS forwarding and browser same-origin Fetch Metadata; missing or ambiguous proof is rejected. Other Codespaces and arbitrary `X-Forwarded-Host` values do not grant access. Next.js development/HMR access uses the same configured hostname; no wildcard is allowed. JSON content-type/body limits and cross-site request protections remain enabled.

For a different forwarded port or a custom proxy, set **one exact browser origin** as server-only `APP_ORIGIN` in `.env.local`, then restart. For example: `APP_ORIGIN=https://your-codespace-name-4000.app.github.dev`. Do not add `*.app.github.dev`, a list of origins, or a URL path. Standard port-3000 Codespaces users need no new setting.

Grammarly can add `data-new-gr-c-s-check-loaded` and `data-gr-ext-installed` to `<body>` before React hydrates. The layout tolerates attribute differences at that element using `suppressHydrationWarning`; it does not disable server rendering or suppress hydration diagnostics throughout the app. The extension is not removed or disabled. If a warning names application elements or content rather than extension-added body attributes, investigate it as a separate mismatch.

### Update, restart, and retest these fixes

1. In your **existing Codespace's terminal**, update the Phase 1 branch:

   ```sh
   git switch feat/autotube-phase-1
   git pull --ff-only origin feat/autotube-phase-1
   ```

2. Restart Next.js so it reloads the origin configuration. If you started it in a terminal, press **Ctrl+C**, then run `npm run dev`. If it started automatically, use **Codespaces: Stop Current Codespace** from the command palette, then reopen the **same** Codespace from GitHub. Its startup hook starts the updated server. Do not delete the Codespace or its `data/` directory.
3. Open **Ports → 3000 → Open in Browser**, keeping visibility **Private**. Refresh the page fully (Ctrl+Shift+R). Do not use another Codespace's URL or an old forwarded port.
4. With Grammarly enabled if available, open **Create Video**, create a test project, generate a demo script, edit, save, reload, and export. You should see no cross-site error and no hydration warning about the two extension attributes on `body`.
5. To repeat automated checks in the Codespace: `npm test`, `npm run typecheck`, `npm run build`, then `npm run test:e2e` (install the test browser using the earlier README instructions if needed). The browser suite uses its own loopback-only server and isolated database.

The [origin regression report](docs/ORIGIN_REGRESSION.md) separates reproduced defects from live acceptance. The [proposed development workflow](docs/DEVELOPMENT_WORKFLOW.md) defines evidence and acceptance gates for future work; Phase 2 remains unapproved.

Gemini model selection uses only the model ID in SQLite; it never overwrites `GEMINI_API_KEY`. The [diagnostic guide](docs/GEMINI_DIAGNOSIS.md) explains the safe upstream status fields and why an available model is not proof of free quota.
