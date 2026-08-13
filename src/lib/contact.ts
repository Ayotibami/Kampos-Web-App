/**
 * Kampos' real contact channels — ported verbatim from the marketing site
 * (Kampos-website/src/constants/contactLinks.js), the single source of
 * truth for these. Kept in sync by hand since it's a separate repo.
 */
const WHATSAPP_NUMBER = "2349110210657";
const WHATSAPP_GREETING = "Hey Kappy, my name is ";

export const EMAIL_ADDRESS = "kamposkonnect@gmail.com";

export const CONTACT = {
  x: "https://x.com/Kamposapp",
  instagram: "https://instagram.com/Kamposapp",
  whatsapp: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_GREETING)}`,
  email: `mailto:${EMAIL_ADDRESS}`,
} as const;
