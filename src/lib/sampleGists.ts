import type { Gist } from "@/types";

/**
 * DEMO fallback only. Used by the feed when the live API returns nothing/errors
 * (e.g. backend down), so the swipe UX is testable. Real gists take over as soon
 * as the API responds. 20 hand-written gists (not synthetic length-stepped
 * slices of one paragraph) covering real campus topics, deliberately spanning:
 * - short text (hero color-card): #1, #2, #6, #9, #12, #16
 * - medium text (still hero-range, SHORT_TEXT = 200): #3, #5, #8, #10, #13, #15, #17, #19
 * - long text (normal paragraph layout): #4, #7, #11, #14, #18
 * - very long, near the 700-char compose cap: #20
 * - media variety: single image (#3, #6, #12, #19), image duo (#5, #10),
 *   single video (#8, #15), video duo (#14), mixed image+video duo (#17,
 *   #20) — the rest are text-only.
 */
const NOW = Date.now();
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

/** Stand-in for "you" when testing against demo data with nobody actually
 * logged in (avitag is null) — GistCard falls back to this so a couple of
 * the sample gists show Edit/Delete instead of Quote/Report, letting that
 * flow be exercised without a real backend session. */
export const DEMO_SELF_AVITAG = "demo_self";

// X-style: a mix of real-sounding display names and pure alter-ego nicknames,
// paired with longer, funnier handles the way people actually pick them —
// not just "firstname_lastname" for all twenty.
const NAMES: [string, string][] = [
  ["Wahala Boy", "professional_wahala_dealer"],
  ["Chidera Nnaji", "chidera_but_make_it_dramatic"],
  ["Certified Menace", "unilag_menace_247"],
  ["Emeka Obiora", "emeka_no_send_anybody"],
  ["Broke But Blessed", "aisha_dey_manage"],
  ["Femi Adeyanju", "femi_that_dey_owe_gpa"],
  ["Your Fav's Fav", "blessing_no_be_mate"],
  ["Ibrahim Yusuf", "ibrahim_zero_stress"],
  ["Grace Under Pressure", "grace_wey_sabi_book"],
  ["Chukwu Daniel", "daniel_the_gist_lord"],
  ["Halima Musa", "halima_dey_form_shy"],
  ["Segun the Menace", "segun_no_dey_class"],
  ["Ngozi Chidi", "ngozi_dey_type_essay"],
  ["Overthinking King", "kelechi_over_analyze"],
  ["Fatima Sani", "fatima_first_class_material"],
  ["Damilare Ola", "damilare_dey_owe_light_bill"],
  ["Chief Amebo", "amaka_sabi_gist_pass_cnn"],
  ["Yusuf Garba", "yusuf_no_send_lectures"],
  ["Precious Ade", "precious_but_stressed"],
  ["Obinna Kalu", "obinna_dey_hustle_silently"],
];

const CAMPUSES = ["unilag", "unn", "oau", "uniben"];
const MAJORS = ["GEN", "ECO", "LAW", "ENG", "MED", "CSC", "ACC", "MKT"];
const LEVELS = ["100L", "200L", "300L", "400L", "500L"];

