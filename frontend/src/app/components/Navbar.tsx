"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../lib/api";
import { AppNotification } from "../types";
import GmailModal from "./GmailModal";
import Toast from "./Toast";
import { DashboardIcon, GmailIcon, UserIcon, KeyIcon, BellIcon } from "./Icons";

export default function Navbar() {
  const { user, token, isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Gmail status state
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState("");
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [smtpPassword, setSmtpPassword] = useState("");

  // Real-time post-apply notifications state
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const checkGmailStatus = useCallback(async () => {
    if (!isAuthenticated || !token) return;
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
  }, [isAuthenticated, token]);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || !token) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/notifications?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.items || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (err) {
      console.error("Notifications fetch error:", err);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    checkGmailStatus();
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 5000);
    return () => clearInterval(timer);
  }, [checkGmailStatus, fetchNotifications]);

  useEffect(() => {
    if (!showGmailModal) {
      checkGmailStatus();
    }
  }, [showGmailModal, checkGmailStatus]);

  const handleMarkAllRead = async () => {
    if (!token) return;
    try {
      await fetch(`${API_BASE}/api/v1/notifications/read-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error("Failed to mark notifications read:", err);
    }
  };

  const handleNotificationClick = async (item: AppNotification) => {
    if (token && !item.is_read) {
      fetch(`${API_BASE}/api/v1/notifications/${item.id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setIsNotifOpen(false);
    router.push(item.application_id ? `/history?highlight=${item.application_id}` : "/history");
  };

  const navLinks = [
    { href: "/opportunities", label: "Jobs Portal", icon: <DashboardIcon /> },
    { href: "/history", label: "Applied Jobs", icon: <GmailIcon /> },
    { href: "/profile", label: "Resume & Job Details", icon: <UserIcon /> },
    { href: "/settings", label: "API & Sources", icon: <KeyIcon /> },
  ];

  return (
    <>
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/opportunities" className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-gradient-to-br from-rose-500 to-red-600 rounded-xl flex items-center justify-center font-black text-xl shadow-[0_0_20px_rgba(244,63,94,0.4)] text-white group-hover:scale-105 transition-all">
                AI
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight text-white flex items-center gap-2">
                  <span>AutoApply</span>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-red-500 font-black">AI</span>
                </h1>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">LinkedIn • Indeed • Google • Greenhouse</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden md:flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span><strong className="text-slate-200">{user.email}</strong></span>
              </div>
            )}

            {/* Post-Apply Notifications Bell */}
            <div className="relative">
              <button
                onClick={() => setIsNotifOpen((prev) => !prev)}
                className="relative bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
                title="Application Notifications"
              >
                <BellIcon />
                <span className="hidden sm:inline">Alerts</span>
                {unreadCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full leading-none">
                    {unreadCount}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#12141d] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <span className="text-xs font-bold text-slate-100">Application Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No notifications yet. Apply to jobs to get real-time alerts!
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors space-y-1 ${
                            n.is_read ? "opacity-70" : "bg-rose-950/15"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-100 truncate">{n.title}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${
                              n.apply_method === "playwright"
                                ? "bg-indigo-950 text-indigo-300 border border-indigo-500/30"
                                : "bg-rose-950 text-rose-300 border border-rose-500/30"
                            }`}>
                              {n.apply_method || n.type}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-snug">{n.message}</p>
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>{new Date(n.created_at).toLocaleString()}</span>
                            <span className="text-rose-400 font-semibold">Check Applied Job →</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowGmailModal(true)}
              className={`text-xs px-3.5 py-2 rounded-xl font-semibold flex items-center gap-2 transition-all border ${
                isGmailConnected
                  ? "bg-rose-950/80 text-rose-300 border-rose-500/30 hover:border-rose-400"
                  : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
              }`}
            >
              <GmailIcon />
              <span className="hidden sm:inline">{isGmailConnected ? `Gmail (${gmailEmail})` : "Connect Gmail"}</span>
              <span className={`w-2 h-2 rounded-full ${isGmailConnected ? "bg-emerald-400" : "bg-amber-400"}`}></span>
            </button>

            <button
              onClick={logout}
              className="text-xs bg-slate-900/80 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 px-3.5 py-2 rounded-xl font-semibold transition-all"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Navigation Link Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 overflow-x-auto no-scrollbar pt-2 border-t border-slate-800/40">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`pb-3.5 px-6 font-semibold text-sm border-b-2 whitespace-nowrap transition-all flex items-center gap-2.5 rounded-t-xl ${
                  isActive
                    ? "border-rose-400 text-rose-300 bg-rose-950/20 shadow-[0_4px_20px_-4px_rgba(244,63,94,0.3)]"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                }`}
              >
                {link.icon}
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      </header>

      <Toast notification={notification} />

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
          isGmailConnected={isGmailConnected}
        />
      )}
    </>
  );
}
