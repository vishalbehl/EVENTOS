import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { GlobalModal } from "@/components/organizer/modals/GlobalModal";
import { ImpersonationBanner } from "@/components/organizer/ImpersonationBanner";

export const metadata: Metadata = {
  title: "EventX OS | Organiser Portal",
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
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var root = document.documentElement;
                  root.classList.add('dark');
                  root.setAttribute('data-theme', 'dark');
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
          <GlobalModal />
        </Providers>
      </body>
    </html>
  );
}
