import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { GlobalModal } from "@/components/organizer/modals/GlobalModal";
import { FloatingToolbar } from "@/components/organizer/FloatingToolbar";
import { ImpersonationBanner } from "@/components/organizer/ImpersonationBanner";

export const metadata: Metadata = {
  title: "EventOS | Organiser Console",
  description: "Comprehensive management terminal for event organisers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var themes = ['void-indigo','obsidian-rose','carbon-teal','amber-noir','slate-aurora','forest-ink','copper-oxide','plasma-violet','light'];
                  var saved = localStorage.getItem('eventos-theme');
                  var theme = themes.indexOf(saved) >= 0 ? saved : 'void-indigo';
                  document.documentElement.setAttribute('data-theme', theme);
                  if (theme !== 'light') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen">
        <Providers>
          <ImpersonationBanner />
          {children}
          <GlobalModal />
          <FloatingToolbar />
        </Providers>
      </body>
    </html>
  );
}
