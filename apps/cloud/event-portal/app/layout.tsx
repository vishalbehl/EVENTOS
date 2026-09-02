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
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var root = document.documentElement;
                  var path = window.location.pathname || '';
                  var match = path.match(/\\/([a-f0-9\\-]{36})/i);
                  var eventId = match ? match[1] : null;
                  var cachedStr = eventId ? localStorage.getItem('portal_theme_cache_' + eventId) : null;
                  if (eventId && cachedStr) {
                    var d = JSON.parse(cachedStr);
                    var pri = d.primary_color || (d.theme_config && d.theme_config.primary_color) || d.theme_color || '#6366F1';
                    var sec = d.secondary_color || (d.theme_config && d.theme_config.secondary_color) || '#A855F7';
                    var bgMode = d.bg_mode || (d.theme_config && d.theme_config.bg_mode) || 'pattern';
                    var solidBg = (d.bg_solid_color || (d.theme_config && d.theme_config.bg_solid_color) || '#000000').trim();

                    var css = ':root, html, body, [data-theme], [data-radix-portal], [role="dialog"], [role="menu"], [data-radix-popper-content-wrapper] { ' +
                      '--pri: ' + pri + ' !important; ' +
                      '--sec: ' + sec + ' !important; ' +
                      '--brand-primary: ' + pri + ' !important; ' +
                      '--brand-secondary: ' + sec + ' !important; ' +
                    '}';

                    if (bgMode === 'solid') {
                      var hex = solidBg.replace('#', '');
                      var r = parseInt(hex.substring(0, 2), 16) || 0;
                      var g = parseInt(hex.substring(2, 4), 16) || 0;
                      var b = parseInt(hex.substring(4, 6), 16) || 0;
                      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                      var isDark = lum < 0.55;
                      var textColor = isDark ? '#f8fafc' : '#0f172a';
                      var textSec = isDark ? '#cbd5e1' : '#334155';
                      var mutedColor = isDark ? '#94a3b8' : '#475569';
                      var cardBg = isDark ? 'rgba(18, 21, 40, 0.90)' : 'rgba(255, 255, 255, 0.94)';
                      var borderCol = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.14)';
                      var surf2 = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';

                      css += ' :root, html, body, [data-theme], body.min-h-screen { ' +
                        '--bg-base: ' + solidBg + ' !important; ' +
                        '--base: ' + solidBg + ' !important; ' +
                        'background-color: ' + solidBg + ' !important; ' +
                        '--text: ' + textColor + ' !important; ' +
                        '--text-primary: ' + textColor + ' !important; ' +
                        '--text-secondary: ' + textSec + ' !important; ' +
                        '--muted: ' + mutedColor + ' !important; ' +
                        '--card: ' + cardBg + ' !important; ' +
                        '--border-default: ' + borderCol + ' !important; ' +
                        '--border: ' + borderCol + ' !important; ' +
                        '--bg-surface-2: ' + surf2 + ' !important; ' +
                        'color: ' + textColor + ' !important; ' +
                      '} ' +
                      '[data-portal-bg-pattern], .portal-bg-pattern { display: none !important; }';
                      root.style.backgroundColor = solidBg;
                      root.setAttribute('data-theme', isDark ? 'dark' : 'light');
                      if (isDark) root.classList.add('dark'); else root.classList.remove('dark');
                    } else if (d.dark_mode_default !== undefined && !localStorage.getItem('portal_theme')) {
                      var mode = d.dark_mode_default ? 'dark' : 'light';
                      root.setAttribute('data-theme', mode);
                      if (mode === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
                    }

                    var styleTag = document.getElementById('event-theme-override');
                    if (!styleTag) {
                      styleTag = document.createElement('style');
                      styleTag.id = 'event-theme-override';
                      document.head.appendChild(styleTag);
                    }
                    styleTag.textContent = css;
                  } else {
                    var saved = localStorage.getItem('portal_theme') || localStorage.getItem('eventos-portal-theme') || 'dark';
                    if (saved === 'light') {
                      root.classList.remove('dark');
                      root.setAttribute('data-theme', 'light');
                    } else {
                      root.classList.add('dark');
                      root.setAttribute('data-theme', saved);
                    }
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
