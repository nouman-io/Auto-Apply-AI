"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import CommandPalette from "./CommandPalette";
import { apiJson } from "../lib/api";
import { Icon } from "../lib/brand-logos";
import { DAILY_APPLY_MAX } from "../constants";
import { AppNotification } from "../types";

interface AppShellProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  toast?: { message: string; type: "success" | "error" } | null;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/opportunities", label: "Jobs Portal", icon: <Icon.Briefcase /> },
  { href: "/history", label: "Applied Jobs", icon: <Icon.CheckList /> },
  { href: "/profile", label: "Resume & Focus", icon: <Icon.User /> },
  { href: "/plugins", label: "Plugins", icon: <Icon.Plug /> },
];

export default function AppShell({ title, subtitle, actions, toast, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [quota, setQuota] = useState({ today_applied: 0, daily_max: DAILY_APPLY_MAX });
  const [connectorsCount, setConnectorsCount] = useState(0);
  const [gmailReady, setGmailReady] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  const loadShellState = useCallback(async () => {
    const [q, n, s] = await Promise.all([
      apiJson<{ today_applied: number; daily_max: number }>("/api/v1/auto-apply/quota").catch(() => null),
      apiJson<{ unread_count: number; items: AppNotification[] }>("/api/v1/notifications?limit=15").catch(() => null),
      apiJson<{ enabled_connectors?: string[]; is_gmail_connected?: boolean }>("/api/v1/users/settings").catch(() => null),
    ]);
    if (q) setQuota(q);
    if (n) {
      setNotifications(n.items || []);
      setUnreadCount(n.unread_count || 0);
    }
    if (s) {
      if (s.enabled_connectors) setConnectorsCount(s.enabled_connectors.length);
      setGmailReady(Boolean(s.is_gmail_connected));
    }
  }, []);

  useEffect(() => {
    loadShellState();
    const timer = setInterval(loadShellState, 6000);
    const onRefresh = () => loadShellState();
    window.addEventListener("autoapply:refresh-shell", onRefresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("autoapply:refresh-shell", onRefresh);
    };
  }, [loadShellState]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const markAllRead = async () => {
    await apiJson("/api/v1/notifications/read-all", { method: "POST" }).catch(() => null);
    setUnreadCount(0);
    setNotifications((prev) => prev.map((x) => ({ ...x, is_read: true })));
  };

  const openNotification = (item: AppNotification) => {
    if (!item.is_read) {
      apiJson(`/api/v1/notifications/${item.id}/read`, { method: "POST" }).catch(() => null);
    }
    setNotifOpen(false);
    router.push(item.application_id ? `/history?highlight=${item.application_id}` : "/history");
  };

  const pct = quota.daily_max > 0 ? Math.min(100, Math.round((quota.today_applied / quota.daily_max) * 100)) : 0;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#090a0d] text-zinc-100">
      <aside className="w-full md:w-58 shrink-0 border-b md:border-b-0 md:border-r border-white/[0.07] bg-[#0e1015] flex flex-col justify-between">
        <div>
          <div className="h-14 px-4 flex items-center gap-2.5 border-b border-white/[0.07]">
            <img src="/logo.png" alt="AutoApply" className="w-6 h-6 rounded-md object-contain" />
            <span className="text-[13px] font-semibold tracking-tight text-white">AutoApply</span>
            <span className="ml-auto text-[10px] font-mono text-zinc-500 border border-white/10 rounded px-1.5 py-0.5">
              Studio
            </span>
          </div>

          <div className="hidden md:block px-2.5 pt-2.5">
            <button
              onClick={() => setCmdOpen(true)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] text-xs text-zinc-400 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Icon.Search />
                <span>Quick jump</span>
              </span>
              <span className="kbd">⌘K</span>
            </button>
          </div>

          <nav className="p-2.5 flex md:flex-col gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
                    active ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.href === "/plugins" && (
                    <span className="ml-auto text-[11px] font-mono text-zinc-500 tabular-nums">{connectorsCount}/4</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="hidden md:block p-3.5 border-t border-white/[0.07] space-y-3 text-xs">
          <Link
            href="/plugins?open=gmail"
            onClick={() => window.dispatchEvent(new CustomEvent("autoapply:open-plugin", { detail: "gmail" }))}
            className="flex items-center justify-between text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            <span>Gmail delivery</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${gmailReady ? "bg-emerald-400" : "bg-zinc-500"}`} />
              <span className={gmailReady ? "text-emerald-400" : "text-zinc-500"}>{gmailReady ? "Ready" : "Off"}</span>
            </span>
          </Link>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">Daily apply cap</span>
              <span className="font-mono text-zinc-200 tabular-nums">
                {quota.today_applied}/{quota.daily_max}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 px-5 border-b border-white/[0.07] bg-[#090a0d]/90 backdrop-blur sticky top-0 z-30 flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-baseline gap-3">
            <h1 className="text-[13px] font-semibold text-white truncate">{title}</h1>
            {subtitle && <span className="text-xs text-zinc-500 truncate hidden lg:inline">{subtitle}</span>}
          </div>

          <div className="flex items-center gap-2">
            {actions}

            <div className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative h-8 w-8 rounded-lg border border-white/10 bg-[#12141b] hover:bg-[#171a23] flex items-center justify-center text-zinc-300 transition-colors"
                aria-label="Notifications"
              >
                <Icon.Bell />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-emerald-500 text-[#090a0d] text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-white/10 bg-[#12141b] shadow-2xl z-50 overflow-hidden">
                  <div className="px-3.5 py-2.5 border-b border-white/[0.07] flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-[11px] text-zinc-400 hover:text-white">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.06]">
                    {notifications.length === 0 ? (
                      <p className="p-5 text-center text-xs text-zinc-500">No application alerts yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => openNotification(n)}
                          className={`w-full text-left px-3.5 py-2.5 hover:bg-white/[0.04] space-y-0.5 ${n.is_read ? "opacity-60" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-zinc-100 truncate">{n.title}</span>
                            <span className="text-[10px] font-mono text-zinc-400 uppercase">{n.apply_method || n.type}</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 line-clamp-2">{n.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg border text-xs font-medium shadow-xl ${
            toast.type === "error"
              ? "bg-red-950/95 border-red-500/40 text-red-200"
              : "bg-[#171a23] border-white/15 text-zinc-100"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
