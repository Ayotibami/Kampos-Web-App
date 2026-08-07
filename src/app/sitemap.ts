import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Deliberately just the guest-facing entry points — everything else
// (/feed, /profile, /settings, ...) requires a session and has nothing
// for a crawler to index. Individual /gist/[gistId] pages aren't
// enumerated here: they're real, indexable, ungated pages (see robots.ts
// allowing /gist/), but listing every one would mean this file calling
// out to the backend for every build/request, and search engines will
// discover them organically via the links shared out to them regardless.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: env.SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${env.SITE_URL}/welcome`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${env.SITE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${env.SITE_URL}/signup`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
