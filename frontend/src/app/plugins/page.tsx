"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import PluginModal, { PluginDef } from "../components/PluginModal";
import { apiJson } from "../lib/api";
import { BrandLogo, Icon } from "../lib/brand-logos";
import { WorkspaceSettings } from "../types";

const PLUGINS: PluginDef[] = [
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "Job Sources",
    description: "Sign in with your LinkedIn account to inspect live roles inside a verified browser session.",
    permissions: "Account session login, read job listings & apply URLs",
  },
  {
    id: "indeed",
    name: "Indeed",
    category: "Job Sources",
    description: "Sign in to Indeed so full postings and employer links load inside an authenticated session.",
    permissions: "Account sign-in, read job feeds & descriptions",
  },
  {
    id: "google",
    name: "Google Jobs",
    category: "Job Sources",
    description: "Search Google Careers and Google Jobs listings (supports optional SerpAPI).",
    permissions: "Read search listings & employer links",
  },
  {
    id: "greenhouse",
    name: "Greenhouse",
    category: "Job Sources",
    description: "Query direct company ATS boards on Greenhouse with Playwright form support.",
    permissions: "Read tracked company boards & submit web forms",
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "Delivery & AI",
    description: "Send tailored applications with your resume when an HR email is found.",
    permissions: "Send email via OAuth 2.0 or SMTP App Password",
  },
  {
    id: "ai",
    name: "AI Model",
    category: "Delivery & AI",
    description: "Power resume project extraction, match scoring, and tailored cover letters.",
    permissions: "OpenAI, Gemini, Groq, OpenRouter, DeepSeek, or local Ollama",
  },
];

const EMPTY_SETTINGS: WorkspaceSettings = {
  llm_provider: "openai",
  llm_model: "gpt-4o-mini",
  custom_api_base: "",
  openai_api_key: "",
  google_client_id: "",
  google_client_secret: "",
  is_gmail_connected: false,
  gmail_email_address: "",
  is_linkedin_connected: false,
  linkedin_email: "",
  is_indeed_connected: false,
  indeed_email: "",
  enabled_connectors: [],
  greenhouse_companies: [],
  serpapi_api_key: "",
  job_details: "",
  target_roles: [],
  target_countries: [],
  work_mode_preference: "",
  salary_preference: "",
  experience_level: "",
  visa_sponsorship_str: "",
  daily_apply_limit: 15,
  email: "",
  full_name: "",
  phone: "",
  portfolio_url: "",
  github_url: "",
  other_url: "",
};

