import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { GlobalModal } from "@/components/modals/GlobalModal";

export const metadata: Metadata = {
  title: "Event OS | Ecosystem Control",
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
      <body className="min-h-screen">
        <Providers>
          {children}
          <GlobalModal />
        </Providers>
      </body>
    </html>
  );
}
