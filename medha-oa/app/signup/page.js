"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signup } from "@/lib/auth";
import { UserPlus, Stethoscope } from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";

export default function SignupPage() {
  const router = useRouter();
  const { t } = useT();
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "health_worker" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (form.password.length < 4) { setError("Password should be at least 4 characters."); return; }
    setLoading(true);
    try {
      await signup(form);
      router.replace("/dashboard");
    } catch (err) {
      setError(err.message || "Could not create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "radial-gradient(circle at 20% 10%, #0c4a6e, #0f172a 70%)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8 text-white">
          <div className="mx-auto h-16 w-16 rounded-2xl glass-dark flex items-center justify-center mb-3">
            <Stethoscope size={30} />
          </div>
          <h1 className="text-2xl font-bold">{t("auth.appName")}</h1>
          <p className="text-clinical-200 text-sm mt-1">Create a health worker account</p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <UserPlus size={18} className="text-clinical-600" /> {t("auth.signupTitle")}
          </h2>
          <p className="text-sm text-slate-500 mb-5">{t("auth.signupSubtitle")}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">{t("auth.fullName")}</label>
              <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div>
              <label className="label">{t("auth.username")}</label>
              <input className="input" value={form.username} onChange={(e) => set("username", e.target.value)} required />
            </div>
            <div>
              <label className="label">{t("auth.password")}</label>
              <input className="input" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required />
            </div>
            <div>
              <label className="label">{t("auth.role")}</label>
              <select className="input" value={form.role} onChange={(e) => set("role", e.target.value)}>
                <option value="health_worker">Health Worker</option>
                <option value="doctor">Doctor / Clinician</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? t("auth.creating") : t("auth.createBtn")}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            {t("auth.haveAccount")}{" "}
            <Link href="/login" className="text-clinical-600 font-semibold hover:underline">{t("auth.signIn")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
