"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import AppShell, { PageHeader } from "@/components/AppShell";
import { listPatients, searchPatients } from "@/lib/db";
import { Users, Plus, Search, ChevronRight, UserRound } from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";

export default function PatientsPage() {
  const { t } = useT();
  const [patients, setPatients] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => { listPatients().then(setPatients); }, []);
  useEffect(() => {
    const tm = setTimeout(() => { searchPatients(query).then(setPatients); }, 150);
    return () => clearTimeout(tm);
  }, [query]);

  return (
    <AuthGuard>
      <AppShell>
        <div className="p-5 sm:p-8 max-w-[1600px] mx-auto">
          <PageHeader
            icon={Users} title={t("patients.title")} subtitle={`${patients.length} registered on this device`}
            action={<Link href="/patients/new" className="btn-primary"><Plus size={16} /> {t("patients.newPatient")}</Link>}
          />

          <div className="relative mb-5">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" placeholder={t("patients.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div className="card !p-0 overflow-hidden">
            {patients.length === 0 ? (
              <div className="text-center py-14">
                <UserRound size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">{t("patients.none")}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/60">
                {patients.map((p) => (
                  <Link key={p.id} href={`/patients/${p.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-white/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-clinical-100 text-clinical-700 flex items-center justify-center font-semibold">
                        {p.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{p.name}</div>
                        <div className="text-xs text-slate-400">{p.patientCode} Â· {p.age}y Â· {p.sex} {p.village ? `Â· ${p.village}` : ""}</div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-300" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </AuthGuard>
  );
}
