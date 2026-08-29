import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Event OS | Participant Portal",
  description: "Unified Attendee, Registration & Speaker Portal for events.",
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
                  var root = document.documentElement;
                  var saved = localStorage.getItem('eventos-portal-theme') || 'dark';
                  if (saved === 'light') {
                    root.classList.remove('dark');
                    root.setAttribute('data-theme', 'light');
                  } else {
                    root.classList.add('dark');
                    root.setAttribute('data-theme', saved);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--base)] text-[var(--text)] antialiased font-sans">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
