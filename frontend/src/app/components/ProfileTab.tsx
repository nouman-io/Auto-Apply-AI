import React from "react";
import { ProfileData, AtsMetrics, Experience, Education, Project } from "../types";
import { UserIcon, SparklesIcon, UploadIcon, TargetIcon } from "./Icons";
import { ProfileSkeleton, ErrorCard } from "./Skeletons";
import {
  WORK_MODE_OPTIONS,
  ALL_WORLD_COUNTRIES,
  EMPLOYMENT_TYPE_OPTIONS,
  SALARY_RANGE_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  VISA_SPONSORSHIP_OPTIONS,
  DAILY_APPLY_MAX,
} from "../constants";

interface ProfileTabProps {
  userEmail: string;
  setUserEmail: (v: string) => void;
  fullName: string;
  setFullName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  portfolioUrl: string;
  setPortfolioUrl: (v: string) => void;
  githubUrl: string;
  setGithubUrl: (v: string) => void;
  otherUrl: string;
  setOtherUrl: (v: string) => void;
  jobDetails: string;
  setJobDetails: (v: string) => void;
  targetRoles: string[];
  setTargetRoles: (v: string[]) => void;
  countryQuery: string;
  setCountryQuery: (v: string) => void;
  isCountryDropdownOpen: boolean;
  setIsCountryDropdownOpen: (v: boolean) => void;
  selectedCountries: string[];
  handleSelectCountryFromDropdown: (c: string) => void;
  handleRemoveCountry: (c: string) => void;
  workModePref: string;
  setWorkModePref: (v: string) => void;
  salaryPref: string;
  setSalaryPref: (v: string) => void;
  experiencePref: string;
  setExperiencePref: (v: string) => void;
  visaSponsorshipPref: string;
  setVisaSponsorshipPref: (v: string) => void;
  selectedEmpTypes: string[];
  toggleEmpType: (type: string) => void;
  dailyApplyLimit: number;
  setDailyApplyLimit: (v: number) => void;
  totalTodayApplied: number;
  isSavingProfile: boolean;
  handleSaveProfile: (e: React.FormEvent) => void;
  isUploading: boolean;
  agentPhase: string | null;
  agentLogs: string[];
  uploadedResume: string | null;
  handleResumeUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  extractedProfile: ProfileData;
  atsMetrics: AtsMetrics;
  handleRunAtsCheck: () => void;
  isAnalyzingATS: boolean;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function ProfileTab({
  userEmail, setUserEmail,
  fullName, setFullName,
  phone, setPhone,
  portfolioUrl, setPortfolioUrl,
  githubUrl, setGithubUrl,
  otherUrl, setOtherUrl,
  jobDetails, setJobDetails,
  targetRoles, setTargetRoles,
  countryQuery, setCountryQuery,
  isCountryDropdownOpen, setIsCountryDropdownOpen,
  selectedCountries, handleSelectCountryFromDropdown, handleRemoveCountry,
  workModePref, setWorkModePref,
  salaryPref, setSalaryPref,
  experiencePref, setExperiencePref,
  visaSponsorshipPref, setVisaSponsorshipPref,
  selectedEmpTypes, toggleEmpType,
  dailyApplyLimit, setDailyApplyLimit,
  totalTodayApplied,
  isSavingProfile, handleSaveProfile,
  isUploading, agentPhase, agentLogs,
  uploadedResume, handleResumeUpload,
  extractedProfile, atsMetrics,
  handleRunAtsCheck, isAnalyzingATS,
  isLoading, error, onRetry,
}: ProfileTabProps) {
  if (isLoading) return <ProfileSkeleton />;
  if (error) return <ErrorCard message={error} onRetry={onRetry} />;

  const goalProgress = dailyApplyLimit > 0 ? Math.min(100, Math.round((totalTodayApplied / dailyApplyLimit) * 100)) : 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Col 1 & 2: Candidate Details, Job Details ("what type of work they do"), Preferences */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <UserIcon />
                <span>Candidate Details &amp; What Type of Work You Do</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Used by the agent alongside your extracted resume &amp; projects to match and apply across LinkedIn, Indeed, Google, and Greenhouse.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Name (used in Playwright web forms)</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full omni-input rounded-xl px-3 py-2.5"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Phone Number (used in Playwright web forms)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 123 4567"
                  className="w-full omni-input rounded-xl px-3 py-2.5"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Email Address</label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="w-full omni-input rounded-xl px-3 py-2.5"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Portfolio / Website</label>
                <input
                  type="url"
                  value={portfolioUrl}
                  onChange={(e) => setPortfolioUrl(e.target.value)}
                  placeholder="https://yourportfolio.com"
                  className="w-full omni-input rounded-xl px-3 py-2.5"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">GitHub URL</label>
                <input
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/username"
                  className="w-full omni-input rounded-xl px-3 py-2.5"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">LinkedIn Profile URL</label>
                <input
                  type="url"
                  value={otherUrl}
                  onChange={(e) => setOtherUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                  className="w-full omni-input rounded-xl px-3 py-2.5"
                />
              </div>
            </div>

            {/* Job Details ("give job detail what type of they do") */}
            <div className="space-y-4 pt-4 border-t border-white/10">
              <h4 className="text-sm font-bold text-rose-300">Job Details &amp; Search Focus</h4>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  What Type of Job / Work Do You Do?
                </label>
                <textarea
                  rows={3}
                  value={jobDetails}
                  onChange={(e) => setJobDetails(e.target.value)}
                  placeholder="Describe the type of work you do (e.g. Full-stack web development with React/Next.js, Python FastAPI backends, AI agents & automation pipelines)..."
                  className="w-full omni-input rounded-xl px-3 py-2.5 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Target Roles (Comma separated)</label>
                <input
                  type="text"
                  value={targetRoles.join(", ")}
                  onChange={(e) => setTargetRoles(e.target.value.split(",").map((r) => r.trim()))}
                  placeholder="e.g. Software Engineer, Full Stack Developer, AI Engineer"
                  className="w-full omni-input rounded-xl px-3 py-2.5"
                />
              </div>

              {/* Target Countries Multi-Select */}
              <div className="relative z-20">
                <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                  <span>Target Countries</span>
                  <span className="text-[10px] text-rose-400 font-mono">{selectedCountries.length} Selected</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={countryQuery}
                    onChange={(e) => {
                      setCountryQuery(e.target.value);
                      setIsCountryDropdownOpen(true);
                    }}
                    onFocus={() => setIsCountryDropdownOpen(true)}
                    placeholder="Search and add countries (e.g. United States, Germany...)"
                    className="w-full omni-input rounded-xl px-3 py-2.5"
                  />
                  {isCountryDropdownOpen && (
                    <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-56 overflow-y-auto custom-scrollbar z-50">
                      {ALL_WORLD_COUNTRIES.filter((c) => c.toLowerCase().includes(countryQuery.toLowerCase())).map(
                        (country, idx) => {
                          const isAlreadySelected = selectedCountries.includes(country);
                          return (
                            <div
                              key={idx}
                              onClick={() => handleSelectCountryFromDropdown(country)}
                              className={`px-4 py-2 text-xs font-semibold cursor-pointer flex items-center justify-between ${
                                isAlreadySelected
                                  ? "bg-slate-950 text-slate-500"
                                  : "hover:bg-rose-950/40 text-slate-200 hover:text-rose-300"
                              }`}
                            >
                              <span>{country}</span>
                              <span className="text-[10px] text-rose-400 font-mono">
                                {isAlreadySelected ? "Selected" : "+ Add"}
                              </span>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedCountries.map((country, idx) => (
                    <span
                      key={idx}
                      className="bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs font-semibold px-3 py-1 rounded-lg flex items-center gap-2"
                    >
                      <span>{country}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCountry(country)}
                        className="hover:text-red-400 text-slate-400 font-bold"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/10 pt-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Preferred Work Mode</label>
                  <select
                    value={workModePref}
                    onChange={(e) => setWorkModePref(e.target.value)}
                    className="w-full omni-input rounded-xl px-3 py-2 text-xs"
                  >
                    {WORK_MODE_OPTIONS.map((opt, idx) => (
                      <option key={idx} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Minimum Salary</label>
                  <select
                    value={salaryPref}
                    onChange={(e) => setSalaryPref(e.target.value)}
                    className="w-full omni-input rounded-xl px-3 py-2 text-xs"
                  >
                    {SALARY_RANGE_OPTIONS.map((opt, idx) => (
                      <option key={idx} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Experience Level</label>
                  <select
                    value={experiencePref}
                    onChange={(e) => setExperiencePref(e.target.value)}
                    className="w-full omni-input rounded-xl px-3 py-2 text-xs"
                  >
                    {EXPERIENCE_LEVEL_OPTIONS.map((opt, idx) => (
                      <option key={idx} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Visa Sponsorship</label>
                  <select
                    value={visaSponsorshipPref}
                    onChange={(e) => setVisaSponsorshipPref(e.target.value)}
                    className="w-full omni-input rounded-xl px-3 py-2 text-xs"
                  >
                    {VISA_SPONSORSHIP_OPTIONS.map((opt, idx) => (
                      <option key={idx} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-2">Opportunity Types</label>
                <div className="flex flex-wrap gap-2">
                  {EMPLOYMENT_TYPE_OPTIONS.map((type, idx) => {
                    const isSelected = selectedEmpTypes.includes(type);
                    return (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => toggleEmpType(type)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                          isSelected
                            ? "bg-rose-950/80 border-rose-500 text-rose-200"
                            : "bg-[#12141d] border-white/10 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {isSelected ? "✓ " : "+ "}{type}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Daily Apply Cap (0 -> 15 Daily Max) */}
            <div className="bg-[#12141d] border border-white/10 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <TargetIcon />
                  <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                    Daily Apply Quota (Max {DAILY_APPLY_MAX} / Day)
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-slate-300">
                  {totalTodayApplied} / {dailyApplyLimit} Applied Today
                </span>
              </div>

              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={DAILY_APPLY_MAX}
                  value={dailyApplyLimit}
                  onChange={(e) => setDailyApplyLimit(parseInt(e.target.value, 10) || 1)}
                  className="flex-1 accent-rose-500"
                />
                <span className="text-lg font-extrabold text-rose-400 font-mono min-w-[40px] text-center">
                  {dailyApplyLimit}
                </span>
              </div>

              <div className="w-full bg-[#090a0f] h-2.5 rounded-full overflow-hidden border border-white/10">
                <div
                  className="bg-gradient-to-r from-rose-600 via-rose-500 to-rose-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${goalProgress}%` }}
                ></div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="btn-red-glow text-white font-semibold px-5 py-2.5 rounded-lg shadow-lg text-xs"
              >
                {isSavingProfile ? "Saving..." : "Save Profile & Job Details"}
              </button>
            </div>
          </form>
        </div>

        {/* Col 3: Resume Upload + Extracted Resume Details & Projects */}
        <div className="lg:col-span-1 space-y-6">
          {isUploading ? (
            <div className="bg-slate-900/90 border-2 border-rose-500/50 p-6 rounded-2xl space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-rose-500/30 pb-3">
                <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2">
                  <SparklesIcon />
                  <span>Extracting Resume &amp; Projects...</span>
                </h3>
              </div>
              <div className="bg-slate-950 rounded-xl p-4 font-mono text-[11px] text-slate-300 space-y-2 h-36 overflow-y-auto border border-rose-500/20">
                {agentLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-rose-500">❯</span>
                    <span className={idx === agentLogs.length - 1 && agentPhase !== "complete" ? "text-white font-bold" : "text-slate-400"}>
                      {log}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <UploadIcon />
                  <span>Upload Resume</span>
                </h3>
                <span className="text-[10px] bg-rose-950 text-rose-400 border border-rose-500/30 px-2.5 py-0.5 rounded font-mono">
                  PDF / DOCX
                </span>
              </div>

              <div className="border-2 border-dashed border-slate-700 hover:border-rose-500 p-6 rounded-xl text-center bg-slate-950/60 cursor-pointer relative transition-all group">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleResumeUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                <div className="w-12 h-12 bg-rose-950/60 border border-rose-500/30 rounded-xl flex items-center justify-center mx-auto text-rose-400 group-hover:scale-110 transition-transform">
                  <UploadIcon />
                </div>
                <p className="text-xs font-semibold text-slate-200 mt-3">Click or Drag Resume File</p>
                <p className="text-[10px] text-slate-400 mt-1">Extracts skills, experience, education &amp; projects</p>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs flex items-center justify-between">
                <span className="text-slate-200 font-semibold truncate">
                  {uploadedResume ? `📄 ${uploadedResume}` : "No Active Resume"}
                </span>
                {uploadedResume && (
                  <span className="bg-emerald-950 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-mono">
                    Extracted
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Extracted Candidate Details & Projects Card */}
          <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-5 max-h-[640px] overflow-y-auto custom-scrollbar">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between sticky top-0 bg-slate-900/90 backdrop-blur z-10">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <SparklesIcon />
                <span>Extracted Resume &amp; Projects</span>
              </h3>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <h4 className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Summary</h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                {extractedProfile.summary || "Upload your resume above to extract summary, skills, and projects."}
              </p>
            </div>

            <div>
              <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">Skills</h4>
              {extractedProfile.skills.length === 0 ? (
                <p className="text-xs text-slate-500">No skills extracted yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {extractedProfile.skills.map((skill, idx) => (
                    <span
                      key={idx}
                      className="bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs font-semibold px-2.5 py-1 rounded-lg"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Projects Section */}
            <div className="space-y-2 border-t border-slate-800 pt-4">
              <h4 className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                Extracted Projects ({extractedProfile.projects?.length || 0})
              </h4>
              {!extractedProfile.projects || extractedProfile.projects.length === 0 ? (
                <p className="text-xs text-slate-500">No projects extracted yet.</p>
              ) : (
                extractedProfile.projects.map((proj: Project, idx: number) => (
                  <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-slate-800/60 space-y-1">
                    <div className="text-xs font-bold text-slate-200">{proj.name || proj.title}</div>
                    {proj.description && <p className="text-[11px] text-slate-400">{proj.description}</p>}
                    {proj.technologies && proj.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {proj.technologies.map((t, i) => (
                          <span key={i} className="text-[10px] bg-slate-900 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {extractedProfile.experience && extractedProfile.experience.length > 0 && (
              <div className="space-y-2 border-t border-slate-800 pt-4">
                <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Experience</h4>
                {extractedProfile.experience.map((exp: Experience, idx: number) => (
                  <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-slate-800/60 space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-bold text-slate-200">{exp.title}</span>
                      {exp.company && (
                        <span className="text-[10px] text-rose-400 font-mono bg-rose-950/30 px-1.5 py-0.5 rounded">
                          {exp.company}
                        </span>
                      )}
                    </div>
                    {(exp.duration || exp.date) && (
                      <span className="text-[10px] text-slate-500 block">{exp.duration || exp.date}</span>
                    )}
                    {exp.description && <p className="text-[11px] text-slate-400 line-clamp-2">{exp.description}</p>}
                  </div>
                ))}
              </div>
            )}

            {extractedProfile.education && extractedProfile.education.length > 0 && (
              <div className="space-y-2 border-t border-slate-800 pt-4">
                <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Education</h4>
                {extractedProfile.education.map((edu: Education, idx: number) => (
                  <div key={idx} className="bg-slate-950 p-3 rounded-lg border border-slate-800/60">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-bold text-slate-200">{edu.degree}</span>
                      {edu.institution && (
                        <span className="text-[10px] text-indigo-400 font-mono bg-indigo-950/30 px-1.5 py-0.5 rounded">
                          {edu.institution}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ATS Score Section */}
      <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <SparklesIcon />
              <span>ATS Resume Audit</span>
            </h3>
            <p className="text-xs text-slate-400">Section completeness, keyword density, formatting, and action verbs.</p>
          </div>
          <button
            onClick={handleRunAtsCheck}
            disabled={isAnalyzingATS}
            className="bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-200 text-xs font-semibold px-4 py-2 rounded-lg"
          >
            {isAnalyzingATS ? "Running ATS Audit..." : "⚡ Re-Run ATS Check"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1 bg-slate-950 border border-slate-800 p-6 rounded-xl text-center flex flex-col justify-center items-center space-y-2">
            <div className="w-28 h-28 flex items-center justify-center rounded-full bg-gradient-to-tr from-rose-500/20 via-red-500/20 to-orange-500/20 border-4 border-rose-500/50">
              <div>
                <span className="text-3xl font-extrabold text-rose-400">{atsMetrics.overall_score || 0}</span>
                <span className="text-xs text-slate-400 block font-semibold">/ 100</span>
              </div>
            </div>
            <h4 className="text-xs font-bold text-rose-400 uppercase pt-2">
              {atsMetrics.overall_score > 0 ? "ATS Score Ready" : "Upload Resume"}
            </h4>
          </div>

          <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: "🎨 Formatting & Structure", val: atsMetrics.formatting_score },
              { label: "🔑 Skill Density", val: atsMetrics.keyword_density_score },
              { label: "⚡ Action Verbs", val: atsMetrics.action_verbs_score },
              { label: "📋 Section Completeness", val: atsMetrics.section_completeness_score },
            ].map((m) => (
              <div key={m.label} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-semibold">{m.label}</span>
                  <span className="text-rose-400 font-mono font-bold">{m.val}%</span>
                </div>
                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                  <div className="bg-rose-400 h-full rounded-full" style={{ width: `${m.val}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