export default function PluginsPage() {
  const [settings, setSettings] = useState<WorkspaceSettings>(EMPTY_SETTINGS);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"All" | "Job Sources" | "Delivery & AI" | "Connected">("All");
  const [activePlugin, setActivePlugin] = useState<PluginDef | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const notify = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await apiJson<WorkspaceSettings>("/api/v1/users/settings");
      setSettings(data);
    } catch {
      // fallback keeps connectors disconnected
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("open");
    const gmailConnected = params.get("gmail_connected");
    const gmailError = params.get("gmail_error");

    if (openId) {
      const target = PLUGINS.find((p) => p.id === openId);
      if (target) setActivePlugin(target);
    }
    if (gmailConnected === "true") {
      notify("Gmail connected via Google OAuth.");
      loadSettings();
    } else if (gmailError) {
      notify(gmailError, "error");
    }
    if (openId || gmailConnected || gmailError) {
      window.history.replaceState({}, "", "/plugins");
    }

    const onOpenPlugin = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const target = PLUGINS.find((p) => p.id === id);
      if (target) setActivePlugin(target);
    };
    window.addEventListener("autoapply:open-plugin", onOpenPlugin);
    return () => window.removeEventListener("autoapply:open-plugin", onOpenPlugin);
  }, [loadSettings, notify]);

  const isPluginConnected = (id: string) => {
    const enabled = settings.enabled_connectors || [];
    if (id === "gmail") return settings.is_gmail_connected;
    if (id === "ai") return Boolean(settings.openai_api_key || settings.llm_provider === "ollama");
    if (id === "linkedin") return Boolean(settings.is_linkedin_connected && enabled.includes("linkedin"));
    if (id === "indeed") return Boolean(settings.is_indeed_connected && enabled.includes("indeed"));
    return enabled.includes(id);
  };

  const handleCardAction = async (e: React.MouseEvent, plugin: PluginDef) => {
    e.stopPropagation();
    if (togglingId) return;

    const connected = isPluginConnected(plugin.id);

    // LinkedIn & Indeed require explicit sign-in modal before connecting
    if ((plugin.id === "linkedin" || plugin.id === "indeed") && !connected) {
      setActivePlugin(plugin);
      return;
    }

    if (plugin.category !== "Job Sources") {
      setActivePlugin(plugin);
      return;
    }

    setTogglingId(plugin.id);
    try {
      if ((plugin.id === "linkedin" || plugin.id === "indeed") && connected) {
        await apiJson(`/api/v1/users/connectors/${plugin.id}/disconnect`, { method: "POST" });
        await loadSettings();
        window.dispatchEvent(new Event("autoapply:refresh-shell"));
        notify(`${plugin.name} disconnected.`);
      } else {
        const current = settings.enabled_connectors || [];
        const next = connected ? current.filter((x) => x !== plugin.id) : Array.from(new Set([...current, plugin.id]));
        await apiJson("/api/v1/users/settings", {
          method: "PUT",
          body: JSON.stringify({ enabled_connectors: next }),
        });
        setSettings((prev) => ({ ...prev, enabled_connectors: next }));
        window.dispatchEvent(new Event("autoapply:refresh-shell"));
        notify(`${plugin.name} ${connected ? "disconnected" : "connected"}.`);
      }
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to update connector", "error");
    } finally {
      setTogglingId(null);
    }
  };

  const connectedCount = PLUGINS.filter((p) => isPluginConnected(p.id)).length;

  const filtered = PLUGINS.filter((p) => {
    if (tab === "Connected" && !isPluginConnected(p.id)) return false;
    if ((tab === "Job Sources" || tab === "Delivery & AI") && p.category !== tab) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
  });

  const getCardStatusText = (plugin: PluginDef, connected: boolean) => {
    if (plugin.id === "linkedin") {
      return connected ? settings.linkedin_email || "Session active" : "Sign in with email & password";
    }
    if (plugin.id === "indeed") {
      return connected ? settings.indeed_email || "Session active" : "Sign in to connect";
    }
    if (plugin.id === "gmail") {
      return settings.gmail_email_address || "Not connected";
    }
    if (plugin.id === "ai") {
      return connected ? `${settings.llm_provider} · ${settings.llm_model}` : "Configure API key";
    }
    if (plugin.id === "greenhouse") {
      return connected ? `${settings.greenhouse_companies?.length || 0} tracked boards` : "Disconnected by default";
    }
    return connected ? "Enabled for search" : "Disconnected by default";
  };

  return (
    <AppShell
      title="Plugins & Connectors"
      subtitle="All connectors start disconnected — sign in or enable only the sources you want"
      toast={toast}
      actions={
        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono text-zinc-400 tabular-nums">
            {connectedCount}/{PLUGINS.length} connected
          </span>
          <Link
            href="/opportunities"
            className="h-8 px-3 rounded-lg border border-white/10 bg-[#12141b] hover:bg-[#171a23] text-zinc-200 inline-flex items-center"
          >
            Back to Portal →
          </Link>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#12141b] border border-white/[0.08] w-fit">
            {(["All", "Job Sources", "Delivery & AI", "Connected"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === t ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
              <Icon.Search />
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search plugins..."
              className="w-full h-9 field rounded-lg pl-9 pr-3 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((plugin) => {
            const connected = isPluginConnected(plugin.id);
            const isAccount = plugin.id === "linkedin" || plugin.id === "indeed";

            return (
              <div
                key={plugin.id}
                onClick={() => setActivePlugin(plugin)}
                className="panel rounded-xl p-4 hover:border-white/20 hover:bg-[#151821] transition-all cursor-pointer flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                        <BrandLogo id={plugin.id} size={23} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-white truncate">{plugin.name}</h3>
                        <span className="text-[11px] text-zinc-500">{plugin.category}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleCardAction(e, plugin)}
                      disabled={togglingId === plugin.id}
                      className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors shrink-0 ${
                        connected
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20"
                          : "bg-white/[0.04] text-zinc-200 border-white/15 hover:bg-white hover:text-black"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-zinc-500"}`} />
                      {togglingId === plugin.id
                        ? "..."
                        : connected
                          ? "Connected"
                          : isAccount
                            ? "Sign In"
                            : "Connect"}
                    </button>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">{plugin.description}</p>
                </div>

                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs gap-2">
                  <span className="text-zinc-500 text-[11px] truncate">{getCardStatusText(plugin, connected)}</span>
                  <span className="text-zinc-200 font-medium shrink-0">Configure →</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PluginModal
        plugin={activePlugin}
        settings={settings}
        onClose={() => setActivePlugin(null)}
        onUpdated={loadSettings}
        notify={notify}
      />
    </AppShell>
  );
}
