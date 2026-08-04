"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import KappyLookingUp from "@/assets/illustrations/KappyLookingUp.png";
import KappyElementHeart from "@/assets/illustrations/KappyElement-heart.png";
import KappyElementCash from "@/assets/illustrations/KappyElement-cash.png";
import KappyElementNotebook from "@/assets/illustrations/KappyElement-notebook.png";
import KappyElementBriefcase from "@/assets/illustrations/KappyElement-briefcase.png";

interface ElementDef {
  src: typeof KappyElementHeart;
  alt: string;
  top: string;
  left: string;
  width: string;
  amp: number;
  duration: number;
  delay: number;
  rotate: number;
}

// Small, arranged along a shallow curve above Kappy's head — like they're
// floating in his eyeline as he looks up at them, not orbiting his whole
// body. Middle two sit slightly higher than the outer two for the arc.
const ELEMENT_DEFS: ElementDef[] = [
  { src: KappyElementHeart, alt: "Love", top: "10%", left: "4%", width: "14%", amp: 7, duration: 4.2, delay: 0.2, rotate: -6 },
  { src: KappyElementNotebook, alt: "Learning", top: "-2%", left: "26%", width: "15%", amp: 6, duration: 3.9, delay: 1, rotate: -5 },
  { src: KappyElementBriefcase, alt: "Jobs", top: "-2%", left: "58%", width: "15%", amp: 6, duration: 4.4, delay: 0.4, rotate: 5 },
  { src: KappyElementCash, alt: "Opportunities", top: "10%", left: "80%", width: "16%", amp: 7, duration: 4.6, delay: 0.6, rotate: 6 },
];

/**
 * Kappy looking up, shrunk down to leave headroom, with 4 small floating
 * icon elements (love/learning/jobs/opportunities) arranged in a shallow
 * curve above his head — same bob/drift/rotate mechanic as HeroOrbit on the
 * marketing site (all alive at once, independently looping, nothing
 * cycling on a timer).
 */
export function KappyOpportunitiesOrbit({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {/* Kappy pinned to the bottom, taking up most of the frame — just
          enough headroom above him for the small curve of elements. */}
      <div className="absolute inset-x-0 bottom-0 h-[85%]">
        <Image
          src={KappyLookingUp}
          alt="Kappy looking up"
          fill
          priority
          sizes="(min-width: 768px) 45vw, 95vw"
          className="object-contain object-bottom"
        />
      </div>

      {ELEMENT_DEFS.map((el, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ top: el.top, left: el.left, width: el.width, filter: "drop-shadow(0 4px 6px rgb(0 0 0 / 0.15))" }}
          animate={{ y: [0, -el.amp, 0] }}
          transition={{
            duration: el.duration,
            delay: el.delay,
            repeat: Infinity,
            repeatType: "mirror",
            ease: "easeInOut",
          }}
        >
          <Image src={el.src} alt={el.alt} unoptimized className="h-auto w-full" />
        </motion.div>
      ))}
    </div>
  );
}
