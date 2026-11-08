import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Brief, Project, Revision } from "./schema";
import { AppError } from "./errors";

/** Local single-user repository. Every update and its snapshot commit atomically. */
export class ProjectRepository {
  private db: Database.Database;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL,
      version INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
      document TEXT NOT NULL, UNIQUE(project_id, version)
    ); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE INDEX IF NOT EXISTS revision_project ON revisions(project_id, id);`);
  }
  private read(id: string): Project {
    const row = this.db
      .prepare("SELECT document FROM projects WHERE id = ?")
      .get(id) as { document: string } | undefined;
    if (!row) throw new AppError(404, "Project not found.");
    return JSON.parse(row.document) as Project;
  }
  private persist(project: Project, reason: string) {
    const document = JSON.stringify(project);
    this.db
      .prepare(
        "INSERT INTO projects VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET document=excluded.document, updated_at=excluded.updated_at",
      )
      .run(project.id, document, project.updatedAt);
    this.db
      .prepare(
        "INSERT INTO revisions(project_id, version, reason, created_at, document) VALUES (?, ?, ?, ?, ?)",
      )
      .run(project.id, project.version, reason, project.updatedAt, document);
  }
  create(brief: Brief): Project {
    const now = new Date().toISOString();
    const project: Project = {
      ...brief,
      id: randomUUID(),
      scenes: [],
      status: "draft",
      provider: null,
      error: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.db.transaction(() => this.persist(project, "Project created"))();
    return project;
  }
  get(id: string): Project {
    const p = this.read(id);
    // A crashed request must not leave the project permanently locked.
    if (
      p.status === "generating" &&
      Date.now() - Date.parse(p.updatedAt) > 120000
    ) {
      return this.update(
        id,
        p.version,
        {
          status: "failed",
          error: "Generation was interrupted. You can retry.",
        },
        "Generation interrupted",
      );
    }
    return p;
  }
  list(): Project[] {
    const rows = this.db
      .prepare("SELECT id FROM projects ORDER BY updated_at DESC, id")
      .all() as { id: string }[];
    return rows.map((row) => this.get(row.id));
  }
  update(
    id: string,
    version: number,
    changes: Partial<
      Pick<Project, "title" | "scenes" | "status" | "provider" | "error">
    >,
    reason: string,
  ): Project {
    return this.db.transaction(() => {
      const current = this.read(id);
      if (current.version !== version)
        throw new AppError(
          409,
          "This project changed in another tab. Reopen it before saving. Your current text is still on screen.",
        );
      const next = {
        ...current,
        ...changes,
        version: version + 1,
        updatedAt: new Date().toISOString(),
      };
      this.persist(next, reason);
      return next;
    })();
  }
  history(id: string): Revision[] {
    this.get(id);
    const rows = this.db
      .prepare(
        "SELECT * FROM revisions WHERE project_id = ? ORDER BY version DESC LIMIT 100",
      )
      .all(id) as {
      id: number;
      version: number;
      reason: string;
      created_at: string;
      document: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      reason: r.reason,
      createdAt: r.created_at,
      project: JSON.parse(r.document),
    }));
  }
  getSetting(key: string): string | undefined {
    return (
      this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
        { value: string } | undefined
    )?.value;
  }
  setSetting(key: string, value: string) {
    this.db
      .prepare(
        "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, value);
  }
  deleteSetting(key: string) {
    this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }
  close() {
    this.db.close();
  }
}
let instance: ProjectRepository | undefined;
export function repository() {
  return (instance ??= new ProjectRepository(
    process.env.DATABASE_PATH || "./data/autotube.sqlite",
  ));
}
