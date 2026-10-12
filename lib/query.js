const STOP = new Set(("a an the i im i'm me my we you your is are was be been it its of to for and or but in on at by with from about so no do did does just " +
  "something anything show shows anime animes series please want wanted wanna looking look find recommend recommendation recommendations " +
  "good great nice some any that this these those what which who how why watch watching watched see give get need really very more much " +
  "than into over can could would should will make makes made feel feeling kind sort type stuff thing things one ones lot lots got im " +
  "tonight today night weekend after work while when time maybe also too even all every ever have has had not dont don't haven't havent " +
  "yet seen there their them they it's that's where up out like am being let lets let's go going around bit little enough other another " +
  "new old short long quick binge bingeable episode episodes season seasons").split(/\s+/));

const CONCEPTS = [
  { words: ["sad", "sadder", "saddest", "cry", "crying", "tearjerker", "tearjerking", "tears", "heartbreaking", "depressing", "emotional", "tragic", "tragedy"],
    labels: { Tragedy: 1, Drama: 0.55, "Coming of Age": 0.35 }, avoid: { Gore: 0.5, Horror: 0.4, "Body Horror": 0.4, Thriller: 0.25, Ecchi: 0.3 } },
  { words: ["scary", "scarier", "horror", "creepy", "spooky", "terrifying", "frightening", "haunted", "eerie"],
    labels: { Horror: 1, "Body Horror": 0.9, "Cosmic Horror": 0.9, Ghost: 0.6, Gore: 0.5, Supernatural: 0.35 } },
  { words: ["funny", "funnier", "hilarious", "comedy", "comedic", "laugh", "laughs", "silly", "goofy", "gag"],
    labels: { Comedy: 1, Parody: 0.8, "Surreal Comedy": 0.8, Slapstick: 0.7, Satire: 0.6 } },
  { words: ["chill", "relaxing", "relax", "cozy", "comfy", "calm", "wholesome", "heartwarming", "unwind", "soothing", "peaceful", "healing", "comfort"],
    labels: { Iyashikei: 1, "Slice of Life": 0.75, CGDCT: 0.55, "Family Life": 0.5, Food: 0.35 }, avoid: { Gore: 0.6, Horror: 0.5, Tragedy: 0.4, Psychological: 0.3, Thriller: 0.3 } },
  { words: ["romance", "romantic", "love", "dating", "couple", "relationship"],
    labels: { Romance: 1, "Love Triangle": 0.6, "Heterosexual": 0.3 } },
  { words: ["dark", "darker", "bleak", "grim", "disturbing", "twisted", "messed"],
    labels: { Psychological: 0.9, Tragedy: 0.7, Gore: 0.6, Horror: 0.6, "Anti-Hero": 0.5, Thriller: 0.6 } },
  { words: ["psychological", "mind", "mindbending", "cerebral", "mindgames"],
    labels: { Psychological: 1, Thriller: 0.5, Mystery: 0.4 } },
  { words: ["mystery", "mysteries", "detective", "whodunit", "investigation", "crime"],
    labels: { Mystery: 1, Detective: 0.9, Crime: 0.7 } },
  { words: ["thriller", "suspense", "suspenseful", "tense", "intense"],
    labels: { Thriller: 1, Suspense: 1, Psychological: 0.4 } },
  { words: ["action", "fight", "fights", "fighting", "battle", "battles", "brawl"],
    labels: { Action: 1, "Martial Arts": 0.7, "Super Power": 0.5, Swordplay: 0.5 } },
  { words: ["sports", "sport", "team", "athlete", "athletes", "tournament"],
    labels: { Sports: 1, "Team Sports": 0.9 } },
  { words: ["fantasy", "magic", "magical", "wizard", "witch", "sorcery"],
    labels: { Fantasy: 1, Magic: 0.8 } },
  { words: ["epic", "adventure", "adventures", "journey", "quest", "exploration"],
    labels: { Adventure: 1, Fantasy: 0.5, Travel: 0.5 } },
  { words: ["isekai", "reincarnated", "reincarnation", "transported"],
    labels: { Isekai: 1, Reincarnation: 0.8 } },
  { words: ["scifi", "sci-fi", "space", "futuristic", "cyberpunk", "aliens", "alien"],
    labels: { "Sci-Fi": 1, Space: 0.8, Cyberpunk: 0.8, Aliens: 0.7 } },
  { words: ["mecha", "robot", "robots", "mech", "gundam"], labels: { Mecha: 1, Robots: 0.8 } },
  { words: ["music", "musical", "band", "idol", "idols", "singing", "concert"], labels: { Music: 1, Band: 0.8, Idol: 0.8 } },
  { words: ["school", "highschool", "classroom", "students"], labels: { School: 1, "School Club": 0.6 } },
  { words: ["historical", "history", "samurai", "feudal", "edo"], labels: { Historical: 1, Samurai: 0.8 } },
  { words: ["cooking", "food", "foodie", "cuisine", "chef"], labels: { Food: 1, Cooking: 1 } },
  { words: ["supernatural", "ghost", "ghosts", "spirits", "demons", "demon", "yokai"],
    labels: { Supernatural: 1, Demons: 0.7, Ghost: 0.7, Youkai: 0.7 } },
  { words: ["vampire", "vampires"], labels: { Vampire: 1 } },
  { words: ["zombie", "zombies", "undead"], labels: { Zombie: 1 } },
  { words: ["military", "war", "soldiers", "army"], labels: { Military: 1, War: 1 } },
  { words: ["gore", "gory", "bloody", "violent", "brutal"], labels: { Gore: 1, Violence: 0.7 } },
  { words: ["villainess", "otome"], labels: { Villainess: 1 } },
  { words: ["harem"], labels: { "Male Harem": 1, "Female Harem": 1 } },
  { words: ["yuri"], labels: { Yuri: 1, "Girls' Love": 1 } },
  { words: ["yaoi", "bl"], labels: { "Boys' Love": 1 } },
  { words: ["slice", "everyday"], labels: { "Slice of Life": 1 } },
  { words: ["supervillain", "superhero", "superheroes", "powers"], labels: { "Super Power": 1, Superhero: 1 } },
  { words: ["timetravel", "loop", "loops"], labels: { "Time Manipulation": 1, "Time Loop": 1 } },
  { words: ["shounen", "shonen"], labels: { Shounen: 1 } },
  { words: ["shoujo", "shojo"], labels: { Shoujo: 1 } },
  { words: ["seinen"], labels: { Seinen: 1 } },
  { words: ["josei"], labels: { Josei: 1 } },
];

