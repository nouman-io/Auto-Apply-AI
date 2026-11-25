"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import AppShell from "../components/AppShell";
import { API_BASE, apiJson } from "../lib/api";
import { Icon } from "../lib/brand-logos";
import { Application } from "../types";

export default function HistoryPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [filter, setFilter] = useState<"all" | "email" | "playwright">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [inspect, setInspect] = useState<Application | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("highlight");
      if (p) setHighlightId(parseInt(p, 10) || null);
    }
  }, []);

  useEffect(() => {
    if (!inspect) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspect(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspect]);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<Application[]>("/api/v1/applications");
      setApps(Array.isArray(data) ? data : []);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const stats = useMemo(() => {
    const email = apps.filter((a) => (a.apply_method || "email") === "email").length;
    const playwright = apps.filter((a) => a.apply_method === "playwright").length;
    const failed = apps.filter((a) => a.status.toLowerCase() === "failed").length;
    return { total: apps.length, email, playwright, failed };
  }, [apps]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => {
      if (filter !== "all" && (a.apply_method || "email") !== filter) return false;
      if (!q) return true;
      return `${a.title} ${a.company} ${a.company_email || ""} ${a.status}`.toLowerCase().includes(q);
    });
  }, [apps, filter, query]);

  return (
    <AppShell
      title="Applied Jobs"
      subtitle="Verify every submission, proof screenshot, Gmail message ID, and cover letter"
      actions={
        <button
          onClick={loadApps}
          className="h-8 px-3 rounded-lg border border-white/10 bg-[#12141b] hover:bg-[#171a23] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5"
        >
          <Icon.Refresh />
          <span>Refresh</span>
        </button>
      }
    >
      <div className="space-y-4">
        {/* Metrics Summary Strip */}
        <div className="panel rounded-xl grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06] text-xs">
          {[
            { label: "Total Records", value: stats.total, tone: "text-white" },
            { label: "Gmail Email", value: stats.email, tone: "text-emerald-400" },
            { label: "Playwright Web", value: stats.playwright, tone: "text-zinc-200" },
            { label: "Failed", value: stats.failed, tone: stats.failed > 0 ? "text-red-400" : "text-zinc-400" },
          ].map((item) => (
            <div key={item.label} className="px-4 py-3 flex items-center justify-between">
              <span className="text-zinc-400">{item.label}</span>
              <span className={`font-mono text-sm font-semibold tabular-nums ${item.tone}`}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Filter & Search Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#12141b] border border-white/[0.08] w-fit">
            {(["all", "email", "playwright"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                  filter === f ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 sm:w-64">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                <Icon.Search />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter company, role, email..."
                className="w-full h-8 field rounded-lg pl-8 pr-3 text-xs"
              />
            </div>
            <span className="text-xs font-mono text-zinc-500 tabular-nums shrink-0">{filtered.length} shown</span>
          </div>
        </div>

        {/* Audit Ledger Table */}
        {loading ? (
          <div className="panel rounded-xl h-48 animate-pulse" />
        ) : filtered.length === 0 ? (
          <div className="panel rounded-xl p-10 text-center text-xs text-zinc-400">
            No matching application records found.
          </div>
        ) : (
          <div className="panel rounded-xl overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-white/[0.07] bg-[#0e1015] text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              <div className="col-span-5">Role &amp; Company</div>
              <div className="col-span-2">Route</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Timestamp</div>
              <div className="col-span-1 text-right">Proof</div>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {filtered.map((app) => {
                const isFailed = app.status.toLowerCase() === "failed";
                return (
                  <div
                    key={app.id}
                    onClick={() => setInspect(app)}
                    className={`px-4 py-3 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 items-center cursor-pointer transition-colors ${
                      highlightId === app.id ? "bg-white/[0.05]" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="md:col-span-5 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{app.title}</div>
                      <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {app.company}
                        {app.company_email ? ` · ${app.company_email}` : ""}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/[0.05] text-zinc-300 border border-white/10">
                        {app.apply_method || "email"}
                      </span>
                    </div>

                    <div className="md:col-span-2">
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                          isFailed
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                        }`}
                      >
                        {app.status}
                      </span>
                    </div>

                    <div className="md:col-span-2 text-[11px] font-mono text-zinc-400 tabular-nums">
                      {new Date(app.applied_at).toLocaleDateString()}
                    </div>

                    <div
                      className="md:col-span-1 flex items-center justify-end gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {app.url && (
                        <a
                          href={app.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open listing"
                          className="p-1.5 rounded-md border border-white/10 text-zinc-400 hover:text-white"
                        >
                          <Icon.External />
                        </a>
                      )}
                      <button
                        onClick={() => setInspect(app)}
                        className="px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white hover:text-black text-[11px] font-medium text-white transition-colors"
                      >
                        Inspect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Proof Inspector Modal */}
      {inspect && (
        <div
          onClick={() => setInspect(null)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel-elevated rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-3.5 gap-4">
              <div>
                <h3 className="text-sm font-semibold text-white">{inspect.title}</h3>
                <p className="text-zinc-400 mt-0.5">
                  {inspect.company} · {inspect.status} ·{" "}
                  <span className="font-mono">{new Date(inspect.applied_at).toLocaleString()}</span>
                </p>
              </div>
              <button onClick={() => setInspect(null)} className="text-zinc-400 hover:text-white p-1" aria-label="Close">
                <Icon.Close />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="panel rounded-lg p-3">
                <div className="text-[10px] uppercase text-zinc-500">Delivery Method</div>
                <div className="font-mono text-zinc-200 mt-0.5 uppercase">{inspect.apply_method || "email"}</div>
              </div>
              <div className="panel rounded-lg p-3">
                <div className="text-[10px] uppercase text-zinc-500">
                  {inspect.gmail_message_id ? "Gmail Message ID" : "Target Contact"}
                </div>
                <div className="font-mono text-zinc-200 mt-0.5 truncate">
                  {inspect.gmail_message_id || inspect.company_email || "Web ATS Form"}
                </div>
              </div>
            </div>

            {inspect.screenshot_path && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-zinc-400 uppercase font-semibold tracking-wider">
                  Playwright Proof Screenshot
                </div>
                <img
                  src={`${API_BASE}${inspect.screenshot_path}`}
                  alt="Submission proof"
                  className="w-full rounded-lg border border-white/10"
                />
              </div>
            )}

            {inspect.cover_letter && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-zinc-400 uppercase font-semibold tracking-wider">Cover Letter</div>
                <pre className="panel rounded-lg p-3.5 text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed max-h-60 overflow-y-auto">
                  {inspect.cover_letter}
                </pre>
              </div>
            )}

            {inspect.notes && (
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-zinc-400">
                {inspect.notes}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
