"use client";

import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { LegalIconFill, TermsIconFill, CommunityIconFill } from "@/components/ui/icons";
import { env } from "@/lib/env";
import { CONTACT, EMAIL_ADDRESS } from "@/lib/contact";

// Privacy/Terms/Community Guidelines all live on the separate marketing
// site (Kampos-website), not this app — see lib/env.ts for why.

// Each doc's own "intro" line + "updated" date, pulled verbatim from its
// source component on the marketing site (PrivacyPolicy.jsx,
// TermsConditions.jsx, CommunityGuidelines.jsx) — the short summary the
// site itself shows under the title, not paraphrased.
const DOCS = [
  {
    title: "Privacy Policy",
    intro:
      "Your trust is a big deal to us. This policy explains what data we collect, why we collect it, and how we use, store, and protect it — in plain English.",
    updated: "22 July 2026",
    href: env.PRIVACY_URL,
  },
  {
    title: "Terms and Conditions",
    intro:
      "These Terms govern your access to and use of Kampos. By creating an account, accessing, or using Kampos, you agree to be bound by them.",
    updated: "22 July 2026",
    href: env.TERMS_URL,
  },
  {
    title: "Community Guidelines",
    intro:
      "Kampos runs on good vibes. These guidelines keep it safe, respectful, and fun for every student — read them, live them, and help us protect the space.",
    updated: "22 July 2026",
    href: env.COMMUNITY_GUIDELINES_URL,
  },
] as const;

export default function LegalPage() {
  return (
    <SettingsPageShell title="Legal" backHref="/settings" wide>
      <p className="mb-5 max-w-md font-nunito text-sm text-muted">
        The full details on what we collect, how we use it, and what you&apos;re agreeing to when you use
        Kampos — both live on our main site.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SettingsRow
          variant="card"
          icon={<LegalIconFill className="h-5 w-5" weight="regular" />}
          title="Privacy Policy"
          subtitle="See our privacy policy"
          href={env.PRIVACY_URL}
          external
        />
        <SettingsRow
          variant="card"
          icon={<TermsIconFill className="h-5 w-5" weight="regular" />}
          title="Terms and condition"
          subtitle="Check our terms and conditions"
          href={env.TERMS_URL}
          external
        />
        <SettingsRow
          variant="card"
          icon={<CommunityIconFill className="h-5 w-5" weight="regular" />}
          title="Community Guidelines"
          subtitle="What keeps Kampos a good place to gist"
          href={env.COMMUNITY_GUIDELINES_URL}
          external
        />
      </div>

      {/* Real language from both docs: Community Guidelines' "If you break
          the rules" section says accounts may be "suspend[ed] or
          permanently terminate[d]... for repeated or serious violations";
          Terms and Conditions' "Rights of Kampos" section reserves the
          right to "remove, restrict, or suspend any content or accounts
          that violate these Terms". */}
      <div className="mt-6 flex max-w-2xl items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
        <span className="mt-0.5 font-nunito text-base">⚠️</span>
        <p className="font-nunito text-xs text-ink">
          <span className="font-bold">Heads up:</span> breaking the Community Guidelines or Terms and
          Conditions can get your content removed or restricted, or your account suspended — or
          permanently terminated for repeated or serious violations.
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-6">
        <h2 className="font-nunito text-sm font-bold text-ink">In short</h2>
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-3">
          {DOCS.map((doc) => (
            <div key={doc.title}>
              <p className="font-nunito text-sm font-semibold text-ink">{doc.title}</p>
              <p className="mt-1 font-nunito text-sm text-muted">{doc.intro}</p>
              <p className="mt-2 font-nunito text-xs text-faint">Last updated {doc.updated}</p>
              <a
                href={doc.href}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block font-nunito text-sm font-semibold text-brand hover:underline"
              >
                Read the full policy →
              </a>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-10 max-w-md font-nunito text-xs text-muted">
        Questions about your data? Reach us at{" "}
        <a href={CONTACT.email} className="select-all font-semibold text-ink hover:text-brand">
          {EMAIL_ADDRESS}
        </a>
      </p>
    </SettingsPageShell>
  );
}
