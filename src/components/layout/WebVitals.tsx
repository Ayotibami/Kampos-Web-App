"use client";

import { useReportWebVitals } from "next/web-vitals";

// Dev-only console reporting for now — there's no analytics/monitoring
// backend wired up yet (no Sentry, no Vercel Analytics, no custom
// endpoint), so this is deliberately just a visibility tool: open devtools
// while testing a change and see LCP/INP/CLS/TTFB/FCP move in real time,
// which is exactly what's needed to confirm the code-splitting/image work
// elsewhere in this pass actually helped. Wiring real production RUM
// (sending `metric` to an endpoint) is a separate, deliberate choice for
// whenever there's an actual destination for that data — see the
// commented sendBeacon example below for the shape that'd take.
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[web-vitals] ${metric.name}`, Math.round(metric.value * 100) / 100, metric);
    }
    // Example for later, once there's somewhere to actually send this:
    // const body = JSON.stringify(metric);
    // if (navigator.sendBeacon) navigator.sendBeacon("/api/vitals", body);
    // else fetch("/api/vitals", { body, method: "POST", keepalive: true });
  });

  return null;
}
