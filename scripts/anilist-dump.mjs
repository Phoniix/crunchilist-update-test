import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const OUT = path.resolve(arg("out") || "data/anilist-anime.json");
const LIMIT = Number(arg("limit")) || 100;
const PER_PAGE = 50;
const GAP_MS = 2100;

const QUERY = `query ($page: Int) {
  Page(page: $page, perPage: ${PER_PAGE}) {
    pageInfo { hasNextPage }
    media(type: ANIME, sort: POPULARITY_DESC) {
      id idMal
      title { romaji english native userPreferred }
      synonyms
      format status episodes duration
      season seasonYear
      startDate { year month day }
      endDate { year month day }
      source countryOfOrigin isAdult isLicensed
      description(asHtml: false)
      genres
      tags { name rank category isMediaSpoiler isGeneralSpoiler isAdult }
      averageScore meanScore popularity favourites trending
      studios { edges { isMain node { id name isAnimationStudio } } }
      relations { edges { relationType node { id type format title { romaji english } } } }
      externalLinks { site url type language }
      streamingEpisodes { title url site }
      nextAiringEpisode { episode airingAt }
      coverImage { extraLarge large color }
      bannerImage
      trailer { id site }
      siteUrl
      hashtag
      updatedAt
    }
  }
}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(page) {
  for (let attempt = 1; ; attempt += 1) {
    let response;
    try {
      response = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: QUERY, variables: { page } })
      });
    } catch (error) {
      if (attempt >= 5) throw error;
      await sleep(5000 * attempt);
      continue;
    }
    if (response.status === 429) {
      const wait = Number(response.headers.get("retry-after")) || 60;
      console.log(`  rate limited, waiting ${wait}s`);
      await sleep(wait * 1000 + 500);
      continue;
    }
    if (!response.ok) {
      if (attempt >= 5) throw new Error(`AniList ${response.status}: ${await response.text()}`);
      await sleep(5000 * attempt);
      continue;
    }
    const json = await response.json();
    if (json.errors?.length) throw new Error(json.errors.map((error) => error.message).join("; "));
    return json.data.Page;
  }
}

async function save(anime, done) {
  await mkdir(path.dirname(OUT), { recursive: true });
  const payload = { fetchedAt: new Date().toISOString(), complete: done, count: anime.length, anime };
  await writeFile(OUT, JSON.stringify(payload, null, 2));
}

async function main() {
  const anime = [];
  for (let pages = 1; anime.length < LIMIT; pages += 1) {
    const page = await fetchPage(pages);
    anime.push(...page.media.slice(0, LIMIT - anime.length));
    console.log(`page ${pages}: ${anime.length} anime`);
    if (!page.pageInfo.hasNextPage || !page.media.length) break;
    if (pages % 20 === 0) await save(anime, false);
    if (anime.length < LIMIT) await sleep(GAP_MS);
  }
  await save(anime, true);
  console.log(`Saved ${anime.length} anime to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
