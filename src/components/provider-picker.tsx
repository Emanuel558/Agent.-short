"use client";
import { useState } from "react";
import type { ProviderInfo } from "@/lib/providers/text";

/** Explicit selection only: saving this preference never invokes a model. */
export function ProviderPicker({
  provider,
  onUpdated,
  disabled = false,
}: {
  provider: ProviderInfo | null;
  onUpdated: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const selected = choice ?? provider?.id ?? "demo";
  const gemini =
    provider?.id === "gemini"
      ? provider
      : provider?.options?.find((p) => p.id === "gemini");
  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selected }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Provider selection could not be saved.",
        );
      await onUpdated();
      setMessage("Provider saved. Future generation uses this selection.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Provider selection could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div>
      <label>
        Script provider
        <select
          aria-label="Script provider"
          value={selected}
          disabled={disabled || saving || !provider}
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value="gemini">Google Gemini · cloud</option>
          <option value="ollama">Ollama · optional local inference</option>
          <option value="demo">Demo · offline templates</option>
          <option value="openai-compatible">
            OpenAI-compatible · legacy configuration
          </option>
        </select>
      </label>
      <button
        className="subtle-button full-width"
        style={{ marginTop: 12 }}
        disabled={disabled || saving || !provider || selected === "invalid"}
        onClick={() => void save()}
      >
        {saving ? "Saving provider…" : "Save provider"}
      </button>
      {message && <p role="status">{message}</p>}
      {gemini && (
        <p className="small-text" data-testid="gemini-key-status">
          Gemini API key:{" "}
          {gemini.keyConfigured ? "loaded on server" : "not loaded on server"}.
          Model: {gemini.model}.{" "}
          {!gemini.keyConfigured &&
            "Allow this repository to use your Codespaces secret, then stop and reopen the Codespace. Never paste the key here."}
        </p>
      )}
    </div>
  );
}
