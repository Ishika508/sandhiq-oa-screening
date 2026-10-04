import "./globals.css";
import SwRegister from "@/components/SwRegister";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";

export const metadata = {
  title: "SANDHIQ | Osteoarthritis Screening",
  description: "AI-assisted, offline-first multimodal osteoarthritis screening system",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SwRegister />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
