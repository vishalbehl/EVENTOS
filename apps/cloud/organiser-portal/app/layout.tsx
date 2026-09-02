import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ImpersonationBanner } from "@/components/organizer/ImpersonationBanner";

export const metadata: Metadata = {
  title: "Event OS | Organiser Portal",
  description: "Enterprise event management platform for professional organizers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline script: apply theme immediately before paint to avoid flash */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var root = document.documentElement;
                  var saved = localStorage.getItem('eventos-theme');
                  if (saved === 'dark') {
                    root.classList.add('dark');
                    root.setAttribute('data-theme', 'dark');
                  } else {
                    root.classList.remove('dark');
                    root.setAttribute('data-theme', 'light');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>
          <ImpersonationBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}


