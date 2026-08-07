import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { resolveServerAuthState } from "@/lib/serverAuth";
import { fetchGistContext } from "@/lib/serverGist";
import { GistShareView } from "./GistShareView";

const OG_TITLE_FALLBACK = "Kampos — your campus life in one app";
const OG_DESCRIPTION =
  "Gists, rants, banters, school updates — Kampos drops you right in the middle of everything happening on your campus.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gistId: string }>;
}): Promise<Metadata> {
  const { gistId } = await params;
  const context = await fetchGistContext(gistId, 0, 0);
  if (!context) {
    return { title: OG_TITLE_FALLBACK, description: OG_DESCRIPTION };
  }
  const { target } = context;
  const title = `Checkout ${target.avitag}'s gist on Kampos`;
  const description = target.gist_text.slice(0, 150);
  const imageUrl = `/api/og/${encodeURIComponent(gistId)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function GistSharePage({
  params,
}: {
  params: Promise<{ gistId: string }>;
}) {
  const { gistId } = await params;
  // Deliberately NOT gateServer — this route is the one place in the app
  // that renders for a guest with no session at all (see the whole
  // "shared link" design: WhatsApp/X/Facebook's preview crawlers are never
  // logged in either, and a stranger clicking a shared link shouldn't hit
  // a login wall before ever seeing the actual content).
  const { state, account, profiles } = await resolveServerAuthState();
  const context = await fetchGistContext(gistId);
  if (!context) notFound();

  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <GistShareView context={context} />
    </>
  );
}
