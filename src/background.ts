// ===============================
// Session State
// ===============================
let hasGreetedThisSession = false;
let latestNews: { title: string; link: string; description: string }[] = [];

console.log("Oppa background running");

// ===============================
// TTS CONFIG
// ===============================
const OPPA_VOICE = {
    lang: "en-GB",
    rate: 0.85,
    pitch: 0.9,
    volume: 1,
    voiceName: "Google UK English Female",
};

function speak(text: string, onEnd?: () => void, options?: { interrupt?: boolean }) {
    if (options?.interrupt !== false) {
        chrome.tts.stop();
    }

    chrome.runtime.sendMessage({ type: "OPPA_SPEECH_START" }).catch(() => { });
    chrome.tts.speak(text, {
        ...OPPA_VOICE,
        onEvent: (event) => {
            if (event.type === "end" || event.type === "cancelled") {
                chrome.runtime.sendMessage({ type: "OPPA_SPEECH_END" }).catch(() => { });
                if (onEnd) onEnd();
            }
        },
    });
}

function openTab(url: string) {
    chrome.tabs.create({ url });
}

// ===============================
// HELPERS
// ===============================
function parse(input: string): string[] {
    return input
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .trim()
        .split(/\s+/);
}

function normalizeTokens(tokens: string[]): string[] {
    return tokens.map((t) => ALIASES[t] ?? t);
}

function hasPhrase(tokens: string[], phrase: string[]) {
    return phrase.every(p => tokens.includes(p));
}

function pick(arr: string[]) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ===============================
// READING STATE
// ===============================
const readingState = {
    chunks: [] as string[],
    index: 0,
    isReading: false,
    sourceUrl: "",
};

function splitIntoParagraphs(text: string): string[] {
    const rawParas = text
        .split(/\n\s*\n/g)
        .map((p) => p.trim())
        .filter(Boolean);

    if (rawParas.length > 1) return rawParas;

    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const grouped: string[] = [];
    let buf = "";
    for (const s of sentences) {
        const next = buf ? `${buf} ${s}` : s;
        if (next.length > 600) {
            if (buf) grouped.push(buf.trim());
            buf = s;
        } else {
            buf = next;
        }
    }
    if (buf) grouped.push(buf.trim());
    return grouped.filter(Boolean);
}

async function speakChunked(text: string) {
    const chunks = text.match(/.{1,250}(\s|$)/g) || [text];
    for (const chunk of chunks) {
        if (!readingState.isReading) break;
        await new Promise<void>((resolve) => {
            speak(chunk, resolve, { interrupt: false });
        });
    }
}

function stopReadingInternal() {
    readingState.isReading = false;
    chrome.tts.stop();
}

async function readFromIndex(startIndex: number, autoContinue: boolean) {
    if (!readingState.chunks.length) {
        speak("I don't have a page to read yet.");
        return;
    }

    const clamped = Math.max(0, Math.min(startIndex, readingState.chunks.length - 1));
    readingState.index = clamped;
    readingState.isReading = true;

    for (let i = clamped; i < readingState.chunks.length; i++) {
        if (!readingState.isReading) break;
        readingState.index = i;
        await speakChunked(readingState.chunks[i]);
        if (!autoContinue) {
            readingState.isReading = false;
            return;
        }
    }

    readingState.isReading = false;
}

// ===============================
// ALIASES
// ===============================
const ALIASES: Record<string, string> = {
    go: "open",
    launch: "open",
    start: "play",
    listen: "play",
    picture: "image",
    photo: "image",
    images: "image",
    get: "open",
    whats: "what",
    hows: "how",
    whos: "who",
    summarise: "summarize",
};

// ===============================
// INTENT DETECTION
// ===============================
const DEBUG_INTENT = true;

