import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ImpersonationBanner } from "@/components/super-admin/ImpersonationBanner";

export const metadata: Metadata = {
  title: "Event OS | Command Center",
  description: "Organization-grade administration for the Event OS ecosystem.",
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
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('eventos-theme');
                  var preference = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : (saved ? 'dark' : 'system');
                  var resolved = preference === 'system'
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : preference;
                  if (saved !== preference) localStorage.setItem('eventos-theme', preference);
                  document.documentElement.setAttribute('data-theme-preference', preference);
                  document.documentElement.setAttribute('data-theme', resolved);
                  document.documentElement.style.colorScheme = resolved;
                  if (resolved === 'dark') {
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
        </Providers>
      </body>
    </html>
  );
}
