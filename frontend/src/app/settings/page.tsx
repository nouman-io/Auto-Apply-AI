"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE, parseApiError } from "../lib/api";
import Navbar from "../components/Navbar";
import SettingsTab from "../components/SettingsTab";
import ErrorBoundary from "../components/ErrorBoundary";
import Toast from "../components/Toast";
import GmailModal from "../components/GmailModal";

export default function SettingsPage() {
  const { token, isAuthenticated } = useAuth();

  const [showApiKeys, setShowApiKeys] = useState(false);
  const [llmProvider, setLlmProvider] = useState("openai");
  const [llmModel, setLlmModel] = useState("gpt-4o-mini");
  const [customApiBase, setCustomApiBase] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [greenhouseCompanies, setGreenhouseCompanies] = useState(
    "vercel, openai, cloudflare, anthropic, stripe, figma"
  );
  const [serpapiApiKey, setSerpapiApiKey] = useState("");
  const [isSavingApiSettings, setIsSavingApiSettings] = useState(false);

  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState("");
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [smtpPassword, setSmtpPassword] = useState("");

  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const checkGmailStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/gmail/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIsGmailConnected(data.is_connected);
        if (data.connected_email) setGmailEmail(data.connected_email);
      }
    } catch (err) {
      console.error("Gmail connection check error:", err);
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
        if (data.llm_provider) setLlmProvider(data.llm_provider);
        if (data.llm_model) setLlmModel(data.llm_model);
        if (data.custom_api_base !== undefined) setCustomApiBase(data.custom_api_base || "");
        if (data.openai_api_key) setOpenaiApiKey(data.openai_api_key);
        if (data.google_client_id) setGoogleClientId(data.google_client_id);
        if (data.google_client_secret) setGoogleClientSecret(data.google_client_secret);
        if (data.greenhouse_companies?.length) {
          setGreenhouseCompanies(data.greenhouse_companies.join(", "));
        }
        if (data.serpapi_api_key) setSerpapiApiKey(data.serpapi_api_key);
      }
    } catch (err) {
      console.error("Failed to fetch user settings:", err);
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchUserSettings();
    checkGmailStatus();
  }, [isAuthenticated, token, fetchUserSettings, checkGmailStatus]);

  const handleSaveApiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingApiSettings(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          llm_provider: llmProvider,
          llm_model: llmModel,
          custom_api_base: customApiBase,
          openai_api_key: openaiApiKey,
          google_client_id: googleClientId,
          google_client_secret: googleClientSecret,
          greenhouse_companies: greenhouseCompanies
            .split(",")
            .map((c) => c.trim().toLowerCase())
            .filter(Boolean),
          serpapi_api_key: serpapiApiKey,
        }),
      });
      if (res.ok) {
        showToast("Settings saved successfully!");
      } else {
        showToast(await parseApiError(res, "Failed to save settings"), "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to save settings.", "error");
    } finally {
      setIsSavingApiSettings(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] bg-grid-omni text-slate-100 selection:bg-rose-500 selection:text-white">
      <Toast notification={notification} />
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorBoundary>
          <SettingsTab
            showApiKeys={showApiKeys} setShowApiKeys={setShowApiKeys}
            llmProvider={llmProvider} setLlmProvider={setLlmProvider}
            llmModel={llmModel} setLlmModel={setLlmModel}
            customApiBase={customApiBase} setCustomApiBase={setCustomApiBase}
            openaiApiKey={openaiApiKey} setOpenaiApiKey={setOpenaiApiKey}
            googleClientId={googleClientId} setGoogleClientId={setGoogleClientId}
            googleClientSecret={googleClientSecret} setGoogleClientSecret={setGoogleClientSecret}
            isGmailConnected={isGmailConnected} gmailEmail={gmailEmail} setShowGmailModal={setShowGmailModal}
            greenhouseCompanies={greenhouseCompanies} setGreenhouseCompanies={setGreenhouseCompanies}
            serpapiApiKey={serpapiApiKey} setSerpapiApiKey={setSerpapiApiKey}
            isSavingApiSettings={isSavingApiSettings} handleSaveApiSettings={handleSaveApiSettings}
          />
        </ErrorBoundary>
      </main>

      {showGmailModal && (
        <GmailModal
          API_BASE={API_BASE}
          token={token}
          gmailEmail={gmailEmail}
          setGmailEmail={setGmailEmail}
          showGmailModal={showGmailModal}
          setShowGmailModal={setShowGmailModal}
          smtpPassword={smtpPassword}
          setSmtpPassword={setSmtpPassword}
          setIsGmailConnected={setIsGmailConnected}
          showToast={showToast}
          googleClientId={googleClientId}
          setGoogleClientId={setGoogleClientId}
          googleClientSecret={googleClientSecret}
          setGoogleClientSecret={setGoogleClientSecret}
          isGmailConnected={isGmailConnected}
        />
      )}
    </div>
  );
}
