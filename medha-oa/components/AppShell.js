"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Users, LayoutDashboard, LogOut, Settings, Wifi, WifiOff, Menu, X,
  ChevronsLeft, ChevronsRight, Stethoscope, Globe, ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getSession, logout } from "@/lib/auth";
import { useT } from "@/lib/i18n/LanguageContext";
import { LANGUAGES } from "@/lib/i18n/dictionary";
import ChatWidget from "@/components/assistant/ChatWidget";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, lang, setLang } = useT();
  const [session, setSession] = useState(null);
  const [online, setOnline] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef(null);

  const NAV = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/patients", label: t("nav.patients"), icon: Users },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  useEffect(() => {
    setSession(getSession());
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const saved = localStorage.getItem("medha_oa_sidebar_collapsed");
    if (saved === "1") setCollapsed(true);
    function onClickOutside(e) {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("medha_oa_sidebar_collapsed", !c ? "1" : "0");
      return !c;
    });
  }

  const currentLangLabel = LANGUAGES.find((l) => l.code === lang)?.native || "English";

  return (
    <div className="min-h-screen flex">
      <div data-app-chrome className="lg:hidden fixed top-0 inset-x-0 z-40 glass-dark text-white flex items-center justify-between px-4 h-14">
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Stethoscope size={18} /> SANDHIQ
        </div>
        <div className="w-[22px]" />
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-72 glass-dark text-white flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2 font-semibold">
                <Stethoscope size={20} /> SANDHIQ
              </div>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>
            <SidebarNav nav={NAV} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <SidebarFooter
              online={online} session={session} t={t}
              onSignOut={() => { logout(); router.replace("/login"); }}
            />
          </div>
          <div className="flex-1 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <aside
        className={`hidden lg:flex flex-col glass-dark text-white transition-all duration-200 ${
          collapsed ? "w-[76px]" : "w-64"
        }`}
      >
        <div className={`px-5 py-6 flex items-center gap-2.5 border-b border-white/10 ${collapsed ? "justify-center px-0" : ""}`}>
          <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#0ea5e9,#14b8a6)" }}>
            <Stethoscope size={18} />
          </div>
          {!collapsed && (
            <div>
              <div className="font-bold leading-tight text-sm">SANDHIQ</div>
              <div className="text-[11px] text-slate-300">Screening Platform</div>
            </div>
          )}
        </div>

        <SidebarNav nav={NAV} pathname={pathname} collapsed={collapsed} />

        <div className="px-3 pb-2">
          <button
            onClick={toggleCollapsed}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-slate-300 hover:bg-white/10 text-xs"
          >
            {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Collapse</>}
          </button>
        </div>

        <SidebarFooter
          online={online} session={session} t={t} collapsed={collapsed}
          onSignOut={() => { logout(); router.replace("/login"); }}
        />
      </aside>

      <main className="flex-1 min-w-0 pt-14 lg:pt-0">
        <div data-app-chrome className="hidden lg:flex justify-end px-8 pt-4">
          <div className="relative" ref={langRef}>
            <button
              onClick={() => setLangOpen((o) => !o)}
              className="btn-secondary !py-2 !px-3 text-xs"
            >
              <Globe size={14} /> {currentLangLabel} <ChevronDown size={12} />
            </button>
            {langOpen && (
              <div className="absolute right-0 mt-2 w-40 card !p-1.5 z-30">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { setLang(l.code); setLangOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-900/5 ${
                      lang === l.code ? "text-clinical-700 font-semibold" : "text-slate-600"
                    }`}
                  >
                    {l.native}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {children}
      </main>
      <ChatWidget />
    </div>
  );
}

function SidebarNav({ nav, pathname, collapsed, onNavigate }) {
  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              collapsed ? "justify-center" : ""
            } ${active ? "text-white" : "text-slate-300 hover:bg-white/10"}`}
            style={active ? { background: "linear-gradient(135deg,#0d9488,#0284c7)" } : undefined}
          >
            <Icon size={18} />
            {!collapsed && label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ online, session, t, collapsed, onSignOut }) {
  return (
    <div className="px-3 py-4 border-t border-white/10 space-y-3">
      <div className={`flex items-center gap-2 px-3 text-xs text-slate-300 ${collapsed ? "justify-center px-0" : ""}`}>
        {online ? <Wifi size={14} /> : <WifiOff size={14} />}
        {!collapsed && (online ? "Online" : "Offline mode")}
      </div>
      {session && (
        <div className={`flex items-center gap-2 text-sm ${collapsed ? "justify-center" : "px-3"}`}>
          <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-teal-300 font-semibold text-xs shrink-0">
            {session.name?.[0]?.toUpperCase() || "U"}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{session.name}</div>
              <div className="truncate text-[11px] text-slate-400 capitalize">{session.role?.replace("_", " ")}</div>
            </div>
          )}
        </div>
      )}
      <button
        onClick={onSignOut}
        title={collapsed ? t("nav.signOut") : undefined}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-white/10 ${
          collapsed ? "justify-center px-0" : ""
        }`}
      >
        <LogOut size={16} /> {!collapsed && t("nav.signOut")}
      </button>
    </div>
  );
}

export function PageHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="icon-tile">
            <Icon size={22} />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
