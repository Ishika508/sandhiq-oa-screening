"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import AppShell, { PageHeader } from "@/components/AppShell";
import StepNav from "@/components/steps/StepNav";
import WomacStep from "@/components/steps/WomacStep";
import FihoaStep from "@/components/steps/FihoaStep";
import HandStep from "@/components/steps/HandStep";
import GripStep from "@/components/steps/GripStep";
import ImuStep from "@/components/steps/ImuStep";
import CvStep from "@/components/steps/CvStep";
import XrayStep from "@/components/steps/XrayStep";
import ReviewStep from "@/components/steps/ReviewStep";
import { getScreening, getPatient, saveStep, getAllSteps, updateScreening } from "@/lib/db";
import { ClipboardList, ArrowLeft, Footprints, Hand, Activity, Video, ScanLine, BarChart3 } from "lucide-react";
import { useT } from "@/lib/i18n/LanguageContext";

const STEPS = [
  { key: "womac", shortLabel: "WOMAC", icon: Footprints, component: WomacStep },
  { key: "fihoa", shortLabel: "FIHOA", icon: Hand, component: FihoaStep },
  { key: "hand", shortLabel: "Hand", icon: Hand, component: HandStep },
  { key: "grip", shortLabel: "Grip", icon: Hand, component: GripStep },
  { key: "imu", shortLabel: "IMU", icon: Activity, component: ImuStep },
  { key: "cv", shortLabel: "Camera", icon: Video, component: CvStep },
  { key: "xray", shortLabel: "X-ray", icon: ScanLine, component: XrayStep },
  { key: "review", shortLabel: "Review", icon: BarChart3, component: ReviewStep },
];

export default function ScreeningWizardPage() {
  const { id } = useParams();
  const router = useRouter();
  const [screening, setScreening] = useState(null);
  const [patient, setPatient] = useState(null);
  const [steps, setSteps] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const { t } = useT();

  useEffect(() => {
    (async () => {
      const s = await getScreening(id);
      if (!s) return;
      setScreening(s);
      const p = await getPatient(s.patientId);
      setPatient(p);
      const allSteps = await getAllSteps(id);
      setSteps(allSteps);
      const firstIncomplete = STEPS.findIndex((st) => st.key !== "review" && !allSteps[st.key]);
      setCurrentIndex(firstIncomplete === -1 ? STEPS.length - 1 : firstIncomplete);
    })();
  }, [id]);

  async function handleStepSave(stepKey, data) {
    await saveStep(id, stepKey, data);
    setSteps((s) => ({ ...s, [stepKey]: data }));
    setCurrentIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  async function handleFinalize(fusion) {
    setFinalizing(true);
    await updateScreening(id, {
      status: "completed",
      combinedScore: fusion.combinedScore,
      resultBand: fusion.band?.label,
      xrayAvailable: fusion.xrayAvailable,
    });
    router.push(`/report/${id}`);
  }

  const completed = new Set(Object.keys(steps));
  const current = STEPS[currentIndex];
  const CurrentComponent = current?.component;

  if (!screening || !patient) return null;

  return (
    <AuthGuard>
      <AppShell>
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
          <Link href={`/patients/${patient.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-clinical-600 mb-4">
            <ArrowLeft size={14} /> Back to {patient.name}
          </Link>

          <PageHeader icon={ClipboardList} title={`Screening — ${patient.name}`} subtitle={`${patient.patientCode} · ${t("steps.testOf", { n: currentIndex + 1, total: STEPS.length })} · ${Math.round((currentIndex / (STEPS.length - 1)) * 100)}%`} />

          <div className="mb-6">
            <StepNav steps={STEPS} currentIndex={currentIndex} completed={completed} onJump={setCurrentIndex} />
          </div>

          {current.key === "review" ? (
            <ReviewStep steps={steps} patient={patient} onFinalize={handleFinalize} finalizing={finalizing} />
          ) : (
            <CurrentComponent
              initialData={steps[current.key]}
              patientSex={patient.sex}
              patient={patient}
              onSave={(data) => handleStepSave(current.key, data)}
            />
          )}
        </div>
      </AppShell>
    </AuthGuard>
  );
}
