"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProviderPicker } from "./provider-picker";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Clock3,
  FileText,
  Film,
  FolderOpen,
  Globe2,
  History,
  LayoutDashboard,
  ListVideo,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MonitorPlay,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings2,
  Sparkles,
  WandSparkles,
  X,
  Youtube,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  languages,
  type Brief,
  type Project,
  type Revision,
  type Scene,
  scriptText,
} from "@/lib/schema";
import type { ProviderInfo } from "@/lib/providers/text";

type View =
  | "dashboard"
  | "create"
  | "inspiration"
  | "studio"
  | "voice"
  | "stock"
  | "editor"
  | "agent"
  | "projects"
  | "analytics"
  | "settings";
const navigation: {
  id: View;
  label: string;
  icon: LucideIcon;
  phase?: number;
}[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "create", label: "Create Video", icon: Plus },
  { id: "inspiration", label: "Viral Inspiration", icon: Zap, phase: 2 },
  { id: "studio", label: "AI Script Studio", icon: FileText },
  { id: "voice", label: "Voice Studio", icon: AudioLines, phase: 3 },
  { id: "stock", label: "Stock Footage", icon: Film, phase: 3 },
  { id: "editor", label: "Video Editor", icon: Clapperboard, phase: 4 },
  { id: "agent", label: "AI Agent", icon: Bot, phase: 5 },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "analytics", label: "YouTube Analytics", icon: BarChart3, phase: 6 },
  { id: "settings", label: "Settings", icon: Settings2 },
];
const statusLabel = {
  draft: "Draft",
  generating: "Generating",
  script_ready: "Script ready",
  failed: "Needs attention",
};
async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    ...(data !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "The request failed. Please try again.");
  return result as T;
}
function Spinner() {
  return <LoaderCircle className="spin" size={17} aria-hidden="true" />;
}
function Status({ project }: { project: Project }) {
  return (
    <span className={`status ${project.status}`}>
      <span />
      {statusLabel[project.status]}
    </span>
  );
}
function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div className="alert" role="alert">
      {children}
    </div>
  );
}
function date(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
function duration(value: number) {
  return value < 60
    ? `${value}s`
    : `${Math.floor(value / 60)}m${value % 60 ? ` ${value % 60}s` : ""}`;
}

export function Workspace() {
  const params = useSearchParams();
  const router = useRouter();
  const view = (
    navigation.some((n) => n.id === params.get("view"))
      ? params.get("view")
      : "dashboard"
  ) as View;
  const projectId = params.get("project");
  const [projects, setProjects] = useState<Project[]>([]);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const dirty = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const [p, info] = await Promise.all([
        api<Project[]>("/api/projects"),
        api<ProviderInfo>("/api/provider"),
      ]);
      setProjects(p);
      setProvider(info);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  function go(next: View, id?: string, topic?: string) {
    if (
      dirty.current &&
      !window.confirm("You have unsaved edits. Leave without saving?")
    )
      return;
    dirty.current = false;
    setMobile(false);
    const query = new URLSearchParams({ view: next });
    if (id) query.set("project", id);
    if (topic) query.set("topic", topic);
    router.push(`/?${query}`);
  }
  const isProject = view === "studio" && !!projectId;
  const current = navigation.find((n) => n.id === view)!;
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <button
          className="brand"
          onClick={() => go("dashboard")}
          aria-label="AutoTube AI home"
        >
          <span className="brand-icon">
            <Play fill="currentColor" size={20} />
          </span>
          <span>
            AutoTube<span className="brand-ai"> AI</span>
          </span>
        </button>
        <div className="workspace-label">CREATOR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item, i) => (
            <div key={item.id} className={i === 8 ? "nav-separator" : ""}>
              <button
                className={`nav-item ${view === item.id ? "active" : ""}`}
                onClick={() => go(item.id)}
                aria-current={view === item.id ? "page" : undefined}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.phase && <LockKeyhole className="nav-lock" size={12} />}
                {item.id === "create" && <span className="nav-new">NEW</span>}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="build-card">
            <span className="tiny-label">
              <span className="live-dot" /> PHASE 1 WORKSPACE
            </span>
            <p>Big ideas. First drafts.</p>
            <span>Build your next story, scene by scene.</span>
            <button onClick={() => go("create")}>
              Start creating <ArrowUpRight />
            </button>
          </div>
          <div className="profile">
            <span className="avatar">C</span>
            <div>
              <strong>Your workspace</strong>
              <small>Local · single creator</small>
            </div>
            <span className="free-label">FREE</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{isProject ? "Script Studio" : current.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <span className="live-dot" /> Phase 1
            </span>
            <button
              className="icon-button"
              aria-label="Open settings"
              onClick={() => go("settings")}
            >
              <Settings2 size={18} />
            </button>
            <span className="avatar small">C</span>
          </div>
        </header>
        <main className="main-content">
          {error && (
            <Alert>
              {error} <button onClick={() => void refresh()}>Retry</button>
            </Alert>
          )}
          {isProject ? (
            <ProjectEditor
              key={projectId}
              id={projectId}
              provider={provider}
              onBack={() => go("projects")}
              onChange={refresh}
              onDirty={(value) => {
                dirty.current = value;
              }}
            />
          ) : view === "dashboard" ? (
            <Dashboard
              projects={projects}
              loading={loading}
              go={go}
              provider={provider}
            />
          ) : view === "create" ? (
            <CreateProject
              initialTopic={params.get("topic") || ""}
              onCreated={(p) => {
                void refresh();
                go("studio", p.id);
              }}
            />
          ) : view === "projects" || view === "studio" ? (
            <ProjectList
              projects={projects}
              loading={loading}
              studio={view === "studio"}
              go={go}
            />
          ) : view === "settings" ? (
            <Settings provider={provider} onUpdated={refresh} />
          ) : (
            <FutureFeature feature={current} go={go} />
          )}
          <footer className="footer">
            <span>
              AutoTube AI <span className="footer-dot">·</span> Made for your
              next idea
            </span>
            <span>Phase 1 / Foundation & scripts</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function ArrowUpRight() {
  return <ArrowRight size={14} className="diagonal" />;
}
function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Dashboard({
  projects,
  loading,
  go,
  provider,
}: {
  projects: Project[];
  loading: boolean;
  go: (v: View, id?: string, topic?: string) => void;
  provider: ProviderInfo | null;
}) {
  const ready = projects.filter((p) => p.scenes.length > 0).length;
  return (
    <>
      <Heading
        eyebrow="YOUR CREATIVE CONTROL ROOM"
        title="Let’s make something great."
        description="Turn your next big idea into a story worth watching."
        action={
          <button className="primary" onClick={() => go("create")}>
            <Plus size={17} /> Create a video
          </button>
        }
      />
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-tag">
            <Sparkles size={13} /> FROM IDEA TO FIRST DRAFT
          </span>
          <h2>
            Your idea.
            <br />
            Your next <em>great video.</em>
          </h2>
          <p>
            A little inspiration. A clear plan. An original script.
            <br className="desktop-break" /> Bring it all together in one
            creative workspace.
          </p>
          <button className="white-button" onClick={() => go("create")}>
            Start a new project <ArrowRight size={16} />
          </button>
          <span className="hero-note">
            No API key needed · Free template demo included
          </span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="float-label float-top">
            <Sparkles size={15} />
            <span>A spark of inspiration</span>
          </div>
          <div className="video-art">
            <div className="video-art-top">
              <span />
              <span />
              <span />
              <small>YOUR NEXT STORY</small>
            </div>
            <div className="art-picture">
              <div className="art-moon" />
              <div className="mountain back" />
              <div className="mountain front" />
              <div className="art-play">
                <Play size={23} fill="currentColor" />
              </div>
              <span className="art-aspect">9:16 / 16:9</span>
            </div>
            <div className="art-timeline">
              <div />
              <div />
              <div />
              <div />
              <div />
            </div>
            <div className="art-audio">
              {Array.from({ length: 35 }, (_, i) => (
                <i key={i} style={{ height: `${8 + ((i * 17) % 23)}px` }} />
              ))}
            </div>
          </div>
          <div className="float-label float-bottom">
            <span className="check-orb">
              <Check size={13} />
            </span>
            <div>
              <strong>Made for your workflow</strong>
              <small>Plan. Write. Refine.</small>
            </div>
          </div>
        </div>
      </section>
      <section className="stats-grid" aria-label="Workspace statistics">
        {[
          {
            label: "Total projects",
            value: projects.length,
            note: "Ideas with a place to grow",
            icon: FolderOpen,
            color: "purple",
          },
          {
            label: "Scripts created",
            value: ready,
            note: "Ready for your next edit",
            icon: FileText,
            color: "blue",
          },
          {
            label: "Scenes planned",
            value: projects.reduce((a, p) => a + p.scenes.length, 0),
            note: "Your stories, broken down",
            icon: ListVideo,
            color: "pink",
          },
          {
            label: "In progress",
            value: projects.filter(
              (p) => p.status === "draft" || p.status === "generating",
            ).length,
            note: "Keep the creativity going",
            icon: Clock3,
            color: "teal",
          },
        ].map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div className={`stat-icon ${stat.color}`}>
              <stat.icon size={20} />
            </div>
            <div>
              <span>{stat.label}</span>
              <strong>{loading ? "—" : stat.value}</strong>
              <small>{stat.note}</small>
            </div>
          </article>
        ))}
      </section>
      <div className="dashboard-columns">
        <section>
          <div className="section-title">
            <h2>
              Your recent projects{" "}
              <span className="count-badge">{projects.length}</span>
            </h2>
            <button className="text-button" onClick={() => go("projects")}>
              View all <ArrowRight size={14} />
            </button>
          </div>
          {loading ? (
            <div className="panel empty">
              <Spinner />
              Loading projects…
            </div>
          ) : projects.length ? (
            <div className="recent-list">
              {projects.slice(0, 3).map((p, i) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  index={i}
                  onClick={() => go("studio", p.id)}
                />
              ))}
            </div>
          ) : (
            <div className="panel empty-projects">
              <span className="empty-icon">
                <Clapperboard size={25} />
              </span>
              <h3>A blank canvas. Endless possibilities.</h3>
              <p>
                Your projects will live here. Start with a topic you’re curious
                about.
              </p>
              <button className="subtle-button" onClick={() => go("create")}>
                <Plus size={15} /> Create your first project
              </button>
            </div>
          )}
          <div className="section-title inspiration-title">
            <h2>A little inspiration</h2>
            <span className="muted small-text">
              Topic starters · not live trends
            </span>
          </div>
          <div className="topic-grid">
            {[
              {
                icon: Globe2,
                title: "The world, explained",
                topic: "Why the northern lights appear",
                class: "nature",
                tag: "EXPLAINER",
              },
              {
                icon: Zap,
                title: "One curious question",
                topic: "How everyday habits shape creativity",
                class: "curious",
                tag: "STORYTELLING",
              },
            ].map((t) => (
              <button
                className={`topic-card ${t.class}`}
                key={t.title}
                onClick={() => go("create", undefined, t.topic)}
              >
                <t.icon size={27} />
                <span className="topic-tag">{t.tag}</span>
                <h3>{t.title}</h3>
                <p>{t.topic}</p>
                <ArrowUpRight />
              </button>
            ))}
          </div>
        </section>
        <aside className="dashboard-side">
          <div className="panel workflow">
            <div className="section-title">
              <h2>Your creative workflow</h2>
              <span className="purple-text small-text">01 / 06</span>
            </div>
            <p>One step closer to your next upload.</p>
            {[
              {
                label: "Plan & write",
                desc: "Projects, scripts & scenes",
                active: true,
              },
              {
                label: "Discover & research",
                desc: "Inspiration & topic research",
              },
              { label: "Voice & footage", desc: "Audio & licensed visuals" },
              { label: "Edit & assemble", desc: "Video, subtitles & music" },
              { label: "Review & publish", desc: "Approve, upload & schedule" },
              { label: "Learn & improve", desc: "Performance & insights" },
            ].map((step, i) => (
              <div
                className={`workflow-step ${step.active ? "current" : ""}`}
                key={step.label}
              >
                <span className="step-number">
                  {step.active ? (
                    <FileText size={15} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.desc}</small>
                </div>
                {step.active ? (
                  <span className="live-pill">LIVE</span>
                ) : (
                  <LockKeyhole size={12} />
                )}
              </div>
            ))}
            <div className="workflow-foot">
              Later phases are planned, not available yet.
            </div>
          </div>
          <div className="provider-card">
            <span className="provider-orb">
              <WandSparkles size={19} />
            </span>
            <div>
              <h3>{provider?.label || "Checking provider…"}</h3>
              <p>
                {provider?.id === "demo"
                  ? "Explore the workflow for free. Templates are clearly labeled and ready to make your own."
                  : "Manage your text provider and workspace configuration."}
              </p>
              <button className="text-button" onClick={() => go("settings")}>
                Provider settings <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
function ProjectRow({
  project: p,
  index,
  onClick,
}: {
  project: Project;
  index: number;
  onClick: () => void;
}) {
  return (
    <button className="project-row panel" onClick={onClick}>
      <div className={`project-thumb thumb-${index % 3}`}>
        <MonitorPlay size={26} />
        <span>{p.format === "short" ? "9:16" : "16:9"}</span>
      </div>
      <div className="project-row-info">
        <h3>{p.title}</h3>
        <div className="project-meta">
          <span>{p.format === "short" ? "Shorts" : "Long-form"}</span>
          <span>·</span>
          <span>{duration(p.duration)}</span>
          <span>·</span>
          <span>{languages[p.language]}</span>
        </div>
        <Status project={p} />
      </div>
      <div className="project-row-end">
        <small>{date(p.updatedAt)}</small>
        <ChevronRight size={17} />
      </div>
    </button>
  );
}
function ProjectList({
  projects,
  loading,
  studio,
  go,
}: {
  projects: Project[];
  loading: boolean;
  studio: boolean;
  go: (v: View, id?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = projects.filter(
    (p) =>
      `${p.title} ${p.topic}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" || p.status === filter),
  );
  return (
    <>
      <Heading
        eyebrow={studio ? "FIND YOUR STORY" : "YOUR PROJECT LIBRARY"}
        title={studio ? "AI Script Studio" : "All your ideas, in one place."}
        description={
          studio
            ? "Choose a project to write, refine, and plan your scenes."
            : "Pick up where you left off. Your next great video is in here."
        }
        action={
          <button className="primary" onClick={() => go("create")}>
            <Plus size={17} /> New project
          </button>
        }
      />
      <div className="library-tools">
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Search projects"
            placeholder="Search your projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter project status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="script_ready">Script ready</option>
          <option value="generating">Generating</option>
          <option value="failed">Needs attention</option>
        </select>
        <span className="muted small-text">{filtered.length} projects</span>
      </div>
      {loading ? (
        <div className="panel empty">
          <Spinner />
          Loading projects…
        </div>
      ) : filtered.length ? (
        <div className="project-grid">
          {filtered.map((p, i) => (
            <ProjectRow
              key={p.id}
              project={p}
              index={i}
              onClick={() => go("studio", p.id)}
            />
          ))}
        </div>
      ) : (
        <div className="panel empty-projects">
          <FolderOpen size={32} />
          <h3>
            {projects.length
              ? "No projects match your search"
              : "Your first story starts here"}
          </h3>
          <p>
            {projects.length
              ? "Try another topic or status."
              : "Create a project, choose a format, and shape your script."}
          </p>
          <button className="primary" onClick={() => go("create")}>
            <Plus size={15} /> New project
          </button>
        </div>
      )}
    </>
  );
}
function CreateProject({
  initialTopic,
  onCreated,
}: {
  initialTopic: string;
  onCreated: (project: Project) => void;
}) {
  const [brief, setBrief] = useState<Brief>({
    title: "",
    topic: initialTopic,
    format: "short",
    language: "en",
    duration: 60,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated(await api<Project>("/api/projects", "POST", brief));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="LET’S BRING IT TO LIFE"
        title="Every great video starts with an idea."
        description="Tell us what you have in mind. We’ll give your story a place to grow."
      />
      <div className="create-layout">
        <form className="panel create-form" onSubmit={submit}>
          {error && <Alert>{error}</Alert>}
          <div className="form-section-heading">
            <span className="number-circle">01</span>
            <div>
              <h2>Set the stage</h2>
              <p>Give your project a name and a direction.</p>
            </div>
          </div>
          <label>
            Project name{" "}
            <input
              required
              maxLength={120}
              value={brief.title}
              onChange={(e) => setBrief({ ...brief, title: e.target.value })}
              placeholder="e.g. The science behind the northern lights"
            />
          </label>
          <label>
            What’s your video about?
            <textarea
              required
              minLength={3}
              maxLength={1000}
              rows={4}
              value={brief.topic}
              onChange={(e) => setBrief({ ...brief, topic: e.target.value })}
              placeholder="Describe your topic, angle, and the story you want to tell…"
            />
            <span className="field-hint">
              A specific angle makes a better starting point.{" "}
              {brief.topic.length}/1000
            </span>
          </label>
          <div className="form-section-heading second">
            <span className="number-circle">02</span>
            <div>
              <h2>Make it your format</h2>
              <p>Set the shape and pace of your story.</p>
            </div>
          </div>
          <fieldset className="format-field">
            <legend>Video format</legend>
            <div className="format-options">
              {(["short", "long"] as const).map((f) => (
                <button
                  type="button"
                  key={f}
                  className={`format-option ${brief.format === f ? "selected" : ""}`}
                  aria-pressed={brief.format === f}
                  onClick={() =>
                    setBrief({
                      ...brief,
                      format: f,
                      duration: f === "short" ? 60 : 300,
                    })
                  }
                >
                  <div className={`format-outline ${f}`}>
                    <Play size={12} fill="currentColor" />
                  </div>
                  <div>
                    <strong>
                      {f === "short" ? "YouTube Shorts" : "Long-form video"}
                    </strong>
                    <span>
                      {f === "short" ? "9:16 · Vertical" : "16:9 · Landscape"}
                    </span>
                  </div>
                  <span className="radio-dot">
                    {brief.format === f && <Check size={10} />}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="two-fields">
            <label>
              Script language
              <select
                value={brief.language}
                onChange={(e) =>
                  setBrief({
                    ...brief,
                    language: e.target.value as Brief["language"],
                  })
                }
              >
                {Object.entries(languages).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target duration (seconds)
              <input
                type="number"
                required
                min={brief.format === "short" ? 15 : 60}
                max={brief.format === "short" ? 180 : 3600}
                step={1}
                value={brief.duration}
                onChange={(e) =>
                  setBrief({ ...brief, duration: Number(e.target.value) })
                }
              />
              <span className="field-hint">
                {brief.format === "short"
                  ? "15–180 seconds"
                  : "60–3,600 seconds"}{" "}
                · target, not rendered runtime
              </span>
            </label>
          </div>
          <div className="form-submit">
            <span>
              <LockKeyhole size={13} /> Saved in this workspace
            </span>
            <button className="primary" disabled={busy} type="submit">
              {busy ? <Spinner /> : <Plus size={17} />}
              {busy ? "Creating…" : "Create project"}
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
        <aside>
          <div className="panel create-guide">
            <span className="guide-icon">
              <Sparkles size={25} />
            </span>
            <h2>A good idea is all you need to start.</h2>
            <p>You can refine every word and scene as you go.</p>
            <div>
              <CheckCircle2 size={17} />
              <span>Write an original script</span>
            </div>
            <div>
              <CheckCircle2 size={17} />
              <span>Plan your scenes and visuals</span>
            </div>
            <div>
              <CheckCircle2 size={17} />
              <span>Save, revisit, and export</span>
            </div>
            <hr />
            <small>
              Phase 1 creates scripts and scene plans. Voice, footage,
              rendering, and publishing are planned for later phases.
            </small>
          </div>
          <div className="note-card">
            <strong>
              <WandSparkles size={16} /> Start free, stay in control
            </strong>
            <p>
              The default provider uses templates, with no API key required.
              Demo output is always labeled.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function ProjectEditor({
  id,
  provider,
  onBack,
  onChange,
  onDirty,
}: {
  id: string;
  provider: ProviderInfo | null;
  onBack: () => void;
  onChange: () => void | Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [title, setTitle] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [tab, setTab] = useState("script");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const dirty =
    !!project &&
    (title !== project.title ||
      JSON.stringify(scenes) !== JSON.stringify(project.scenes));
  const accept = useCallback((p: Project) => {
    setProject(p);
    setTitle(p.title);
    setScenes(p.scenes);
  }, []);
  const load = useCallback(async () => {
    try {
      accept(await api<Project>(`/api/projects/${id}`));
      setLoadFailed(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
      setLoadFailed(true);
    }
  }, [id, accept]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    function unload(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);
  useEffect(() => {
    if (project?.status !== "generating") return;
    const interval = setInterval(() => {
      void api<Project>(`/api/projects/${id}`)
        .then((p) => {
          if (p.status !== "generating") {
            accept(p);
            onChange();
          }
        })
        .catch(() => {
          /* next poll can recover */
        });
    }, 3000);
    return () => clearInterval(interval);
  }, [project?.status, id, accept, onChange]);
  async function save() {
    if (!project) return;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      accept(
        await api<Project>(`/api/projects/${id}`, "PUT", {
          title,
          scenes,
          version: project.version,
        }),
      );
      setNotice("All changes saved.");
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function generate() {
    if (!project) return;
    if (
      scenes.length &&
      !window.confirm(
        "Generate a new script? Your current saved script remains available in revision history.",
      )
    )
      return;
    setBusy("generate");
    setError("");
    setNotice("");
    let requestStarted = false;
    try {
      let saved = project;
      if (dirty) {
        saved = await api<Project>(`/api/projects/${id}`, "PUT", {
          title,
          scenes,
          version: project.version,
        });
        accept(saved);
      }
      requestStarted = true;
      accept(
        await api<Project>(`/api/projects/${id}/generate`, "POST", {
          version: saved.version,
        }),
      );
      setNotice("Script saved. Review the draft and make it your own.");
      onChange();
    } catch (e) {
      setError((e as Error).message);
      try {
        const latest = await api<Project>(`/api/projects/${id}`);
        if (
          requestStarted &&
          latest.version > project.version &&
          latest.status !== "generating"
        )
          accept(latest);
        onChange();
      } catch {
        /* preserve local state */
      }
    } finally {
      setBusy("");
    }
  }
  async function history() {
    setTab("history");
    setRevision(null);
    setError("");
    setBusy("history");
    try {
      setRevisions(await api<Revision[]>(`/api/projects/${id}/history`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const total = scenes.reduce((n, s) => n + s.duration, 0);
  const locked = !!busy || project?.status === "generating";
  function updateScene(index: number, changes: Partial<Scene>) {
    setNotice("");
    setScenes((list) =>
      list.map((s, i) => (i === index ? { ...s, ...changes } : s)),
    );
  }
  if (!project)
    return (
      <>
        {error ? (
          <Alert>
            {error} <button onClick={() => void load()}>Retry</button>
          </Alert>
        ) : (
          <div className="panel empty">
            <Spinner />
            Opening project…
          </div>
        )}
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={15} /> Back to projects
        </button>
      </>
    );
  return (
    <>
      <button className="text-button back-button" onClick={onBack}>
        <ArrowLeft size={14} /> All projects
      </button>
      <Heading
        eyebrow="AI SCRIPT STUDIO"
        title={project.title}
        description={`${project.format === "short" ? "YouTube Shorts · 9:16" : "Long-form · 16:9"} · ${languages[project.language]} · ${duration(project.duration)} target`}
        action={
          <div className="editor-actions">
            <span className={`save-state ${dirty ? "unsaved" : ""}`}>
              {dirty ? (
                "Unsaved changes"
              ) : (
                <>
                  <Check size={13} /> Saved
                </>
              )}
            </span>
            <button
              className="primary"
              disabled={locked || !dirty}
              onClick={() => void save()}
            >
              {busy === "save" ? <Spinner /> : <Check size={16} />} Save changes
            </button>
          </div>
        }
      />
      {error && (
        <Alert>
          {error}
          {loadFailed && <button onClick={() => void load()}>Retry</button>}
        </Alert>
      )}
      {notice && (
        <div className="success" role="status">
          <CheckCircle2 size={16} />
          {notice}
        </div>
      )}
      <div className="editor-layout">
        <section className="editor-main">
          <div className="panel script-panel">
            <div
              className="editor-tabs"
              role="tablist"
              aria-label="Project editor"
            >
              <button
                role="tab"
                aria-selected={tab === "script"}
                className={tab === "script" ? "selected" : ""}
                onClick={() => setTab("script")}
              >
                <FileText size={15} /> Script
              </button>
              <button
                role="tab"
                aria-selected={tab === "scenes"}
                className={tab === "scenes" ? "selected" : ""}
                onClick={() => setTab("scenes")}
              >
                <ListVideo size={15} /> Scene plan{" "}
                <span className="count-badge">{scenes.length}</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === "history"}
                className={tab === "history" ? "selected" : ""}
                onClick={() => void history()}
              >
                <History size={15} /> History
              </button>
            </div>
            {tab === "history" ? (
              <div className="history-content">
                <h2>Project history</h2>
                <p className="muted small-text">
                  Latest 100 saved revisions. Load a revision as a draft, then
                  save to restore it.
                </p>
                {busy === "history" ? (
                  <Spinner />
                ) : (
                  <div className="history-list">
                    {revisions.map((r) => (
                      <button
                        key={r.id}
                        className={revision?.id === r.id ? "selected" : ""}
                        onClick={() => setRevision(r)}
                      >
                        <span className="revision-number">v{r.version}</span>
                        <span>
                          <strong>{r.reason}</strong>
                          <small>
                            {new Date(r.createdAt).toLocaleString()}
                          </small>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  </div>
                )}
                {revision && (
                  <div className="revision-preview">
                    <h3>{revision.project.title}</h3>
                    <p className="revision-text">
                      {scriptText(revision.project) ||
                        "No script in this revision."}
                    </p>
                    <button
                      className="subtle-button"
                      disabled={locked}
                      onClick={() => {
                        setTitle(revision.project.title);
                        setScenes(revision.project.scenes);
                        setTab("script");
                        setNotice(
                          "Revision loaded as an unsaved draft. Save to keep these changes.",
                        );
                      }}
                    >
                      Load revision as draft
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="editor-content">
                <label className="project-title-label">
                  Project name
                  <input
                    disabled={locked}
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                {project.provider === "demo" && scenes.length > 0 && (
                  <div className="demo-banner">
                    <WandSparkles size={17} />
                    <div>
                      <strong>
                        Template demo · no AI model or research used
                      </strong>
                      <p>
                        Replace the bracketed prompts with original, verified
                        content. Scene lengths are planning targets.
                      </p>
                    </div>
                  </div>
                )}
                {project.provider !== null && project.provider !== "demo" && (
                  <div className="demo-banner">
                    <Sparkles size={17} />
                    <div>
                      <strong>
                        {project.provider === "gemini"
                          ? "Gemini-generated draft"
                          : "AI-generated draft"}{" "}
                        · review required
                      </strong>
                      <p>
                        Fact-check claims and review originality before using
                        this script.
                      </p>
                    </div>
                  </div>
                )}
                {!scenes.length ? (
                  <div className="editor-empty">
                    <span className="empty-icon">
                      <WandSparkles size={29} />
                    </span>
                    <h2>Your story starts with a first draft.</h2>
                    <p>
                      Generate an outline for your topic, then edit each scene
                      to make it your own.
                    </p>
                    <button
                      className="primary"
                      disabled={locked || !provider?.configured}
                      onClick={() => void generate()}
                    >
                      {busy === "generate" ||
                      project.status === "generating" ? (
                        <Spinner />
                      ) : (
                        <Sparkles size={16} />
                      )}
                      {busy === "generate" || project.status === "generating"
                        ? "Generating script…"
                        : provider?.id === "demo"
                          ? "Generate demo script"
                          : provider?.id === "gemini"
                            ? "Generate with Gemini"
                            : "Generate AI script"}
                    </button>
                    {dirty && (
                      <small>Edits will be saved before generation.</small>
                    )}
                  </div>
                ) : (
                  <>
                    {scenes.map((scene, i) => (
                      <article className="scene-editor" key={scene.id}>
                        <div className="scene-heading">
                          <span className="scene-index">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <label className="scene-name">
                            <span className="sr-only">
                              Scene {i + 1} heading
                            </span>
                            <input
                              disabled={locked}
                              maxLength={120}
                              value={scene.heading}
                              onChange={(e) =>
                                updateScene(i, { heading: e.target.value })
                              }
                            />
                          </label>
                          <span className="scene-time">
                            <Clock3 size={12} /> {scene.duration}s
                          </span>
                        </div>
                        {tab === "script" ? (
                          <label className="narration-label">
                            <span className="sr-only">
                              Scene {i + 1} narration
                            </span>
                            <textarea
                              aria-label={`Scene ${i + 1} narration`}
                              disabled={locked}
                              rows={Math.max(
                                4,
                                Math.min(
                                  12,
                                  Math.ceil(scene.narration.length / 90),
                                ),
                              )}
                              maxLength={12000}
                              value={scene.narration}
                              onChange={(e) =>
                                updateScene(i, { narration: e.target.value })
                              }
                            />
                          </label>
                        ) : (
                          <div className="scene-plan-fields">
                            <label>
                              Visual direction
                              <textarea
                                disabled={locked}
                                rows={3}
                                maxLength={2000}
                                value={scene.visual}
                                onChange={(e) =>
                                  updateScene(i, { visual: e.target.value })
                                }
                              />
                            </label>
                            <label>
                              Duration (seconds)
                              <input
                                disabled={locked}
                                type="number"
                                min={1}
                                max={3600}
                                step={1}
                                value={scene.duration}
                                onChange={(e) =>
                                  updateScene(i, {
                                    duration: Number(e.target.value),
                                  })
                                }
                              />
                            </label>
                            <p className="scene-excerpt">{scene.narration}</p>
                          </div>
                        )}
                      </article>
                    ))}
                    <div
                      className={`script-summary ${total !== project.duration ? "timing-error" : ""}`}
                    >
                      <span>
                        {
                          scriptText({ scenes })
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean).length
                        }{" "}
                        words · {scenes.length} scenes
                      </span>
                      <span>
                        {duration(total)} / {duration(project.duration)} planned
                      </span>
                    </div>
                    {total !== project.duration && (
                      <p className="timing-message" role="alert">
                        Scene durations must total {project.duration} seconds
                        before saving.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </section>
        <aside className="editor-side">
          <div className="panel project-brief">
            <span className="tiny-label">PROJECT BRIEF</span>
            <h3>Your starting point</h3>
            <p>{project.topic}</p>
            <Status project={project} />
            <hr />
            <div className="brief-detail">
              <span>Format</span>
              <strong>
                {project.format === "short"
                  ? "Shorts · 9:16"
                  : "Long-form · 16:9"}
              </strong>
            </div>
            <div className="brief-detail">
              <span>Language</span>
              <strong>{languages[project.language]}</strong>
            </div>
            <div className="brief-detail">
              <span>Target duration</span>
              <strong>{duration(project.duration)}</strong>
            </div>
            <div className="brief-detail">
              <span>Saved revision</span>
              <strong>v{project.version}</strong>
            </div>
          </div>
          <div className="panel generation-card">
            <span className="stat-icon purple">
              <Sparkles size={20} />
            </span>
            <h3>
              {scenes.length
                ? "Try a fresh direction"
                : "Find your first words"}
            </h3>
            <ProviderPicker
              provider={provider}
              onUpdated={onChange}
              disabled={locked}
            />
            <p>Active provider: {provider?.label || "Loading…"}</p>
            <p>{provider?.detail || "Checking text provider…"}</p>
            <button
              className="subtle-button full-width"
              disabled={locked || !provider?.configured}
              onClick={() => void generate()}
            >
              {busy === "generate" || project.status === "generating" ? (
                <Spinner />
              ) : (
                <WandSparkles size={15} />
              )}
              {busy === "generate" || project.status === "generating"
                ? "Generating…"
                : provider?.id === "demo"
                  ? "Generate demo script"
                  : provider?.id === "gemini"
                    ? "Generate with Gemini"
                    : "Generate AI script"}
            </button>
            {dirty && (
              <small className="muted">
                Edits are saved to history before generating again.
              </small>
            )}
            {project.error && <p className="error-text">{project.error}</p>}
          </div>
          <div className="panel export-card">
            <h3>
              <ArrowDownToLine size={17} /> Take your script with you
            </h3>
            <p>Export the saved version of your project.</p>
            <div className="export-actions">
              {(["json", "txt"] as const).map((format) => (
                <a
                  aria-disabled={dirty || locked}
                  onClick={(e) => {
                    if (dirty || locked) e.preventDefault();
                  }}
                  className={`subtle-button ${dirty || locked ? "disabled" : ""}`}
                  href={`/api/projects/${id}/export?format=${format}`}
                  key={format}
                >
                  <ArrowDownToLine size={14} /> {format.toUpperCase()}
                </a>
              ))}
            </div>
            {dirty && (
              <small className="muted">
                Save changes to include them in your export.
              </small>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
function Settings({
  provider,
  onUpdated,
}: {
  provider: ProviderInfo | null;
  onUpdated: () => Promise<void>;
}) {
  return (
    <>
      <Heading
        eyebrow="YOUR WORKSPACE, YOUR WAY"
        title="Settings"
        description="A simple, private development workspace with replaceable services."
      />
      <div className="settings-grid">
        <section className="panel settings-panel">
          <span className="stat-icon purple">
            <WandSparkles size={22} />
          </span>
          <h2>Text generation</h2>
          <div className="settings-status">
            <strong>{provider?.label || "Checking…"}</strong>
            <span className="status script_ready">
              {provider?.configured ? "Configured" : "Not configured"}
            </span>
          </div>
          <p>{provider?.detail}</p>
          <ProviderPicker provider={provider} onUpdated={onUpdated} />
          <h3>Gemini setup in Codespaces</h3>
          <p>
            Create a key in{" "}
            <a
              href="https://aistudio.google.com/api-keys"
              target="_blank"
              rel="noreferrer"
            >
              Google AI Studio
            </a>
            . Add it as <code>GEMINI_API_KEY</code> in Codespaces secrets or{" "}
            <code>.env.local</code>. Restart Next.js, select Gemini, then save.
            Never paste keys into this page or commit them.
          </p>
          <p>
            The default model is <code>gemini-2.5-flash</code>; override with
            server-only <code>GEMINI_MODEL</code>. Google marks this model
            deprecated and may reroute aliases. Check its current model/pricing
            documentation before use. Free access depends on your account and
            quota. This app does not enable billing or change models
            automatically. If your Google project already has billing, requests
            may incur charges.
          </p>
          <h3>Ollama (optional)</h3>
          <p>
            Requires your own running model server. Configure{" "}
            <code>OLLAMA_BASE_URL</code> (default localhost:11434) and{" "}
            <code>OLLAMA_MODEL</code> (default llama3.2) on the server. No model
            is bundled or installed automatically.
          </p>
          <h3>Demo recovery</h3>
          <p>
            Select Demo and save to generate free templates without any key or
            model server, even if Gemini or Ollama is unavailable. Output is
            labeled as a template, not researched AI content.
          </p>
        </section>
        <section className="panel settings-panel">
          <span className="stat-icon blue">
            <FolderOpen size={22} />
          </span>
          <h2>Storage & scope</h2>
          <p>
            Projects and revision history are saved to SQLite in{" "}
            <code>data/autotube.sqlite</code> in your Codespace. Reopening the
            same Codespace keeps them; deleting it deletes its local data.
            Export important projects.
          </p>
          <p>
            This is a single-user development app. Keep forwarded port 3000
            private. Authentication and multi-user isolation are not implemented
            in Phase 1.
          </p>
          <hr />
          <h3>What’s available today</h3>
          <ul>
            <li>Projects in Shorts and long-form formats</li>
            <li>Editable scripts and scene plans</li>
            <li>Revision history and JSON / TXT export</li>
            <li>Demo and configurable text providers</li>
          </ul>
          <p className="muted">
            Voice, footage, rendering, YouTube integration, and analytics are
            planned. No YouTube account is connected.
          </p>
        </section>
      </div>
    </>
  );
}
function FutureFeature({
  feature,
  go,
}: {
  feature: (typeof navigation)[number];
  go: (v: View) => void;
}) {
  return (
    <>
      <Heading
        eyebrow="THE ROAD AHEAD"
        title={feature.label}
        description="A place in your future production workflow."
      />
      <div className="panel future-panel">
        <span className="future-icon">
          <feature.icon size={38} />
        </span>
        <span className="hero-tag">PLANNED · PHASE {feature.phase}</span>
        <h2>Great things take a few steps.</h2>
        <p>
          {feature.label} is not implemented in Phase 1. Today, you can create
          projects, write scripts, plan scenes, and export your work.
        </p>
        <span className="muted small-text">
          Later development begins only after Phase 1 approval.
        </span>
        <button className="primary" onClick={() => go("create")}>
          <Plus size={16} /> Start with a script
        </button>
      </div>
    </>
  );
}
