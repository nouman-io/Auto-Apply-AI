"use client";

import React, { useState, useEffect } from "react";
import { apiJson } from "../lib/api";
import { BrandLogo, Icon } from "../lib/brand-logos";
import { WorkspaceSettings } from "../types";

export interface PluginDef {
  id: string;
  name: string;
  category: "Job Sources" | "Delivery & AI";
  description: string;
  permissions: string;
}

interface PluginModalProps {
  plugin: PluginDef | null;
  settings: WorkspaceSettings;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  notify: (msg: string, type?: "success" | "error") => void;
}

const ACCOUNT_COPY: Record<string, { emailPlaceholder: string; passwordPlaceholder: string; note: string; passwordRequired: boolean }> = {
  linkedin: {
    emailPlaceholder: "LinkedIn account email",
    passwordPlaceholder: "LinkedIn password",
    note: "Sign in with your LinkedIn email & password so AutoApply can open LinkedIn jobs inside an authenticated session.",
    passwordRequired: true,
  },
  indeed: {
    emailPlaceholder: "Indeed account email",
    passwordPlaceholder: "Indeed password (optional if using browser sign-in)",
    note: "Sign in to Indeed via credentials or open the Browser Sign-In window (supports SSO & one-time verification).",
    passwordRequired: false,
  },
};

function SecretInput({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full field rounded-lg pl-3 pr-9 py-2 font-mono text-xs"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide secret" : "Reveal secret"}
        className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded transition-colors ${
          visible ? "text-white" : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        <Icon.Eye />
      </button>
    </div>
  );
}