function detectIntent(tokens: string[]) {
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

    // ---- Read News Item
    if (
        tokens.includes("read") &&
        tokens.some(t => ["1", "2", "3", "4", "5", "6", "one", "two", "three", "four", "five", "six", "first", "second", "third", "fourth", "fifth", "sixth"].includes(t))
    ) {
        scores.READ_NEWS_ITEM += 5;
    }

    // ---- Open All News
    if (
        hasPhrase(tokens, ["open", "all", "news"]) ||
        hasPhrase(tokens, ["show", "all", "news"])
    ) {
        scores.OPEN_ALL_NEWS += 5;
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

    // ---- Token-based scoring
    tokens.forEach((t) => {
        if (["hi", "hello", "hey"].includes(t)) scores.GREET += 3;
        if (t === "open") scores.OPEN_SITE += 2;
        if (["search", "find"].includes(t)) scores.SEARCH_WEB += 2;
        if (t === "play" && !tokens.includes("read")) scores.PLAY_MUSIC += 2;
        if (t === "youtube") scores.PLAY_YOUTUBE += 2;
        if (["pause", "resume", "stop"].includes(t)) scores.MEDIA_CONTROL += 2;
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
        if (["news", "headline"].includes(t)) scores.NEWS += 2;
        if (["calculate", "math", "plus", "minus", "multiply", "divide"].includes(t)) scores.CALCULATE += 2;
        if (["all"].includes(t)) scores.OPEN_ALL_NEWS += 2;
        if (["reader", "reading"].includes(t)) scores.READ_PAGE += 2;
    });

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [intent, confidence] = sorted[0];

    return { intent, confidence, scores, sorted };
}

// ===============================
// ENTITY EXTRACTION
// ===============================
function extractQuery(tokens: string[], ignore: string[]) {
    return tokens.filter((t) => !ignore.includes(t)).join(" ");
}

// ===============================
// UNDERSTAND
// ===============================
function understand(input: string) {
    let tokens = parse(input);
    tokens = normalizeTokens(tokens);

    const { intent, confidence, scores, sorted } = detectIntent(tokens);

    const entities = {
        query: extractQuery(tokens, [
            "play",
            "open",
            "search",
            "image",
            "weather",
            "me",
            "some",
            "a",
            "an",
            "to",
            "on",
            "for",
            "in",
            "get",
            "date",
            "time",
            "what",
            "is",
            "who",
            "are",
            "tell",
            "about",
            "read",
            "and",
            "find",
            "this",
            "page",
            "reader",
            "reading",
            "continue",
            "resume",
            "stop",
            "next",
            "previous",
            "paragraph",
            "start",
            "beginning",
            "over",
            "again",
        ]),
    };

    return { intent, confidence, entities, scores, sorted };
}

// ===============================
// TASK REGISTRY
// ===============================
interface Task {
    intent: string;
    minConfidence: number;
    action: (entities: { query: string }) => void | Promise<void>;
}

const TASK_REGISTRY: Task[] = [
    {
        intent: "GREET",
        minConfidence: 1,
        action: () =>
            speak(
                pick([
                    "Hey.",
                    "Hi there.",
                    "Hello.",
                    "Hey, how can I help?"
                ])
            ),
    },
    {
        intent: "HOW_ARE_YOU",
        minConfidence: 3,
        action: () =>
            speak(
                pick([
                    "I’m doing great, thanks for asking.",
                    "All good on my end.",
                    "Doing well. What can I help you with?",
                    "I’m here and ready."
                ])
            ),
    },
    {
        intent: "IDENTITY",
        minConfidence: 3,
        action: () =>
            speak(
                pick([
                    "I’m Oppa.I'm your personal assistant.",
                    "My name is Oppa.I was created to help you browse the web.",
                    "You can call me Oppa. I’m here to assist you."
                ])
            ),
    },
    {
        intent: "AGE",
        minConfidence: 3,
        action: () =>
            speak(
                pick([
                    "I don’t really have an age.",
                    "I’m as old as my last update.",
                    "Age doesn’t apply to me."
                ])
            ),
    },
    {
        intent: "OPEN_SITE",
        minConfidence: 2,
        action: ({ query }) => {
            let url = query.replace(/\s/g, "");
            if (!url.includes(".")) url += ".com";
            if (!url.startsWith("http")) url = "https://" + url;
            speak(`Opening ${query}`);
            openTab(url);
        },
    },
    {
        intent: "SEARCH_WEB",
        minConfidence: 2,
        action: ({ query }) => {
            speak(`Searching for ${query}`);
            openTab(`https://www.google.com/search?q=${query}`);
        },
    },
    {
        intent: "PLAY_YOUTUBE",
        minConfidence: 2,
        action: ({ query }) => {
            speak("Opening YouTube.");
            openTab(`https://www.youtube.com/results?search_query=${query}`);
        },
    },
    {
        intent: "GET_IMAGE",
        minConfidence: 2,
        action: ({ query }) => {
            speak("Searching for images.");
            openTab(`https://www.google.com/search?tbm=isch&q=${query || "random"}`);
        },
    },
    {
        intent: "SEARCH_AND_READ",
        minConfidence: 4,
        action: async ({ query }) => {
            speak(`Looking up ${query}`);
            try {
                const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
                const data = await response.json();
                const summary = data.AbstractText || (data.RelatedTopics?.[0]?.Text);

                if (summary) {
                    speak(summary.substring(0, 200));
                } else {
                    speak(`I couldn't find a quick summary for ${query}. I'll open a search page for you.`);
                    openTab(`https://www.google.com/search?q=${query}`);
                }
            } catch (error) {
                console.error("Failed to fetch summary:", error);
                speak(`Sorry, I had trouble looking that up. I'll open a search page instead.`);
                openTab(`https://www.google.com/search?q=${query}`);
            }
        },
    },
    {
        intent: "PLAY_MUSIC",
        minConfidence: 2,
        action: ({ query }) => {
            speak("Playing it now.");
            openTab(`https://open.spotify.com/search/${query}`);
        },
    },
    {
        intent: "TIME",
        minConfidence: 2,
        action: () => {
            const d = new Date();
            const hr = d.getHours() % 12 || 12;
            const mins = d.getMinutes().toString().padStart(2, "0");
            const am = d.getHours() >= 12 ? "PM" : "AM";
            speak(`The time is ${hr}:${mins} ${am}`);
        },
    },
    {
        intent: "WEATHER",
        minConfidence: 2,
        action: async ({ query }) => {
            speak(`Checking the weather ${query ? `for ${query}` : ""}.`);
            try {
                // Using wttr.in for text summary as DuckDuckGo API often lacks weather text
                const response = await fetch(`https://wttr.in/${query}?format=%C+and+%t`);
                if (response.ok) {
                    const text = await response.text();
                    speak(`It is currently ${text}.`);
                }
            } catch (e) {
                console.error("Weather fetch failed", e);
            }
            openTab(`https://www.google.com/search?q=weather+${query}`);
        },
    },
    {
        intent: "NEWS",
        minConfidence: 2,
        action: async () => {
            speak("Fetching the latest headlines.");
            try {
                // Use rss2json to avoid CORS issues and get JSON directly
                const response = await fetch("https://api.rss2json.com/v1/api.json?rss_url=https://news.google.com/rss");
                const data = await response.json();
                if (data.status === "ok" && data.items.length > 0) {
                    latestNews = data.items.slice(0, 6).map((item: any) => ({
                        title: item.title.split(" - ")[0],
                        link: item.link,
                        description: (item.description || "").replace(/<[^>]*>?/gm, "")
                    }));
                    const titles = latestNews.map((n) => n.title);
                    speak(`Here are the top ${titles.length} headlines: ${titles.join(". ")}. You can ask me to read a specific one or open all of them.`);
                } else {
                    speak("I couldn't find any news.");
                }
            } catch (e) {
                console.error("News fetch error:", e);
                speak("Sorry, I couldn't get the news.");
            }
        },
    },
    {
        intent: "READ_NEWS_ITEM",
        minConfidence: 3,
        action: ({ query }) => {
            if (latestNews.length === 0) {
                speak("I haven't fetched any news yet. Ask for the latest news first.");
                return;
            }
            const numberMap: Record<string, number> = {
                "one": 0, "first": 0, "1": 0,
                "two": 1, "second": 1, "2": 1,
                "three": 2, "third": 2, "3": 2,
                "four": 3, "fourth": 3, "4": 3,
                "five": 4, "fifth": 4, "5": 4,
                "six": 5, "sixth": 5, "6": 5
            };
            const words = query.split(" ");
            const target = words.find(w => numberMap[w] !== undefined);
            if (target && latestNews[numberMap[target]]) {
                const item = latestNews[numberMap[target]];
                speak(`${item.title}. ${item.description}`);
            } else {
                speak("I couldn't find that news item.");
            }
        }
    },
    {
        intent: "OPEN_ALL_NEWS",
        minConfidence: 3,
        action: () => {
            if (latestNews.length === 0) {
                speak("I haven't fetched any news yet.");
                return;
            }
            speak("Opening all news articles.");
            latestNews.forEach(item => openTab(item.link));
        }
    },
    {
        intent: "CALCULATE",
        minConfidence: 2,
        action: ({ query }) => {
            const mathQuery = query
                .toLowerCase()
                .replace(/plus/g, "+")
                .replace(/minus/g, "-")
                .replace(/times/g, "*")
                .replace(/multiplied by/g, "*")
                .replace(/divided by/g, "/")
                .replace(/[^0-9+\-*/.()]/g, "");

            try {
                // eslint-disable-next-line no-new-func
                const result = new Function("return " + mathQuery)();
                if (isFinite(result)) {
                    speak(`The answer is ${result}`);
                } else {
                    speak("I couldn't calculate that.");
                }
            } catch (e) {
                speak("Sorry, I didn't understand the math expression.");
            }
        },
    },
    {
        intent: "READ_PAGE",
        minConfidence: 2,
        action: async () => {
            speak("Alright, reading this page.");

            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });

            if (
                !tab?.id ||
                !tab.url ||
                !tab.url.startsWith("http") ||
                tab.url.startsWith("chrome://")
            ) {
                speak("Sorry, I can't read this page.");
                return;
            }

            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const root =
                            document.querySelector("main") ||
                            document.querySelector("article") ||
                            document.querySelector('[role="main"]') ||
                            document.body;

                        if (!root) return "";

                        const REMOVE_SELECTORS = [
                            "script",
                            "style",
                            "noscript",
                            "nav",
                            "header",
                            "footer",
                            "aside",
                            "aside *",
                            "form",
                            "button",
                            "input",
                            "select",
                            "textarea",
                            "label",
                            "figure",
                            "figcaption",
                            "svg",
                            "canvas",
                            "iframe",
                            "video",
                            "audio",
                            "a",
                            "[role='navigation']",
                            "[role='banner']",
                            "[role='contentinfo']",
                            "[role='search']",
                            "[aria-hidden='true']",
                            // Common cookie/consent banners and overlays
                            "[id*='cookie']",
                            "[class*='cookie']",
                            "[id*='consent']",
                            "[class*='consent']",
                            "[id*='gdpr']",
                            "[class*='gdpr']",
                            "[id*='privacy']",
                            "[class*='privacy']",
                            "[class*='banner']",
                            "[class*='overlay']",
                            "[class*='modal']",
                            "[role='dialog']",
                            // Common ads / sidebar / promo blocks
                            "[id*='ad']",
                            "[class*='ad']",
                            "[id*='ads']",
                            "[class*='ads']",
                            "[id*='sponsor']",
                            "[class*='sponsor']",
                            "[class*='promo']",
                            "[class*='sidebar']",
                            "[id*='sidebar']",
                            "[class*='related']",
                        ];

                        root.querySelectorAll(REMOVE_SELECTORS.join(",")).forEach((el) => el.remove());

                        const walker = document.createTreeWalker(
                            root,
                            NodeFilter.SHOW_TEXT,
                            {
                                acceptNode(node) {
                                    const text = (node.nodeValue || "").trim();
                                    if (!text) return NodeFilter.FILTER_REJECT;
                                    const parent = node.parentElement;
                                    if (!parent) return NodeFilter.FILTER_REJECT;
                                    const tag = parent.tagName.toLowerCase();
                                    if (["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "button", "input", "select", "textarea", "label", "a"].includes(tag)) {
                                        return NodeFilter.FILTER_REJECT;
                                    }
                                    return NodeFilter.FILTER_ACCEPT;
                                },
                            }
                        );

                        const parts: string[] = [];
                        let current: Node | null = walker.nextNode();
                        while (current) {
                            parts.push((current.nodeValue || "").trim());
                            current = walker.nextNode();
                        }

                        const text = parts.join(" ");
                        return text.replace(/\s\s+/g, " ").trim();
                    },
                });

                const text = results?.[0]?.result;

                if (!text || text.length < 50) {
                    speak("I couldn't find readable text on this page.");
                    return;
                }

                readingState.sourceUrl = tab.url;
                readingState.chunks = splitIntoParagraphs(text);
                readingState.index = 0;
                readingState.isReading = false;

                if (!readingState.chunks.length) {
                    speak("I couldn't find readable text on this page.");
                    return;
                }

                stopReadingInternal();
                await readFromIndex(0, true);
            } catch (error) {
                console.error("Reading page failed:", error);
                speak("Sorry, I couldn't read this page. It may be restricted.");
            }
        },
    },
    {
        intent: "READ_PAGE_RESTART",
        minConfidence: 2,
        action: async () => {
            if (!readingState.chunks.length) {
                speak("I don't have a page ready to read yet.");
                return;
            }
            speak("Starting from the beginning.");
            stopReadingInternal();
            await readFromIndex(0, true);
        },
    },
    {
        intent: "READ_PAGE_CONTINUE",
        minConfidence: 2,
        action: async () => {
            if (!readingState.chunks.length) {
                speak("I don't have a page ready to read yet.");
                return;
            }
            if (readingState.isReading) {
                speak("I'm already reading.");
                return;
            }
            speak("Continuing.");
            await readFromIndex(readingState.index, true);
        },
    },
    {
        intent: "READ_PAGE_NEXT",
        minConfidence: 2,
        action: async () => {
            if (!readingState.chunks.length) {
                speak("I don't have a page ready to read yet.");
                return;
            }
            const nextIndex = readingState.index + 1;
            if (nextIndex >= readingState.chunks.length) {
                speak("You're already at the end.");
                return;
            }
            stopReadingInternal();
            await readFromIndex(nextIndex, false);
        },
    },
    {
        intent: "READ_PAGE_PREV",
        minConfidence: 2,
        action: async () => {
            if (!readingState.chunks.length) {
                speak("I don't have a page ready to read yet.");
                return;
            }
            const prevIndex = readingState.index - 1;
            if (prevIndex < 0) {
                speak("You're already at the beginning.");
                return;
            }
            stopReadingInternal();
            await readFromIndex(prevIndex, false);
        },
    },
    {
        intent: "READ_PAGE_LAST",
        minConfidence: 2,
        action: async () => {
            if (!readingState.chunks.length) {
                speak("I don't have a page ready to read yet.");
                return;
            }
            const lastIndex = readingState.chunks.length - 1;
            if (lastIndex < 0) {
                speak("You're already at the beginning.");
                return;
            }
            stopReadingInternal();
            await readFromIndex(lastIndex, false);
        },
    },
    {
        intent: "READ_PAGE_FINAL",
        minConfidence: 2,
        action: async () => {
            if (!readingState.chunks.length) {
                speak("I don't have a page ready to read yet.");
                return;
            }
            const lastIndex = readingState.chunks.length - 1;
            if (lastIndex < 0) {
                speak("You're already at the beginning.");
                return;
            }
            stopReadingInternal();
            await readFromIndex(lastIndex, false);
        },
    },
    {
        intent: "READ_PAGE_STOP",
        minConfidence: 2,
        action: () => {
            if (!readingState.isReading) {
                speak("I'm not reading right now.");
                return;
            }
            stopReadingInternal();
            speak("Stopped reading.");
        },
    },

    {
        intent: "DATE",
        minConfidence: 2,
        action: () => {
            const date = new Date().toDateString();
            speak(`Today is ${date}`);
        },
    },
    {
        intent: "CLOSE_TAB",
        minConfidence: 2,
        action: () => {
            speak("Closing tab.");
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.remove(tabs[0].id);
                }
            });
        },
    },
    {
        intent: "HELP",
        minConfidence: 1,
        action: () => {
            speak(
                "You can ask me to play music, open websites, search the web, read the page, or check the weather. While reading, you can say stop reading, continue reading, next paragraph, or go back."
            );
        },
    },
];

