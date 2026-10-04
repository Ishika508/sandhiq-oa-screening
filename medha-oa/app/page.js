"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Stethoscope } from "lucide-react";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const session = getSession();
    router.replace(session ? "/dashboard" : "/login");
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "radial-gradient(circle at 20% 10%, #0c4a6e, #0f172a 70%)" }}>
      <div className="text-white text-lg flex items-center gap-2">
        <Stethoscope size={22} /> Loading SANDHIQ…
      </div>
    </div>
  );
}
