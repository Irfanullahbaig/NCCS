import type { MetadataRoute } from "next";
import { site } from "@/site/data/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // Staff pages sit behind the login; keep them out of search results.
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/login", "/dashboard", "/students", "/classes", "/staff", "/finance", "/reports", "/settings", "/users", "/audit", "/api"],
    },
    sitemap: new URL("/sitemap.xml", site.url).toString(),
  };
}
