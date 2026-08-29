import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "sonner";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "EVENTOS | Venue Server Operations Console",
  description: "Central Local Edge Node & Venue Operations Management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="eventos-theme-bootstrap" strategy="beforeInteractive">
          {`
            (function() {
              try {
                var saved = localStorage.getItem('eventos-theme') || localStorage.getItem('theme');
                var theme = (saved === 'light') ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', theme);
                if (theme !== 'light') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (e) {}
            })();
          `}
        </Script>
      </head>
      <body className="antialiased flex flex-col min-h-screen bg-[var(--base)] text-[var(--text)] select-none">
        <Providers>
          <main className="flex-1 flex flex-col overflow-hidden min-h-0">{children}</main>
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
