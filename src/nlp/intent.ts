import { hasPhrase } from "../utils/helpers.ts";
import type { IntentResult } from "../types.ts";

export const DEBUG_INTENT = true;

export function detectIntent(tokens: string[]): IntentResult {
    const scores: Record<string, number> = {
        GREET: 0,
        HOW_ARE_YOU: 0,
        IDENTITY: 0,
        AGE: 0,
        OPEN_SITE: 0,
        PLAY_MUSIC: 0,
        SEARCH_WEB: 0,
        PLAY_YOUTUBE: 0,
        GET_IMAGE: 0,
        MEDIA_CONTROL: 0,
        DEV_SEARCH: 0,
        TAB_CONTROL: 0,
        CLOSE_TAB: 0,
        TIME: 0,
        DATE: 0,
        HELP: 0,
        WEATHER: 0,
        UNKNOWN: 0,
        SEARCH_AND_READ: 0,
        NEWS: 0,
        CALCULATE: 0,
        READ_NEWS_ITEM: 0,
        OPEN_ALL_NEWS: 0,
        READ_PAGE: 0,
        READ_PAGE_RESTART: 0,
        READ_PAGE_CONTINUE: 0,
        READ_PAGE_NEXT: 0,
        READ_PAGE_PREV: 0,
        READ_PAGE_STOP: 0,
        READ_PAGE_LAST: 0,
        READ_PAGE_FINAL: 0,
        MUSIC_PAUSE: 0,
        MUSIC_RESUME: 0,
        MUSIC_STOP: 0,
        MUSIC_NEXT: 0,
        MUSIC_PREV: 0,
        MUSIC_REPLAY: 0,
        NEWS_OPEN_ITEM: 0,
        NEWS_READ_FULL: 0,
        NEWS_READ_ALL: 0,
        NEWS_STOP: 0,
        NEWS_LATEST: 0,
        NEWS_NEXT: 0,
        NEWS_PREV: 0,
        NEWS_READ_FULL_BODY: 0,
        NEWS_FULL_CHOICE: 0,
    };

    // ---- Greeting phrases (HIGH PRIORITY)
    if (
        hasPhrase(tokens, ["good", "morning"]) ||
        hasPhrase(tokens, ["good", "afternoon"]) ||
        hasPhrase(tokens, ["good", "evening"]) ||
        hasPhrase(tokens, ["whats", "up"]) ||
        tokens.includes("howdy") ||
        tokens.includes("yo")
    ) {
        scores.GREET += 5;
    }

    // ---- HOW ARE YOU (dual intent logic)
    const isHowAreYou =
        hasPhrase(tokens, ["how", "are", "you"]) ||
        hasPhrase(tokens, ["how", "you", "doing"]);

    if (isHowAreYou) {
        scores.HOW_ARE_YOU += 4;

        // Short versions behave like greetings
        if (tokens.length <= 4) {
            scores.GREET += 3;
        }
    }

    // ---- Identity
    if (
        hasPhrase(tokens, ["what", "your", "name"]) ||
        hasPhrase(tokens, ["who", "are", "you"])
    ) {
        scores.IDENTITY += 5;
    }

    // ---- Age
    if (
        hasPhrase(tokens, ["how", "old", "are", "you"]) ||
        tokens.includes("age")
    ) {
        scores.AGE += 5;
    }

    // ---- Close tab
    if (
        hasPhrase(tokens, ["close", "tab"]) ||
        hasPhrase(tokens, ["close", "this", "tab"])
    ) {
        scores.CLOSE_TAB += 5;
    }

    // ---- Search and Read
    if (
        hasPhrase(tokens, ["tell", "me", "about"]) ||
        hasPhrase(tokens, ["what", "is"]) ||
        hasPhrase(tokens, ["who", "is"]) ||
        hasPhrase(tokens, ["search", "and", "read"])
    ) {
        scores.SEARCH_AND_READ += 5;
    }

    // ---- News
    if (
        hasPhrase(tokens, ["latest", "news"]) ||
        hasPhrase(tokens, ["headlines"]) ||
        hasPhrase(tokens, ["what", "is", "happening"])
    ) {
        scores.NEWS += 5;
    }

    // ---- Math
    if (
        (hasPhrase(tokens, ["what", "is"]) || hasPhrase(tokens, ["how", "much"])) &&
        tokens.some(t => ["plus", "minus", "times", "divided", "multiply", "add", "subtract"].includes(t))
    ) {
        scores.CALCULATE += 5;
    }
    if (tokens.includes("calculate")) {
        scores.CALCULATE += 5;
    }

    // ---- Play music (explicit phrase, avoids "start" conflicting with reading)
    if (
        hasPhrase(tokens, ["play", "music"]) ||
        hasPhrase(tokens, ["play", "a", "song"]) ||
        hasPhrase(tokens, ["play", "song"]) ||
        hasPhrase(tokens, ["play", "some", "music"]) ||
        hasPhrase(tokens, ["play", "something"]) ||
        hasPhrase(tokens, ["put", "on", "music"]) ||
        hasPhrase(tokens, ["put", "on", "a", "song"]) ||
        hasPhrase(tokens, ["queue", "a", "song"]) ||
        hasPhrase(tokens, ["listen", "to", "music"]) ||
        hasPhrase(tokens, ["play", "tracks"])
    ) {
        scores.PLAY_MUSIC += 4;
    }

    const newsContext =
        tokens.includes("news") ||
        tokens.includes("headline") ||
        tokens.includes("headlines") ||
        tokens.includes("article") ||
        tokens.includes("articles") ||
        tokens.includes("story") ||
        tokens.includes("stories");

    // ---- Read News Item
    if (
        newsContext &&
        tokens.includes("read") &&
        tokens.some(t => ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six", "first", "second", "third", "fourth", "fifth", "sixth"].includes(t))
    ) {
        scores.READ_NEWS_ITEM += 6;
    }

    if (
        newsContext &&
        (tokens.includes("reread") || tokens.includes("repeat")) &&
        tokens.some(t => ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six", "first", "second", "third", "fourth", "fifth", "sixth"].includes(t))
    ) {
        scores.READ_NEWS_ITEM += 6;
    }

    // ---- Open All News
    if (
        hasPhrase(tokens, ["open", "all", "news"]) ||
        hasPhrase(tokens, ["show", "all", "news"])
    ) {
        scores.OPEN_ALL_NEWS += 5;
    }

    // ---- Open/Read Full News Item
    if (
        newsContext &&
        tokens.includes("open") &&
        tokens.some(t => ["headline", "headlines", "news", "article", "articles", "story", "stories"].includes(t)) &&
        tokens.some(t => ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six", "first", "second", "third", "fourth", "fifth", "sixth"].includes(t))
    ) {
        scores.NEWS_OPEN_ITEM += 6;
    }

    // Exact pattern: "read #" / "open #" for headlines
    if (
        newsContext &&
        tokens.length >= 2 &&
        tokens[0] === "read" &&
        ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six"].includes(tokens[1])
    ) {
        scores.READ_NEWS_ITEM += 7;
    }

    if (
        newsContext &&
        tokens.length >= 2 &&
        tokens[0] === "open" &&
        ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six"].includes(tokens[1])
    ) {
        scores.NEWS_OPEN_ITEM += 7;
    }

    if (
        newsContext &&
        tokens.length >= 3 &&
        tokens[0] === "read" &&
        ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six"].includes(tokens[1]) &&
        ["headline", "headlines", "news", "article", "articles", "story", "stories"].includes(tokens[2])
    ) {
        scores.READ_NEWS_ITEM += 8;
    }

    if (
        newsContext &&
        tokens.length >= 3 &&
        tokens[0] === "open" &&
        ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six"].includes(tokens[1]) &&
        ["headline", "headlines", "news", "article", "articles", "story", "stories"].includes(tokens[2])
    ) {
        scores.NEWS_OPEN_ITEM += 8;
    }

    if (
        newsContext &&
        tokens.length >= 3 &&
        tokens[0] === "read" &&
        ["headline", "headlines", "news", "article", "articles", "story", "stories"].includes(tokens[1]) &&
        ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six"].includes(tokens[2])
    ) {
        scores.READ_NEWS_ITEM += 8;
    }

    if (
        newsContext &&
        tokens.length >= 3 &&
        tokens[0] === "open" &&
        ["headline", "headlines", "news", "article", "articles", "story", "stories"].includes(tokens[1]) &&
        ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six"].includes(tokens[2])
    ) {
        scores.NEWS_OPEN_ITEM += 8;
    }

    if (
        newsContext &&
        tokens.includes("read") &&
        tokens.some(t => ["full", "article", "fullpage", "page"].includes(t))
    ) {
        scores.NEWS_READ_FULL += 6;
    }

    if (
        newsContext &&
        tokens.includes("read") &&
        tokens.some(t => ["full", "body", "story"].includes(t))
    ) {
        scores.NEWS_READ_FULL_BODY += 7;
    }

    if (
        newsContext &&
        (tokens.includes("summary") ||
            tokens.includes("full") ||
            tokens.includes("article") ||
            tokens.includes("story"))
    ) {
        scores.NEWS_FULL_CHOICE += 4;
    }

    if (
        newsContext &&
        tokens.includes("read") &&
        tokens.includes("all") &&
        tokens.some(t => ["headlines", "news"].includes(t))
    ) {
        scores.NEWS_READ_ALL += 5;
    }

    if (
        newsContext &&
        tokens.includes("stop") &&
        tokens.some(t => ["news", "headlines"].includes(t))
    ) {
        scores.NEWS_STOP += 6;
    }

    if (
        newsContext &&
        (hasPhrase(tokens, ["open", "latest"]) ||
            hasPhrase(tokens, ["open", "the", "latest"]) ||
            hasPhrase(tokens, ["read", "latest"]) ||
            hasPhrase(tokens, ["read", "the", "latest"]) ||
            hasPhrase(tokens, ["read", "last", "headline"]) ||
            hasPhrase(tokens, ["read", "the", "last", "headline"]) ||
            hasPhrase(tokens, ["open", "last", "headline"]) ||
            hasPhrase(tokens, ["open", "the", "last", "headline"]))
    ) {
        scores.NEWS_LATEST += 6;
    }

    if (
        newsContext &&
        (hasPhrase(tokens, ["read", "next", "headline"]) ||
            hasPhrase(tokens, ["read", "the", "next", "headline"]) ||
            hasPhrase(tokens, ["next", "headline"]) ||
            hasPhrase(tokens, ["open", "next", "headline"]) ||
            hasPhrase(tokens, ["read", "previous", "headline"]) ||
            hasPhrase(tokens, ["read", "the", "previous", "headline"]) ||
            hasPhrase(tokens, ["previous", "headline"]) ||
            hasPhrase(tokens, ["open", "previous", "headline"]))
    ) {
        if (tokens.includes("previous")) {
            scores.NEWS_PREV += 6;
        } else {
            scores.NEWS_NEXT += 6;
        }
    }

    // ---- Read Page
    if (
        hasPhrase(tokens, ["read", "this"]) ||
        hasPhrase(tokens, ["read", "page"]) ||
        hasPhrase(tokens, ["read", "this", "page"]) ||
        hasPhrase(tokens, ["read", "the", "page"]) ||
        hasPhrase(tokens, ["read", "this", "article"]) ||
        hasPhrase(tokens, ["read", "this", "for", "me"]) ||
        hasPhrase(tokens, ["page", "reader"]) ||
        hasPhrase(tokens, ["read", "it", "out"]) ||
        hasPhrase(tokens, ["read", "out", "loud"])
    ) {
        scores.READ_PAGE += 5;
    }

    // ---- Read Page Controls
    if (
        hasPhrase(tokens, ["start", "from", "beginning"]) ||
        hasPhrase(tokens, ["start", "from", "the", "beginning"]) ||
        hasPhrase(tokens, ["start", "over"]) ||
        hasPhrase(tokens, ["start", "again"]) ||
        hasPhrase(tokens, ["start", "afresh"]) ||
        hasPhrase(tokens, ["read", "from", "the", "beginning"]) ||
        hasPhrase(tokens, ["read", "again"]) ||
        hasPhrase(tokens, ["read", "this", "again"]) ||
        hasPhrase(tokens, ["read", "from", "start"])
    ) {
        scores.READ_PAGE_RESTART += 5;
    }

    // Extra boost when "start" + "beginning" appears
    if (tokens.includes("start") && tokens.includes("beginning")) {
        scores.READ_PAGE_RESTART += 2;
    }

    if (
        hasPhrase(tokens, ["continue", "reading"]) ||
        hasPhrase(tokens, ["resume", "reading"]) ||
        hasPhrase(tokens, ["keep", "reading"]) ||
        hasPhrase(tokens, ["continue", "the", "page"]) ||
        hasPhrase(tokens, ["resume", "the", "page"]) ||
        hasPhrase(tokens, ["start", "reading"])
    ) {
        scores.READ_PAGE_CONTINUE += 5;
    }

    if (
        hasPhrase(tokens, ["next", "paragraph"]) ||
        hasPhrase(tokens, ["next", "part"]) ||
        hasPhrase(tokens, ["next", "section"])
    ) {
        scores.READ_PAGE_NEXT += 5;
    }

    if (
        hasPhrase(tokens, ["previous", "paragraph"]) ||
        hasPhrase(tokens, ["go", "back"]) ||
        hasPhrase(tokens, ["back", "up"]) ||
        hasPhrase(tokens, ["previous", "part"]) ||
        hasPhrase(tokens, ["last", "paragraph"])
    ) {
        scores.READ_PAGE_PREV += 5;
    }

    if (
        hasPhrase(tokens, ["previous", "section"]) ||
        hasPhrase(tokens, ["read", "last", "paragraph"]) ||
        hasPhrase(tokens, ["final", "paragraph"]) ||
        hasPhrase(tokens, ["go", "to", "end"]) ||
        hasPhrase(tokens, ["end", "of", "page"]) ||
        hasPhrase(tokens, ["last", "section"])
    ) {
        scores.READ_PAGE_FINAL += 5;
    }

    if (
        hasPhrase(tokens, ["stop", "reading"]) ||
        hasPhrase(tokens, ["stop", "the", "page"]) ||
        hasPhrase(tokens, ["pause", "reading"]) ||
        hasPhrase(tokens, ["cancel", "reading"])
    ) {
        scores.READ_PAGE_STOP += 5;
    }

    // ---- Music controls (avoid conflicts with reading)
    const musicContext =
        tokens.includes("music") ||
        tokens.includes("song") ||
        tokens.includes("track") ||
        tokens.includes("spotify") ||
        tokens.includes("playlist") ||
        tokens.includes("album");

    if (
        musicContext &&
        (hasPhrase(tokens, ["pause", "music"]) ||
            hasPhrase(tokens, ["pause", "song"]) ||
            hasPhrase(tokens, ["pause", "track"]) ||
            hasPhrase(tokens, ["pause", "spotify"]) ||
            hasPhrase(tokens, ["hold", "music"]) ||
            hasPhrase(tokens, ["pause", "audio"]))
    ) {
        scores.MUSIC_PAUSE += 6;
    }

    if (
        musicContext &&
        (hasPhrase(tokens, ["resume", "music"]) ||
            hasPhrase(tokens, ["resume", "song"]) ||
            hasPhrase(tokens, ["resume", "track"]) ||
            hasPhrase(tokens, ["continue", "music"]) ||
            hasPhrase(tokens, ["keep", "playing"]) ||
            hasPhrase(tokens, ["play", "music", "again"]) ||
            hasPhrase(tokens, ["unpause", "music"]))
    ) {
        scores.MUSIC_RESUME += 6;
    }

    if (
        musicContext &&
        (hasPhrase(tokens, ["stop", "music"]) ||
            hasPhrase(tokens, ["stop", "song"]) ||
            hasPhrase(tokens, ["stop", "track"]) ||
            hasPhrase(tokens, ["stop", "spotify"]) ||
            hasPhrase(tokens, ["mute", "music"]) ||
            hasPhrase(tokens, ["kill", "music"]))
    ) {
        scores.MUSIC_STOP += 6;
    }

    if (
        musicContext &&
        (hasPhrase(tokens, ["next", "song"]) ||
            hasPhrase(tokens, ["next", "track"]) ||
            hasPhrase(tokens, ["skip", "song"]) ||
            hasPhrase(tokens, ["skip", "track"]) ||
            hasPhrase(tokens, ["skip", "this"]) ||
            hasPhrase(tokens, ["play", "next"]) ||
            hasPhrase(tokens, ["next", "music"]))
    ) {
        scores.MUSIC_NEXT += 6;
    }

    if (
        musicContext &&
        (hasPhrase(tokens, ["previous", "song"]) ||
            hasPhrase(tokens, ["previous", "track"]) ||
            hasPhrase(tokens, ["go", "back", "song"]) ||
            hasPhrase(tokens, ["play", "previous"]) ||
            hasPhrase(tokens, ["last", "song"]) ||
            hasPhrase(tokens, ["back", "track"]))
    ) {
        scores.MUSIC_PREV += 6;
    }

    if (
        musicContext &&
        (hasPhrase(tokens, ["replay", "song"]) ||
            hasPhrase(tokens, ["replay", "track"]) ||
            hasPhrase(tokens, ["restart", "song"]) ||
            hasPhrase(tokens, ["restart", "track"]) ||
            hasPhrase(tokens, ["play", "this", "again"]) ||
            hasPhrase(tokens, ["repeat", "song"]))
    ) {
        scores.MUSIC_REPLAY += 6;
    }

    // ---- Token-based scoring
    tokens.forEach((t) => {
        if (["hi", "hello", "hey"].includes(t)) scores.GREET += 3;
        if (t === "open") scores.OPEN_SITE += 2;
        if (["search", "find"].includes(t)) scores.SEARCH_WEB += 2;
        if (t === "play" && !tokens.includes("read")) scores.PLAY_MUSIC += 2;
        if (t === "youtube") scores.PLAY_YOUTUBE += 2;
        if (["pause", "resume", "stop"].includes(t) && !musicContext) scores.MEDIA_CONTROL += 2;
        if (t === "image") scores.GET_IMAGE += 2;
        if (["github", "npm", "stackoverflow"].includes(t)) scores.DEV_SEARCH += 2;
        if (["tab", "next"].includes(t)) scores.TAB_CONTROL += 2;
        if (["close", "exit"].includes(t)) scores.CLOSE_TAB += 2;
        if (t === "time") scores.TIME += 2;
        if (t === "date") scores.DATE += 2;
        if (["help", "commands"].includes(t)) scores.HELP += 2;
        if (t === "weather") scores.WEATHER += 2;
        if (t === "name") scores.IDENTITY += 2;
        if (t === "age") scores.AGE += 2;
        if (["news", "headline", "headlines", "article", "articles", "story", "stories"].includes(t)) scores.NEWS += 2;
        if (["calculate", "math", "plus", "minus", "multiply", "divide"].includes(t)) scores.CALCULATE += 2;
        if (["all"].includes(t)) scores.OPEN_ALL_NEWS += 2;
        if (["reader", "reading"].includes(t)) scores.READ_PAGE += 2;
    });

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]) as [string, number][];
    const [intent, confidence] = sorted[0];

    return { intent, confidence, scores, sorted };
}