const TEXTS = [
  // 1 — very short, hero
  "Omo wahala dey o 😩",
  // 2 — short, hero
  "First class or nothing this semester. No be beans but we go still gum am reach the end.",
  // 3 — medium, hero + 1 image
  "Just finished my Statistics exam and my head don scatter reach another dimension. The questions no even follow anything wey the lecturer taught us this whole semester, na so I just dey format and hope for mercy marks.",
  // 4 — long, no media
  "Can we talk about hostel light for one second? NEPA don take light since Tuesday and my roommate's rechargeable fan don die since yesterday night. I no fit read, I no fit charge phone well, and the generator wey dem dey use for the hostel gate dey cost money wey I no even budget for this month. Meanwhile assignment submission na tomorrow by 11:59pm and I need my laptop battery to survive at least three more hours of typing. Abeg if anybody sabi where I fit charge for cheap around campus make dem drop the location for una DM, I dey beg una well well because this one don pass matter be that.",
  // 5 — medium, hero + 2 images
  "Lecturer just shifted the CA date AGAIN for the third time this semester and posted the new timetable like say nothing happen. See the screenshot make una witness am with me, I no dey form again, na wa for this department o.",
  // 6 — short, hero + 1 image
  "Canteen jollof today na different level, dem finally cook am well well. Rice no dey stick together like glue for once, God when.",
  // 7 — long, no media
  "So my project group get five members and only two of us dey do anything since the semester start. I don send message for the group chat like six times this week alone, nobody dey reply, meanwhile presentation na next Monday and we never even combine our slides together. I dey type the whole literature review myself while person dey post story for Snapchat like say group work no concern them. Na this kind thing dey make person wan just do individual project forever, because at least if I fail I go fail alone, no be one person dey carry everybody load for background while credit go share equal equal for everybody. God abeg make Monday favor us small small, I don do wetin I fit do.",
  // 8 — medium, hero + 1 video
  "MATCH DAY!! Faculty of Engineering vs Faculty of Science for the inter-fac final, pitch don dey fill up since morning. Come support your set o, this one na derby wey go enter history books for real.",
  // 9 — short, hero
  "I think say I dey catch feelings for the guy wey dey sit front row for GST class. Nobody talk anything o, I just dey observe for now.",
  // 10 — medium, hero + 2 images
  "Wetin I go wear for the departmental dinner this weekend still dey give me hard time o, I don try like four different combinations and I no fit decide. Which one una think dey hit different, the first one or the second?",
  // 11 — long, no media
  "Campus WiFi has officially declared war on my final year project. Three days now wey I dey try upload my project file for the portal and e just dey buffer for like ten minutes then network go disconnect. I don try am for library, for hostel, even for that spot near the admin block wey people say get better signal, nothing dey work. Deadline na tomorrow 5pm and IT department don close for the day already. If anybody get better data plan wey fit hold my hotspot steady for like twenty minutes make dem holla at me abeg, I dey owe una one big thank you and maybe suya sef.",
  // 12 — short, hero + 1 image
  "Happy birthday to the realest amebo for this whole campus, una know who I dey talk about. God bless your new age big time 🎂",
  // 13 — medium, hero
  "Just got my internship acceptance letter from the firm I applied to since December and I don read the email like ten times to confirm say na real. All the sleepless nights dey finally make sense small small, thank God.",
  // 14 — long, no media
  "Strike rumor don dey circulate for our WhatsApp group since Monday and honestly nobody sabi wetin dey happen for real. Some people dey say na just one week warning strike, another person dey swear say ASUU don call full meeting for next week already. Meanwhile we still get CA to write this Friday and lecturers dey act like say nothing dey happen at all. I no even know again whether to prepare well for the test or to just relax small since maybe strike go save us sha. Abeg if anybody get correct gist make dem share am, we dey confused for real this time, everybody just dey manage information wey half true half rumor.",
  // 15 — medium, hero + 1 video
  "Third night in a row for the library and my eyes don dey see double small small. Recorded this timelapse to prove to myself say I actually dey do something with my life this exam period, no be only vibes.",
  // 16 — short, hero
  "78 days to graduation and I still no sabi wetin I wan do with my life, but we move regardless 😅.",
  // 17 — medium, hero + mixed image/video duo
  "Started selling thrift shoes and bags for my hostel room, business slow small for now but we dey push am. First video showing one of the new arrivals, come check my page if you dey around campus this week.",
  // 18 — long, no media
  "Can somebody explain to me why our class rep dey collect money for department dues since three weeks ago and nobody don see how e dey spend am? I ask for breakdown for the group chat and dem just dey give vague explanation anytime. Other departments don already do their end of semester get-together and buy branded jackets, meanwhile we still dey here dey ask basic questions about money wey we contribute ourselves. I no dey accuse anybody of anything o, I just want transparency, na so I put my own money there too. If anybody dey the exco make una help push for proper account statement before more people start to complain for real, better make we sort this one out quietly before e blow up.",
  // 19 — short, hero + 1 image
  "Who dey free this weekend, some of us dey plan small hangout by the new spot near main gate. Flyer attached, come if you fit come.",
  // 20 — very long, near cap + mixed image/video duo
  "End of semester don almost reach and I just dey sit down dey reflect small. This semester don teach me pass any single course wey dem register me for, real talk. I don learn how to manage my time when I get four deadlines for one week, I don learn who my real friends be when things hard, and I don learn say lecturer wey seem strict for class fit still be the one wey go help you pass if you show up and try. E no easy at all this journey, from lecture wahala to hostel wahala to money wahala, but here we still dey, standing, still pushing. To everybody wey dey read this and dey feel like say una no dey make progress, abeg no compare your chapter one to another person chapter twenty, everybody get their own pace. We go still gum am reach the finish line together, no matter how e take long. Attached small video and photo from the semester, just to remember how far we don waka since resumption day.",
];

