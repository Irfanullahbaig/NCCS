/**
 * Verified facts only. Leave unknown fields blank.
 * Do not invent phone numbers, emails, street addresses, hours, or social accounts.
 *
 * Some public profiles associate the college with Jutial, Gilgit.
 * Confirm that locality before publishing a street address or map pin.
 */

type Site = {
  name: string;
  fullName: string;
  location: string;
  locality: string;
  region: string;
  country: string;
  countryCode: string;
  founded: number;
  title: string;
  description: string;
  url: string;
  phone: string;
  email: string;
  officeHours: string;
  streetAddress: string;
  mapQuery: string;
};

export const site: Site = {
  name: "NCCS",
  fullName: "National College of Commerce and Computer Science",
  location: "Gilgit, Gilgit-Baltistan, Pakistan",
  locality: "Gilgit",
  region: "Gilgit-Baltistan",
  country: "Pakistan",
  countryCode: "PK",
  founded: 2018,
  title: "NCCS Gilgit | National College of Commerce and Computer Science",
  description:
    "NCCS — National College of Commerce and Computer Science, Gilgit, established in 2018, providing a supportive environment for learning, growth, and student development.",
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  phone: "",
  email: "",
  officeHours: "",
  streetAddress: "",
  mapQuery: "",
};

export const socialLinks: { label: string; href: string }[] = [];

export const usefulLinks: { label: string; href: string }[] = [];

export function unpublished(value: string, fallback = "Not yet published") {
  return value.trim() ? value : fallback;
}
