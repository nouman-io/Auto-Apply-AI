"use client";

import React, { useState, useEffect } from "react";
import { DAILY_APPLY_MAX } from "../constants";

interface AutoApplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (applyCount: number) => void;
  isStarting: boolean;
  todayApplied?: number;
  dailyMax?: number;
}

export default function AutoApplyModal({
  isOpen,
  onClose,
  onStart,
  isStarting,
  todayApplied = 0,
  dailyMax = DAILY_APPLY_MAX,
}: AutoApplyModalProps) {
  const remaining = Math.max(0, dailyMax - todayApplied);
  const [applyCount, setApplyCount] = useState(Math.min(5, remaining));

  useEffect(() => {
    if (isOpen) {
      setApplyCount((prev) => Math.min(Math.max(prev, remaining > 0 ? 1 : 0), remaining));
    }
  }, [isOpen, remaining]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#12141d] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md custom-scrollbar">
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span className="text-rose-400">⚡</span>
              <span>How Many Jobs to Apply?</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Daily maximum is {dailyMax} applications ({todayApplied} already used today).
            </p>
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
          <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-3.5 text-xs text-rose-200 space-y-1.5">
            <p className="font-bold text-rose-100">Smart Real-Time Routing</p>
            <p className="text-rose-200/90 leading-relaxed">
              • <strong>HR email found:</strong> Generates tailored cover letter + sends via your connected Gmail.
              <br />
              • <strong>Web-based portal:</strong> Uses <strong>Playwright</strong> to fill and submit the form with your resume.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-300">
                Number of Jobs to Apply (0 – {dailyMax} Daily Max)
              </label>
              <span className="text-[11px] font-mono text-slate-400">
                Remaining today: <strong className="text-emerald-400">{remaining}</strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={remaining}
                value={applyCount}
                disabled={remaining === 0}
                onChange={(e) => setApplyCount(parseInt(e.target.value, 10) || 0)}
                className="flex-1 accent-rose-500"
              />
              <input
                type="number"
                min={0}
                max={remaining}
                value={applyCount}
                disabled={remaining === 0}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(remaining, parseInt(e.target.value, 10) || 0));
                  setApplyCount(val);
                }}
                className="w-16 omni-input rounded-lg px-2 py-1.5 text-center font-mono font-bold text-rose-400"
              />
            </div>

            <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
              <span>0</span>
              <span>Daily Max: {dailyMax}</span>
            </div>
          </div>

          {remaining === 0 && (
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-200">
              You have reached today&apos;s maximum of {dailyMax} applications. You can still inspect your applied jobs in Applied Jobs.
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
            <button
              onClick={onClose}
              disabled={isStarting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 border border-white/10 hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => onStart(applyCount)}
              disabled={isStarting || applyCount <= 0 || remaining === 0}
              className="btn-red-glow text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 disabled:opacity-50"
            >
              {isStarting ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Starting...
                </>
              ) : (
                <>⚡ Apply to {applyCount} Job{applyCount === 1 ? "" : "s"}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
