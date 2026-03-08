import { IBM_Plex_Mono, Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Tender Hunter",
  description: "Tender qualification for small IT consultancies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="background-elements">
          <div className="glow-orb orb-1"></div>
          <div className="glow-orb orb-2"></div>
          <div className="glow-orb orb-3"></div>
        </div>

        <nav className="nav">
          <div className="nav-inner">
            <Link href="/" className="nav-logo">
              <span className="nav-logo-mark">TH</span>
              <span className="nav-brand">
                <strong>Tender Hunter</strong>
                <span className="nav-tagline">Bid qualification for small delivery teams</span>
              </span>
            </Link>

            <div className="nav-actions">
              <Link href="/blog" className="nav-link">
                Blog
              </Link>
              <Link href="/dashboard" className="nav-link">
                Dashboard
              </Link>
              <Link href="/searches/new" className="button secondary">
                Build search
              </Link>
            </div>
          </div>
        </nav>

        <div className="container">{children}</div>

        <footer className="site-footer">
          Tender Hunter MVP. Ranked public-sector opportunities without the TED-search noise.
        </footer>
      </body>
    </html>
  );
}
