"use client";
import { useState } from "react";
interface Discovery {
  models: Array<{ id: string; freeTierDocumented: boolean }>;
  recommendedModel: string | null;
  currentModel: string | null;
  currentModelListed: boolean;
}
export function GeminiModels({
  keyConfigured,
  onUpdated,
  disabled = false,
}: {
  keyConfigured: boolean;
  onUpdated: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const [data, setData] = useState<Discovery | null>(null);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function request(method: string, body: unknown) {
    const r = await fetch("/api/gemini/models", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await r.json();
    if (!r.ok)
      throw new Error(result.error || "Gemini model operation failed.");
    return result;
  }
  async function discover() {
    setBusy(true);
    setMessage("");
    try {
      const result = await request("POST", {});
      setData(result);
      setModel("");
      setMessage("Model list checked. No model was selected automatically.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(value: string | null) {
    setBusy(true);
    setMessage("");
    try {
      await request("PUT", { model: value });
      await onUpdated();
      setData(null);
      setModel("");
      setMessage("Gemini model saved. Your API key was not changed.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="note-card">
      <strong>Gemini model availability</strong>
      <button
        className="subtle-button full-width"
        style={{ marginTop: 12 }}
        disabled={disabled || busy || !keyConfigured}
        onClick={() => void discover()}
      >
        {busy ? "Checking…" : "Check available Gemini models"}
      </button>
      {data && (
        <>
          <p>
            Current model: {data.currentModel || "invalid server model setting"}
            .{" "}
            {data.currentModelListed
              ? "Listed for this key with generateContent support."
              : "Not listed for this key with generateContent support."}
          </p>
          {data.recommendedModel && (
            <p>
              Recommended candidate: <strong>{data.recommendedModel}</strong>.
              Google documents a free tier; your quota and billing status still
              need checking.
            </p>
          )}
          <label>
            Available free-tier model
            <select
              aria-label="Available free-tier model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={busy || disabled}
            >
              <option value="">Choose explicitly…</option>
              {data.models
                .filter((m) => m.freeTierDocumented)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
            </select>
          </label>
          {!data.models.some((m) => m.freeTierDocumented) && (
            <p>
              No model in this key's list has a documented free-tier entry in
              the app's reviewed catalog. Use Demo; no paid-only model will be
              selected.
            </p>
          )}
          <p>
            {data.models.length} models support generateContent. Models without
            reviewed free-tier pricing are not selectable here.
          </p>
          <button
            className="subtle-button full-width"
            style={{ marginTop: 10 }}
            disabled={!model || busy || disabled}
            onClick={() => void save(model)}
          >
            Save Gemini model
          </button>
        </>
      )}
      <button
        className="text-button"
        style={{ marginTop: 12 }}
        disabled={busy || disabled}
        onClick={() => void save(null)}
      >
        Use server GEMINI_MODEL setting
      </button>
      {message && <p role="status">{message}</p>}
      <p>
        Discovery reads Google's model metadata only. Saving does not generate
        content or enable billing. An already-billed Google project may incur
        charges when you generate.{" "}
        <a
          href="https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite"
          target="_blank"
          rel="noreferrer"
        >
          Check Google pricing
        </a>
        .
      </p>
    </div>
  );
}
