import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";
import { GlobalModal } from "@/components/modals/GlobalModal";

export const metadata: Metadata = {
  title: "EVENTOS | Registration Software",
  description: "Onsite Registration, Badge Printing & Onsite Ecosystem Control Software",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      <body className="min-h-screen">
        <Providers>
          {children}
          <GlobalModal />
        </Providers>
      </body>
    </html>
  );
}
