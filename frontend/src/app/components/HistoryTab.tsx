"use client";

import React, { useState } from "react";
import { Application } from "../types";
import { API_BASE } from "../lib/api";
import { CalendarIcon, GmailIcon } from "./Icons";
import { HistorySkeleton, ErrorCard } from "./Skeletons";

interface HistoryTabProps {
  historyFilter: "today" | "monthly" | "yearly" | "all";
  setHistoryFilter: (filter: "today" | "monthly" | "yearly" | "all") => void;
  todayApps: Application[];
  emailAppsCount: number;
  playwrightAppsCount: number;
  monthlyApps: Application[];
  yearlyApps: Application[];
  applications: Application[];
  filteredApplications: Application[];
  highlightId?: number | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function HistoryTab({
  historyFilter,
  setHistoryFilter,
  todayApps,
  emailAppsCount,
  playwrightAppsCount,
  monthlyApps,
  yearlyApps,
  applications,
  filteredApplications,
  highlightId,
  isLoading,
  error,
  onRetry,
}: HistoryTabProps) {
  const [inspectApp, setInspectApp] = useState<Application | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <HistorySkeleton />
      </div>
    );
  }

  if (error) return <ErrorCard message={error} onRetry={onRetry} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => setHistoryFilter("today")}
          className={`p-5 rounded-2xl border cursor-pointer transition-all shadow-lg ${
            historyFilter === "today"
              ? "bg-rose-950/40 border-rose-500/80 ring-2 ring-rose-500/30"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarIcon />
              <span>Today</span>
            </span>
            <span className="bg-rose-950 text-rose-300 border border-rose-500/30 text-[10px] px-2 py-0.5 rounded font-mono">
              24 Hours
            </span>
          </div>
          <div className="text-2xl font-extrabold text-rose-400 font-mono">{todayApps.length} Applied</div>
          <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
            <span>📧 Email: <strong className="text-slate-200 font-mono">{emailAppsCount}</strong></span>
            <span>🤖 Playwright: <strong className="text-indigo-300 font-mono">{playwrightAppsCount}</strong></span>
          </div>
        </div>

        <div
          onClick={() => setHistoryFilter("monthly")}
          className={`p-5 rounded-2xl border cursor-pointer transition-all shadow-lg ${
            historyFilter === "monthly"
              ? "bg-rose-950/40 border-rose-500/80 ring-2 ring-rose-500/30"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarIcon />
              <span>This Month</span>
            </span>
          </div>
          <div className="text-2xl font-extrabold text-rose-400 font-mono">{monthlyApps.length} Applied</div>
          <p className="text-[11px] text-slate-400 mt-1">Applications submitted this month.</p>
        </div>

        <div
          onClick={() => setHistoryFilter("yearly")}
          className={`p-5 rounded-2xl border cursor-pointer transition-all shadow-lg ${
            historyFilter === "yearly"
              ? "bg-rose-950/40 border-rose-500/80 ring-2 ring-rose-500/30"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarIcon />
              <span>This Year</span>
            </span>
          </div>
          <div className="text-2xl font-extrabold text-rose-400 font-mono">{yearlyApps.length} Applied</div>
          <p className="text-[11px] text-slate-400 mt-1">Total jobs checked &amp; applied this year.</p>
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <GmailIcon />
              <span>Applied Jobs Log &amp; Proof</span>
            </h3>
            <p className="text-xs text-slate-400">
              Check every applied job, including Playwright screenshots, Gmail message proofs, and tailored cover letters.
            </p>
          </div>

          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {(["today", "monthly", "yearly", "all"] as const).map((period) => (
              <button
                key={period}
                onClick={() => setHistoryFilter(period)}
                className={`px-3 py-1.5 rounded-lg font-semibold capitalize transition-all ${
                  historyFilter === period ? "bg-rose-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-800">
          {filteredApplications.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs space-y-2">
              <p className="text-sm font-semibold text-slate-300">No Applied Jobs Yet</p>
              <p>Click Apply on the Jobs Portal to submit via Playwright or HR Email.</p>
            </div>
          ) : (
            filteredApplications.map((app) => {
              const isHighlighted = highlightId === app.id;
              const isPlaywright = app.apply_method === "playwright";
              return (
                <div
                  key={app.id}
                  className={`p-6 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isHighlighted ? "bg-rose-950/30 ring-1 ring-inset ring-rose-500/60" : "hover:bg-slate-900/40"
                  }`}
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-100">{app.title}</h4>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                          isPlaywright
                            ? "bg-indigo-950/80 text-indigo-300 border-indigo-500/30"
                            : "bg-rose-950/80 text-rose-300 border-rose-500/30"
                        }`}
                      >
                        {isPlaywright ? "🤖 Playwright" : "📧 Email"}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                          app.status === "Failed"
                            ? "bg-red-950/80 text-red-300 border-red-500/30"
                            : "bg-emerald-950/80 text-emerald-300 border-emerald-500/30"
                        }`}
                      >
                        {app.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400">
                      Company: <strong className="text-slate-200">{app.company}</strong>
                      {app.company_email ? ` (${app.company_email})` : ""}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Applied At: {new Date(app.applied_at).toLocaleString()}
                      {app.gmail_message_id ? ` • Gmail ID: ${app.gmail_message_id}` : ""}
                    </p>
                    {app.notes && <p className="text-[11px] text-slate-400">{app.notes}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {app.url && (
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 font-semibold"
                      >
                        Open Job ↗
                      </a>
                    )}
                    <button
                      onClick={() => setInspectApp(app)}
                      className="text-xs bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 px-3 py-1.5 rounded-lg border border-rose-500/30 font-semibold"
                    >
                      Inspect Details
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Inspect Applied Job Modal (Screenshot Proof + Cover Letter + Notes) */}
      {inspectApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#12141d] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100">{inspectApp.title}</h3>
                <p className="text-xs text-slate-400">
                  {inspectApp.company} • {inspectApp.status}
                </p>
              </div>
              <button
                onClick={() => setInspectApp(null)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            {inspectApp.screenshot_path && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-indigo-300 uppercase">Playwright Submission Screenshot</div>
                <img
                  src={`${API_BASE}${inspectApp.screenshot_path}`}
                  alt="Playwright form screenshot"
                  className="w-full rounded-xl border border-white/10"
                />
              </div>
            )}

            {inspectApp.cover_letter && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-rose-300 uppercase">Cover Letter Sent</div>
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
                  {inspectApp.cover_letter}
                </pre>
              </div>
            )}

            {inspectApp.notes && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300">
                <strong>Execution Log:</strong> {inspectApp.notes}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
