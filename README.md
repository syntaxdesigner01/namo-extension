# Namo AI Browser Extension

Namo AI is a voice-first browser companion built as a Chrome extension. It provides natural language commands for browsing, media control, news, and page reading, with a focus on low-friction, hands-free workflows.

## Highlights

- Voice assistant with robust intent parsing and conflict-safe scoring.
- Spotify playback: search and play, pause/resume, next/previous, replay.
- News flow with local/international scope, topic filtering, and full-article reading.
- Page reader that extracts and speaks main content.
- Practical utilities: open sites, search web, images, YouTube, time/date, weather, and quick math.

## What It Can Do

### Voice & Conversation
- Natural responses with a consistent voice profile.
- Automatic listen-state control to prevent hot-mic overlap while speaking.

### Music (Spotify Web Player)
- “Play music” or “play [song/artist]” opens Spotify and starts playback.
- Media controls: pause, resume, stop, next, previous, replay.

### News
- Ask for local or international news.
- Filter by topics (tech, finance, sports, health, science, entertainment, AI, crypto, etc.).
- Reads headlines only by default.
- “Read headline 2” reads summary and asks if you want the full article.
- “Read full article 3” opens and reads the full page automatically.
- “Next headline” / “Previous headline” / “Read the last headline.”

### Web + Utilities
- Open websites: “open github.”
- Search the web: “search for rest api best practices.”
- Image search: “find images of sunsets.”
- YouTube search: “play lo-fi beats on YouTube.”
- Weather: “weather in Lagos.”
- Time/date: natural, humanized time phrasing.
- Math: “what is 24 times 6.”

## Architecture

- `src/background.ts` is the core logic: intent detection, actions, and TTS.
- `public/manifest.json` defines permissions and host access.
- Vite builds the extension bundle.

## Setup

1. Install dependencies: `npm install`
2. Build for development: `npm run build`
3. Load unpacked extension in Chrome:
   - Go to `chrome://extensions`
   - Enable Developer mode
   - Load the `dist/` folder

## Permissions

The extension requests:
- Tabs, scripting, TTS, activeTab for voice actions and automation.
- Host permissions for Spotify and external APIs used by news/weather/lookup.

## Test Plan

Below is a structured manual test plan with expected results by category.

### 1) Voice & Listening Control
- Command: “hello”
  - Expected: speaks greeting; popup stops listening during speech; resumes after speech ends.
- Command: long response (news summary)
  - Expected: no re-listen between chunks; listening resumes at end.

### 2) Music: Spotify Search & Play
- Command: “play music”
  - Expected: opens Spotify search and starts playback.
- Command: “play [song name]”
  - Expected: starts playback on top result.

### 3) Music: Playback Controls
- Command: “pause music”
  - Expected: Spotify pauses.
- Command: “resume music”
  - Expected: Spotify plays.
- Command: “next song”
  - Expected: Spotify skips.
- Command: “previous song”
  - Expected: Spotify goes back.
- Command: “replay song”
  - Expected: restarts current track.

### 4) News: Fetch and Headlines
- Command: “news”
  - Expected: asks “local or international.”
- Command: “local tech news”
  - Expected: reads top 6 headlines (titles only).

### 5) News: Read Specific
- Command: “read headline 2”
  - Expected: reads summary for #2, asks if full article should be read.
- Command: “yes”
  - Expected: opens and reads full article.
- Command: “no”
  - Expected: stops after summary.

### 6) News: Navigation
- Command: “read the last headline”
  - Expected: reads last headline summary.
- Command: “next headline”
  - Expected: reads next headline summary.
- Command: “previous headline”
  - Expected: reads previous headline summary.

### 7) Page Reader
- Command: “read this page”
  - Expected: extracts main content and reads it aloud.

### 8) Web & Utilities
- Command: “open example”
  - Expected: opens `example.com`.
- Command: “search for [topic]”
  - Expected: opens Google search.
- Command: “images of cats”
  - Expected: opens Google Images.
- Command: “weather in Nairobi”
  - Expected: speaks summary; opens weather search.
- Command: “what time is it”
  - Expected: humanized response.

## Test Results (Example Template)

Use this section to document test runs.

- Date: 2026-02-04
- Build: `npm run build`
- Browser: Chrome

Results:
- Voice & Listening Control: Pass
- Spotify Search & Play: Pass
- Spotify Controls: Pass
- News Fetch: Pass
- News Read Specific: Pass
- Page Reader: Pass
- Web Utilities: Pass

## Roadmap Ideas

- Offline/queued commands
- Per-source news filters
- Additional music providers (Apple Music, YouTube Music)
- Contextual follow-ups (“read more”, “next paragraph”)

## License

MIT
