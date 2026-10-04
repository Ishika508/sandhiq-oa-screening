"use client";

import { wipeAllData } from "@/lib/db";
import AuthGuard from "@/components/AuthGuard";
import AppShell, { PageHeader } from "@/components/AppShell";
import { Settings, Globe, Trash2, Info, Check } from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";
import { LANGUAGES } from "@/lib/i18n/dictionary";

export default function SettingsPage() {
  const { t, lang, setLang } = useT();

  async function handleWipe() {
    if (!confirm("This deletes ALL patients, screenings, and accounts on this device. Continue?")) return;
    await wipeAllData();
    window.location.href = "/login";
  }

  return (
    <AuthGuard>
      <AppShell>
        <div className="p-5 sm:p-8 max-w-2xl mx-auto">
          <PageHeader icon={Settings} title={t("settings.title")} subtitle={t("settings.subtitle")} />

          <div className="card mb-5">
            <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
              <Globe size={18} className="text-clinical-600" /> {t("settings.language")}
            </h3>
            <p className="text-sm text-slate-500 mb-4">{t("settings.languageNote")}</p>
            <div className="grid grid-cols-2 gap-3">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors flex items-center justify-between ${
                    lang === l.code ? "border-clinical-400 bg-clinical-50/70" : "border-slate-200/70 bg-white/40 hover:bg-white/70"
                  }`}
                >
                  <div>
                    <div className="font-semibold text-sm text-slate-800">{l.native}</div>
                    <div className="text-xs text-slate-400">{l.label}</div>
                  </div>
                  {lang === l.code && <Check size={16} className="text-clinical-600" />}
                </button>
              ))}
            </div>
          </div>

          <div className="card mb-5">
            <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
              <Info size={18} className="text-clinical-600" /> {t("settings.about")}
            </h3>
            <p className="text-sm text-slate-500">{t("settings.aboutText")}</p>
          </div>

          <div className="card border-rose-200">
            <h3 className="font-semibold text-rose-700 mb-1 flex items-center gap-2">
              <Trash2 size={18} /> {t("settings.danger")}
            </h3>
            <p className="text-sm text-slate-500 mb-4">{t("settings.dangerText")}</p>
            <button className="btn-danger" onClick={handleWipe}>{t("settings.wipe")}</button>
          </div>
        </div>
      </AppShell>
    </AuthGuard>
  );
}
