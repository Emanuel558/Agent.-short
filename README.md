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

## Optional AI model

The basic demo works offline after dependencies are installed. For real model generation, configure an **OpenAI-compatible `/v1/chat/completions` service** on the server. It must support JSON object responses. Provider failures show an error; the app never silently substitutes demo output.

In the Codespaces terminal:

```sh
cp .env.example .env.local
```

Edit `.env.local` in the browser editor:

```dotenv
AI_PROVIDER=openai-compatible
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL=llama3.2
# AI_API_KEY=only-if-your-provider-requires-it
```

The example URL requires an Ollama server with that model already running **inside that Codespace**. It is not installed by this repository. Ollama is free and open-source; model hardware requirements may exceed a small Codespace. You can also use a compatible model server you control. Hosted API services can charge fees. Model availability and live model output have not been verified for your account; the adapter is tested with mocked HTTP responses. Real AI claims require human fact-checking.

Restart `npm run dev` after changing configuration. Keep API keys in `.env.local` or Codespaces secrets, never in chat, source code, or variables prefixed `NEXT_PUBLIC_`. Settings reports configuration status without revealing keys, model endpoints, or credentials. In the Codespaces environment, requests reach the provider from the server; a localhost URL on your school computer is not reachable.

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

These install browser-test dependencies **inside Codespaces**, never on your computer. E2E tests start their own development server on port 3001 with an isolated, ignored database and a demo provider. Close any other process using that port first. On a Linux environment with Chromium already installed, you may use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`.

GitHub Actions runs Vitest, TypeScript checks, a production build, and Chromium workflow tests on Node 22. The lockfile pins installed dependencies. For production-mode testing in your private Codespace, use `npm run build` then `npm start`.

## Architecture

| Location                        | Responsibility                                                             |
| ------------------------------- | -------------------------------------------------------------------------- |
| `src/app`                       | Next.js shell, Tailwind styles, API route handlers                         |
| `src/components/workspace.tsx`  | Dashboard, project creation, script editor, history, settings              |
| `src/lib/schema.ts`             | Shared strict validation and domain types                                  |
| `src/lib/db.ts`                 | SQLite repository, atomic updates and revisions, optimistic version checks |
| `src/lib/services/projects.ts`  | Generation lifecycle and saving rules                                      |
| `src/lib/providers`             | Replaceable text interface, demo provider and compatible-model adapter     |
| `src/lib/services/contracts.ts` | Unimplemented future voice, research and media service boundaries          |
| `tests`                         | Vitest domain/provider/API-boundary tests and Playwright browser tests     |
| `.devcontainer`                 | Browser-only Codespaces setup                                              |

REST endpoints: `GET/POST /api/projects`, `GET/PUT /api/projects/:id`, `POST /api/projects/:id/generate`, `GET /api/projects/:id/history`, `GET /api/projects/:id/export?format=json|txt`, and `GET /api/provider`.

Saving and generation require the current project `version`. Conflicts return HTTP 409 and do not overwrite another tab’s work. Projects move through `draft`, `generating`, `script_ready`, and `failed`. Generation is a synchronous request with a 60-second provider timeout. Interrupted `generating` projects recover to `failed` when read after two minutes, allowing retry. No background task queue is implemented.

See [the six-phase development plan](docs/DEVELOPMENT_PLAN.md) and [Phase 1 acceptance guide](docs/ACCEPTANCE.md). **Do not begin Phase 2 until Phase 1 is approved.**
