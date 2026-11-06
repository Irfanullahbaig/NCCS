import type { MetadataRoute } from "next";
import { news } from "@/site/data/news";
import { site } from "@/site/data/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/about", "/facilities", "/faculty", "/admissions", "/news", "/contact"];

  return [
    ...paths.map((path) => ({
      url: new URL(path || "/", site.url).toString(),
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : 0.7,
    })),
    ...news.map((item) => ({
      url: new URL(`/news/${item.slug}`, site.url).toString(),
      lastModified: new Date(item.date),
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
  ];
}