export default function PluginModal({ plugin, settings, onClose, onUpdated, notify }: PluginModalProps) {
  const [saving, setSaving] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [boards, setBoards] = useState("");
  const [serpKey, setSerpKey] = useState("");
  const [llmProvider, setLlmProvider] = useState("openai");
  const [llmModel, setLlmModel] = useState("gpt-4o-mini");
  const [llmBase, setLlmBase] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [gmailMode, setGmailMode] = useState<"oauth" | "smtp">("smtp");
  const [gmailEmail, setGmailEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  useEffect(() => {
    if (!plugin) return;
    setAuthError(null);
    setAccountPassword("");
    setAccountEmail(
      plugin.id === "linkedin"
        ? settings.linkedin_email || ""
        : plugin.id === "indeed"
          ? settings.indeed_email || ""
          : ""
    );
    setBoards((settings.greenhouse_companies || []).join(", "));
    setSerpKey(settings.serpapi_api_key || "");
    setLlmProvider(settings.llm_provider || "openai");
    setLlmModel(settings.llm_model || "gpt-4o-mini");
    setLlmBase(settings.custom_api_base || "");
    setLlmKey(settings.openai_api_key || "");
    setGmailEmail(settings.gmail_email_address || "");
    setClientId(settings.google_client_id || "");
    setClientSecret(settings.google_client_secret || "");
    setAppPassword("");
  }, [plugin, settings]);

  useEffect(() => {
    if (!plugin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plugin, onClose]);

  if (!plugin) return null;

  const isAccountConnector = plugin.id === "linkedin" || plugin.id === "indeed";
  const isToggleSource = plugin.id === "google" || plugin.id === "greenhouse";
  const enabledList = settings.enabled_connectors || [];
  const isConnected =
    plugin.id === "gmail"
      ? settings.is_gmail_connected
      : plugin.id === "ai"
        ? Boolean(settings.openai_api_key || settings.llm_provider === "ollama")
        : plugin.id === "linkedin"
          ? Boolean(settings.is_linkedin_connected && enabledList.includes("linkedin"))
          : plugin.id === "indeed"
            ? Boolean(settings.is_indeed_connected && enabledList.includes("indeed"))
            : enabledList.includes(plugin.id);

  const syncShell = () => window.dispatchEvent(new Event("autoapply:refresh-shell"));

  const toggleSource = async () => {
    setSaving(true);
    try {
      const next = isConnected
        ? enabledList.filter((x) => x !== plugin.id)
        : Array.from(new Set([...enabledList, plugin.id]));
      await apiJson("/api/v1/users/settings", {
        method: "PUT",
        body: JSON.stringify({ enabled_connectors: next }),
      });
      await onUpdated();
      syncShell();
      notify(`${plugin.name} ${isConnected ? "disconnected" : "connected"}.`);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed to update connector", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAccountSignIn = async (interactive: boolean) => {
    setAuthError(null);
    if (!interactive && !accountEmail.trim()) {
      setAuthError(`Enter your ${plugin.name} email address first.`);
      return;
    }
    if (!interactive && plugin.id === "linkedin" && !accountPassword) {
      setAuthError("Enter your LinkedIn password before signing in.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiJson<{ message: string }>(`/api/v1/users/connectors/${plugin.id}/connect`, {
        method: "POST",
        body: JSON.stringify({
          email: accountEmail.trim(),
          password: accountPassword,
          interactive,
        }),
      });
      await onUpdated();
      syncShell();
      notify(res.message || `${plugin.name} signed in and connected.`);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `${plugin.name} sign-in failed`;
      setAuthError(msg);
      notify(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const disconnectAccountConnector = async () => {
    setSaving(true);
    try {
      await apiJson(`/api/v1/users/connectors/${plugin.id}/disconnect`, { method: "POST" });
      await onUpdated();
      syncShell();
      notify(`${plugin.name} disconnected.`);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Disconnect failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAccountConnector && !isConnected) {
      await handleAccountSignIn(false);
      return;
    }
    setSaving(true);
    try {
      if (plugin.id === "greenhouse") {
        await apiJson("/api/v1/users/settings", {
          method: "PUT",
          body: JSON.stringify({
            greenhouse_companies: boards
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean),
          }),
        });
      } else if (plugin.id === "google") {
        await apiJson("/api/v1/users/settings", {
          method: "PUT",
          body: JSON.stringify({ serpapi_api_key: serpKey }),
        });
      } else if (plugin.id === "ai") {
        await apiJson("/api/v1/users/settings", {
          method: "PUT",
          body: JSON.stringify({
            llm_provider: llmProvider,
            llm_model: llmModel,
            custom_api_base: llmBase,
            openai_api_key: llmKey,
          }),
        });
      } else if (plugin.id === "gmail") {
        if (gmailMode === "smtp") {
          await apiJson("/api/v1/auth/gmail/setup-smtp", {
            method: "POST",
            body: JSON.stringify({ email: gmailEmail, app_password: appPassword }),
          });
        } else {
          await apiJson("/api/v1/users/settings", {
            method: "PUT",
            body: JSON.stringify({ google_client_id: clientId, google_client_secret: clientSecret }),
          });
          const res = await apiJson<{ auth_url?: string }>("/api/v1/auth/gmail/url");
          if (res.auth_url) {
            window.location.href = res.auth_url;
            return;
          }
        }
      }
      await onUpdated();
      syncShell();
      notify(`${plugin.name} configuration saved.`);
      onClose();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const disconnectGmail = async () => {
    setSaving(true);
    try {
      await apiJson("/api/v1/auth/gmail/disconnect", { method: "POST" });
      await onUpdated();
      syncShell();
      notify("Gmail disconnected.");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Disconnect failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const accountSpec = ACCOUNT_COPY[plugin.id];
  const connectedAccountEmail =
    plugin.id === "linkedin" ? settings.linkedin_email : settings.indeed_email;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel-elevated rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
      >
        {/* ChatGPT / Claude-style Connector Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center shrink-0">
              <BrandLogo id={plugin.id} size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">{plugin.name}</h3>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    isConnected
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-zinc-800 text-zinc-400 border-white/10"
                  }`}
                >
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">{plugin.category}</p>
            </div>
          </div>

          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1" aria-label="Close">
            <Icon.Close />
          </button>
        </div>

        <form onSubmit={saveConfig} className="p-5 space-y-4 text-xs">
          <p className="text-zinc-300 leading-relaxed">{plugin.description}</p>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.07] px-3.5 py-2.5 text-[11px] text-zinc-400">
            <span className="text-zinc-200 font-medium">Permissions: </span>
            {plugin.permissions}
          </div>

          {/* Account-Authenticated Connector UI (LinkedIn / Indeed) */}
          {isAccountConnector && accountSpec && (
            isConnected ? (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white font-medium">Authenticated Browser Session Active</div>
                  <div className="text-[11px] text-emerald-300 font-mono truncate mt-0.5">
                    {connectedAccountEmail || `${plugin.name} account linked`}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={disconnectAccountConnector}
                  className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 font-medium shrink-0"
                >
                  {saving ? "..." : "Disconnect"}
                </button>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-white/10 bg-[#0d0f14] p-4">
                <div className="text-[11px] text-zinc-300 leading-relaxed">{accountSpec.note}</div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Account Email</label>
                    <input
                      type="email"
                      value={accountEmail}
                      onChange={(e) => setAccountEmail(e.target.value)}
                      placeholder={accountSpec.emailPlaceholder}
                      className="w-full field rounded-lg px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Password</label>
                    <SecretInput
                      value={accountPassword}
                      onChange={setAccountPassword}
                      placeholder={accountSpec.passwordPlaceholder}
                    />
                  </div>
                </div>

                {authError && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200 leading-relaxed">
                    {authError}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleAccountSignIn(true)}
                    className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 text-[11px] font-medium disabled:opacity-40"
                  >
                    Open Browser Sign-In
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold hover:bg-zinc-200 disabled:opacity-50"
                  >
                    {saving ? "Signing in..." : `Sign In & Connect`}
                  </button>
                </div>
              </div>
            )
          )}

          {/* Direct Toggle Job Sources (Google / Greenhouse) */}
          {isToggleSource && (
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0d0f14] px-4 py-3">
              <div>
                <div className="font-medium text-white">Enable {plugin.name}</div>
                <div className="text-[11px] text-zinc-500">Disconnected by default — enable when ready</div>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={toggleSource}
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors ${
                  isConnected
                    ? "bg-white/[0.08] text-zinc-200 hover:bg-red-500/20 hover:text-red-300"
                    : "bg-white text-black hover:bg-zinc-200"
                }`}
              >
                {isConnected ? "Disconnect" : "Connect"}
              </button>
            </div>
          )}

          {plugin.id === "greenhouse" && (
            <div>
              <label className="block text-zinc-300 font-medium mb-1.5">Tracked Company Board Slugs</label>
              <input
                type="text"
                value={boards}
                onChange={(e) => setBoards(e.target.value)}
                placeholder="vercel, openai, cloudflare, anthropic, stripe"
                className="w-full field rounded-lg px-3 py-2 font-mono text-xs"
              />
            </div>
          )}

          {plugin.id === "google" && (
            <div>
              <label className="block text-zinc-300 font-medium mb-1.5">SerpAPI Key (Optional)</label>
              <SecretInput
                value={serpKey}
                onChange={setSerpKey}
                placeholder="Optional — uses built-in Google Careers search if blank"
              />
            </div>
          )}

          {plugin.id === "ai" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Provider</label>
                  <select
                    value={llmProvider}
                    onChange={(e) => setLlmProvider(e.target.value)}
                    className="w-full field rounded-lg px-3 py-2 text-xs"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="groq">Groq</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="ollama">Ollama (Local)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Model</label>
                  <input
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="w-full field rounded-lg px-3 py-2 font-mono text-xs"
                  />
                </div>
              </div>
              {llmProvider === "ollama" && (
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Base URL</label>
                  <input
                    value={llmBase}
                    onChange={(e) => setLlmBase(e.target.value)}
                    placeholder="http://localhost:11434/v1"
                    className="w-full field rounded-lg px-3 py-2 font-mono text-xs"
                  />
                </div>
              )}
              <div>
                <label className="block text-zinc-300 font-medium mb-1">API Key</label>
                <SecretInput value={llmKey} onChange={setLlmKey} placeholder="sk-... or AIza..." />
              </div>
            </div>
          )}

          {plugin.id === "gmail" && (
            <div className="space-y-3">
              <div className="flex gap-1.5 p-1 rounded-lg bg-[#0d0f14] border border-white/10">
                {(["smtp", "oauth"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setGmailMode(m)}
                    className={`flex-1 py-1.5 rounded-md font-medium uppercase text-[11px] transition-colors ${
                      gmailMode === m ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {m === "smtp" ? "App Password" : "Google OAuth"}
                  </button>
                ))}
              </div>

              {gmailMode === "smtp" ? (
                <div className="space-y-2.5">
                  <input
                    type="email"
                    value={gmailEmail}
                    onChange={(e) => setGmailEmail(e.target.value)}
                    placeholder="your@gmail.com"
                    className="w-full field rounded-lg px-3 py-2 text-xs"
                    required
                  />
                  <SecretInput
                    value={appPassword}
                    onChange={setAppPassword}
                    placeholder="16-character Google App Password"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="Google OAuth Client ID"
                    className="w-full field rounded-lg px-3 py-2 font-mono text-xs"
                  />
                  <SecretInput
                    value={clientSecret}
                    onChange={setClientSecret}
                    placeholder="Google OAuth Client Secret"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
            {plugin.id === "gmail" && settings.is_gmail_connected ? (
              <button
                type="button"
                onClick={disconnectGmail}
                disabled={saving}
                className="text-red-400 hover:text-red-300 font-medium"
              >
                Disconnect Gmail
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg border border-white/10 text-zinc-300 hover:bg-white/[0.04]"
              >
                Close
              </button>
              {(plugin.id === "greenhouse" || plugin.id === "google" || plugin.id === "ai" || plugin.id === "gmail") && (
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-white text-black font-semibold hover:bg-zinc-200 disabled:opacity-50"
                >
                  {saving ? "Saving..." : plugin.id === "gmail" ? "Connect" : "Save"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