// Real hotlinkable placeholders (Picsum for images, two distinct small public
// sample clips for video) so GistMediaStage has real content to render.
// Indices are 0-based (gist_id = index + 1).
const MEDIA_BY_INDEX: Record<number, Gist["media"]> = {
  2: [
    {
      media_id: "demo-media-3-1",
      gist_id: "demo-3",
      order_index: 0,
      media_type: "IMAGE",
      media_url: "https://picsum.photos/id/1015/900/700",
    },
  ],
  4: [
    {
      media_id: "demo-media-5-1",
      gist_id: "demo-5",
      order_index: 0,
      media_type: "IMAGE",
      media_url: "https://picsum.photos/id/1025/900/700",
    },
    {
      media_id: "demo-media-5-2",
      gist_id: "demo-5",
      order_index: 1,
      media_type: "IMAGE",
      media_url: "https://picsum.photos/id/1035/900/700",
    },
  ],
  5: [
    {
      media_id: "demo-media-6-1",
      gist_id: "demo-6",
      order_index: 0,
      media_type: "IMAGE",
      media_url: "https://picsum.photos/id/1080/900/700",
    },
  ],
  7: [
    {
      media_id: "demo-media-8-1",
      gist_id: "demo-8",
      order_index: 0,
      media_type: "VIDEO",
      media_url: "https://www.w3schools.com/html/mov_bbb.mp4",
      thumbnail_url: "https://picsum.photos/id/1039/900/700",
    },
  ],
  9: [
    {
      media_id: "demo-media-10-1",
      gist_id: "demo-10",
      order_index: 0,
      media_type: "IMAGE",
      media_url: "https://picsum.photos/id/1041/900/700",
    },
    {
      media_id: "demo-media-10-2",
      gist_id: "demo-10",
      order_index: 1,
      media_type: "IMAGE",
      media_url: "https://picsum.photos/id/1043/900/700",
    },
  ],
  11: [
    {
      media_id: "demo-media-12-1",
      gist_id: "demo-12",
      order_index: 0,
      media_type: "IMAGE",
      media_url: "https://picsum.photos/id/1050/900/700",
    },
  ],
  13: [
    // Video duo — two genuinely different clips (not the same file twice),
    // so the overlay's left/right nav is actually verifiable.
    {
      media_id: "demo-media-14-1",
      gist_id: "demo-14",
      order_index: 0,
      media_type: "VIDEO",
      media_url: "https://www.w3schools.com/html/mov_bbb.mp4",
      thumbnail_url: "https://picsum.photos/id/1059/900/700",
    },
    {
      media_id: "demo-media-14-2",
      gist_id: "demo-14",
      order_index: 1,
      media_type: "VIDEO",
      media_url: "https://www.w3schools.com/html/movie.mp4",
      thumbnail_url: "https://picsum.photos/id/1060/900/700",
    },
  ],
  15: [
    {
      media_id: "demo-media-16-1",
      gist_id: "demo-16",
      order_index: 0,
      media_type: "IMAGE",
      media_url: "https://picsum.photos/id/1069/900/700",
    },
  ],
  16: [
    // Mixed duo — one image, one video, to make sure the split layout
    // handles two different media types side by side, not just same-type pairs.
    {
      media_id: "demo-media-17-1",
      gist_id: "demo-17",
      order_index: 0,
      media_type: "IMAGE",
      media_url: "https://picsum.photos/id/1074/900/700",
    },
    {
      media_id: "demo-media-17-2",
      gist_id: "demo-17",
      order_index: 1,
      media_type: "VIDEO",
      media_url: "https://www.w3schools.com/html/mov_bbb.mp4",
      thumbnail_url: "https://picsum.photos/id/1082/900/700",
    },
  ],
  18: [
    {
      media_id: "demo-media-19-1",
      gist_id: "demo-19",
      order_index: 0,
      media_type: "IMAGE",
      media_url: "https://picsum.photos/id/1084/900/700",
    },
  ],
  19: [
    {
      media_id: "demo-media-20-1",
      gist_id: "demo-20",
      order_index: 0,
      media_type: "IMAGE",
      media_url: "https://picsum.photos/id/1084/900/700",
    },
    {
      media_id: "demo-media-20-2",
      gist_id: "demo-20",
      order_index: 1,
      media_type: "VIDEO",
      media_url: "https://www.w3schools.com/html/movie.mp4",
      thumbnail_url: "https://picsum.photos/id/1050/900/700",
    },
  ],
};

// Indices marked as "yours" (0-based) — gist #1 and #6 show up as posted by
// DEMO_SELF_AVITAG, so Edit/Delete is reachable without a real login.
const SELF_INDICES = new Set([0, 5]);

export const SAMPLE_GISTS: Gist[] = TEXTS.map((text, i) => {
  const isSelf = SELF_INDICES.has(i);
  const [name, presetAvitag] = NAMES[i];
  const avitag = isSelf ? DEMO_SELF_AVITAG : presetAvitag;
  return {
    gist_id: `demo-${i + 1}`,
    name,
    avitag,
    gist_text: text,
    created_at: ago(i),
    major_tag: MAJORS[i % MAJORS.length],
    campus_tag: CAMPUSES[i % CAMPUSES.length],
    level: LEVELS[i % LEVELS.length],
    media: MEDIA_BY_INDEX[i],
    counts: {
      reactions_count: 50 + i * 37,
      comments_count: 5 + i * 4,
      views_count: 300 + i * 220,
      shares_count: 2 + i * 3,
      reports_count: 0,
      // Every reaction type gets a real (varied) count, not just the one you
      // happen to click — otherwise only the locally-clicked emoji shows a
      // number, which is what was happening before this field existed.
      reactions_by_type: {
        LIKE: 20 + i * 9,
        LOVE: 12 + i * 6,
        FIRE: 8 + i * 11,
        SAD: 3 + i * 2,
        WOW: 6 + i * 4,
      },
    },
  };
});
