"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import AppShell from "../components/AppShell";
import { ApplyModal, ApplyProgressCard } from "../components/ApplyModal";
import JobDrawer from "../components/JobDrawer";
import { apiJson } from "../lib/api";
import { BrandLogo, Icon } from "../lib/brand-logos";
import { DAILY_APPLY_MAX, JOB_SOURCES } from "../constants";
import { Job, ProfileData, WorkspaceSettings } from "../types";

interface SourceScanReport {
  source: string;
  status: string;
  count: number;
  detail?: string;
}

type RouteFilter = "all" | "email" | "playwright";

export default function OpportunitiesPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [source, setSource] = useState<string>("All");
  const [routeFilter, setRouteFilter] = useState<RouteFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [scanReport, setScanReport] = useState<Record<string, SourceScanReport> | null>(null);

  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const [applyOpen, setApplyOpen] = useState(false);
  const [startingBatch, setStartingBatch] = useState(false);
  const [batchStatus, setBatchStatus] = useState<any>(null);
  const [quota, setQuota] = useState({ today_applied: 0, daily_max: DAILY_APPLY_MAX });
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const notify = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [oppRes, quotaRes, statusRes, profRes, cfgRes] = await Promise.all([
        apiJson<{ items: Job[] }>("/api/v1/search/opportunities?limit=100"),
        apiJson<{ today_applied: number; daily_max: number }>("/api/v1/auto-apply/quota"),
        apiJson<any>("/api/v1/auto-apply/status"),
        apiJson<ProfileData>("/api/v1/resumes/profile").catch(() => null),
        apiJson<WorkspaceSettings>("/api/v1/users/settings").catch(() => null),
      ]);
      const items = oppRes.items || [];
      setJobs(items);
      setQuota(quotaRes);
      setBatchStatus(statusRes);
      if (profRes) setProfile(profRes);
      if (cfgRes) setSettings(cfgRes);
      setSelectedId((prev) => (prev && items.some((j) => j.id === prev) ? prev : items[0]?.id ?? null));
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to load jobs", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (batchStatus?.status !== "running") return;
    const t = setInterval(async () => {
      const st = await apiJson<any>("/api/v1/auto-apply/status").catch(() => null);
      if (st) {
        setBatchStatus(st);
        if (st.status !== "running") loadData();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [batchStatus?.status, loadData]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jobs.filter((j) => {
      if (source !== "All" && (j.source || "").toLowerCase() !== source.toLowerCase()) return false;
      const isEmail = Boolean(j.company_email);
      if (routeFilter === "email" && !isEmail) return false;
      if (routeFilter === "playwright" && isEmail) return false;
      if (q) {
        const hay = `${j.title} ${j.company} ${j.location || ""} ${j.source || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, source, routeFilter, searchQuery]);

  const activeJob = useMemo(() => {
    if (!filtered.length) return null;
    return filtered.find((j) => j.id === selectedId) || filtered[0];
  }, [filtered, selectedId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || applyOpen) return;
      if (!filtered.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = filtered.findIndex((j) => j.id === activeJob?.id);
        const nextIdx =
          e.key === "ArrowDown"
            ? Math.min(filtered.length - 1, idx + 1)
            : Math.max(0, idx - 1);
        setSelectedId(filtered[nextIdx].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, activeJob?.id, applyOpen]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await apiJson<{
        message: string;
        source_status?: Record<string, SourceScanReport>;
      }>("/api/v1/search/trigger", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res.source_status) setScanReport(res.source_status);
      notify(res.message);
      await loadData();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Scan failed", "error");
    } finally {
      setScanning(false);
    }
  };

  const handleApplyOne = async (job: Job) => {
    setApplyingId(job.id);
    try {
      const res = await apiJson<{ success: boolean; message: string }>("/api/v1/auto-apply/apply-one", {
        method: "POST",
        body: JSON.stringify({ job_id: job.id }),
      });
      notify(res.message, res.success ? "success" : "error");
      await loadData();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Application failed", "error");
    } finally {
      setApplyingId(null);
    }
  };

  const handleStartBatch = async (count: number) => {
    setStartingBatch(true);
    try {
      const res = await apiJson<{ message: string }>("/api/v1/auto-apply/start", {
        method: "POST",
        body: JSON.stringify({ apply_count: count }),
      });
      notify(res.message);
      setApplyOpen(false);
      setBatchStatus(await apiJson("/api/v1/auto-apply/status"));
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to start apply", "error");
    } finally {
      setStartingBatch(false);
    }
  };

  const activeConnectors = settings?.enabled_connectors?.length ?? 4;

  return (
    <AppShell
      title="Jobs Portal"
      subtitle="Live roles ranked against your resume, projects, and target focus"
      toast={toast}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="h-8 px-3 rounded-lg border border-white/10 bg-[#12141b] hover:bg-[#171a23] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Icon.Refresh />
            <span>{scanning ? "Scanning..." : "Find Jobs"}</span>
          </button>
          <button
            onClick={() => setApplyOpen(true)}
            disabled={batchStatus?.status === "running"}
            className="h-8 px-3.5 rounded-lg bg-white text-black hover:bg-zinc-200 text-xs font-semibold disabled:opacity-50"
          >
            Apply (0–{quota.daily_max})
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Readiness Strip */}
        <div className="panel rounded-xl grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/[0.06] text-xs">
          <Link href="/profile" className="px-4 py-2.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Resume &amp; Focus</div>
              <div className="text-zinc-200 font-medium mt-0.5">
                {profile?.skills?.length
                  ? `${profile.skills.length} skills · ${profile.projects?.length || 0} projects`
                  : "Upload resume to unlock matching"}
              </div>
            </div>
            <span className={`text-[11px] font-mono ${profile?.skills?.length ? "text-emerald-400" : "text-amber-400"}`}>
              {profile?.skills?.length ? "Ready" : "Setup →"}
            </span>
          </Link>

          <Link href="/plugins" className="px-4 py-2.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Connectors</div>
              <div className="text-zinc-200 font-medium mt-0.5">{activeConnectors} / 4 job boards enabled</div>
            </div>
            <span className="text-[11px] text-zinc-400">Plugins →</span>
          </Link>

          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Routing &amp; Quota</div>
              <div className="text-zinc-200 font-medium mt-0.5 truncate">
                {settings?.is_gmail_connected
                  ? `Gmail (${settings.gmail_email_address}) + Playwright`
                  : "Playwright Web (Gmail optional)"}
              </div>
            </div>
            <span className="font-mono text-xs text-white tabular-nums shrink-0 ml-2">
              {quota.today_applied}/{quota.daily_max}
            </span>
          </div>
        </div>

        {/* Live Source Status Strip after Scan */}
        {scanReport && (
          <div className="panel rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Last Scan:</span>
              {Object.values(scanReport).map((item) => (
                <div
                  key={item.source}
                  title={item.detail}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/[0.08] bg-white/[0.02]"
                >
                  <BrandLogo id={item.source.toLowerCase()} size={12} />
                  <span className="text-zinc-200">{item.source}</span>
                  <span
                    className={`font-mono text-[11px] ${
                      item.count > 0 ? "text-emerald-400" : item.status === "disabled" ? "text-zinc-500" : "text-amber-400"
                    }`}
                  >
                    {item.status === "disabled" ? "off" : `+${item.count}`}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => setScanReport(null)} className="text-[11px] text-zinc-500 hover:text-zinc-200">
              Dismiss
            </button>
          </div>
        )}

        {/* Search + Source + Route Filter Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {JOB_SOURCES.map((src) => (
              <button
                key={src}
                onClick={() => setSource(src)}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors ${
                  source === src
                    ? "bg-white text-black border-white"
                    : "bg-[#12141b] text-zinc-400 border-white/[0.08] hover:text-white"
                }`}
              >
                {src !== "All" && <BrandLogo id={src.toLowerCase()} size={14} />}
                <span>{src}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500">
                <Icon.Search />
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter title, company..."
                className="w-full h-8 field rounded-lg pl-8 pr-3 text-xs"
              />
            </div>

            <div className="inline-flex rounded-lg border border-white/[0.08] bg-[#12141b] p-0.5 text-[11px]">
              {(["all", "email", "playwright"] as RouteFilter[]).map((rt) => (
                <button
                  key={rt}
                  onClick={() => setRouteFilter(rt)}
                  className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                    routeFilter === rt ? "bg-white/[0.1] text-white font-medium" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {rt === "all" ? "All Routes" : rt}
                </button>
              ))}
            </div>

            <span className="text-[11px] font-mono text-zinc-500 tabular-nums px-1">
              {filtered.length} roles
            </span>
          </div>
        </div>

        {/* Master-Detail Split Workspace */}
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 space-y-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="panel rounded-xl h-20 animate-pulse" />
              ))}
            </div>
            <div className="hidden lg:block lg:col-span-7 panel rounded-xl h-[540px] animate-pulse" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="panel rounded-xl p-10 text-center space-y-3">
            <p className="text-sm font-medium text-white">No matching jobs found</p>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Upload your resume in Resume &amp; Focus, configure Connectors in Plugins, and click Find Jobs to pull live listings.
            </p>
            <button onClick={handleScan} disabled={scanning} className="px-4 py-2 rounded-lg bg-white text-black text-xs font-semibold">
              {scanning ? "Scanning..." : "Scan Connected Sources"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Master List */}
            <div className="lg:col-span-5 panel rounded-xl divide-y divide-white/[0.06] overflow-hidden lg:max-h-[calc(100vh-14.5rem)] lg:overflow-y-auto">
              {filtered.map((job) => {
                const isSelected = activeJob?.id === job.id;
                const hasEmail = Boolean(job.company_email);
                return (
                  <div
                    key={job.id}
                    onClick={() => {
                      setSelectedId(job.id);
                      setMobileOpen(true);
                    }}
                    className={`p-3.5 cursor-pointer transition-colors flex items-center justify-between gap-3 border-l-2 ${
                      isSelected
                        ? "bg-white/[0.05] border-l-white"
                        : "border-l-transparent hover:bg-white/[0.025]"
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                        <BrandLogo id={(job.source || "greenhouse").toLowerCase()} size={18} />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-white truncate">{job.title}</span>
                          {job.already_applied && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Applied" />
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          <span className="text-zinc-300">{job.company}</span> · {job.location || "Remote"}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500">
                          {hasEmail ? `Email (${job.company_email})` : "Playwright Web"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono font-semibold text-white tabular-nums">
                        {job.match_score != null ? `${Math.round(job.match_score)}%` : "—"}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApplyOne(job);
                        }}
                        disabled={applyingId === job.id || Boolean(job.already_applied)}
                        className="h-7 px-2.5 rounded-md border border-white/15 bg-white/[0.04] hover:bg-white hover:text-black text-[11px] font-medium text-zinc-200 transition-colors disabled:opacity-40"
                      >
                        {job.already_applied ? "Applied" : applyingId === job.id ? "..." : "Apply"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Embedded Detail Inspector */}
            <div className="hidden lg:block lg:col-span-7">
              <JobDrawer
                embedded
                job={activeJob}
                applying={activeJob ? applyingId === activeJob.id : false}
                onApply={handleApplyOne}
              />
            </div>
          </div>
        )}
      </div>

      <ApplyModal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        onStart={handleStartBatch}
        starting={startingBatch}
        todayApplied={quota.today_applied}
        dailyMax={quota.daily_max}
      />

      <ApplyProgressCard
        status={batchStatus}
        onStop={async () => {
          await apiJson("/api/v1/auto-apply/stop", { method: "POST" }).catch(() => null);
          loadData();
        }}
        onDismiss={async () => {
          await apiJson("/api/v1/auto-apply/dismiss", { method: "POST" }).catch(() => null);
          setBatchStatus(null);
        }}
      />

      {/* Mobile Drawer Overlay */}
      <JobDrawer
        job={mobileOpen ? activeJob : null}
        applying={activeJob ? applyingId === activeJob.id : false}
        onClose={() => setMobileOpen(false)}
        onApply={handleApplyOne}
      />
    </AppShell>
  );
}
