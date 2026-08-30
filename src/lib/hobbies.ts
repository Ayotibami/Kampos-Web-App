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
 * Emoji live in a separate lookup, not baked into the stored strings
 * themselves: a saved hobby is just `"Football"`, never `"⚽ Football"`.
 * That keeps the actual data clean (exact-matching against it — the
 * Settings toggle logic, a future "students who also picked X" feature —
 * never has to fight emoji/whitespace variations) and means fixing or
 * swapping an emoji later is a one-line edit here, not a migration of
 * every profile that already saved the old string.
 */
export const HOBBIES = [
  "Football", "Basketball", "Gaming", "Reading", "Photography", "Fashion",
  "Dancing", "Singing", "Cooking", "Baking", "Gym & Fitness", "Movies & TV",
  "Music Production", "DJing", "Painting & Art", "Fashion Design",
  "Hair & Makeup", "Coding", "Web Development", "App Development",
  "AI & Machine Learning", "Cybersecurity", "UI/UX Design", "Hackathons",
  "Entrepreneurship", "Freelancing", "Debate", "Content Creation", "Chess",
  "Table Tennis", "Swimming", "Spoken Word", "Comedy & Skits",
  "Whot & Ludo", "Crypto & Trading", "Graphic Design", "Video Editing",
  "Podcasting", "Vlogging", "Thrifting", "Anime & K-drama", "Volleyball",
  "Track & Field", "MCing & Hosting", "Event Planning",
  "Fellowship & Ministry", "Modeling", "Freestyle Rap", "Barbing",
  "Campus Politics", "Writing", "Traveling", "Volunteering", "Journaling",
  "Cycling", "Hiking", "Skating", "Board Games", "Karaoke",
  "Language Learning", "Public Speaking",
] as const;

export const HOBBY_EMOJI: Record<string, string> = {
  "Football": "⚽",
  "Basketball": "🏀",
  "Gaming": "🎮",
  "Reading": "📚",
  "Photography": "📷",
  "Fashion": "👗",
  "Dancing": "💃",
  "Singing": "🎤",
  "Cooking": "🍳",
  "Baking": "🧁",
  "Gym & Fitness": "🏋️",
  "Movies & TV": "🎬",
  "Music Production": "🎹",
  "DJing": "🎧",
  "Painting & Art": "🎨",
  "Fashion Design": "🧵",
  "Hair & Makeup": "💄",
  "Coding": "💻",
  "Web Development": "🌐",
  "App Development": "📱",
  "AI & Machine Learning": "🤖",
  "Cybersecurity": "🔐",
  "UI/UX Design": "🖥️",
  "Hackathons": "⚡",
  "Entrepreneurship": "💼",
  "Freelancing": "💵",
  "Debate": "🗣️",
  "Content Creation": "🎥",
  "Chess": "♟️",
  "Table Tennis": "🏓",
  "Swimming": "🏊",
  "Spoken Word": "🎙️",
  "Comedy & Skits": "😂",
  "Whot & Ludo": "🃏",
  "Crypto & Trading": "📈",
  "Graphic Design": "🖌️",
  "Video Editing": "🎞️",
  "Podcasting": "🎙️",
  "Vlogging": "📹",
  "Thrifting": "🛍️",
  "Anime & K-drama": "🎌",
  "Volleyball": "🏐",
  "Track & Field": "🏃",
  "MCing & Hosting": "🎉",
  "Event Planning": "📅",
  "Fellowship & Ministry": "🙏",
  "Modeling": "🕴️",
  "Freestyle Rap": "🔥",
  "Barbing": "💈",
  "Campus Politics": "🏛️",
  "Writing": "✍️",
  "Traveling": "✈️",
  "Volunteering": "🤝",
  "Journaling": "📓",
  "Cycling": "🚴",
  "Hiking": "🥾",
  "Skating": "🛼",
  "Board Games": "🎲",
  "Karaoke": "🎤",
  "Language Learning": "🔤",
  "Public Speaking": "📣",
};
