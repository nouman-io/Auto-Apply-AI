"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE, parseApiError } from "../lib/api";
import { DAILY_APPLY_MAX } from "../constants";
import Navbar from "../components/Navbar";
import ProfileTab from "../components/ProfileTab";
import ErrorBoundary from "../components/ErrorBoundary";
import Toast from "../components/Toast";
import { ProfileData, AtsMetrics } from "../types";

export default function ProfilePage() {
  const { user, token, isAuthenticated } = useAuth();

  const [userEmail, setUserEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [otherUrl, setOtherUrl] = useState("");
  const [jobDetails, setJobDetails] = useState("");

  const [targetRoles, setTargetRoles] = useState<string[]>(["Full Stack Developer", "AI Engineer"]);
  const [countryQuery, setCountryQuery] = useState("");
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["United States", "United Kingdom", "Canada", "Germany"]);
  const [workModePref, setWorkModePref] = useState("Fully Remote (Worldwide)");
  const [salaryPref, setSalaryPref] = useState("$90,000 - $130,000 / year");
  const [experiencePref, setExperiencePref] = useState("Mid-Level (2 - 5 Yrs)");
  const [visaSponsorshipPref, setVisaSponsorshipPref] = useState("No Visa Needed (Authorized Work Permit)");
  const [selectedEmpTypes, setSelectedEmpTypes] = useState<string[]>(["Full-Time Jobs"]);
  const [dailyApplyLimit, setDailyApplyLimit] = useState(DAILY_APPLY_MAX);
  const [totalTodayApplied, setTotalTodayApplied] = useState(0);

  const [isUploading, setIsUploading] = useState(false);
  const [agentPhase, setAgentPhase] = useState<string | null>(null);
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [uploadedResume, setUploadedResume] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isAnalyzingATS, setIsAnalyzingATS] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [extractedProfile, setExtractedProfile] = useState<ProfileData>({
    summary: "",
    skills: [],
    experience: [],
    education: [],
    projects: [],
  });

  const [atsMetrics, setAtsMetrics] = useState<AtsMetrics>({
    overall_score: 0,
    formatting_score: 0,
    keyword_density_score: 0,
    action_verbs_score: 0,
    section_completeness_score: 0,
    summary: "No resume analyzed yet.",
    strengths: [],
    missing_skills: [],
    formatting_suggestions: [],
    experience_improvements: [],
  });

  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  useEffect(() => {
    if (user?.email) setUserEmail(user.email);
  }, [user]);

  const fetchResumeProfile = useCallback(async () => {
    if (!token) return;
    setIsProfileLoading(true);
    setProfileError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/resumes/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) return;
        throw new Error(await parseApiError(res, "Failed to load resume profile"));
      }
      const data = await res.json();
      if (data.resume_url) setUploadedResume("Active Resume (Saved)");
      if (data.full_name) setFullName(data.full_name);
      if (data.phone) setPhone(data.phone);
      setExtractedProfile({
        summary: data.summary || "",
        skills: data.skills || [],
        experience: data.experience || [],
        education: data.education || [],
        projects: data.projects || [],
        languages: data.languages || [],
      });
      if (data.ats_score) {
        setAtsMetrics((prev) => ({
          ...prev,
          overall_score: data.ats_score,
          formatting_score: data.formatting_score || 0,
          keyword_density_score: data.keyword_density_score || 0,
          action_verbs_score: data.action_verbs_score || 0,
          section_completeness_score: data.section_completeness_score || 0,
          missing_skills: data.ats_suggestions?.missing_skills || [],
          formatting_suggestions: data.ats_suggestions?.formatting_suggestions || [],
          experience_improvements: data.ats_suggestions?.experience_improvements || [],
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load resume profile";
      setProfileError(msg);
      showToast(msg, "error");
    } finally {
      setIsProfileLoading(false);
    }
  }, [token]);

  const fetchUserSettings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.job_details !== undefined) setJobDetails(data.job_details || "");
        if (data.target_countries?.length) setSelectedCountries(data.target_countries);
        if (data.target_roles?.length) setTargetRoles(data.target_roles);
        if (data.work_mode_preference) setWorkModePref(data.work_mode_preference);
        if (data.salary_preference) setSalaryPref(data.salary_preference);
        if (data.experience_level) setExperiencePref(data.experience_level);
        if (data.employment_types?.length) setSelectedEmpTypes(data.employment_types);
        if (typeof data.daily_apply_limit === "number") setDailyApplyLimit(data.daily_apply_limit);
        if (data.full_name) setFullName(data.full_name);
        if (data.phone) setPhone(data.phone);
        if (data.portfolio_url) setPortfolioUrl(data.portfolio_url);
        if (data.github_url) setGithubUrl(data.github_url);
        if (data.other_url) setOtherUrl(data.other_url);
        if (data.visa_sponsorship_str) setVisaSponsorshipPref(data.visa_sponsorship_str);
      }
    } catch (err) {
      console.error("Failed to load user settings:", err);
    }
  }, [token]);

  const fetchQuota = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/auto-apply/quota`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTotalTodayApplied(data.today_applied || 0);
      }
    } catch {
      // Ignore
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchResumeProfile();
    fetchUserSettings();
    fetchQuota();
  }, [isAuthenticated, token, fetchResumeProfile, fetchUserSettings, fetchQuota]);

  const toggleEmpType = (type: string) => {
    setSelectedEmpTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const handleSelectCountryFromDropdown = (country: string) => {
    if (!selectedCountries.includes(country)) {
      setSelectedCountries([...selectedCountries, country]);
    }
    setCountryQuery("");
    setIsCountryDropdownOpen(false);
  };

  const handleRemoveCountry = (country: string) => {
    setSelectedCountries(selectedCountries.filter((c) => c !== country));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: userEmail,
          full_name: fullName,
          phone,
          portfolio_url: portfolioUrl,
          github_url: githubUrl,
          other_url: otherUrl,
          job_details: jobDetails,
          target_roles: targetRoles,
          target_countries: selectedCountries,
          work_mode_preference: workModePref,
          employment_types: selectedEmpTypes,
          salary_preference: salaryPref,
          experience_level: experiencePref,
          visa_sponsorship_str: visaSponsorshipPref,
          daily_apply_limit: dailyApplyLimit,
        }),
      });
      if (res.ok) {
        showToast("Saved profile, job details, and preferences!");
      } else {
        showToast(await parseApiError(res, "Failed to save profile"), "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to save profile.", "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setIsUploading(true);
    setAgentPhase("reading");
    setAgentLogs([
      "[Agent] Uploading resume...",
      "[Agent] Extracting skills, experience, education & projects...",
    ]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/v1/resumes/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      setAgentPhase("complete");
      setAgentLogs((prev) => [
        ...prev,
        res.ok ? "[Agent] Resume & projects extracted!" : "[Agent] Resume extraction failed.",
      ]);

      if (res.ok) {
        const data = await res.json();
        setUploadedResume(file.name);
        if (data.full_name && !fullName) setFullName(data.full_name);
        if (data.github_url && !githubUrl) setGithubUrl(data.github_url);
        if (data.linkedin_url && !otherUrl) setOtherUrl(data.linkedin_url);
        if (data.portfolio_url && !portfolioUrl) setPortfolioUrl(data.portfolio_url);

        setExtractedProfile({
          summary: data.summary || "",
          skills: data.skills || [],
          experience: data.experience || [],
          education: data.education || [],
          projects: data.projects || [],
          languages: data.languages || [],
        });
        if (data.ats_score) {
          setAtsMetrics((prev) => ({
            ...prev,
            overall_score: data.ats_score,
            formatting_score: data.formatting_score || 0,
            keyword_density_score: data.keyword_density_score || 0,
            action_verbs_score: data.action_verbs_score || 0,
            section_completeness_score: data.section_completeness_score || 0,
            missing_skills: data.ats_suggestions?.missing_skills || [],
            formatting_suggestions: data.ats_suggestions?.formatting_suggestions || [],
            experience_improvements: data.ats_suggestions?.experience_improvements || [],
          }));
        }
        showToast("Resume & projects extracted successfully!");
      } else {
        showToast(await parseApiError(res, "Resume upload failed"), "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Resume upload failed.", "error");
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setAgentPhase(null);
      }, 1200);
    }
  };

  const handleRunAtsCheck = async () => {
    if (!token) return;
    setIsAnalyzingATS(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/resumes/ats-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ target_role: targetRoles[0] || "Software Engineer" }),
      });
      if (res.ok) {
        const data = await res.json();
        setAtsMetrics((prev) => ({
          ...prev,
          overall_score: data.ats_score || 0,
          formatting_score: data.formatting_score || 0,
          keyword_density_score: data.keyword_density_score || 0,
          action_verbs_score: data.action_verbs_score || 0,
          section_completeness_score: data.section_completeness_score || 0,
          missing_skills: data.ats_suggestions?.missing_skills || [],
          formatting_suggestions: data.ats_suggestions?.formatting_suggestions || [],
          experience_improvements: data.ats_suggestions?.experience_improvements || [],
        }));
        showToast("ATS Audit updated!");
      } else {
        showToast(await parseApiError(res, "Failed to run ATS Audit"), "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "ATS check failed.", "error");
    } finally {
      setIsAnalyzingATS(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] bg-grid-omni text-slate-100 selection:bg-rose-500 selection:text-white">
      <Toast notification={notification} />
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorBoundary>
          <ProfileTab
            userEmail={userEmail} setUserEmail={setUserEmail}
            fullName={fullName} setFullName={setFullName}
            phone={phone} setPhone={setPhone}
            portfolioUrl={portfolioUrl} setPortfolioUrl={setPortfolioUrl}
            githubUrl={githubUrl} setGithubUrl={setGithubUrl}
            otherUrl={otherUrl} setOtherUrl={setOtherUrl}
            jobDetails={jobDetails} setJobDetails={setJobDetails}
            targetRoles={targetRoles} setTargetRoles={setTargetRoles}
            countryQuery={countryQuery} setCountryQuery={setCountryQuery}
            isCountryDropdownOpen={isCountryDropdownOpen} setIsCountryDropdownOpen={setIsCountryDropdownOpen}
            selectedCountries={selectedCountries}
            handleSelectCountryFromDropdown={handleSelectCountryFromDropdown}
            handleRemoveCountry={handleRemoveCountry}
            workModePref={workModePref} setWorkModePref={setWorkModePref}
            salaryPref={salaryPref} setSalaryPref={setSalaryPref}
            experiencePref={experiencePref} setExperiencePref={setExperiencePref}
            visaSponsorshipPref={visaSponsorshipPref} setVisaSponsorshipPref={setVisaSponsorshipPref}
            selectedEmpTypes={selectedEmpTypes} toggleEmpType={toggleEmpType}
            dailyApplyLimit={dailyApplyLimit} setDailyApplyLimit={setDailyApplyLimit}
            totalTodayApplied={totalTodayApplied}
            isSavingProfile={isSavingProfile} handleSaveProfile={handleSaveProfile}
            isUploading={isUploading} agentPhase={agentPhase} agentLogs={agentLogs}
            uploadedResume={uploadedResume} handleResumeUpload={handleResumeUpload}
            extractedProfile={extractedProfile} atsMetrics={atsMetrics}
            handleRunAtsCheck={handleRunAtsCheck} isAnalyzingATS={isAnalyzingATS}
            isLoading={isProfileLoading} error={profileError} onRetry={fetchResumeProfile}
          />
        </ErrorBoundary>
      </main>
    </div>
  );
}
