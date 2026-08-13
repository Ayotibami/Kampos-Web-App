"use client";

import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { SettingsRow } from "@/components/settings/SettingsRow";
import {
  BugIconFill,
  FeatureIconFill,
  PhoneIconFill,
  SupportCentreIconFill,
  WhatsappLogoFill,
} from "@/components/ui/icons";
import { env } from "@/lib/env";
import { CONTACT, EMAIL_ADDRESS } from "@/lib/contact";

// All flows live on the marketing site (Kampos-website) — its contact form,
// bug-report and feature-request pages, plus WhatsApp/email directly —
// since the Kampos backend has no feedback/support endpoints of its own.
// See lib/env.ts and lib/contact.ts.

// Pulled verbatim from the marketing site's real FAQ (ContactPage.jsx) —
// the entries most relevant to a support context, not invented copy.
const FAQS = [
  {
    q: "How do I get support if I face issues?",
    a: "You can reach out to Kampos through the contact form, email, or WhatsApp. Our team is always ready to respond quickly and help resolve any problems.",
  },
  {
    q: "What happens when I flag a post?",
    a: "When you flag a post, it comes straight to our team for review. If it goes against our community guidelines, we take it down as fast as possible. Flagging is what helps us keep Kampos a space everybody can enjoy.",
  },
  {
    q: "How is my data protected?",
    a: "Your privacy matters to us. For the full details on what we collect, how we use it and how we keep it safe, please read our Privacy Policy and Terms and Conditions.",
  },
  {
    q: "Is Kampos affiliated with my university?",
    a: "No — Kampos is an independent platform and is not owned by, endorsed by, or officially affiliated with any university or institution. We bring campus updates and announcements together in one place, but we operate independently of the schools themselves.",
  },
  {
    q: "Is Kampos free to use?",
    a: "Yes, Kampos is completely free for students to use.",
  },
] as const;

export default function SupportPage() {
  return (
    <SettingsPageShell title="Feedback & Support" backHref="/settings" wide>
      <p className="mb-5 max-w-md font-nunito text-sm text-muted">
        Got a bug, a big idea, or just wan tell us hey? Pick where you want to reach us — each one opens
        our main site, where you can actually send it.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SettingsRow
          variant="card"
          icon={<BugIconFill className="h-5 w-5" weight="regular" />}
          title="Report bugs and issues"
          subtitle="Report bugs, after all no one is perfect"
          href={env.REPORT_BUG_URL}
          external
        />
        <SettingsRow
          variant="card"
          icon={<FeatureIconFill className="h-5 w-5" weight="regular" />}
          title="Feature request"
          subtitle="Do you want us to cook something for you?"
          href={env.REQUEST_FEATURE_URL}
          external
        />
        <SettingsRow
          variant="card"
          icon={<PhoneIconFill className="h-5 w-5" weight="regular" />}
          title="Contact us"
          subtitle="Have a question or want to tell us hey?"
          href={env.CONTACT_URL}
          external
        />
        <SettingsRow
          variant="card"
          icon={<SupportCentreIconFill className="h-5 w-5" weight="regular" />}
          title="Support Centre"
          subtitle="Need help or have questions? No panic, Everywhere good."
          href={`${env.CONTACT_URL}#faq`}
          external
        />
        <SettingsRow
          variant="card"
          icon={<WhatsappLogoFill className="h-5 w-5" weight="regular" />}
          title="Chat on WhatsApp"
          subtitle="Quick question? Ping us directly"
          href={CONTACT.whatsapp}
          external
        />
      </div>

      {/* mailto: silently does nothing without a registered mail app on
          desktop — showing the address as selectable text means it can
          always be copied, same reasoning the marketing site's own contact
          page uses for this. */}
      <p className="mt-4 font-nunito text-xs text-muted">
        or email us directly at{" "}
        <a href={CONTACT.email} className="select-all font-semibold text-ink hover:text-brand">
          {EMAIL_ADDRESS}
        </a>
      </p>

      <div className="mt-10 flex flex-col gap-5">
        <h2 className="font-nunito text-sm font-bold text-ink">Common questions</h2>
        <div className="grid grid-cols-1 gap-x-10 gap-y-5 lg:grid-cols-2">
          {FAQS.map((f) => (
            <div key={f.q}>
              <p className="font-nunito text-sm font-semibold text-ink">{f.q}</p>
              <p className="mt-1 font-nunito text-sm text-muted">{f.a}</p>
            </div>
          ))}
        </div>
        <a
          href={`${env.CONTACT_URL}#faq`}
          target="_blank"
          rel="noreferrer"
          className="font-nunito text-sm font-semibold text-brand hover:underline"
        >
          See more in our FAQ →
        </a>
      </div>
    </SettingsPageShell>
  );
}
