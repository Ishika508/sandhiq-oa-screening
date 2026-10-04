"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import AppShell, { PageHeader } from "@/components/AppShell";
import { listPatients, listAllScreenings } from "@/lib/db";
import { Users, ClipboardList, TrendingUp, Plus, ArrowRight, Clock, AlertOctagon } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, CartesianGrid } from "recharts";
import { useT } from "@/lib/i18n/LanguageContext";

const BAND_COLORS = { Low: "#10b981", Moderate: "#f59e0b", High: "#f43f5e", Unscored: "#94a3b8" };

export default function DashboardPage() {
  const { t } = useT();
  const [patients, setPatients] = useState([]);
  const [screenings, setScreenings] = useState([]);

  useEffect(() => {
    listPatients().then(setPatients);
    listAllScreenings().then(setScreenings);
  }, []);

  const completed = screenings.filter((s) => s.status === "completed");
  const inProgress = screenings.filter((s) => s.status === "in_progress");
  const bandCounts = completed.reduce((acc, s) => {
    const band = s.resultBand || "Unscored";
    acc[band] = (acc[band] || 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(bandCounts).map(([name, value]) => ({ name, value }));
  const dailyData = Array.from({ length: 14 }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() - (13 - index));
    const key = day.toISOString().slice(0, 10);
    return { day: key.slice(5), count: screenings.filter((screening) => new Date(screening.createdAt).toISOString().slice(0, 10) === key).length };
  });

  return (
    <AuthGuard>
      <AppShell>
        <div className="p-5 sm:p-8 max-w-[1600px] mx-auto">
          <PageHeader
            icon={TrendingUp} title={t("dashboard.title")} subtitle={t("dashboard.subtitle")}
            action={<Link href="/patients/new" className="btn-primary"><Plus size={16} /> {t("dashboard.newPatient")}</Link>}
          />

          <div className="card mb-8 grid grid-cols-2 gap-4 border-clinical-200/60 bg-white/45 lg:grid-cols-4">
            <StatCard icon={Users} label={t("dashboard.patients")} value={patients.length} />
            <StatCard icon={ClipboardList} label={t("dashboard.completed")} value={completed.length} />
            <StatCard icon={Clock} label={t("dashboard.inProgress")} value={inProgress.length} />
            <StatCard icon={AlertOctagon} label={t("dashboard.highRisk")} value={bandCounts.High || 0} accent="rose" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <ClipboardList size={18} className="text-clinical-600" /> {t("dashboard.recent")}
              </h3>
              {screenings.length === 0 ? (
                <EmptyState text={t("dashboard.noScreenings")} />
              ) : (
                <div className="divide-y divide-slate-200/60">
                  {screenings.slice(0, 8).map((s) => <ScreeningRow key={s.id} screening={s} patients={patients} />)}
                </div>
              )}
            </div>

            <div className="card">
              <h3 className="font-semibold text-slate-800 mb-4">{t("dashboard.riskDistribution")}</h3>
              {pieData.length === 0 ? (
                <p className="text-sm text-slate-400">{t("dashboard.noCompleted")}</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} labelLine={false} label={<CenterLabel total={completed.length} />}>
                        {pieData.map((entry, i) => <Cell key={i} fill={BAND_COLORS[entry.name] || "#94a3b8"} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="flex flex-wrap gap-3 mt-2 justify-center text-xs">
                {pieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: BAND_COLORS[d.name] }} /> {d.name} ({d.value})
                  </div>
                ))}
              </div>
            </div>
            <div className="card lg:col-span-3">
              <h3 className="font-semibold text-slate-800 mb-4">{t("dashboard.last14")}</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <defs><linearGradient id="screeningsFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#14a8b8" stopOpacity={0.3} /><stop offset="100%" stopColor="#14a8b8" stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dbe7eb" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Area type="monotone" dataKey="count" stroke="#0c879c" strokeWidth={2} fill="url(#screeningsFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </AuthGuard>
  );
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="card !p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className={`text-2xl font-bold mt-1 ${accent === "rose" ? "text-rose-600" : "text-slate-800"}`}>{value}</div>
        </div>
        <div className="icon-tile !h-10 !w-10"><Icon size={18} /></div>
      </div>
    </div>
  );
}

function CenterLabel({ viewBox, total }) {
  const { cx, cy } = viewBox || {};
  return <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="#334155"><tspan x={cx} dy="-3" fontSize="24" fontWeight="700">{total}</tspan><tspan x={cx} dy="18" fontSize="10">total</tspan></text>;
}

function ScreeningRow({ screening, patients }) {
  const patient = patients.find((p) => p.id === screening.patientId);
  return (
    <Link href={`/screening/${screening.id}`} className={`flex items-center justify-between border-l-4 py-3 pl-3 group ${screening.resultBand === "High" ? "border-rose-400" : screening.resultBand === "Moderate" ? "border-amber-400" : "border-emerald-400"}`}>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-clinical-100 text-clinical-700 flex items-center justify-center text-sm font-semibold">
          {patient?.name?.[0]?.toUpperCase() || "?"}
        </div>
        <div>
          <div className="text-sm font-medium text-slate-800">{patient?.name || "Unknown patient"}</div>
          <div className="text-xs text-slate-400">{new Date(screening.createdAt).toLocaleString()}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {screening.status === "completed" ? (
          <span className={`badge-${(screening.resultBand || "neutral").toLowerCase()}`}>{screening.resultBand || "Scored"}</span>
        ) : (
          <span className="badge-neutral">In progress</span>
        )}
        <ArrowRight size={16} className="text-slate-300 group-hover:text-clinical-600" />
      </div>
    </Link>
  );
}

function EmptyState({ text }) {
  return (
    <div className="text-center py-10">
      <ClipboardList size={32} className="mx-auto text-slate-300 mb-2" />
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}
