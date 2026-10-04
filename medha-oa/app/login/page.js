"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/auth";
import { countUsers } from "@/lib/db";
import { Stethoscope, Eye, EyeOff, LogIn } from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";
import { LANGUAGES } from "@/lib/i18n/dictionary";

export default function LoginPage() {
  const router = useRouter();
  const { t, lang, setLang } = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [noUsersYet, setNoUsersYet] = useState(false);

  useEffect(() => { countUsers().then((n) => setNoUsersYet(n === 0)); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ username, password });
      router.replace("/dashboard");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "radial-gradient(circle at 20% 10%, #0c4a6e, #0f172a 70%)" }}>
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-4">
          <select value={lang} onChange={(e) => setLang(e.target.value)} className="bg-white/10 text-white text-xs rounded-lg px-2.5 py-1.5 border border-white/20">
            {LANGUAGES.map((l) => <option key={l.code} value={l.code} className="text-slate-800">{l.native}</option>)}
          </select>
        </div>

        <div className="text-center mb-8 text-white">
          <div className="mx-auto h-16 w-16 rounded-2xl glass-dark flex items-center justify-center mb-3">
            <Stethoscope size={30} />
          </div>
          <h1 className="text-2xl font-bold">{t("auth.appName")}</h1>
          <p className="text-clinical-200 text-sm mt-1">{t("auth.tagline")}</p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <LogIn size={18} className="text-clinical-600" /> {t("auth.loginTitle")}
          </h2>
          <p className="text-sm text-slate-500 mb-5">{t("auth.loginSubtitle")}</p>

          {noUsersYet && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3.5 py-2.5">
              No account exists on this device yet.{" "}
              <Link href="/signup" className="font-semibold underline">{t("auth.createAccount")}</Link> to get started.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">{t("auth.username")}</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. asha.worker" required autoFocus />
            </div>
            <div>
              <label className="label">{t("auth.password")}</label>
              <div className="relative">
                <input className="input pr-10" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? t("auth.signingIn") : t("auth.signIn")}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            {t("auth.noAccount")}{" "}
            <Link href="/signup" className="text-clinical-600 font-semibold hover:underline">{t("auth.createAccount")}</Link>
          </p>
        </div>

        <p className="text-center text-xs text-clinical-300 mt-6">Works fully offline · Data stored securely on this device</p>
      </div>
    </div>
  );
}
