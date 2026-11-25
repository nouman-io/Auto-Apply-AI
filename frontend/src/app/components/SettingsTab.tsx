import React from "react";
import { KeyIcon, LockIcon, SparklesIcon, GmailIcon, GlobeIcon } from "./Icons";

interface SettingsTabProps {
  showApiKeys: boolean;
  setShowApiKeys: (v: boolean) => void;
  llmProvider: string;
  setLlmProvider: (v: string) => void;
  llmModel: string;
  setLlmModel: (v: string) => void;
  customApiBase: string;
  setCustomApiBase: (v: string) => void;
  openaiApiKey: string;
  setOpenaiApiKey: (v: string) => void;
  googleClientId: string;
  setGoogleClientId: (v: string) => void;
  googleClientSecret: string;
  setGoogleClientSecret: (v: string) => void;
  isGmailConnected: boolean;
  gmailEmail: string;
  setShowGmailModal: (v: boolean) => void;
  greenhouseCompanies: string;
  setGreenhouseCompanies: (v: string) => void;
  serpapiApiKey: string;
  setSerpapiApiKey: (v: string) => void;
  isSavingApiSettings: boolean;
  handleSaveApiSettings: (e: React.FormEvent) => void;
}

export default function SettingsTab({
  showApiKeys, setShowApiKeys,
  llmProvider, setLlmProvider,
  llmModel, setLlmModel,
  customApiBase, setCustomApiBase,
  openaiApiKey, setOpenaiApiKey,
  googleClientId, setGoogleClientId,
  googleClientSecret, setGoogleClientSecret,
  isGmailConnected, gmailEmail, setShowGmailModal,
  greenhouseCompanies, setGreenhouseCompanies,
  serpapiApiKey, setSerpapiApiKey,
  isSavingApiSettings, handleSaveApiSettings,
}: SettingsTabProps) {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="omni-card p-8 rounded-3xl space-y-6 border border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 pb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2.5">
              <KeyIcon />
              <span>AI Vault, Gmail &amp; Job Source Settings</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Configure LLM providers, Gmail credentials (for HR email apply), and LinkedIn / Indeed / Google / Greenhouse connectors.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowApiKeys(!showApiKeys)}
            className="btn-dark-outline text-xs font-semibold px-3.5 py-1.5 rounded-xl text-slate-300 flex items-center gap-1.5"
          >
            <LockIcon />
            <span>{showApiKeys ? "Hide Keys" : "Show Keys"}</span>
          </button>
        </div>

        <form onSubmit={handleSaveApiSettings} className="space-y-6 text-xs">
          {/* AI Model Provider */}
          <div className="bg-[#12141d] border border-white/10 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                <SparklesIcon />
                <span>AI Model Provider</span>
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Provider</label>
                <select
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value)}
                  className="w-full omni-input rounded-xl px-3.5 py-2.5 text-xs"
                >
                  <option value="openai">OpenAI (GPT-4o-mini / GPT-4o)</option>
                  <option value="ollama">Ollama / LM Studio (Local Free)</option>
                  <option value="groq">Groq Cloud</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="custom">Custom OpenAI-Compatible</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Model Name</label>
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="gpt-4o-mini, llama3, gemini-1.5-flash..."
                  className="w-full omni-input rounded-xl px-3.5 py-2.5 font-mono text-xs"
                />
              </div>
            </div>

            {(llmProvider === "ollama" || llmProvider === "custom") && (
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Custom API Base URL</label>
                <input
                  type="text"
                  value={customApiBase}
                  onChange={(e) => setCustomApiBase(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="w-full omni-input rounded-xl px-3.5 py-2.5 font-mono text-xs"
                />
              </div>
            )}

            <div>
              <label className="block text-slate-300 font-semibold mb-1">API Key</label>
              <input
                type={showApiKeys ? "text" : "password"}
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="sk-..., gsk_..., AIza..."
                className="w-full omni-input rounded-xl px-3.5 py-2.5 font-mono text-xs"
              />
            </div>
          </div>

          {/* Gmail OAuth & SMTP Connection */}
          <div className="bg-[#12141d] border border-white/10 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                <GmailIcon />
                <span>Gmail Integration (for HR Email Applications)</span>
              </h4>
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded font-mono ${
                  isGmailConnected
                    ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/30"
                    : "bg-red-950/80 text-red-300 border border-red-500/30"
                }`}
              >
                {isGmailConnected ? "Connected" : "Disconnected"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Google OAuth Client ID</label>
                <input
                  type="text"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                  placeholder="123456-xxx.apps.googleusercontent.com"
                  className="w-full omni-input rounded-xl px-3.5 py-2.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Google OAuth Client Secret</label>
                <input
                  type={showApiKeys ? "text" : "password"}
                  value={googleClientSecret}
                  onChange={(e) => setGoogleClientSecret(e.target.value)}
                  placeholder="GOCSPX-..."
                  className="w-full omni-input rounded-xl px-3.5 py-2.5 font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-white/5">
              <div>
                <span className="text-xs text-slate-300">
                  Active Gmail: <strong>{gmailEmail || "Not Connected"}</strong>
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  When an HR email is found on a job, Auto-Apply sends directly from this Gmail account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGmailModal(true)}
                className="btn-red-glow text-white font-bold px-4 py-2 rounded-xl text-xs whitespace-nowrap"
              >
                {isGmailConnected ? "Manage Gmail" : "Connect Gmail"}
              </button>
            </div>
          </div>

          {/* 4 Job Sources: LinkedIn, Indeed, Google, Greenhouse */}
          <div className="bg-[#12141d] border border-white/10 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                <GlobeIcon />
                <span>Connected Job Sources (LinkedIn, Indeed, Google, Greenhouse)</span>
              </h4>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {["LinkedIn", "Indeed", "Google", "Greenhouse"].map((src) => (
                <div
                  key={src}
                  className="bg-slate-950 border border-emerald-500/30 rounded-xl px-3 py-2 text-center text-emerald-300 font-semibold"
                >
                  ✓ {src}
                </div>
              ))}
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Tracked Greenhouse Company Boards (Comma separated board slugs)
              </label>
              <input
                type="text"
                value={greenhouseCompanies}
                onChange={(e) => setGreenhouseCompanies(e.target.value)}
                placeholder="vercel, openai, cloudflare, anthropic, stripe, figma"
                className="w-full omni-input rounded-xl px-3.5 py-2.5 font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Optional SerpAPI Key (Boosts Google Jobs coverage)
              </label>
              <input
                type={showApiKeys ? "text" : "password"}
                value={serpapiApiKey}
                onChange={(e) => setSerpapiApiKey(e.target.value)}
                placeholder="Optional SerpAPI key (leave blank for built-in Google Careers fallback)"
                className="w-full omni-input rounded-xl px-3.5 py-2.5 font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <button
              type="submit"
              disabled={isSavingApiSettings}
              className="btn-red-glow text-white font-bold px-6 py-3 rounded-xl text-xs"
            >
              {isSavingApiSettings ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
