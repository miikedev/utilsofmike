const ADJECTIVES = [
  "Swift", "Quiet", "Bold", "Lucky", "Rapid", "Clever", "Sneaky", "Mighty",
  "Chill", "Wild", "Bright", "Silent", "Fuzzy", "Nimble", "Cosmic", "Rogue",
];

const NOUNS = [
  "Falcon", "Otter", "Panda", "Tiger", "Comet", "Ninja", "Wizard", "Rabbit",
  "Koala", "Raven", "Fox", "Yeti", "Shark", "Wolf", "Dragon", "Penguin",
];

export function generateUsername() {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 90 + 10); // 10-99
  return `${adjective}${noun}${num}`;
}
