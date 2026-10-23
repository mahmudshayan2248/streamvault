#!/usr/bin/env python3
"""Build a guarded, offline candidate from exact Mac mini backend bytes."""
import argparse
import hashlib
from pathlib import Path

DEPLOYED_SHA256 = "920b8058eecf9993c3ab18124505f891cad4d355236f5ddcd458be54d357dbd4"


def replace_once(text, old, new):
    count = text.count(old)
    if count != 1:
        raise ValueError(f"Expected one backend anchor, found {count}: {old[:75]!r}")
    return text.replace(old, new, 1)


def build(source):
    if hashlib.sha256(source).hexdigest() != DEPLOYED_SHA256:
        raise ValueError("Backend byte hash differs from the audited running candidate")
    text = source.decode("utf-8")
    text = replace_once(text,
        "const { spawn } = require('child_process');",
        "const { spawn } = require('child_process');\nconst { createAdaptiveCapability } = require('./adaptive-capability');")
    text = replace_once(text,
        "  fs.mkdirSync(subtitleRoot, { recursive: true });",
        """  fs.mkdirSync(subtitleRoot, { recursive: true });
  // Disabled until the operator supplies an exact origin and completed packages.
  const adaptiveCapability = process.env.SV_ADAPTIVE_HLS_ENABLED === '1'
    ? createAdaptiveCapability({
        cacheDir: process.env.SV_ADAPTIVE_HLS_CACHE_DIR || path.join(cacheDir, 'adaptive'),
        allowedOrigin: process.env.SV_ADAPTIVE_HLS_ORIGIN,
      })
    : null;
  if (adaptiveCapability) app.get('/api/adaptive-hls/:key/*', (req, res) => adaptiveCapability.serve(req, res));""")
    text = replace_once(text,
        "    const decision = playbackDecision(info, source.input, source.filename, caps);",
        """    const decision = playbackDecision(info, source.input, source.filename, caps);
    const adaptive = req.query.adaptive === '0' ? null : adaptiveCapability?.select(source, info);
    const mode = adaptive ? 'hls' : decision.mode;""")
    text = replace_once(text,
        "    const windowStart = decision.mode === 'hls'\n      ? await probeSeekOrigin(source, info, inputStart)\n      : 0;",
        """    const windowStart = adaptive ? 0 : decision.mode === 'hls'
      ? await probeSeekOrigin(source, info, inputStart)
      : 0;
    const subtitleStart = adaptive ? 0 : inputStart;""")
    text = replace_once(text,
        "    if (decision.mode === 'hls') {\n      session = await sessionFor(source, info, decision, windowStart, inputStart);\n      hlsUrl = `/api/playback-hls/${session.key}/master.m3u8`;\n    }",
        """    if (adaptive) hlsUrl = adaptive.hlsUrl;
    else if (decision.mode === 'hls') {
      session = await sessionFor(source, info, decision, windowStart, inputStart);
      hlsUrl = `/api/playback-hls/${session.key}/master.m3u8`;
    }""")
    # Restrict changes to capabilityFor, preserving subtitle handlers elsewhere.
    start = text.index("  async function capabilityFor(req, source) {")
    end = text.index("  function jsonFailure(res, error) {", start)
    part = text[start:end]
    part = part.replace("decision.mode === 'hls' ? 'local' : 'global'", "mode === 'hls' ? 'local' : 'global'")
    part = part.replace("start=${inputStart}", "start=${subtitleStart}")
    part = part.replace("      mode: decision.mode,", "      mode,")
    part = part.replace("      strategy: decision.strategy,", "      strategy: adaptive ? 'offline-adaptive' : decision.strategy,")
    part = part.replace("      audioTracks: decision.audioTracks,", "      audioTracks: adaptive ? adaptive.metadata.audioTracks : decision.audioTracks,")
    part = part.replace("      directUrl: decision.mode === 'direct' ? directUrl : null,", "      directUrl: mode === 'direct' ? directUrl : null,")
    part = part.replace("      cacheKey: session?.key || null,", "      cacheKey: adaptive?.key || session?.key || null,")
    if part.count("mode === 'hls' ? 'local' : 'global'") != 2 or part.count("start=${subtitleStart}") != 4:
        raise ValueError("Subtitle capability anchors drifted")
    text = text[:start] + part + text[end:]
    start = text.index("  app.get('/api/playback/status',")
    end = text.index("  app.get('/api/playback/remote',", start)
    part = text[start:end]
    part = replace_once(part,
        "      })),\n      activeWorkers: activeWorkers.size,",
        """      })).concat(adaptiveCapability ? [...adaptiveCapability.cache.known.values()].map(item => ({
        key: item.metadata.key, state: 'complete', strategy: 'offline-adaptive',
        running: false, speed: 0, windowStart: 0, outTimeSeconds: item.metadata.duration,
      })) : []),
      adaptiveCache: adaptiveCapability?.cache.snapshot() || null,
      activeWorkers: activeWorkers.size,""")
    text = text[:start] + part + text[end:]
    text = replace_once(text,
        "    if (!session) return res.json({ ok: true, released: false });",
        """    if (!session && adaptiveCapability?.release(req.params.key))
      return res.json({ ok: true, released: false, state: 'complete' });
    if (!session) return res.json({ ok: true, released: false });""")
    return text.encode("utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        raise SystemExit("Output must be an isolated candidate path")
    result = build(args.input.read_bytes())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(result)
    print(f"candidate_sha256={hashlib.sha256(result).hexdigest()}")


if __name__ == "__main__":
    main()
