import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseQuery } from "../lib/query.js";
import { buildIndex, searchIndex } from "../lib/search-index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(readFileSync(join(root, "fixtures/catalog-snapshot.json"), "utf8"));
const cases = JSON.parse(readFileSync(join(root, "scripts/eval-cases.json"), "utf8"));
const baselinePath = join(root, "fixtures/eval-baseline.json");
const update = process.argv.includes("--update");
const verbose = process.argv.includes("--verbose");
const SHOWN = 12;

const shows = snapshot.shows;
const labelsOf = (show) => [...(show.genres || []), ...(show.tags || []), ...(show.hiddenTags || [])];

const index = buildIndex(shows);

function rank(query) {
  return searchIndex(index, parseQuery(query), { limit: SHOWN }).results.map((entry) => entry.doc.item);
}

function fits(show, entry) {
  const labels = labelsOf(show).map((label) => label.toLowerCase());
  if (entry.labels && !entry.labels.some((label) => labels.includes(label.toLowerCase()))) return false;
  if (entry.format && (show.format || (show.type === "movie" ? "MOVIE" : "")) !== entry.format) return false;
  if (entry.maxEpisodes && !(show.episodes > 0 && show.episodes <= entry.maxEpisodes)) return false;
  return true;
}

function grade(entry) {
  const top = rank(entry.query);
  const titles = top.map((show) => show.title);
  if (entry.none) {
    const score = titles.length ? 0 : 1;
    return { query: entry.query, score, detail: score ? "nothing, as expected" : `showed ${titles.length} results`, titles };
  }
  if (entry.top) {
    const score = titles[0] === entry.top ? 1 : 0;
    return { query: entry.query, score, detail: score ? "first" : `first was ${titles[0] || "nothing"}`, titles };
  }
  const precision = top.length ? top.filter((show) => fits(show, entry)).length / SHOWN : 0;
  const good = entry.good || [];
  const found = good.filter((title) => titles.includes(title));
  const recall = good.length ? found.length / Math.min(good.length, SHOWN) : 1;
  const bad = (entry.bad || []).filter((title) => titles.includes(title));
  const score = Math.max(0, 0.5 * precision + 0.5 * recall - 0.25 * bad.length);
  return {
    query: entry.query,
    score,
    detail: `fit ${Math.round(precision * 100)}%, must-haves ${found.length}/${good.length}${bad.length ? `, bad: ${bad.join(", ")}` : ""}`,
    titles,
  };
}

const average = (rows) => (rows.length ? rows.reduce((sum, row) => sum + row.score, 0) / rows.length : 0);
const results = cases.map((entry) => ({ ...grade(entry), persona: entry.persona || "core" }));
const overall = average(results);
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;
const before = new Map((baseline?.results || []).map((row) => [row.query, row.score]));

let group = "";
for (const row of results) {
  if (row.persona !== group) {
    group = row.persona;
    console.log(`\n[${group}]`);
  }
  const was = before.get(row.query);
  const change = was == null ? " (new)" : row.score > was + 0.005 ? " (better)" : row.score < was - 0.005 ? " (worse)" : "";
  console.log(`${row.score.toFixed(2)}  ${row.query}: ${row.detail}${change}`);
  if (verbose) console.log(`      ${row.titles.join(" | ")}`);
}

const personas = [...new Set(results.map((row) => row.persona))];
console.log(`\n${personas.map((name) => `${name} ${average(results.filter((row) => row.persona === name)).toFixed(2)}`).join(" · ")}`);
const known = results.filter((row) => before.has(row.query));
const knownNow = average(known);
const knownBefore = known.length ? known.reduce((sum, row) => sum + before.get(row.query), 0) / known.length : 0;
console.log(`overall ${overall.toFixed(3)}${baseline ? ` (baseline ${baseline.overall.toFixed(3)}; on the same queries ${knownNow.toFixed(3)} vs ${knownBefore.toFixed(3)})` : ""}`);

if (update || !baseline) {
  writeFileSync(baselinePath, `${JSON.stringify({ overall, results: results.map(({ query, score }) => ({ query, score })) }, null, 2)}\n`);
  console.log("Baseline saved.");
} else if (knownNow < knownBefore - 0.005) {
  console.log("Search quality dropped below the baseline.");
  process.exit(1);
}
