# Promo video

A 60-second product video for TraceIQ, built from code: real dashboard screens, an HTML timeline rendered frame by frame, and original synthesized music (no voiceover, nothing to license).

| Time | Scene |
| --- | --- |
| 0–5 s | Intro: "Introducing TraceIQ for your web app / mobile app / API / whole team" |
| 5–10 s | Overview dashboard |
| 10–15 s | `npx traceiq-cli` setup (output copied from a real run) |
| 15–20 s | SDK snippet |
| 20–25 s | Web analytics |
| 25–30 s | Funnel |
| 30–35 s | Retention |
| 35–40 s | Error tracking |
| 40–45 s | Logs and API performance |
| 45–50 s | SDKs for every platform |
| 50–55 s | Open source, self-host in one command |
| 55–60 s | Logo and traceiq.run |

## Files

- `seed-demo.mjs` fills a local instance with 30 days of data for a fictional SaaS called Acme.
- `capture.mjs` screenshots the real dashboard pages into `public/shots/`.
- `promo.html` is the video itself. Open `promo.html#preview` in a browser to watch it play.
- `music.py` writes the soundtrack to `out/music.wav`. Scene cuts are every 5 s, which is every two bars at 96 BPM, so cuts land on downbeats.
- `render.mjs` renders `promo.html` at 30 fps and muxes the music into `out/traceiq-promo.mp4`.

There are two versions from the same timeline: dark (screens in `public/shots/`) and light (`public/shots-light/`, chosen with `promo.html?theme=light`).

## Rendering

Needs Node 20+, Playwright with Chromium, ffmpeg, and Python 3 with numpy.

```bash
python3 video/music.py
node video/render.mjs                    # -> video/out/traceiq-promo.mp4
node video/render.mjs --theme light      # -> video/out/traceiq-promo-light.mp4
node video/render.mjs --stills 7.5,27    # check single frames
```

## Refreshing the screenshots

The screens in `public/shots/` come from a local instance in single-user mode. To retake them after a UI change:

1. Start the local stack (`docker compose -f compose.local.yml up -d --build`), or run the API with `AUTH_MODE=local` and the dashboard with `NEXT_PUBLIC_AUTH_MODE=local`. Set `TRUST_PROXY_HEADERS=true` on the API so the seeded visitors get countries.
2. On an empty database, open the dashboard once so the local project is created, then optionally rename it:
   `UPDATE projects SET name = 'Acme Web' WHERE id = 'proj_local'; UPDATE organizations SET name = 'Acme' WHERE id = 'org_local';`
3. `node video/seed-demo.mjs`
4. `node video/capture.mjs && node video/capture.mjs --theme light` within a few minutes, while the seeded live visitors still count as online.
