import type { Metadata } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { GlobalModal } from "@/components/modals/GlobalModal";
import { FloatingToolbar } from "@/components/FloatingToolbar";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-sans",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

export const metadata: Metadata = {
  title: "EventOS | Ecosystem Control",
  description: "Advanced administrative terminal for ecosystem management.",
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
      <body className={`${dmSans.variable} ${dmMono.variable} min-h-screen`}>
        <Providers>
          {children}
          <GlobalModal />
          <FloatingToolbar />
        </Providers>
      </body>
    </html>
  );
}
