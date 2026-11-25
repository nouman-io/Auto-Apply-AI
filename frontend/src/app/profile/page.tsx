"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppShell from "../components/AppShell";
import { apiJson } from "../lib/api";
import { Icon } from "../lib/brand-logos";
import { DAILY_APPLY_MAX, WORK_MODE_OPTIONS, EXPERIENCE_LEVEL_OPTIONS, ALL_WORLD_COUNTRIES } from "../constants";
import { ProfileData, WorkspaceSettings } from "../types";

type ResumeSectionTab = "projects" | "experience" | "education" | "skills";

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData>({
    summary: "",
    skills: [],
    experience: [],
    education: [],
    projects: [],
  });
  const [sectionTab, setSectionTab] = useState<ResumeSectionTab>("projects");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [jobDetails, setJobDetails] = useState("");
  const [targetRoles, setTargetRoles] = useState("Full Stack Developer, AI Engineer");
  const [countries, setCountries] = useState<string[]>(["United States", "United Kingdom", "Germany"]);
  const [workMode, setWorkMode] = useState(WORK_MODE_OPTIONS[0]);
  const [expLevel, setExpLevel] = useState(EXPERIENCE_LEVEL_OPTIONS[1]);
  const [dailyLimit, setDailyLimit] = useState(DAILY_APPLY_MAX);
  const [uploading, setUploading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const notify = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadProfile = useCallback(async () => {
    const [p, s] = await Promise.all([
      apiJson<ProfileData>("/api/v1/resumes/profile").catch(() => null),
      apiJson<WorkspaceSettings>("/api/v1/users/settings").catch(() => null),
    ]);
    if (p) setProfile(p);
    if (s) {
      setFullName(s.full_name || "");
      setPhone(s.phone || "");
      setEmail(s.email || "");
      setGithubUrl(s.github_url || "");
      setLinkedinUrl(s.other_url || "");
      setPortfolioUrl(s.portfolio_url || "");
      setJobDetails(s.job_details || "");
      if (s.target_roles?.length) setTargetRoles(s.target_roles.join(", "));
      if (s.target_countries?.length) setCountries(s.target_countries);
      if (s.work_mode_preference) setWorkMode(s.work_mode_preference);
      if (s.experience_level) setExpLevel(s.experience_level);
      if (s.daily_apply_limit) setDailyLimit(s.daily_apply_limit);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await apiJson<ProfileData & { github_url?: string; linkedin_url?: string; portfolio_url?: string }>(
        "/api/v1/resumes/upload",
        { method: "POST", body: fd }
      );
      setProfile(data);
      if (data.full_name && !fullName) setFullName(data.full_name);
      if (data.github_url && !githubUrl) setGithubUrl(data.github_url);
      if (data.linkedin_url && !linkedinUrl) setLinkedinUrl(data.linkedin_url);
      if (data.portfolio_url && !portfolioUrl) setPortfolioUrl(data.portfolio_url);
      notify("Resume, projects & ATS audit updated.");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleAtsAudit = async () => {
    setAuditing(true);
    try {
      const primaryRole = targetRoles.split(",").map((s) => s.trim()).filter(Boolean)[0] || undefined;
      const res = await apiJson<Partial<ProfileData>>("/api/v1/resumes/ats-check", {
        method: "POST",
        body: JSON.stringify({ target_role: primaryRole, job_description: jobDetails || undefined }),
      });
      setProfile((prev) => ({ ...prev, ...res }));
      notify(`ATS audit completed (${res.ats_score ?? 0}/100).`);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "ATS audit failed", "error");
    } finally {
      setAuditing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiJson("/api/v1/users/profile", {
        method: "PUT",
        body: JSON.stringify({
          full_name: fullName,
          phone,
          email,
          github_url: githubUrl,
          other_url: linkedinUrl,
          portfolio_url: portfolioUrl,
          job_details: jobDetails,
          target_roles: targetRoles.split(",").map((s) => s.trim()).filter(Boolean),
          target_countries: countries,
          work_mode_preference: workMode,
          experience_level: expLevel,
          daily_apply_limit: dailyLimit,
        }),
      });
      notify("Profile & job focus saved.");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleCountry = (c: string) => {
    setCountries((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const atsMetrics = [
    { label: "Formatting", value: profile.formatting_score ?? 0 },
    { label: "Keywords", value: profile.keyword_density_score ?? 0 },
    { label: "Action Verbs", value: profile.action_verbs_score ?? 0 },
    { label: "Completeness", value: profile.section_completeness_score ?? 0 },
  ];

  const missingSkills = profile.ats_suggestions?.missing_skills || [];
  const hasProfileData =
    profile.skills.length > 0 || profile.projects.length > 0 || profile.experience.length > 0;

  return (
    <AppShell
      title="Resume & Job Focus"
      subtitle="Provide your resume, projects, and the type of work you do"
      toast={toast}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Candidate & Work Focus Form */}
        <form onSubmit={handleSave} className="lg:col-span-7 panel rounded-xl p-5 space-y-5 text-xs">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
            <div>
              <h2 className="text-sm font-semibold text-white">Candidate &amp; Work Details</h2>
              <p className="text-zinc-400 mt-0.5">Used to rank live jobs and auto-fill Playwright forms.</p>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="h-8 px-4 rounded-lg bg-white text-black font-semibold hover:bg-zinc-200 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alex Rivera" className="w-full field rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 0100" className="w-full field rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Email Address</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" className="w-full field rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">GitHub URL</label>
              <input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/..." className="w-full field rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">LinkedIn URL</label>
              <input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." className="w-full field rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Portfolio URL</label>
              <input value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="https://portfolio.dev" className="w-full field rounded-lg px-3 py-2" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block font-medium text-zinc-200">What type of job / work do you do?</label>
            <textarea
              rows={3}
              value={jobDetails}
              onChange={(e) => setJobDetails(e.target.value)}
              placeholder="e.g. Full-stack TypeScript/Next.js and Python/FastAPI engineering, AI automation agents, REST APIs..."
              className="w-full field rounded-lg px-3 py-2 leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Target Roles</label>
              <input value={targetRoles} onChange={(e) => setTargetRoles(e.target.value)} className="w-full field rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Work Mode</label>
              <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} className="w-full field rounded-lg px-3 py-2">
                {WORK_MODE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Experience Level</label>
              <select value={expLevel} onChange={(e) => setExpLevel(e.target.value)} className="w-full field rounded-lg px-3 py-2">
                {EXPERIENCE_LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Daily Apply Limit (max {DAILY_APPLY_MAX})</label>
              <input
                type="number"
                min={1}
                max={DAILY_APPLY_MAX}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Math.max(1, Math.min(DAILY_APPLY_MAX, parseInt(e.target.value, 10) || 1)))}
                className="w-full field rounded-lg px-3 py-2 font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-zinc-400">Target Countries</label>
              <span className="text-[11px] font-mono text-zinc-500">{countries.length} selected</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_WORLD_COUNTRIES.map((c) => {
                const active = countries.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCountry(c)}
                    className={`px-2.5 py-1 rounded-md border text-[11px] transition-colors ${
                      active ? "bg-white text-black border-white font-medium" : "border-white/10 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        </form>

        {/* Right: Resume Dropzone, ATS Breakdown, Extracted Portfolio */}
        <div className="lg:col-span-5 space-y-4 text-xs">
          <label className="panel rounded-xl p-4 border-dashed border-white/15 hover:border-white/30 transition-colors cursor-pointer flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-zinc-200 shrink-0">
              <Icon.Upload />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-white">
                {uploading ? "Extracting resume..." : "Upload Resume (PDF, DOCX, TXT)"}
              </div>
              <div className="text-zinc-400 mt-0.5 truncate">
                Extracts skills, experience, education, projects &amp; runs ATS audit
              </div>
            </div>
            <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleUpload} className="hidden" />
          </label>

          {/* ATS Breakdown Panel */}
          <div className="panel rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-white">ATS Readiness</h3>
                <p className="text-[11px] text-zinc-500">Evaluated against your target focus</p>
              </div>
              <div className="flex items-center gap-2">
                {profile.ats_score != null && (
                  <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 tabular-nums">
                    {profile.ats_score}/100
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleAtsAudit}
                  disabled={auditing || !hasProfileData}
                  className="h-7 px-2.5 rounded-md border border-white/10 bg-[#171a23] hover:bg-white/[0.08] text-[11px] font-medium text-zinc-200 inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <Icon.Refresh />
                  <span>{auditing ? "Auditing..." : "Re-run"}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {atsMetrics.map((m) => (
                <div key={m.label} className="panel-elevated rounded-lg p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400">{m.label}</span>
                    <span className="font-mono text-zinc-200 tabular-nums">{m.value}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full ${m.value >= 75 ? "bg-emerald-500" : m.value >= 50 ? "bg-amber-400" : "bg-zinc-500"}`}
                      style={{ width: `${Math.min(100, Math.max(0, m.value))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {missingSkills.length > 0 && (
              <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Suggested Keywords</div>
                <div className="flex flex-wrap gap-1.5">
                  {missingSkills.slice(0, 6).map((kw) => (
                    <span key={kw} className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px]">
                      + {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Extracted Profile Tabs */}
          <div className="panel rounded-xl p-4 space-y-3.5">
            {profile.summary && (
              <p className="text-zinc-300 leading-relaxed pb-3 border-b border-white/[0.06]">{profile.summary}</p>
            )}

            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0d0f14] border border-white/[0.07]">
              {([
                { id: "projects", label: `Projects (${profile.projects.length})` },
                { id: "experience", label: `Exp (${profile.experience.length})` },
                { id: "education", label: `Edu (${profile.education.length})` },
                { id: "skills", label: `Skills (${profile.skills.length})` },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSectionTab(t.id)}
                  className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                    sectionTab === t.id ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2">
              {sectionTab === "projects" &&
                (profile.projects.length === 0 ? (
                  <p className="text-zinc-500 py-2">No projects extracted yet.</p>
                ) : (
                  profile.projects.map((p, i) => (
                    <div key={i} className="panel-elevated rounded-lg p-3 space-y-1">
                      <div className="font-medium text-white">{p.name || p.title}</div>
                      {p.description && <p className="text-zinc-400 leading-relaxed line-clamp-2">{p.description}</p>}
                    </div>
                  ))
                ))}

              {sectionTab === "experience" &&
                (profile.experience.length === 0 ? (
                  <p className="text-zinc-500 py-2">No experience entries extracted yet.</p>
                ) : (
                  profile.experience.map((exp, i) => (
                    <div key={i} className="panel-elevated rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-white">{exp.title}</span>
                        {exp.duration && <span className="text-[11px] font-mono text-zinc-500">{exp.duration}</span>}
                      </div>
                      <div className="text-zinc-400">{exp.company}</div>
                      {exp.description && <p className="text-zinc-400 line-clamp-2">{exp.description}</p>}
                    </div>
                  ))
                ))}

              {sectionTab === "education" &&
                (profile.education.length === 0 ? (
                  <p className="text-zinc-500 py-2">No education entries extracted yet.</p>
                ) : (
                  profile.education.map((edu, i) => (
                    <div key={i} className="panel-elevated rounded-lg p-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-white">{edu.degree}</div>
                        <div className="text-zinc-400 mt-0.5">{edu.institution}</div>
                      </div>
                      {edu.year && <span className="font-mono text-[11px] text-zinc-500">{edu.year}</span>}
                    </div>
                  ))
                ))}

              {sectionTab === "skills" &&
                (profile.skills.length === 0 ? (
                  <p className="text-zinc-500 py-2">Upload a resume to extract skills.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.skills.map((s) => (
                      <span key={s} className="px-2 py-1 rounded bg-white/[0.04] border border-white/10 text-zinc-200 text-[11px]">
                        {s}
                      </span>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
