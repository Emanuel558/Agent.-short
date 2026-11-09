import { languages, type Project, scriptText } from "./schema";
export function exportProject(p: Project, format: "json" | "txt"): string {
  if (format === "json")
    return JSON.stringify(
      { schemaVersion: 1, ...p, script: scriptText(p) },
      null,
      2,
    );
  return `${p.title}\n${"=".repeat(Math.min(p.title.length, 60))}\nTopic: ${p.topic}\nFormat: ${p.format === "short" ? "Shorts · 9:16" : "Long-form · 16:9"}\nLanguage: ${languages[p.language]}\nTarget duration: ${p.duration}s\nProvider: ${p.provider || "No script generated"}${p.provider === "demo" ? " — TEMPLATE DEMO, not AI-generated or researched" : ""}\nRevision: ${p.version}\n\n${p.scenes.map((s, i) => `SCENE ${i + 1}: ${s.heading} (${s.duration}s)\n${s.narration}\n\nVisual plan: ${s.visual}`).join("\n\n")}\n`;
}
