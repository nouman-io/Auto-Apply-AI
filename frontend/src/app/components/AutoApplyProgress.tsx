"use client";

import React from "react";
import Link from "next/link";

interface AutoApplyProgressProps {
  status: {
    status: string;
    target_count: number;
    total_applied: number;
    email_applied: number;
    playwright_applied: number;
    total_failed: number;
    current_job_title?: string | null;
    current_job_company?: string | null;
    current_apply_method?: string | null;
    last_error?: string | null;
  } | null;
  onStop: () => void;
  isStopping: boolean;
  onDismiss?: () => void;
  isDismissing?: boolean;
}

export default function AutoApplyProgress({
  status,
  onStop,
  isStopping,
  onDismiss,
  isDismissing = false,
}: AutoApplyProgressProps) {
  if (!status || status.status === "idle") return null;

  const isRunning = status.status === "running";
  const target = status.target_count || 0;
  const applied = status.total_applied || 0;
  const progress = target > 0 ? Math.min(100, Math.round((applied / target) * 100)) : 0;

  const statusLabel =
    {
      running: "🔄 Applying in Real Time...",
      completed: "✅ Applications Completed!",
      stopped: "⏹️ Auto-Apply Stopped",
      error: "❌ Auto-Apply Stopped with Error",
    }[status.status] || status.status;

  const statusColor =
    {
      running: "text-rose-300",
      completed: "text-emerald-400",
      stopped: "text-amber-400",
      error: "text-red-400",
    }[status.status] || "text-slate-300";

  return (
    <div
      className={`fixed bottom-6 right-4 left-4 sm:left-auto sm:right-6 z-50 w-auto sm:w-[390px] max-w-full shadow-2xl border rounded-2xl backdrop-blur-xl ${
        isRunning
          ? "border-red-500/60 bg-[#12141d]/95 shadow-[0_10px_30px_rgba(239,68,68,0.25)]"
          : "border-white/10 bg-[#12141d]/95"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          {isRunning && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>}
          <h4 className={`text-xs font-bold ${statusColor}`}>{statusLabel}</h4>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              onClick={onStop}
              disabled={isStopping}
              className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-extrabold px-2.5 py-1 rounded-lg border border-red-400/80 shadow transition-all disabled:opacity-50"
            >
              {isStopping ? "Stopping..." : "⏹️ Stop"}
            </button>
          )}
          {!isRunning && onDismiss && (
            <button
              onClick={onDismiss}
              disabled={isDismissing}
              className="text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 p-1 rounded-lg text-xs transition-all w-7 h-7"
              title="Close"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3.5">
        <div>
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>Progress ({applied}/{target})</span>
            <span className="font-mono font-bold text-rose-300">{progress}%</span>
          </div>
          <div className="w-full bg-[#090a0f] h-2.5 rounded-full overflow-hidden border border-white/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                status.status === "completed"
                  ? "bg-emerald-500"
                  : status.status === "error"
                    ? "bg-red-500"
                    : "bg-gradient-to-r from-rose-600 via-red-500 to-red-400 animate-pulse"
              }`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {isRunning && status.current_job_title && (
          <div className="bg-[#090a0f] border border-white/10 rounded-xl px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-400 font-medium">Currently applying:</p>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 uppercase">
                {status.current_apply_method || "auto"}
              </span>
            </div>
            <p className="text-xs font-bold text-slate-200 truncate mt-0.5">{status.current_job_title}</p>
            <p className="text-[11px] text-rose-400 font-semibold truncate">{status.current_job_company}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#090a0f] border border-white/10 rounded-xl p-2 text-center">
            <div className="text-base font-extrabold text-rose-400 font-mono">{status.email_applied || 0}</div>
            <div className="text-[10px] text-slate-400">📧 Email</div>
          </div>
          <div className="bg-[#090a0f] border border-white/10 rounded-xl p-2 text-center">
            <div className="text-base font-extrabold text-indigo-400 font-mono">{status.playwright_applied || 0}</div>
            <div className="text-[10px] text-slate-400">🤖 Playwright</div>
          </div>
          <div className="bg-[#090a0f] border border-white/10 rounded-xl p-2 text-center">
            <div className="text-base font-extrabold text-red-400 font-mono">{status.total_failed || 0}</div>
            <div className="text-[10px] text-slate-400">❌ Failed</div>
          </div>
        </div>

        {status.last_error && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl px-3 py-2 text-[11px] text-red-300">
            ⚠️ {status.last_error}
          </div>
        )}

        {!isRunning && (
          <div className="flex gap-2 pt-1">
            <Link
              href="/history"
              className="flex-1 btn-red-glow text-white text-center font-bold text-xs py-2.5 rounded-xl"
            >
              Check Applied Jobs →
            </Link>
            {onDismiss && (
              <button
                onClick={onDismiss}
                disabled={isDismissing}
                className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2.5 rounded-xl border border-white/10"
              >
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
