import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ImpersonationBanner } from "@/components/super-admin/ImpersonationBanner";

export const metadata: Metadata = {
  title: "EventX OS | Ecosystem Control",
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
                  var themes = ['plasma-violet', 'light'];
                  var saved = localStorage.getItem('eventos-theme');
                  var theme = themes.indexOf(saved) >= 0 ? saved : 'plasma-violet';
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
        </Providers>
      </body>
    </html>
  );
}
