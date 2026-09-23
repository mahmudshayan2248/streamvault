const express = require("express");
const path = require("path");

const app = express();

const ROOT = __dirname;
const POSTER_CACHE_ROOT = process.env.STREAMVAULT_POSTER_CACHE_DIR || "/home/u655076875/streamvault-persistent/posters";

app.disable("x-powered-by");
app.use("/cache/posters", express.static(POSTER_CACHE_ROOT, {
  index: false,
  fallthrough: false,
  setHeaders(res) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
}));

app.use(express.static(ROOT, {
  index: "index.html",
  setHeaders(res, filename) {
    const basename = path.basename(filename);
    if (/^(?:index\.html|runtime-config\.js|sw(?:-[^/]+)?\.js|home-snapshot-[^/]+\.js|manifest\.webmanifest)$/i.test(basename)) {
      res.setHeader("Cache-Control", "no-cache, no-store, max-age=0, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    } else if (/(?:home-feed|boot-search-index|channels|catalog|home-snapshot-manifest)\.json$/i.test(basename)) {
      res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
    } else if (/[.-](?=[a-f0-9]{8,64}[.-])(?=[a-f0-9]*[a-f])[a-f0-9]{8,64}(?:[.-][^./]+)*\.(?:css|js|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i.test(basename)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (/\.(?:css|js)$/i.test(basename)) {
      res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
    } else if (/\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i.test(basename)) {
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    }
  }
}));

app.use((req, res) => {
  if (/^\/(?:api|playback|stream|proxy|hls|live|live-relay(?:-v2)?|audio|subtitle|subtitles|download)(?:\/|$)/i.test(req.path)
    || /\.(?:css|js|json|webmanifest|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|m3u8|ts|m4s|mp4|m4v|mkv|webm|mov|avi|mp3|m4a|aac|flac|wav|vtt)$/i.test(req.path)) {
    return res.status(404).type('text/plain').send('Not found');
  }
  res.setHeader("Cache-Control", "no-cache, no-store, max-age=0, must-revalidate");
  res.sendFile(path.join(ROOT, "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Frontend running on ${PORT}`);
});
