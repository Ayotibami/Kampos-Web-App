// Shared between every compose entry point (FeedContent's own "+" button,
// ProfileView's own, and the standalone /compose route a notification
// lands on) — one rotating prompt bank and "don't repeat the last one"
// state, not an independently-drifting copy per page.
const PROMPTS = [
  "Oya gist us",
  "Feel free to rant",
  "Wetin dey your mind?",
  "Give us hot gist",
  "Wetin dey sup",
  "Oya we are listening",
  "Yarn some matter for us",
  "What's happening on campus?",
  "Tell us a story",
  "Any random gist?",
  "Any departmental gist",
  "Wetin dey sup for school",
  "Oya banter anybody!",
];

let lastPromptIndex = -1;
export function pickRandomPrompt(): string {
  let idx = Math.floor(Math.random() * PROMPTS.length);
  if (PROMPTS.length > 1) {
    while (idx === lastPromptIndex) idx = Math.floor(Math.random() * PROMPTS.length);
  }
  lastPromptIndex = idx;
  return PROMPTS[idx];
}
