"use client";

import React from "react";
import { Job } from "../types";
import { BrandLogo, Icon } from "../lib/brand-logos";

interface JobDrawerProps {
  job: Job | null;
  applying: boolean;
  onClose?: () => void;
  onApply: (job: Job) => void;
  embedded?: boolean;
}

function cleanDescription(raw?: string): string {
  return (raw || "No description provided.")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function InspectorContent({
  job,
  applying,
  onClose,
  onApply,
  embedded,
}: {
  job: Job;
  applying: boolean;
  onClose?: () => void;
  onApply: (job: Job) => void;
  embedded?: boolean;
}) {
  const isEmail = Boolean(job.company_email);
  const score = job.match_score != null ? Math.max(0, Math.min(100, Math.round(job.match_score))) : null;
  const desc = cleanDescription(job.description);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.08] flex items-start justify-between gap-4 shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
            <BrandLogo id={(job.source || "greenhouse").toLowerCase()} size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white leading-snug">{job.title}</h3>
              {job.already_applied && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  Applied
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 truncate">
              {job.company} · {job.location || "Remote"}
              {job.salary ? ` · ${job.salary}` : ""}
            </p>
          </div>
        </div>
        {!embedded && onClose && (
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 shrink-0" aria-label="Close">
            <Icon.Close />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="panel-elevated rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Match</span>
              <span className="font-mono font-semibold text-white tabular-nums">
                {score != null ? `${score}%` : "—"}
              </span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className={`h-full transition-all ${score != null && score >= 75 ? "bg-emerald-500" : "bg-zinc-300"}`}
                style={{ width: `${score ?? 0}%` }}
              />
            </div>
          </div>

          <div className="panel-elevated rounded-lg p-3">
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider">Apply Route</div>
            <div className="font-medium text-zinc-100 mt-1">{isEmail ? "Gmail HR Email" : "Playwright Web"}</div>
          </div>

          <div className="panel-elevated rounded-lg p-3">
            <div className="text-zinc-500 text-[10px] uppercase tracking-wider">Connector</div>
            <div className="font-medium text-zinc-100 mt-1 truncate">
              {job.source || "Greenhouse"} · {job.opportunity_type}
            </div>
          </div>
        </div>

        {job.company_email && (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3.5 py-2.5 flex items-center justify-between gap-3">
            <span className="text-zinc-300">Extracted HR Contact</span>
            <span className="font-mono text-emerald-400 truncate">{job.company_email}</span>
          </div>
        )}

        {job.match_reasons && job.match_reasons.length > 0 && (
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3.5 space-y-2">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              Resume &amp; Project Alignment
            </div>
            <ul className="space-y-1.5 text-zinc-200 leading-relaxed">
              {job.match_reasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Job Specification</div>
          <div className="text-zinc-300 whitespace-pre-wrap leading-relaxed select-text">{desc}</div>
        </div>
      </div>

      {/* Footer Action Bar */}
      <div className="px-5 py-3.5 border-t border-white/[0.08] bg-[#0d0f14] flex items-center justify-between gap-3 shrink-0">
        <a
          href={job.apply_url || job.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1.5"
        >
          <span>Open original posting</span>
          <Icon.External />
        </a>
        <button
          onClick={() => onApply(job)}
          disabled={applying || Boolean(job.already_applied)}
          className="h-8 px-4 rounded-lg bg-white text-black text-xs font-semibold hover:bg-zinc-200 disabled:opacity-40 transition-colors"
        >
          {job.already_applied
            ? "Already Applied"
            : applying
            ? "Applying..."
            : isEmail
            ? "Send Email Apply"
            : "Apply with Playwright"}
        </button>
      </div>
    </div>
  );
}

export default function JobDrawer({ job, applying, onClose, onApply, embedded = false }: JobDrawerProps) {
  if (embedded) {
    if (!job) {
      return (
        <div className="panel rounded-xl h-[540px] flex flex-col items-center justify-center p-8 text-center">
          <p className="text-sm font-medium text-zinc-200">Select a role to inspect</p>
          <p className="text-xs text-zinc-500 mt-1">
            Use <span className="kbd">↑</span> <span className="kbd">↓</span> keys or click any listing on the left.
          </p>
        </div>
      );
    }
    return (
      <div className="panel rounded-xl overflow-hidden flex flex-col lg:h-[calc(100vh-14.5rem)] lg:sticky lg:top-20">
        <InspectorContent job={job} applying={applying} onApply={onApply} embedded />
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-end lg:hidden">
      <div className="panel w-full max-w-xl h-full border-l border-white/10">
        <InspectorContent job={job} applying={applying} onClose={onClose} onApply={onApply} />
      </div>
    </div>
  );
}
