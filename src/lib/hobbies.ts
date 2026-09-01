/**
 * The selectable hobbies (Profile Settings) and their display emoji
 * (there + the profile page's pills). Freeform on the backend — plain
 * string[], no fixed vocabulary enforced there (see student.controller.ts)
 * — this list and its emoji are entirely a frontend presentation choice.
 *
 * Picked for actually describing Nigerian campus life specifically —
 * tech gets real breadth (coding alone undersold how much of campus life
 * is web/app/AI/cybersecurity-adjacent, not just "coding" as one generic
 * entry), hustle culture is well represented (barbing, thrifting, DJing,
 * event planning — real income streams for real students, not hobbies in
 * the leisure-only sense), and genuinely campus-specific things (Whot &
 * Ludo, Fellowship & Ministry, campus politics) sit alongside the more
 * general/off-the-shelf entries (traveling, journaling, hiking) rather
 * than replacing them outright.
 *
 * Alphabetical order — not grouped by theme (tech, hustle, sport, ...) —
 * so finding one specific hobby in Settings' own selectable grid doesn't
 * mean scanning the whole thing; HOBBY_EMOJI below is kept in the same
 * order purely so the two stay easy to cross-check by eye, not because
 * the lookup itself cares about order.
 *
 * Emoji live in a separate lookup, not baked into the stored strings
 * themselves: a saved hobby is just `"Football"`, never `"⚽ Football"`.
 * That keeps the actual data clean (exact-matching against it — the
 * Settings toggle logic, a future "students who also picked X" feature —
 * never has to fight emoji/whitespace variations) and means fixing or
 * swapping an emoji later is a one-line edit here, not a migration of
 * every profile that already saved the old string.
 */
export const HOBBIES = [
  "AI & Machine Learning", "Anime", "App Development", "Baking", "Barbing",
  "Basketball", "Board Games", "Campus Politics", "Chess", "Coding",
  "Comedy & Skits", "Content Creation", "Cooking", "Crypto & Trading",
  "Cybersecurity", "Cycling", "Dancing", "Debate", "DJing",
  "Entrepreneurship", "Event Planning", "Fashion", "Fashion Design",
  "Fellowship & Ministry", "Football", "Freelancing", "Freestyle Rap",
  "Gaming", "Graphic Design", "Gym & Fitness", "Hackathons",
  "Hair & Makeup", "Hiking", "Journaling", "K-drama", "Karaoke",
  "Language Learning", "MCing & Hosting", "Modeling", "Movies & TV",
  "Music Production", "Painting & Art", "Photography", "Podcasting",
  "Public Speaking", "Reading", "Singing", "Skating", "Spoken Word",
  "Swimming", "Table Tennis", "Thrifting", "Track & Field", "Traveling",
  "UI/UX Design", "Video Editing", "Vlogging", "Volleyball",
  "Volunteering", "Web Development", "Whot & Ludo", "Writing",
] as const;

export const HOBBY_EMOJI: Record<string, string> = {
  "AI & Machine Learning": "🤖",
  "Anime": "🎌",
  "App Development": "📱",
  "Baking": "🧁",
  "Barbing": "💈",
  "Basketball": "🏀",
  "Board Games": "🎲",
  "Campus Politics": "🏛️",
  "Chess": "♟️",
  "Coding": "💻",
  "Comedy & Skits": "😂",
  "Content Creation": "🎥",
  "Cooking": "🍳",
  "Crypto & Trading": "📈",
  "Cybersecurity": "🔐",
  "Cycling": "🚴",
  "Dancing": "💃",
  "Debate": "🗣️",
  "DJing": "🎧",
  "Entrepreneurship": "💼",
  "Event Planning": "📅",
  "Fashion": "👗",
  "Fashion Design": "🧵",
  "Fellowship & Ministry": "🙏",
  "Football": "⚽",
  "Freelancing": "💵",
  "Freestyle Rap": "🔥",
  "Gaming": "🎮",
  "Graphic Design": "🖌️",
  "Gym & Fitness": "🏋️",
  "Hackathons": "⚡",
  "Hair & Makeup": "💄",
  "Hiking": "🥾",
  "Journaling": "📓",
  "K-drama": "🇰🇷",
  "Karaoke": "🎤",
  "Language Learning": "🔤",
  "MCing & Hosting": "🎉",
  "Modeling": "🕴️",
  "Movies & TV": "🎬",
  "Music Production": "🎹",
  "Painting & Art": "🎨",
  "Photography": "📷",
  "Podcasting": "🎙️",
  "Public Speaking": "📣",
  "Reading": "📚",
  "Singing": "🎤",
  "Skating": "🛼",
  "Spoken Word": "🎙️",
  "Swimming": "🏊",
  "Table Tennis": "🏓",
  "Thrifting": "🛍️",
  "Track & Field": "🏃",
  "Traveling": "✈️",
  "UI/UX Design": "🖥️",
  "Video Editing": "🎞️",
  "Vlogging": "📹",
  "Volleyball": "🏐",
  "Volunteering": "🤝",
  "Web Development": "🌐",
  "Whot & Ludo": "🃏",
  "Writing": "✍️",
};
