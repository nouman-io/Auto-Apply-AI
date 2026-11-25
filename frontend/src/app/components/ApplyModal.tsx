"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Icon } from "../lib/brand-logos";
import { DAILY_APPLY_MAX } from "../constants";

interface ApplyModalProps {
  open: boolean;
  onClose: () => void;
  onStart: (count: number) => void;
  starting: boolean;
  todayApplied: number;
  dailyMax?: number;
}

export function ApplyModal({
  open,
  onClose,
  onStart,
  starting,
  todayApplied,
  dailyMax = DAILY_APPLY_MAX,
}: ApplyModalProps) {
  const remaining = Math.max(0, dailyMax - todayApplied);
  const [count, setCount] = useState(Math.min(5, remaining));

  useEffect(() => {
    if (open) setCount((p) => Math.min(Math.max(p, remaining > 0 ? 1 : 0), remaining));
  }, [open, remaining]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="panel rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Apply to Matched Jobs</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Daily cap: {dailyMax} · Remaining today: {remaining}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1" aria-label="Close">
            <Icon.Close />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.07] p-3 text-zinc-300 leading-relaxed">
            Sends via <strong>Gmail</strong> when an HR email is found, or submits web forms via <strong>Playwright</strong>.
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-zinc-300 font-medium">How many jobs to apply?</label>
              <span className="font-mono text-white font-semibold">{count} / {remaining}</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={remaining}
                value={count}
                disabled={remaining === 0}
                onChange={(e) => setCount(parseInt(e.target.value, 10) || 0)}
                className="flex-1 accent-white"
              />
              <input
                type="number"
                min={0}
                max={remaining}
                value={count}
                disabled={remaining === 0}
                onChange={(e) => setCount(Math.max(0, Math.min(remaining, parseInt(e.target.value, 10) || 0)))}
                className="w-16 field rounded-lg px-2 py-1.5 text-center font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.08]">
            <button onClick={onClose} className="px-3.5 py-2 rounded-lg border border-white/10 text-zinc-300 hover:bg-white/[0.04]">
              Cancel
            </button>
            <button
              onClick={() => onStart(count)}
              disabled={starting || count <= 0 || remaining === 0}
              className="px-4 py-2 rounded-lg bg-white text-black font-semibold hover:bg-zinc-200 disabled:opacity-40"
            >
              {starting ? "Starting..." : `Apply to ${count}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ApplyProgressCard({
  status,
  onStop,
  onDismiss,
}: {
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
  onDismiss: () => void;
}) {
  if (!status || status.status === "idle") return null;

  const running = status.status === "running";
  const pct = status.target_count > 0 ? Math.min(100, Math.round((status.total_applied / status.target_count) * 100)) : 0;

  return (
    <div className="fixed bottom-5 left-5 right-5 sm:left-auto sm:right-5 sm:w-88 z-40 panel rounded-xl p-4 shadow-2xl space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-white">
          {running ? "Applying in progress..." : `Run ${status.status}`}
        </span>
        {running ? (
          <button onClick={onStop} className="px-2.5 py-1 rounded bg-red-500/20 text-red-300 border border-red-500/30 font-medium">
            Stop
          </button>
        ) : (
          <button onClick={onDismiss} className="text-zinc-400 hover:text-white">
            <Icon.Close />
          </button>
        )}
      </div>

      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {running && status.current_job_title && (
        <div className="text-[11px] text-zinc-400 truncate">
          {status.current_apply_method?.toUpperCase()}: <strong className="text-zinc-200">{status.current_job_title}</strong> ({status.current_job_company})
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
        <span>Email: {status.email_applied}</span>
        <span>Playwright: {status.playwright_applied}</span>
        <span>Failed: {status.total_failed}</span>
      </div>

      {status.last_error && <p className="text-[11px] text-red-400">{status.last_error}</p>}

      {!running && (
        <Link href="/history" className="block text-center py-2 rounded-lg bg-white text-black font-semibold hover:bg-zinc-200">
          View Applied Jobs →
        </Link>
      )}
    </div>
  );
}