// ===============================
// EXECUTOR
// ===============================
function handleCommand(command: string) {
    const { intent, confidence, entities, scores, sorted } = understand(command);
    if (DEBUG_INTENT) {
        const topThree = sorted.slice(0, 3).map(([k, v]) => `${k}:${v}`).join(" | ");
        console.log("[OPPA] command:", command);
        console.log("[OPPA] intent:", intent, "confidence:", confidence);
        console.log("[OPPA] top3:", topThree);
        console.log("[OPPA] scores:", scores);
        console.log("[OPPA] entities:", entities);
    }

    const task = TASK_REGISTRY.find(
        (t) => t.intent === intent && confidence >= t.minConfidence
    );

    if (task) {
        task.action(entities);
    } else {
        speak("I’m not sure I understood that.");
    }
}

// ===============================
// MESSAGE LISTENER
// ===============================
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "OPPA_POPUP_OPENED") {
        if (!hasGreetedThisSession) {
            speak("Hi. I’m Oppa.");
            hasGreetedThisSession = true;
            // The popup will start listening after the OPPA_SPEECH_END event.
            sendResponse({ status: "speaking" });
        } else {
            // Tell the popup it can start listening immediately.
            sendResponse({ status: "ready_to_listen" });
        }
        return true; // Required for async sendResponse.
    }

    if (msg.type === "OPPA_VOICE_COMMAND") {
        handleCommand(msg.text);
    }
    if (msg.type === "OPPA_STOP_ALL") {
        stopReadingInternal();
        chrome.tts.stop();
        chrome.runtime.sendMessage({ type: "OPPA_SPEECH_END" }).catch(() => { });
        sendResponse({ status: "stopped" });
        return true;
    }
});
