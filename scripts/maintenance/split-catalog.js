// split-catalog.js
// StreamVault massive catalog splitter + homepage feed generator
// Usage:
// node split-catalog.js catalog.ndjson

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { parseMediaIdentity } = require("../../lib/media-identity");

const INPUT =
  process.argv[2] || "catalog.ndjson";

const OUTPUT_DIR =
  path.join(__dirname, "catalog");

const HOME_DIR =
  path.join(OUTPUT_DIR, "home");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(HOME_DIR, { recursive: true });

const movieStream = fs.createWriteStream(
  path.join(OUTPUT_DIR, "movies.ndjson")
);

const seriesStream = fs.createWriteStream(
  path.join(OUTPUT_DIR, "series.ndjson")
);

const downloadsStream = fs.createWriteStream(
  path.join(OUTPUT_DIR, "downloads.ndjson")
);

// homepage feeds
const feeds = {
  trending: [],
  netflix: [],
  marvel: [],
  dc: [],
  disney: [],
  hbo: [],
  apple: [],
  anime: [],
  korean: [],
  indian: [],
  horror: [],
  scifi: [],
  topRated: [],
  newItems: []
};

const counters = {
  movies: 0,
  series: 0,
  episodes: 0,
  episodeCandidates: 0,
  downloads: 0,
  invalid: 0
};

function safeText(v) {
  return String(v || "").toLowerCase();
}

function addFeed(feed, item, limit = 200) {
  if (feed.length >= limit) return;

  feed.push({
    id: item.id || item.tmdbId || null,
    title: item.title || item.name || "",
    poster: item.poster || "",
    backdrop: item.backdrop || "",
    year: item.year || "",
    rating: item.rating || item.vote_average || 0,
    type: item.type || ""
  });
}

function detectFeeds(item) {
  const text = [
    item.title,
    item.name,
    item.overview,
    item.genre,
    item.genres,
    item.network,
    item.studio,
    item.production,
    item.productionCompany
  ]
    .join(" ")
    .toLowerCase();

  if (text.includes("netflix"))
    addFeed(feeds.netflix, item);

  if (
    text.includes("marvel")
  )
    addFeed(feeds.marvel, item);

  if (
    text.includes("dc") ||
    text.includes("batman") ||
    text.includes("superman")
  )
    addFeed(feeds.dc, item);

  if (text.includes("disney"))
    addFeed(feeds.disney, item);

  if (text.includes("hbo"))
    addFeed(feeds.hbo, item);

  if (
    text.includes("apple tv") ||
    text.includes("appletv")
  )
    addFeed(feeds.apple, item);

  if (
    text.includes("anime")
  )
    addFeed(feeds.anime, item);

  if (
    text.includes("korean") ||
    text.includes("k-drama")
  )
    addFeed(feeds.korean, item);

  if (
    text.includes("india") ||
    text.includes("bollywood") ||
    text.includes("hindi")
  )
    addFeed(feeds.indian, item);

  if (
    text.includes("horror")
  )
    addFeed(feeds.horror, item);

  if (
    text.includes("sci-fi") ||
    text.includes("science fiction") ||
    text.includes("cyberpunk")
  )
    addFeed(feeds.scifi, item);

  const rating =
    Number(item.rating || item.vote_average || 0);

  if (rating >= 8)
    addFeed(feeds.topRated, item);

  addFeed(feeds.newItems, item);

  // pseudo trending
  if (
    Math.random() > 0.995
  )
    addFeed(feeds.trending, item);
}

function isSeries(item) {
  return (
    item.seasons ||
    item.episodes ||
    item.type === "series" ||
    item.type === "tv"
  );
}

function episodeIdentity(item) {
  return parseMediaIdentity({
    title: item.title || item.name || item.filename || item.file || "",
    filename: item.filename || item.file || "",
    streamUrl: item.streamUrl || item.url || item.source || "",
    source_path: item.source_path || item.sourcePath || item.path || item.streamUrl || item.url || item.source || "",
  });
}

function isEpisodeRecord(item, identity = episodeIdentity(item)) {
  return identity.kind === "episode" &&
    identity.seriesKey &&
    identity.season !== null &&
    (identity.confidence === "high" || identity.confidence === "medium");
}

function toEpisodeRecord(item, identity) {
  return {
    ...item,
    type: "episode",
    mediaType: "episode",
    seriesName: identity.seriesName,
    series_key: identity.seriesKey,
    season: identity.season,
    episode: identity.episode,
    epTitle: identity.episodeTitle || `Episode ${identity.episode}`,
    title: item.title || item.name || identity.episodeTitle || `Episode ${identity.episode}`,
    name: item.name || item.title || identity.episodeTitle || `Episode ${identity.episode}`,
    year: item.year || identity.year || "",
    repairConfidence: identity.confidence,
    repairReason: identity.reason,
    sourceFingerprint: identity.sourceFingerprint,
  };
}

function isDownload(item) {
  const ext = safeText(
    path.extname(item.file || item.filename || "")
  );

  return [
    ".exe",
    ".msi",
    ".apk",
    ".xapk",
    ".zip",
    ".rar",
    ".7z",
    ".iso",
    ".img",
    ".dmg",
    ".pkg"
  ].includes(ext);
}

async function start() {
  console.log("\n====================");
  console.log("STREAMVAULT SPLITTER");
  console.log("====================\n");

  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT),
    crlfDelay: Infinity
  });

  let processed = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    let item;

    try {
      item = JSON.parse(line);
    } catch {
      counters.invalid++;
      continue;
    }

    processed++;

    if (processed % 5000 === 0) {
      process.stdout.write(
        `\r📦 Processed: ${processed.toLocaleString()}`
      );
    }

    if (isDownload(item)) {
      downloadsStream.write(
        JSON.stringify(item) + "\n"
      );

      counters.downloads++;
      continue;
    }

    const identity = episodeIdentity(item);
    if (isSeries(item)) {
      detectFeeds(item);
      seriesStream.write(
        JSON.stringify(item) + "\n"
      );

      counters.series++;
    } else if (isEpisodeRecord(item, identity)) {
      const episode = toEpisodeRecord(item, identity);
      seriesStream.write(
        JSON.stringify(episode) + "\n"
      );
      counters.episodes++;
      if (identity.confidence === "medium") counters.episodeCandidates++;
    } else {
      detectFeeds(item);
      movieStream.write(
        JSON.stringify(item) + "\n"
      );

      counters.movies++;
    }
  }

  movieStream.end();
  seriesStream.end();
  downloadsStream.end();

  for (const [name, data] of Object.entries(feeds)) {
    fs.writeFileSync(
      path.join(HOME_DIR, `${name}.json`),
      JSON.stringify(data)
    );
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "stats.json"),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      ...counters
    }, null, 2)
  );

  console.log("\n\n====================");
  console.log("SPLIT FINISHED");
  console.log("====================");
  console.log(`🎬 Movies    : ${counters.movies}`);
  console.log(`📺 Series    : ${counters.series}`);
  console.log(`🎞 Episodes  : ${counters.episodes}`);
  console.log(`⚠️ Candidates: ${counters.episodeCandidates}`);
  console.log(`💾 Downloads : ${counters.downloads}`);
  console.log(`❌ Invalid   : ${counters.invalid}`);
  console.log("====================\n");
}

start().catch(console.error);
