import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Everything past the guest-facing entry points requires a real session —
// a crawler hitting them just gets bounced to /login by the server-side
// gate anyway, so keeping them out of robots.txt saves crawl budget and
// stops those redirect targets from ever getting indexed by mistake.
// Profile pages (root-level /avitag) are the exception, same reasoning as
// /gist/ — public, guest-viewable, and worth indexing.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/welcome", "/login", "/signup", "/gist/"],
      disallow: [
        "/api/",
        "/feed",
        "/settings",
        "/setup-profile",
        "/verify-otp",
        "/forgot-password",
        "/reset-password",
        "/signup-success",
      ],
    },
    sitemap: `${env.SITE_URL}/sitemap.xml`,
  };
}
