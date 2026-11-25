"use client";

import React from "react";
import { Job } from "../types";
import { GmailIcon } from "./Icons";

interface JobDetailsModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onApply: (job: Job) => void;
  isApplying: boolean;
}

export default function JobDetailsModal({
  job,
  isOpen,
  onClose,
  onApply,
  isApplying,
}: JobDetailsModalProps) {
  if (!isOpen || !job) return null;

  const cleanDescription = (raw: string | undefined) => {
    if (!raw) return "No description available for this position.";
    return raw
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const hasHrEmail = Boolean(job.company_email);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#12141d] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between border-b border-white/10 p-5 sticky top-0 bg-[#12141d] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-rose-500/20 to-red-500/20 border border-rose-500/40 rounded-xl flex items-center justify-center text-rose-300">
              💼
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">{job.title}</h3>
              <p className="text-xs text-slate-400">
                {job.company} • Source: {job.source || "Greenhouse"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xl font-bold px-2"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-[#090a0f] border border-white/10 rounded-xl p-3">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Source</div>
              <div className="text-sm font-bold text-slate-200 mt-0.5">{job.source || "Greenhouse"}</div>
            </div>
            <div className="bg-[#090a0f] border border-white/10 rounded-xl p-3">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Location</div>
              <div className="text-sm font-bold text-slate-200 mt-0.5">{job.location || "Remote"}</div>
            </div>
            <div className="bg-[#090a0f] border border-white/10 rounded-xl p-3">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Apply Mode</div>
              <div className="text-sm font-bold text-rose-300 mt-0.5">
                {hasHrEmail ? "📧 Email (HR Found)" : "🤖 Playwright Web"}
              </div>
            </div>
            {job.company_email && (
              <div className="bg-[#090a0f] border border-white/10 rounded-xl p-3 col-span-2">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Extracted HR Email</div>
                <div className="text-sm font-mono text-rose-300 mt-0.5">{job.company_email}</div>
              </div>
            )}
            {job.match_score !== undefined && job.match_score !== null && (
              <div className="bg-[#090a0f] border border-white/10 rounded-xl p-3">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">Resume Match</div>
                <div className="text-sm font-extrabold text-rose-400 mt-0.5">{job.match_score}%</div>
              </div>
            )}
          </div>

          {job.match_reasons && job.match_reasons.length > 0 && (
            <div className="bg-[#090a0f] border border-white/10 rounded-xl p-4 space-y-2">
              <div className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">
                Why This Matches Your Resume &amp; Projects
              </div>
              <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                {job.match_reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-5 space-y-3 max-h-[45vh] overflow-y-auto custom-scrollbar">
            <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Job Description</h4>
            <div className="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
              {cleanDescription(job.description)}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
            <a
              href={job.apply_url || job.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-400 hover:text-slate-200 underline"
            >
              Open Original Job Posting ↗
            </a>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={isApplying}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 border border-white/10 hover:bg-white/5"
              >
                Close
              </button>
              <button
                onClick={() => onApply(job)}
                disabled={isApplying || Boolean(job.already_applied)}
                className="btn-red-glow text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 disabled:opacity-50"
              >
                {isApplying ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>Processing...</span>
                  </>
                ) : job.already_applied ? (
                  <span>✓ Already Applied</span>
                ) : hasHrEmail ? (
                  <>
                    <GmailIcon />
                    <span>Apply via Email</span>
                  </>
                ) : (
                  <span>🤖 Apply via Playwright</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
