"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE, parseApiError } from "../lib/api";
import { DAILY_APPLY_MAX } from "../constants";
import Navbar from "../components/Navbar";
import JobsTab from "../components/JobsTab";
import ErrorBoundary from "../components/ErrorBoundary";
import Toast from "../components/Toast";
import { Job } from "../types";
import EmailReviewModal from "../components/EmailReviewModal";
import AutoApplyModal from "../components/AutoApplyModal";
import AutoApplyProgress from "../components/AutoApplyProgress";
import JobDetailsModal from "../components/JobDetailsModal";

export default function OpportunitiesPage() {
  const { token, isAuthenticated } = useAuth();

  const [dailyJobs, setDailyJobs] = useState<Job[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>("All");
  const [sourceStats, setSourceStats] = useState<Record<string, any> | null>(null);
  const [todayApplied, setTodayApplied] = useState(0);
  const [dailyMax, setDailyMax] = useState(DAILY_APPLY_MAX);

  const [isJobsLoading, setIsJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [isTriggeringSearch, setIsTriggeringSearch] = useState(false);
  const [isApplyingId, setIsApplyingId] = useState<number | null>(null);

  // Email Review Modal State (when HR email is found)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [emailPreview, setEmailPreview] = useState<any>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [pendingJob, setPendingJob] = useState<Job | null>(null);

  // Job Details Modal State
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isJobDetailsOpen, setIsJobDetailsOpen] = useState(false);
  const [isApplyingFromDetails, setIsApplyingFromDetails] = useState(false);

  // Auto-Apply Batch State (0 -> 15 daily max)
  const [isAutoApplyModalOpen, setIsAutoApplyModalOpen] = useState(false);
  const [isStartingAutoApply, setIsStartingAutoApply] = useState(false);
  const [autoApplyStatus, setAutoApplyStatus] = useState<any>(null);
  const [isStoppingAutoApply, setIsStoppingAutoApply] = useState(false);
  const [isDismissingAutoApply, setIsDismissingAutoApply] = useState(false);

  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const fetchQuota = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/auto-apply/quota`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTodayApplied(data.today_applied || 0);
        setDailyMax(data.daily_max || DAILY_APPLY_MAX);
      }
    } catch (err) {
      console.error("Failed to fetch daily quota:", err);
    }
  }, [token]);

  const fetchOpportunities = useCallback(async () => {
    if (!token) return;
    setIsJobsLoading(true);
    setJobsError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/search/opportunities?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res, "Failed to load opportunities"));
      }
      const data = await res.json();
      setDailyJobs(data.items || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load job opportunities";
      setJobsError(msg);
      showToast(msg, "error");
    } finally {
      setIsJobsLoading(false);
    }
  }, [token]);

  const fetchAutoApplyStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/auto-apply/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAutoApplyStatus(data);
        if (data.status === "completed" || data.status === "stopped") {
          fetchQuota();
          fetchOpportunities();
        }
      }
    } catch (err) {
      console.error("Failed to fetch auto-apply status:", err);
    }
  }, [token, fetchQuota, fetchOpportunities]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchQuota();
    fetchOpportunities();
    fetchAutoApplyStatus();
  }, [isAuthenticated, token, fetchQuota, fetchOpportunities, fetchAutoApplyStatus]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    if (autoApplyStatus?.status !== "running") return;
    const interval = setInterval(() => {
      fetchAutoApplyStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated, token, autoApplyStatus?.status, fetchAutoApplyStatus]);

  const handleTriggerSearchAgent = async () => {
    setIsTriggeringSearch(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/search/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setSourceStats(data.source_status || null);
        showToast(data.message || "Job scan completed!");
        fetchOpportunities();
      } else {
        showToast(await parseApiError(res, "Job search failed"), "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Job search failed.", "error");
    } finally {
      setIsTriggeringSearch(false);
    }
  };

  // Single job apply: Email preview if HR email found & Gmail connected, else Playwright directly
  const handleAutoApply = async (job: Job) => {
    setIsApplyingId(job.id);
    try {
      if (job.company_email) {
        const previewRes = await fetch(`${API_BASE}/api/v1/auto-apply/preview`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ job_id: job.id }),
        });
        if (previewRes.ok) {
          const data = await previewRes.json();
          if (data.success && data.preview?.apply_method === "email") {
            setPendingJob(job);
            setEmailPreview(data.preview);
            setIsReviewModalOpen(true);
            setIsJobDetailsOpen(false);
            return;
          }
        }
      }

      // Web-based (or Gmail not connected): execute Playwright route immediately
      const res = await fetch(`${API_BASE}/api/v1/auto-apply/apply-one`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ job_id: job.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast(data.message || `Applied to ${job.company}!`);
        setIsJobDetailsOpen(false);
        fetchQuota();
        fetchOpportunities();
      } else {
        showToast(data.detail || data.error || data.message || "Application did not complete.", "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Apply request failed.", "error");
    } finally {
      setIsApplyingId(null);
      setIsApplyingFromDetails(false);
    }
  };

  const handleApplyFromDetails = async (job: Job) => {
    setIsApplyingFromDetails(true);
    await handleAutoApply(job);
  };

  const handleViewJobDetails = (job: Job) => {
    setSelectedJob(job);
    setIsJobDetailsOpen(true);
  };

  const handleConfirmSendEmail = async () => {
    if (!pendingJob) return;
    setIsSendingEmail(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auto-apply/apply-one`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ job_id: pendingJob.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast(data.message || `Email sent to ${pendingJob.company}!`);
        fetchQuota();
        fetchOpportunities();
      } else {
        showToast(data.detail || data.error || data.message || "Failed to send email.", "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to send email.", "error");
    } finally {
      setIsSendingEmail(false);
      setIsReviewModalOpen(false);
      setPendingJob(null);
      setEmailPreview(null);
    }
  };

  const handleStartAutoApply = async (applyCount: number) => {
    setIsStartingAutoApply(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auto-apply/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ apply_count: applyCount }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message || "Auto-apply started!");
        setIsAutoApplyModalOpen(false);
        fetchAutoApplyStatus();
      } else {
        showToast(await parseApiError(res, "Failed to start auto-apply"), "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to start auto-apply.", "error");
    } finally {
      setIsStartingAutoApply(false);
    }
  };

  const handleStopAutoApply = async () => {
    setIsStoppingAutoApply(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auto-apply/stop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message || "Auto-apply stopped.");
        fetchAutoApplyStatus();
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to stop auto-apply.", "error");
    } finally {
      setIsStoppingAutoApply(false);
    }
  };

  const handleDismissAutoApply = async () => {
    setIsDismissingAutoApply(true);
    try {
      await fetch(`${API_BASE}/api/v1/auto-apply/dismiss`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setAutoApplyStatus(null);
    } finally {
      setIsDismissingAutoApply(false);
    }
  };

  const filteredDailyJobs = dailyJobs.filter((job) => {
    if (selectedSource === "All") return true;
    return (job.source || "").toLowerCase() === selectedSource.toLowerCase();
  });

  return (
    <div className="min-h-screen bg-[#090a0f] bg-grid-omni text-slate-100 selection:bg-rose-500 selection:text-white">
      <Toast notification={notification} />
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorBoundary>
          <JobsTab
            filteredDailyJobs={filteredDailyJobs}
            selectedSource={selectedSource}
            setSelectedSource={setSelectedSource}
            sourceStats={sourceStats}
            todayApplied={todayApplied}
            dailyMax={dailyMax}
            isTriggeringSearch={isTriggeringSearch}
            handleTriggerSearchAgent={handleTriggerSearchAgent}
            isApplyingId={isApplyingId}
            handleAutoApply={handleAutoApply}
            handleAutoApplyBatch={() => setIsAutoApplyModalOpen(true)}
            isAutoApplyRunning={autoApplyStatus?.status === "running"}
            onStopAutoApply={handleStopAutoApply}
            isAutoApplyStopping={isStoppingAutoApply}
            onViewJobDetails={handleViewJobDetails}
            isLoading={isJobsLoading}
            error={jobsError}
            onRetry={fetchOpportunities}
          />
        </ErrorBoundary>
      </main>

      <EmailReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => {
          setIsReviewModalOpen(false);
          setPendingJob(null);
          setEmailPreview(null);
        }}
        onConfirm={handleConfirmSendEmail}
        preview={emailPreview}
        isSending={isSendingEmail}
      />

      <AutoApplyModal
        isOpen={isAutoApplyModalOpen}
        onClose={() => setIsAutoApplyModalOpen(false)}
        onStart={handleStartAutoApply}
        isStarting={isStartingAutoApply}
        todayApplied={todayApplied}
        dailyMax={dailyMax}
      />

      <AutoApplyProgress
        status={autoApplyStatus}
        onStop={handleStopAutoApply}
        isStopping={isStoppingAutoApply}
        onDismiss={handleDismissAutoApply}
        isDismissing={isDismissingAutoApply}
      />

      <JobDetailsModal
        job={selectedJob}
        isOpen={isJobDetailsOpen}
        onClose={() => {
          setIsJobDetailsOpen(false);
          setSelectedJob(null);
        }}
        onApply={handleApplyFromDetails}
        isApplying={isApplyingFromDetails}
      />
    </div>
  );
}
