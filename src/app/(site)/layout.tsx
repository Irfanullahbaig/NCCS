import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Footer } from "@/site/components/Footer";
import { Header } from "@/site/components/Header";
import { site } from "@/site/data/site";
import "./site.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.title,
    template: "%s | NCCS Gilgit",
  },
  description: site.description,
  applicationName: "NCCS",
  icons: { icon: "/site/icon.svg" },
  openGraph: {
    title: site.title,
    description: site.description,
    locale: "en_PK",
    type: "website",
    siteName: "NCCS",
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0c1b33",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: site.fullName,
  alternateName: site.name,
  foundingDate: String(site.founded),
  description: site.description,
  url: site.url,
  address: {
    "@type": "PostalAddress",
    addressLocality: site.locality,
    addressRegion: site.region,
    addressCountry: site.countryCode,
    ...(site.streetAddress ? { streetAddress: site.streetAddress } : {}),
  },
  ...(site.email ? { email: site.email } : {}),
  ...(site.phone ? { telephone: site.phone } : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
