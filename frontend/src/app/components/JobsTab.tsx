import React from "react";
import { Job } from "../types";
import { JOB_SOURCES, DAILY_APPLY_MAX } from "../constants";
import { SparklesIcon, GmailIcon } from "./Icons";
import { JobsSkeleton, ErrorCard } from "./Skeletons";

interface SourceStat {
  source: string;
  status: string;
  count: number;
  detail?: string;
}

interface JobsTabProps {
  filteredDailyJobs: Job[];
  selectedSource: string;
  setSelectedSource: (src: string) => void;
  sourceStats: Record<string, SourceStat> | null;
  todayApplied: number;
  dailyMax: number;
  isTriggeringSearch: boolean;
  handleTriggerSearchAgent: () => void;
  isApplyingId: number | null;
  handleAutoApply: (job: Job) => void;
  handleAutoApplyBatch: () => void;
  isAutoApplyRunning: boolean;
  onStopAutoApply: () => void;
  isAutoApplyStopping: boolean;
  onViewJobDetails: (job: Job) => void;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function JobsTab({
  filteredDailyJobs,
  selectedSource,
  setSelectedSource,
  sourceStats,
  todayApplied,
  dailyMax = DAILY_APPLY_MAX,
  isTriggeringSearch,
  handleTriggerSearchAgent,
  isApplyingId,
  handleAutoApply,
  handleAutoApplyBatch,
  isAutoApplyRunning,
  onStopAutoApply,
  isAutoApplyStopping,
  onViewJobDetails,
  isLoading,
  error,
  onRetry,
}: JobsTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="glass-panel p-5 rounded-2xl border border-white/10 h-20 animate-pulse bg-slate-900/40"></div>
        <JobsSkeleton />
      </div>
    );
  }

  if (error) {
    return <ErrorCard message={error} onRetry={onRetry} />;
  }

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>Jobs Portal Ranked by Your Resume &amp; Projects</span>
              <span className="bg-rose-950/80 text-rose-300 border border-rose-500/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded">
                Live
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Connected to LinkedIn, Indeed, Google &amp; Greenhouse. Routes to Email when HR email is found, or Playwright for web forms.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-950/80 border border-white/10 px-3 py-2 rounded-xl text-xs text-slate-300 font-mono">
              Daily Quota: <strong className="text-rose-400">{todayApplied}/{dailyMax}</strong>
            </div>

            <button
              onClick={handleTriggerSearchAgent}
              disabled={isTriggeringSearch}
              className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl border border-white/10 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isTriggeringSearch ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Scanning Sources...</span>
                </>
              ) : (
                <>
                  <SparklesIcon />
                  <span>Find Matching Jobs</span>
                </>
              )}
            </button>

            <button
              onClick={isAutoApplyRunning ? onStopAutoApply : handleAutoApplyBatch}
              disabled={isAutoApplyRunning && isAutoApplyStopping}
              className={
                isAutoApplyRunning
                  ? "bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs py-2.5 px-5 rounded-xl border-2 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.8)] animate-pulse flex items-center gap-2"
                  : "btn-red-glow text-white font-bold text-xs py-2.5 px-5 rounded-xl shadow-lg flex items-center gap-2"
              }
            >
              {isAutoApplyRunning ? (
                <>
                  <span>⏹️</span>
                  <span>{isAutoApplyStopping ? "Stopping..." : "STOP APPLY"}</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>Apply (0–{dailyMax})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Source Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-2">
            {JOB_SOURCES.map((src) => {
              const active = selectedSource === src;
              return (
                <button
                  key={src}
                  onClick={() => setSelectedSource(src)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    active
                      ? "bg-rose-600 text-white border-rose-400 shadow"
                      : "bg-slate-900/70 text-slate-400 border-white/10 hover:text-slate-200"
                  }`}
                >
                  {src}
                </button>
              );
            })}
          </div>

          {sourceStats && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
              {Object.values(sourceStats).map((st) => (
                <span
                  key={st.source}
                  title={st.detail || ""}
                  className={`px-2 py-0.5 rounded border ${
                    st.status === "ok"
                      ? "bg-emerald-950/50 text-emerald-300 border-emerald-500/30"
                      : "bg-amber-950/50 text-amber-300 border-amber-500/30"
                  }`}
                >
                  {st.source}: {st.count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {filteredDailyJobs.length === 0 ? (
          <div className="glass-panel p-12 rounded-3xl text-center space-y-5 shadow-2xl border border-white/10 relative overflow-hidden">
            <div className="w-16 h-16 bg-gradient-to-br from-rose-500/20 to-red-500/20 border border-rose-500/40 rounded-2xl flex items-center justify-center mx-auto text-rose-300">
              <SparklesIcon />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-lg font-bold text-slate-100">No Jobs Loaded Yet</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Upload your resume &amp; describe your work in <strong>Resume &amp; Job Details</strong>, then click <strong>&quot;Find Matching Jobs&quot;</strong> to fetch from LinkedIn, Indeed, Google, and Greenhouse.
              </p>
            </div>
            <button
              onClick={handleTriggerSearchAgent}
              disabled={isTriggeringSearch}
              className="btn-red-glow text-white font-bold px-6 py-3 rounded-2xl text-xs inline-flex items-center gap-2"
            >
              <SparklesIcon />
              <span>⚡ Scan LinkedIn, Indeed, Google &amp; Greenhouse</span>
            </button>
          </div>
        ) : (
          filteredDailyJobs.map((job) => {
            const hasHrEmail = Boolean(job.company_email);
            return (
              <div
                key={job.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-rose-500/50 p-6 rounded-xl transition-all shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6 cursor-pointer"
                onClick={() => onViewJobDetails(job)}
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-100 hover:text-rose-300 transition-colors">
                      {job.title}
                    </h3>
                    <span className="bg-slate-800 text-slate-200 border border-white/10 text-[10px] px-2.5 py-0.5 rounded-full font-semibold">
                      {job.source || "Greenhouse"}
                    </span>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold border ${
                        hasHrEmail
                          ? "bg-rose-950/70 text-rose-300 border-rose-500/30"
                          : "bg-indigo-950/70 text-indigo-300 border-indigo-500/30"
                      }`}
                    >
                      {hasHrEmail ? "📧 HR Email" : "🤖 Playwright Web"}
                    </span>
                    {job.already_applied && (
                      <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                        ✓ Applied
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">🏢 {job.company}</span>
                    {job.country && <span>🌍 {job.country.toUpperCase()}</span>}
                    {job.location && <span>📍 {job.location}</span>}
                    {job.salary && <span className="text-amber-300 font-mono">💰 {job.salary}</span>}
                    {job.company_email && (
                      <span className="text-rose-400 font-mono">✉️ {job.company_email}</span>
                    )}
                  </div>

                  {job.match_reasons && job.match_reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {job.match_reasons.slice(0, 2).map((reason, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-slate-950 text-slate-300 border border-slate-800 px-2 py-0.5 rounded-md"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}

                  {job.description && (
                    <p className="text-xs text-slate-300 line-clamp-2 pt-1">
                      {job.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
                    </p>
                  )}
                </div>

                <div className="flex md:flex-col items-end justify-between gap-4 min-w-[200px]">
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Resume Match</div>
                    {job.match_score !== undefined && job.match_score !== null ? (
                      <div className="text-lg font-extrabold text-rose-400">{job.match_score}% Match</div>
                    ) : (
                      <div className="text-sm font-bold text-slate-500 mt-1">Run search to score</div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 w-full">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewJobDetails(job);
                      }}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs py-2 px-4 rounded-lg border border-slate-700"
                    >
                      📋 View Details
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAutoApply(job);
                      }}
                      disabled={isApplyingId === job.id || Boolean(job.already_applied)}
                      className="w-full btn-red-glow text-white font-semibold text-xs py-2.5 px-4 rounded-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isApplyingId === job.id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Applying...</span>
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
            );
          })
        )}
      </div>
    </div>
  );
}
