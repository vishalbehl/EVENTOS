import "./globals.css";
import { DM_Sans } from "next/font/google";
import Providers from "@/components/Providers";
import { Toaster } from "sonner";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-dm-sans"
});

export const metadata = {
  title: "Speaker Portal | Event OS",
  description: "Secure file management for conference speakers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="antialiased selection:bg-indigo-500/30">
        <Providers>
          <div className="min-h-screen bg-[#080912] text-[#E8EAFF] relative overflow-x-hidden">
            {/* Ambient Background Glows */}
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/5 blur-[120px] rounded-full pointer-events-none" />

            <main className="relative z-10">
              {children}
            </main>

            <Toaster position="top-center" expand={true} richColors closeButton />
          </div>
        </Providers>
      </body>
    </html>
  );
}
