"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon, BrandLogo } from "../lib/brand-logos";

interface CommandItem {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  run: () => void;
}

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (!open) return null;

  const openPlugin = (id: string) => {
    window.dispatchEvent(new CustomEvent("autoapply:open-plugin", { detail: id }));
    router.push(`/plugins?open=${id}`);
  };

  const items: CommandItem[] = [
    { id: "jobs", label: "Go to Jobs Portal", hint: "Opportunities", icon: <Icon.Briefcase />, run: () => router.push("/opportunities") },
    { id: "history", label: "Go to Applied Jobs", hint: "History & proof", icon: <Icon.CheckList />, run: () => router.push("/history") },
    { id: "profile", label: "Go to Resume & Focus", hint: "CV & projects", icon: <Icon.User />, run: () => router.push("/profile") },
    { id: "plugins", label: "Go to Plugins & Connectors", hint: "Directory", icon: <Icon.Plug />, run: () => router.push("/plugins") },
    { id: "p-linkedin", label: "Configure LinkedIn Connector", hint: "Plugin", icon: <BrandLogo id="linkedin" size={16} />, run: () => openPlugin("linkedin") },
    { id: "p-indeed", label: "Configure Indeed Connector", hint: "Plugin", icon: <BrandLogo id="indeed" size={16} />, run: () => openPlugin("indeed") },
    { id: "p-google", label: "Configure Google Jobs Connector", hint: "Plugin", icon: <BrandLogo id="google" size={16} />, run: () => openPlugin("google") },
    { id: "p-greenhouse", label: "Configure Greenhouse Connector", hint: "Plugin", icon: <BrandLogo id="greenhouse" size={16} />, run: () => openPlugin("greenhouse") },
    { id: "p-gmail", label: "Connect Gmail Delivery", hint: "Plugin", icon: <BrandLogo id="gmail" size={16} />, run: () => openPlugin("gmail") },
    { id: "p-ai", label: "Configure AI Model Provider", hint: "Plugin", icon: <BrandLogo id="ai" size={16} />, run: () => openPlugin("ai") },
  ];

  const filtered = items.filter(
    (i) => i.label.toLowerCase().includes(query.toLowerCase()) || i.hint.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[14vh] p-4" onClick={onClose}>
      <div className="panel rounded-xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.08]">
          <span className="text-zinc-500"><Icon.Search /></span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && filtered[0]) {
                filtered[0].run();
                onClose();
              }
            }}
            placeholder="Jump to workspace view or connector..."
            className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none"
          />
          <span className="kbd">ESC</span>
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5 divide-y divide-white/[0.04]">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-500">No matching commands.</p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  item.run();
                  onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs hover:bg-white/[0.05] text-left transition-colors"
              >
                <span className="flex items-center gap-2.5 text-zinc-200 font-medium">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                <span className="text-[11px] text-zinc-500">{item.hint}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