const PHRASES = [
  [/\bslice of life\b/g, " slice "],
  [/\bsci[\s-]fi\b/g, " scifi "],
  [/\btime travel(?:ing)?\b/g, " timetravel "],
  [/\bcoming of age\b/g, " comingofage "],
  [/\bboys'? love\b/g, " bl "],
  [/\bhigh school\b/g, " highschool "],
  [/\bmind[\s-]?(?:bending|blowing|games?)\b/g, " mindbending "],
  [/\brom[\s-]?coms?\b/g, " romance comedy "],
];

const PLACE_GROUPS = [
  ["japan", "japanese", "tokyo", "kyoto", "osaka", "akihabara", "shibuya"],
  ["germany", "german", "germans", "berlin", "munich", "deutschland", "prussia", "prussian"],
  ["france", "french", "paris", "parisian"],
  ["italy", "italian", "rome", "roman", "venice", "florence", "sicily"],
  ["england", "english", "britain", "british", "london", "uk"],
  ["scotland", "scottish"],
  ["ireland", "irish"],
  ["america", "american", "americans", "usa", "york", "california", "texas", "chicago"],
  ["russia", "russian", "soviet", "moscow"],
  ["china", "chinese", "beijing", "shanghai"],
  ["korea", "korean", "seoul"],
  ["spain", "spanish", "madrid"],
  ["greece", "greek"],
  ["egypt", "egyptian"],
  ["india", "indian"],
  ["mexico", "mexican"],
  ["europe", "european"],
  ["africa", "african"],
  ["scandinavia", "scandinavian", "norway", "norse", "sweden", "swedish", "denmark", "danish", "viking", "vikings"],
  ["hokkaido"],
  ["okinawa"],
];
const PLACES = new Map();
for (const group of PLACE_GROUPS) for (const word of group) PLACES.set(word, group);

export function placeVariants(word) {
  return PLACES.get(word) || null;
}

const SETTING = /\b(?:(?:is\s+|are\s+|that's\s+|thats\s+)?set|takes?\s+place|taking\s+place|took\s+place|located|based|happens?|happening|happened)\s+(?:in|on|at|during|around)\s+(.+?)(?=\s+(?:and|but|with|where|who|that|about|or|like)\b|[,.!?]|$)/g;
const BUT_IN = /\bbut\s+(?:(?:it's|its|it\s+is)\s+)?(?:set\s+)?(?:in|on)\s+(.+?)(?=\s+(?:and|but|with|where|who|that|about|or)\b|[,.!?]|$)/g;
const SETTING_SKIP = new Set(["a", "an", "the", "some", "modern", "modern-day", "day", "world", "country", "city", "town", "place", "era", "time", "times", "period", "setting",
  "east", "west", "north", "south", "eastern", "western", "northern", "southern", "central"]);

function settingWords(phrase) {
  return phrase.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}'\s-]/gu, " ").split(/\s+/)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

const NEGATION = /\b(?:without|no|not|non|minus|except|skip|avoid|avoiding|zero|isn't|aren't|nothing)[\s-]+(?:(?:any|a|an|the|too|much|more|real|heavy|big)\s+)*([a-z'-]+)/g;

const BY_WORD = new Map();
for (const concept of CONCEPTS) for (const word of concept.words) BY_WORD.set(word, concept);
BY_WORD.set("comingofage", { words: ["comingofage"], labels: { "Coming of Age": 1 } });

const FILTER_WORDS = new Set("movie movies film films short quick long lengthy unwatched unseen new recent latest old older classic classics retro popular best top acclaimed underrated hidden gem gems rewatch".split(" "));

function decadeRange(text) {
  const decade = /\b(?:the\s+)?(?:19|20)?(\d)0'?s\b/.exec(text);
  if (decade) {
    const digit = Number(decade[1]);
    const start = digit >= 6 ? 1900 + digit * 10 : 2000 + digit * 10;
    return { yearFrom: start, yearTo: start + 9 };
  }
  const year = /\b(19[6-9]\d|20[0-4]\d)\b/.exec(text);
  if (year) return { yearFrom: Number(year[1]), yearTo: Number(year[1]) };
  return null;
}

export function parseQuery(input, { now = new Date() } = {}) {
  const raw = String(input || "").trim();
  let text = ` ${raw.toLowerCase().replace(/[’`]/g, "'")} `;
  let similarTo = "";
  const like = /\b(?:like|similar to|such as|reminds? me of|in the vein of)\s+(.+?)(?=\s+(?:but|and|with|except|only)\b|[,.!?]|$)/.exec(text.trim());
  if (like && !/^(a|an|the|this|that|something|anything)$/.test(like[1].trim())) {
    similarTo = like[1].trim().replace(/^(?:the\s+)?(?:anime|show|series)\s+/, "");
    text = text.replace(like[0], " ");
  }
  for (const [pattern, replacement] of PHRASES) text = text.replace(pattern, replacement);
  const setting = [];
  const takeSetting = (match, phrase) => {
    const kept = [];
    for (const word of settingWords(phrase)) {
      if (BY_WORD.has(word) || FILTER_WORDS.has(word)) kept.push(word);
      else if (/\d/.test(word)) {
        if (/^(1[89]|20)\d\d$/.test(word) && !setting.includes(word)) setting.push(word);
      } else if (!STOP.has(word) && !SETTING_SKIP.has(word) && word.length >= 2 && !setting.includes(word)) setting.push(word);
    }
    return ` ${kept.join(" ")} `;
  };
  text = text.replace(SETTING, takeSetting).replace(BUT_IN, takeSetting);
  const without = [];
  text = text.replace(NEGATION, (match, word) => {
    const concept = BY_WORD.get(word);
    if (!concept) return match;
    for (const [label, weight] of Object.entries(concept.labels)) if (weight >= 0.9 && !without.includes(label)) without.push(label);
    return " ";
  });

  const filters = { format: null, maxEpisodes: null, minEpisodes: null, unwatched: false, yearFrom: null, yearTo: null, quality: false, rewatch: false };
  if (/\b(movies?|films?)\b/.test(text)) filters.format = "MOVIE";
  if (/\b(short|quick|one[- ]cour|12 episodes?|13 episodes?)\b/.test(text)) filters.maxEpisodes = 13;
  if (/\b(long|lengthy|long[- ]running|100\+? episodes?)\b/.test(text)) filters.minEpisodes = 24;
  if (/\b(unwatched|unseen|not (?:seen|watched)|haven'?t (?:seen|watched)|have not (?:seen|watched)|new to me|never (?:seen|watched))\b/.test(text)) filters.unwatched = true;
  if (/\b(rewatch|again)\b/.test(text)) filters.rewatch = true;
  const range = decadeRange(text);
  if (range) Object.assign(filters, range);
  else if (/\b(old|older|classic|classics|retro)\b/.test(text)) filters.yearTo = 2005;
  else if (/\b(new|recent|latest|this year|current)\b/.test(text) && !filters.unwatched) filters.yearFrom = now.getFullYear() - 2;
  if (/\b(popular|best|top|acclaimed|highly rated|masterpiece|must[- ]watch)\b/.test(text)) filters.quality = true;

  const tokens = text.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}'+\s-]/gu, " ").split(/\s+/).map((word) => word.replace(/^'+|'+$/g, "")).filter(Boolean);
  const concepts = [];
  const seenConcepts = new Set();
  const terms = [];
  for (const token of tokens) {
    const concept = BY_WORD.get(token);
    if (concept) {
      if (!seenConcepts.has(concept)) {
        seenConcepts.add(concept);
        concepts.push({ word: token, labels: concept.labels, ...(concept.avoid ? { avoid: concept.avoid } : {}) });
      }
      continue;
    }
    if (STOP.has(token) || FILTER_WORDS.has(token) || /^\d+$/.test(token) || token.length < 2) continue;
    if (/^(seen|unwatched|haven't|haven|watched|episodes?|cour|decade|era|year|years|90s|80s|00s|10s)$/.test(token)) continue;
    if (PLACES.has(token)) {
      if (!setting.includes(token)) setting.push(token);
      continue;
    }
    terms.push(token);
  }
  return { raw, terms, concepts, filters, similarTo, without, setting };
}

export function hasIntent(parsed) {
  const f = parsed?.filters || {};
  return Boolean(parsed?.concepts?.length || parsed?.similarTo || parsed?.setting?.length || f.format || f.maxEpisodes || f.minEpisodes || f.unwatched || f.yearFrom || f.yearTo || f.quality);
}
