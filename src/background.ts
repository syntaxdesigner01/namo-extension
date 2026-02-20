// ===============================
// Session State
// ===============================
let hasGreetedThisSession = false;
let latestNews: { title: string; link: string; summary: string }[] = [];
let lastFetchTime = 0;
let cachedNewsOptions: { scope: string; topic?: { code: string; label: string } | null } | null = null;
let weatherState: { pendingCityPrompt: boolean } = { pendingCityPrompt: false };

chrome.storage.local.get(["latestNews", "lastFetchTime", "cachedNewsOptions"], (result) => {
    if (result.latestNews) {
        latestNews = result.latestNews as { title: string; link: string; summary: string }[];
    }
    if (result.lastFetchTime) lastFetchTime = result.lastFetchTime as number;
    if (result.cachedNewsOptions) cachedNewsOptions = result.cachedNewsOptions as { scope: string; topic?: { code: string; label: string } | null } | null;
});
chrome.storage.local.get(["weatherState"], (result) => {
    if (result.weatherState) {
        weatherState = result.weatherState as { pendingCityPrompt: boolean };
    }
});
const newsState = {
    pending: false,
    scope: null as "local" | "international" | null,
    topic: null as { code: string; label: string } | null,
    lastReadIndex: null as number | null,
    pendingFullChoice: false,
    isReadingList: false,
    stopReadingList: false,
};

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

const OPEN_WEATHER_API_KEY = "93d645239df7bcdd98c147f54d44e354";

let suppressListenReady = false;
let listenSuppressCount = 0;

function speak(text: string, onEnd?: () => void, options?: { interrupt?: boolean; suppressListen?: boolean }) {
    if (options?.interrupt !== false) {
        chrome.tts.stop();
    }

    if (options?.suppressListen) {
        listenSuppressCount += 1;
    }

    chrome.runtime.sendMessage({ type: "OPPA_LISTEN_STATUS", status: "speaking" }).catch(() => { });
    chrome.runtime.sendMessage({ type: "OPPA_SPEECH_START" }).catch(() => { });
    chrome.tts.speak(text, {
        ...OPPA_VOICE,
        onEvent: (event) => {
            if (event.type === "end" || event.type === "cancelled") {
                chrome.runtime.sendMessage({ type: "OPPA_SPEECH_END" }).catch(() => { });
                if (options?.suppressListen) {
                    listenSuppressCount = Math.max(0, listenSuppressCount - 1);
                }
                if (!suppressListenReady && listenSuppressCount === 0) {
                    chrome.runtime.sendMessage({ type: "OPPA_LISTEN_STATUS", status: "ready_to_listen" }).catch(() => { });
                }
                if (onEnd) onEnd();
            }
        },
    });
}

function openTab(url: string) {
    chrome.tabs.create({ url });
}

async function speakSequential(chunks: string[]) {
    await withListenSuppressed(async () => {
        for (const chunk of chunks) {
            await new Promise<void>((resolve) => {
                speak(chunk, resolve, { interrupt: false });
            });
        }
    });
}

async function withListenSuppressed<T>(fn: () => Promise<T>) {
    const prev = suppressListenReady;
    suppressListenReady = true;
    try {
        return await fn();
    } finally {
        suppressListenReady = prev;
        if (!suppressListenReady && listenSuppressCount === 0) {
            chrome.runtime.sendMessage({ type: "OPPA_LISTEN_STATUS", status: "ready_to_listen" }).catch(() => { });
        }
    }
}

async function readNewsSummaryThenFull(item: { title: string; summary: string; link: string }) {
    const summary = item.summary
        ? `${item.title}. ${item.summary}`
        : `${item.title}. I can open the full article if you'd like.`;
    await speakSequential([summary, "Opening the full article and reading it."]);

    chrome.tabs.create({ url: item.link, active: true }, (tab) => {
        if (!tab?.id) return;
        const tabId = tab.id;
        const onUpdated = (updatedId: number, info: any) => {
            if (updatedId !== tabId || info.status !== "complete") return;
            chrome.tabs.onUpdated.removeListener(onUpdated);
            readTabById(tabId, item.link);
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
}

async function readNewsSummaryAndAsk(item: { title: string; summary: string; link: string }) {
    const summary = item.summary
        ? `${item.title}. ${item.summary}`
        : `${item.title}. I couldn't find a summary, but I can open the full article.`;
    await speakSequential([summary, "Would you like me to read the full article?"]);
    newsState.pendingFullChoice = true;
}

async function readTabById(tabId: number, url?: string) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
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

        readingState.sourceUrl = url || "";
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
}

async function getCountryCode() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch("https://ipapi.co/json/", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) return null;
        const data = await response.json();
        return (data?.country_code || "").toString().toUpperCase() || null;
    } catch {
        return null;
    }
}

function buildNewsRssUrl(options: { scope: "local" | "international"; topic?: { code: string; label: string } | null; countryCode?: string | null }) {
    const cc = (options.countryCode || "US").toUpperCase();
    const isLocal = options.scope === "local";
    const topicCode = options.topic?.code || (isLocal ? "" : "WORLD");

    const base = topicCode
        ? `https://news.google.com/rss/headlines/section/topic/${topicCode}`
        : "https://news.google.com/rss";

    const hl = isLocal ? `en-${cc}` : "en";
    const gl = isLocal ? cc : "US";
    const ceid = isLocal ? `${cc}:en` : "US:en";

    return `${base}?hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(ceid)}`;
}

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, timeout = 10000): Promise<Response> {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (e: any) {
            if (i === retries - 1) throw e;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    throw new Error("Failed to fetch");
}

function updateWeatherState(patch: Partial<{ pendingCityPrompt: boolean }>) {
    weatherState = { ...weatherState, ...patch };
    chrome.storage.local.set({ weatherState });
}

async function getUserCoords(): Promise<{ lat: number; lon: number } | null> {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });

    if (!tab?.id || !tab.url || !tab.url.startsWith("http") || tab.url.startsWith("chrome://")) {
        return null;
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () =>
                new Promise<{ lat: number; lon: number } | null>((resolve) => {
                    if (!("geolocation" in navigator)) {
                        resolve(null);
                        return;
                    }
                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                        () => resolve(null),
                        { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
                    );
                }),
        });
        return results?.[0]?.result ?? null;
    } catch (e) {
        console.error("Geolocation failed", e);
        return null;
    }
}

function describeTemp(tempC: number) {
    if (tempC <= 0) return "freezing";
    if (tempC <= 10) return "chilly";
    if (tempC <= 18) return "cool";
    if (tempC <= 24) return "mild";
    if (tempC <= 30) return "warm";
    return "hot";
}

function describeWind(speed: number) {
    if (speed <= 2.5) return "light breeze";
    if (speed <= 6) return "gentle breeze";
    if (speed <= 10) return "breezy";
    if (speed <= 15) return "windy";
    return "very windy";
}

function buildWeatherSpeech(data: any, fallbackLocation?: string) {
    const name = (data?.name || fallbackLocation || "your area").toString();
    const description = (data?.weather?.[0]?.description || "").toString();
    const temp = Number.isFinite(data?.main?.temp) ? Number(data.main.temp) : null;
    const feels = Number.isFinite(data?.main?.feels_like) ? Number(data.main.feels_like) : null;
    const humidity = Number.isFinite(data?.main?.humidity) ? Number(data.main.humidity) : null;
    const wind = Number.isFinite(data?.wind?.speed) ? Number(data.wind.speed) : null;

    if (temp === null) {
        return `I couldn't read the temperature for ${name}.`;
    }

    const roundedTemp = Math.round(temp);
    const tempLabel = describeTemp(temp);
    const locationIntro = name ? `In ${name} right now, it's` : `Right now, it's`;
    const conditionPart = description ? ` with ${description} overhead.` : ".";
    const first = `${locationIntro} ${tempLabel} — around ${roundedTemp}°C —${conditionPart}`;

    let second = "";
    if (feels !== null) {
        const roundedFeels = Math.round(feels);
        if (Math.abs(roundedFeels - roundedTemp) <= 1) {
            second = "It feels about the same as the actual temperature.";
        } else {
            second = `It feels more like ${roundedFeels}°C.`;
        }
        if (humidity !== null) {
            if (humidity >= 70) {
                second += " The humidity is high, so it might feel a little sticky.";
            } else if (humidity <= 35) {
                second += " The air is pretty dry.";
            }
        }
    }

    let third = "";
    if (wind !== null) {
        const windDesc = describeWind(wind);
        if (windDesc === "light breeze") {
            third = "There's just a light breeze, nothing serious.";
        } else if (windDesc === "gentle breeze") {
            third = "There's a gentle breeze out there.";
        } else if (windDesc === "breezy") {
            third = "It's a bit breezy right now.";
        } else if (windDesc === "windy") {
            third = "It's fairly windy right now.";
        } else {
            third = "It's very windy right now.";
        }
    }

    return [first, second, third].filter(Boolean).join(" ");
}

async function fetchNews(options: { scope: "local" | "international"; topic?: { code: string; label: string } | null }) {
    const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();
    const isSameOptions = cachedNewsOptions &&
        cachedNewsOptions.scope === options.scope &&
        ((!cachedNewsOptions.topic && !options.topic) || (cachedNewsOptions.topic?.code === options.topic?.code));

    if (latestNews.length > 0 && isSameOptions && (now - lastFetchTime < CACHE_DURATION)) {
        const titles = latestNews.map((n) => n.title);
        speak(`Here are the cached headlines: ${titles.join(". ")}. You can ask me to read a specific one or open all of them.`);
        return;
    }

    speak(`Fetching ${options.scope}${options.topic ? ` ${options.topic.label}` : ""} news.`);
    try {
        const countryCode = options.scope === "local" ? await getCountryCode() : null;
        const rssUrl = buildNewsRssUrl({ ...options, countryCode });

        const response = await fetchWithRetry(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
        const contentType = response.headers.get("content-type") || "";
        let data: any = null;
        if (contentType.includes("application/json")) {
            data = await response.json();
        } else {
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch {
                data = null;
            }
        }

        if (data?.status === "ok" && Array.isArray(data.items) && data.items.length > 0) {
            latestNews = data.items.slice(0, 6).map((item: any) => ({
                title: item.title.split(" - ")[0],
                link: item.link,
                summary: (item.description || item.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            }));
        } else {
            // Fallback: fetch RSS XML directly and parse minimal fields
            const rssResp = await fetchWithRetry(rssUrl);
            const rssText = await rssResp.text();
            const items = rssText.match(/<item>[\s\S]*?<\/item>/gi) || [];
            latestNews = items.slice(0, 6).map((raw) => {
                const titleMatch = raw.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
                const linkMatch = raw.match(/<link>(.*?)<\/link>/i);
                const descMatch = raw.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/i);
                const title = (titleMatch?.[1] || titleMatch?.[2] || "").split(" - ")[0].trim();
                const link = (linkMatch?.[1] || "").trim();
                const summary = (descMatch?.[1] || descMatch?.[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                return { title, link, summary };
            }).filter((n) => n.title && n.link);
        }

        lastFetchTime = Date.now();
        cachedNewsOptions = options;
        chrome.storage.local.set({ latestNews, lastFetchTime, cachedNewsOptions });

        if (latestNews.length > 0) {
            const titles = latestNews.map((n) => n.title);
            speak(`Here are the top ${titles.length} headlines: ${titles.join(". ")}. You can ask me to read a specific one or open all of them.`);
        } else {
            speak("I couldn't find any news.");
        }
    } catch (e) {
        console.error("News fetch error:", e);
        speak("Sorry, I couldn't get the news.");
    }
}

function humanizeTime(d: Date) {
    const hour24 = d.getHours();
    const minutes = d.getMinutes();
    const hour12 = hour24 % 12 || 12;
    const am = hour24 >= 12 ? "PM" : "AM";

    const nextHour24 = (hour24 + 1) % 24;
    const nextHour12 = nextHour24 % 12 || 12;
    const nextAm = nextHour24 >= 12 ? "PM" : "AM";

    const isDaytime = hour24 >= 7 && hour24 < 19;
    const amPm = isDaytime ? "" : ` ${am}`;
    const nextAmPm = isDaytime ? "" : ` ${nextAm}`;

    if (minutes === 0) return `${hour12} o'clock${amPm}`;
    if (minutes === 15) return `a quarter past ${hour12}${amPm}`;
    if (minutes === 30) return `half past ${hour12}${amPm}`;
    if (minutes === 45) return `a quarter to ${nextHour12}${nextAmPm}`;

    if (minutes < 30) {
        const m = minutes === 1 ? "minute" : "minutes";
        return `${minutes} ${m} past ${hour12}${amPm}`;
    }

    const to = 60 - minutes;
    const m = to === 1 ? "minute" : "minutes";
    return `${to} ${m} to ${nextHour12}${nextAmPm}`;
}

function controlSpotify(action: "play" | "pause" | "next" | "prev" | "replay" | "stop") {
    chrome.tabs.query({ url: "*://open.spotify.com/*" }, (tabs) => {
        const target = tabs.find((t) => t.id) || null;
        if (!target?.id) {
            speak("I couldn't find an open Spotify tab.");
            return;
        }

        chrome.scripting.executeScript({
            target: { tabId: target.id },
            func: (requested: string) => {
                const click = (sel: string) => {
                    const el = document.querySelector(sel) as HTMLElement | null;
                    if (el) {
                        el.click();
                        return true;
                    }
                    return false;
                };

                if (requested === "replay") {
                    const prevBtn =
                        document.querySelector('button[aria-label^="Previous"]') ||
                        document.querySelector('button[title^="Previous"]');
                    if (prevBtn) {
                        (prevBtn as HTMLElement).click();
                        setTimeout(() => (prevBtn as HTMLElement).click(), 400);
                        return "replayed";
                    }
                    return "not-found";
                }

                if (requested === "stop") {
                    return click('button[aria-label^="Pause"]') || click('button[title^="Pause"]')
                        ? "paused"
                        : "not-found";
                }

                if (requested === "pause") {
                    return click('button[aria-label^="Pause"]') || click('button[title^="Pause"]')
                        ? "paused"
                        : "not-found";
                }

                if (requested === "play") {
                    return click('button[aria-label^="Play"]') || click('button[title^="Play"]')
                        ? "playing"
                        : "not-found";
                }

                if (requested === "next") {
                    return click('button[aria-label^="Next"]') || click('button[title^="Next"]')
                        ? "next"
                        : "not-found";
                }

                if (requested === "prev") {
                    return click('button[aria-label^="Previous"]') || click('button[title^="Previous"]')
                        ? "prev"
                        : "not-found";
                }

                return "not-found";
            },
            args: [action],
        }).then((results) => {
            const status = results?.[0]?.result;
            if (status === "not-found") {
                speak("I couldn't control playback on Spotify.");
            }
        }).catch((error) => {
            console.error("Spotify control injection failed:", error);
        });
    });
}

function openSpotifyAndPlay(query: string) {
    const url = `https://open.spotify.com/search/${encodeURIComponent(query || "")}`;
    chrome.tabs.create({ url }, (tab) => {
        if (!tab?.id) return;
        const tabId = tab.id;
        const onUpdated = (updatedId: number, info: any) => {
            if (updatedId !== tabId || info.status !== "complete") return;
            chrome.tabs.onUpdated.removeListener(onUpdated);

            chrome.scripting.executeScript({
                target: { tabId },
                func: async () => {
                    const waitFor = (selector: string, timeoutMs = 10000) =>
                        new Promise<Element | null>((resolve) => {
                            const start = Date.now();
                            const timer = setInterval(() => {
                                const el = document.querySelector(selector);
                                if (el) {
                                    clearInterval(timer);
                                    resolve(el);
                                    return;
                                }
                                if (Date.now() - start >= timeoutMs) {
                                    clearInterval(timer);
                                    resolve(null);
                                }
                            }, 250);
                        });

                    if (document.querySelector('button[data-testid="login-button"], a[href*="login"]')) {
                        return "login";
                    }

                    await waitFor('[data-testid="search-page"]', 8000);

                    const topResultPlay =
                        document.querySelector('[data-testid="top-result-card"] button[data-testid="play-button"]') ||
                        document.querySelector('[data-testid="top-result-card"] button[aria-label^="Play"]');
                    if (topResultPlay) {
                        (topResultPlay as HTMLElement).click();
                        return "clicked-top-result";
                    }

                    const trackRow = document.querySelector('[data-testid="tracklist-row"]');
                    if (trackRow) {
                        const rowPlay =
                            trackRow.querySelector('button[data-testid="play-button"]') ||
                            trackRow.querySelector('button[aria-label^="Play"]') ||
                            trackRow.querySelector('button[title^="Play"]');
                        if (rowPlay) {
                            (rowPlay as HTMLElement).click();
                            return "clicked-track";
                        }
                    }

                    const fallbackPlay =
                        document.querySelector('button[aria-label^="Play"]') ||
                        document.querySelector('button[title^="Play"]') ||
                        document.querySelector('[data-testid="play-button"]');
                    if (fallbackPlay) {
                        (fallbackPlay as HTMLElement).click();
                        return "clicked-fallback";
                    }

                    return "not-found";
                },
            }).then((results) => {
                const status = results?.[0]?.result;
                if (status === "login") {
                    speak("Please log in to Spotify first.");
                } else if (status === "not-found") {
                    speak("I couldn't find a play button. Try again after the page finishes loading.");
                }
            }).catch((error) => {
                console.error("Spotify play injection failed:", error);
            });
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
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

    await withListenSuppressed(async () => {
        for (let i = clamped; i < readingState.chunks.length; i++) {
            if (!readingState.isReading) break;
            readingState.index = i;
            await speakChunked(readingState.chunks[i]);
            if (!autoContinue) {
                readingState.isReading = false;
                return;
            }
        }
    });

    readingState.isReading = false;
}

// ===============================
// ALIASES
// ===============================
const ALIASES: Record<string, string> = {
    go: "open",
    launch: "open",
    listen: "play",
    picture: "image",
    photo: "image",
    images: "image",
    get: "open",
    whats: "what",
    hows: "how",
    whos: "who",
    summarise: "summarize",
    loacal: "local",
    internations: "international",
    fiance: "finance",
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

function extractNewsScope(tokens: string[]): "local" | "international" | null {
    if (tokens.includes("local") || tokens.includes("nearby") || hasPhrase(tokens, ["in", "my", "country"])) return "local";
    if (tokens.includes("international") || tokens.includes("global") || tokens.includes("world")) return "international";
    return null;
}

function extractNewsTopic(tokens: string[]) {
    const topicMap: Record<string, { code: string; label: string }> = {
        tech: { code: "TECHNOLOGY", label: "tech" },
        technology: { code: "TECHNOLOGY", label: "tech" },
        ai: { code: "TECHNOLOGY", label: "AI" },
        artificial: { code: "TECHNOLOGY", label: "AI" },
        intelligence: { code: "TECHNOLOGY", label: "AI" },
        safety: { code: "TECHNOLOGY", label: "AI safety" },
        aisafety: { code: "TECHNOLOGY", label: "AI safety" },
        ethics: { code: "TECHNOLOGY", label: "AI ethics" },
        alignment: { code: "TECHNOLOGY", label: "AI alignment" },
        ml: { code: "TECHNOLOGY", label: "machine learning" },
        machine: { code: "TECHNOLOGY", label: "machine learning" },
        learning: { code: "TECHNOLOGY", label: "machine learning" },
        llm: { code: "TECHNOLOGY", label: "LLMs" },
        llms: { code: "TECHNOLOGY", label: "LLMs" },
        chatbot: { code: "TECHNOLOGY", label: "chatbots" },
        chatbots: { code: "TECHNOLOGY", label: "chatbots" },
        robotics: { code: "TECHNOLOGY", label: "robotics" },
        robot: { code: "TECHNOLOGY", label: "robotics" },
        drones: { code: "TECHNOLOGY", label: "drones" },
        gadgets: { code: "TECHNOLOGY", label: "gadgets" },
        hardware: { code: "TECHNOLOGY", label: "hardware" },
        software: { code: "TECHNOLOGY", label: "software" },
        apps: { code: "TECHNOLOGY", label: "apps" },
        app: { code: "TECHNOLOGY", label: "apps" },
        mobile: { code: "TECHNOLOGY", label: "mobile" },
        android: { code: "TECHNOLOGY", label: "android" },
        ios: { code: "TECHNOLOGY", label: "iOS" },
        apple: { code: "TECHNOLOGY", label: "Apple" },
        google: { code: "TECHNOLOGY", label: "Google" },
        microsoft: { code: "TECHNOLOGY", label: "Microsoft" },
        meta: { code: "TECHNOLOGY", label: "Meta" },
        amazon: { code: "TECHNOLOGY", label: "Amazon" },
        cybersecurity: { code: "TECHNOLOGY", label: "cybersecurity" },
        security: { code: "TECHNOLOGY", label: "security" },
        hacking: { code: "TECHNOLOGY", label: "hacking" },
        privacy: { code: "TECHNOLOGY", label: "privacy" },
        data: { code: "TECHNOLOGY", label: "data" },
        database: { code: "TECHNOLOGY", label: "databases" },
        databases: { code: "TECHNOLOGY", label: "databases" },
        cloud: { code: "TECHNOLOGY", label: "cloud" },
        aws: { code: "TECHNOLOGY", label: "AWS" },
        azure: { code: "TECHNOLOGY", label: "Azure" },
        gcp: { code: "TECHNOLOGY", label: "GCP" },
        devops: { code: "TECHNOLOGY", label: "DevOps" },
        programming: { code: "TECHNOLOGY", label: "programming" },
        coding: { code: "TECHNOLOGY", label: "coding" },
        openai: { code: "TECHNOLOGY", label: "OpenAI" },
        blockchain: { code: "BUSINESS", label: "blockchain" },
        defi: { code: "BUSINESS", label: "DeFi" },
        nft: { code: "BUSINESS", label: "NFTs" },
        nfts: { code: "BUSINESS", label: "NFTs" },
        token: { code: "BUSINESS", label: "tokens" },
        tokens: { code: "BUSINESS", label: "tokens" },
        stablecoin: { code: "BUSINESS", label: "stablecoins" },
        stablecoins: { code: "BUSINESS", label: "stablecoins" },
        regulation: { code: "BUSINESS", label: "regulation" },
        regulatory: { code: "BUSINESS", label: "regulation" },
        tariffs: { code: "BUSINESS", label: "tariffs" },
        inflation: { code: "BUSINESS", label: "inflation" },
        recession: { code: "BUSINESS", label: "recession" },
        gdp: { code: "BUSINESS", label: "GDP" },
        earnings: { code: "BUSINESS", label: "earnings" },
        ipo: { code: "BUSINESS", label: "IPOs" },
        ipos: { code: "BUSINESS", label: "IPOs" },
        mergers: { code: "BUSINESS", label: "M&A" },
        acquisitions: { code: "BUSINESS", label: "M&A" },
        mna: { code: "BUSINESS", label: "M&A" },
        funding: { code: "BUSINESS", label: "funding" },
        fundraising: { code: "BUSINESS", label: "funding" },
        layoffs: { code: "BUSINESS", label: "layoffs" },
        salaries: { code: "BUSINESS", label: "salaries" },
        wage: { code: "BUSINESS", label: "wages" },
        wages: { code: "BUSINESS", label: "wages" },
        commodities: { code: "BUSINESS", label: "commodities" },
        oil: { code: "BUSINESS", label: "oil" },
        gas: { code: "BUSINESS", label: "energy" },
        energy: { code: "BUSINESS", label: "energy" },
        renewables: { code: "SCIENCE", label: "renewables" },
        solar: { code: "SCIENCE", label: "solar" },
        wind: { code: "SCIENCE", label: "wind" },
        ev: { code: "SCIENCE", label: "electric vehicles" },
        electric: { code: "SCIENCE", label: "electric vehicles" },
        vehicles: { code: "SCIENCE", label: "transport" },
        transportation: { code: "SCIENCE", label: "transport" },
        aviation: { code: "SCIENCE", label: "aviation" },
        airlines: { code: "WORLD", label: "travel" },
        spaceflight: { code: "SCIENCE", label: "spaceflight" },
        astronomy: { code: "SCIENCE", label: "astronomy" },
        physics: { code: "SCIENCE", label: "physics" },
        biology: { code: "SCIENCE", label: "biology" },
        chemistry: { code: "SCIENCE", label: "chemistry" },
        archaeology: { code: "SCIENCE", label: "archaeology" },
        paleontology: { code: "SCIENCE", label: "paleontology" },
        climatechange: { code: "SCIENCE", label: "climate" },
        wildfires: { code: "SCIENCE", label: "wildfires" },
        hurricanes: { code: "SCIENCE", label: "hurricanes" },
        earthquakes: { code: "SCIENCE", label: "earthquakes" },
        disasters: { code: "SCIENCE", label: "disasters" },
        pandemic: { code: "HEALTH", label: "pandemic" },
        vaccines: { code: "HEALTH", label: "vaccines" },
        mental: { code: "HEALTH", label: "mental health" },
        mindfulness: { code: "HEALTH", label: "mindfulness" },
        diet: { code: "HEALTH", label: "nutrition" },
        diabetes: { code: "HEALTH", label: "diabetes" },
        cancer: { code: "HEALTH", label: "cancer" },
        covid: { code: "HEALTH", label: "COVID" },
        biotech: { code: "HEALTH", label: "biotech" },
        pharma: { code: "HEALTH", label: "pharma" },
        drugs: { code: "HEALTH", label: "drugs" },
        hospitals: { code: "HEALTH", label: "hospitals" },
        insurance: { code: "HEALTH", label: "insurance" },
        schools: { code: "NATION", label: "education" },
        universities: { code: "NATION", label: "education" },
        tuition: { code: "NATION", label: "education" },
        renters: { code: "BUSINESS", label: "housing" },
        mortgages: { code: "BUSINESS", label: "housing" },
        startupsfunding: { code: "BUSINESS", label: "startups funding" },
        venturecapital: { code: "BUSINESS", label: "venture capital" },
        seed: { code: "BUSINESS", label: "startups funding" },
        seriesa: { code: "BUSINESS", label: "startups funding" },
        seriesb: { code: "BUSINESS", label: "startups funding" },
        seriesc: { code: "BUSINESS", label: "startups funding" },
        founders: { code: "BUSINESS", label: "startups" },
        entrepreneurship: { code: "BUSINESS", label: "startups" },
        creator: { code: "ENTERTAINMENT", label: "creator economy" },
        creators: { code: "ENTERTAINMENT", label: "creator economy" },
        youtube: { code: "ENTERTAINMENT", label: "YouTube" },
        tiktok: { code: "ENTERTAINMENT", label: "TikTok" },
        instagram: { code: "ENTERTAINMENT", label: "Instagram" },
        twitch: { code: "ENTERTAINMENT", label: "Twitch" },
        podcasts: { code: "ENTERTAINMENT", label: "podcasts" },
        books: { code: "ENTERTAINMENT", label: "books" },
        awards: { code: "ENTERTAINMENT", label: "awards" },
        fashion: { code: "ENTERTAINMENT", label: "fashion" },
        art: { code: "ENTERTAINMENT", label: "art" },
        theater: { code: "ENTERTAINMENT", label: "theater" },
        broadway: { code: "ENTERTAINMENT", label: "theater" },
        photography: { code: "ENTERTAINMENT", label: "photography" },
        design: { code: "ENTERTAINMENT", label: "design" },
        festival: { code: "ENTERTAINMENT", label: "festivals" },
        concerts: { code: "ENTERTAINMENT", label: "concerts" },
        comedy: { code: "ENTERTAINMENT", label: "comedy" },
        pc: { code: "ENTERTAINMENT", label: "PC gaming" },
        console: { code: "ENTERTAINMENT", label: "console gaming" },
        playstation: { code: "ENTERTAINMENT", label: "PlayStation" },
        xbox: { code: "ENTERTAINMENT", label: "Xbox" },
        nintendo: { code: "ENTERTAINMENT", label: "Nintendo" },
        worldcup: { code: "SPORTS", label: "World Cup" },
        olympics: { code: "SPORTS", label: "Olympics" },
        cricket: { code: "SPORTS", label: "cricket" },
        rugby: { code: "SPORTS", label: "rugby" },
        boxing: { code: "SPORTS", label: "boxing" },
        mma: { code: "SPORTS", label: "MMA" },
        ufc: { code: "SPORTS", label: "UFC" },
        wwe: { code: "SPORTS", label: "WWE" },
        wnba: { code: "SPORTS", label: "WNBA" },
        womens: { code: "SPORTS", label: "women's sports" },
        baseball: { code: "SPORTS", label: "baseball" },
        basketball: { code: "SPORTS", label: "basketball" },
        congress: { code: "NATION", label: "politics" },
        senate: { code: "NATION", label: "politics" },
        courts: { code: "NATION", label: "law" },
        supreme: { code: "NATION", label: "law" },
        diplomacy: { code: "WORLD", label: "diplomacy" },
        sanctions: { code: "WORLD", label: "sanctions" },
        refugees: { code: "WORLD", label: "refugees" },
        border: { code: "WORLD", label: "immigration" },
        defense: { code: "WORLD", label: "defense" },
        military: { code: "WORLD", label: "military" },
        humanitarian: { code: "WORLD", label: "humanitarian" },
        aid: { code: "WORLD", label: "aid" },
        africa: { code: "WORLD", label: "Africa" },
        europe: { code: "WORLD", label: "Europe" },
        asia: { code: "WORLD", label: "Asia" },
        middleeast: { code: "WORLD", label: "Middle East" },
        latinamerica: { code: "WORLD", label: "Latin America" },
        uk: { code: "WORLD", label: "UK" },
        usa: { code: "WORLD", label: "USA" },
        canada: { code: "WORLD", label: "Canada" },
        india: { code: "WORLD", label: "India" },
        china: { code: "WORLD", label: "China" },
        russia: { code: "WORLD", label: "Russia" },
        ukraine: { code: "WORLD", label: "Ukraine" },
        israel: { code: "WORLD", label: "Israel" },
        palestine: { code: "WORLD", label: "Palestine" },
        gaza: { code: "WORLD", label: "Gaza" },
        crypto: { code: "BUSINESS", label: "crypto" },
        cryptocurrency: { code: "BUSINESS", label: "crypto" },
        bitcoin: { code: "BUSINESS", label: "crypto" },
        ethereum: { code: "BUSINESS", label: "crypto" },
        web3: { code: "TECHNOLOGY", label: "web3" },
        startups: { code: "BUSINESS", label: "startups" },
        startup: { code: "BUSINESS", label: "startups" },
        venture: { code: "BUSINESS", label: "venture" },
        vc: { code: "BUSINESS", label: "venture" },
        economy: { code: "BUSINESS", label: "economy" },
        markets: { code: "BUSINESS", label: "markets" },
        stocks: { code: "BUSINESS", label: "stocks" },
        investing: { code: "BUSINESS", label: "investing" },
        finance: { code: "BUSINESS", label: "finance" },
        fintech: { code: "BUSINESS", label: "fintech" },
        banking: { code: "BUSINESS", label: "banking" },
        realestate: { code: "BUSINESS", label: "real estate" },
        housing: { code: "BUSINESS", label: "housing" },
        jobs: { code: "BUSINESS", label: "jobs" },
        labor: { code: "BUSINESS", label: "labor" },
        business: { code: "BUSINESS", label: "business" },
        sports: { code: "SPORTS", label: "sports" },
        sport: { code: "SPORTS", label: "sports" },
        nba: { code: "SPORTS", label: "NBA" },
        nfl: { code: "SPORTS", label: "NFL" },
        mlb: { code: "SPORTS", label: "MLB" },
        nhl: { code: "SPORTS", label: "NHL" },
        soccer: { code: "SPORTS", label: "soccer" },
        football: { code: "SPORTS", label: "football" },
        tennis: { code: "SPORTS", label: "tennis" },
        golf: { code: "SPORTS", label: "golf" },
        f1: { code: "SPORTS", label: "Formula 1" },
        racing: { code: "SPORTS", label: "racing" },
        esports: { code: "SPORTS", label: "esports" },
        gaming: { code: "ENTERTAINMENT", label: "gaming" },
        entertainment: { code: "ENTERTAINMENT", label: "entertainment" },
        movies: { code: "ENTERTAINMENT", label: "movies" },
        tv: { code: "ENTERTAINMENT", label: "TV" },
        streaming: { code: "ENTERTAINMENT", label: "streaming" },
        music: { code: "ENTERTAINMENT", label: "music" },
        celebrities: { code: "ENTERTAINMENT", label: "celebrities" },
        culture: { code: "ENTERTAINMENT", label: "culture" },
        science: { code: "SCIENCE", label: "science" },
        space: { code: "SCIENCE", label: "space" },
        nasa: { code: "SCIENCE", label: "space" },
        climate: { code: "SCIENCE", label: "climate" },
        environment: { code: "SCIENCE", label: "environment" },
        health: { code: "HEALTH", label: "health" },
        healthcare: { code: "HEALTH", label: "health" },
        medicine: { code: "HEALTH", label: "medicine" },
        wellness: { code: "HEALTH", label: "wellness" },
        fitness: { code: "HEALTH", label: "fitness" },
        nutrition: { code: "HEALTH", label: "nutrition" },
        travel: { code: "WORLD", label: "travel" },
        world: { code: "WORLD", label: "world" },
        global: { code: "WORLD", label: "world" },
        geopolitics: { code: "WORLD", label: "geopolitics" },
        war: { code: "WORLD", label: "world" },
        politics: { code: "NATION", label: "politics" },
        government: { code: "NATION", label: "politics" },
        elections: { code: "NATION", label: "elections" },
        policy: { code: "NATION", label: "policy" },
        law: { code: "NATION", label: "law" },
        crime: { code: "NATION", label: "crime" },
        education: { code: "NATION", label: "education" },
        immigration: { code: "NATION", label: "immigration" },
        national: { code: "NATION", label: "national" },
    };

    // Handle multi-word topics first (bigrams)
    for (let i = 0; i < tokens.length - 1; i++) {
        const pair = `${tokens[i]} ${tokens[i + 1]}`;
        if (pair === "ai safety") return { code: "TECHNOLOGY", label: "AI safety" };
        if (pair === "startup funding") return { code: "BUSINESS", label: "startups funding" };
        if (pair === "venture capital") return { code: "BUSINESS", label: "venture capital" };
        if (pair === "machine learning") return { code: "TECHNOLOGY", label: "machine learning" };
        if (pair === "artificial intelligence") return { code: "TECHNOLOGY", label: "AI" };
        if (pair === "real estate") return { code: "BUSINESS", label: "real estate" };
        if (pair === "electric vehicles") return { code: "SCIENCE", label: "electric vehicles" };
        if (pair === "mental health") return { code: "HEALTH", label: "mental health" };
        if (pair === "data privacy") return { code: "TECHNOLOGY", label: "privacy" };
    }

    for (const t of tokens) {
        if (topicMap[t]) return topicMap[t];
    }
    return null;
}

function extractNewsIndex(tokens: string[]) {
    const numberMap: Record<string, number> = {
        "one": 0, "first": 0, "1": 0,
        "two": 1, "second": 1, "2": 1,
        "three": 2, "third": 2, "3": 2,
        "four": 3, "fourth": 3, "4": 3,
        "five": 4, "fifth": 4, "5": 4,
        "six": 5, "sixth": 5, "6": 5,
    };
    const token = tokens.find((t) => numberMap[t] !== undefined);
    return token ? numberMap[token] : null;
}

// ===============================
// UNDERSTAND
// ===============================
function understand(input: string) {
    let tokens = parse(input);
    tokens = normalizeTokens(tokens);

    const { intent, confidence, scores, sorted } = detectIntent(tokens);

    const entities: Entities = {
        query: extractQuery(tokens, [
            "play",
            "pause",
            "resume",
            "stop",
            "replay",
            "next",
            "previous",
            "skip",
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
            "reread",
            "repeat",
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
            "music",
            "song",
            "track",
            "spotify",
            "playlist",
            "album",
            "news",
            "headline",
            "headlines",
            "latest",
            "article",
            "full",
            "fullpage",
            "local",
            "international",
            "global",
            "world",
            "tech",
            "technology",
            "finance",
            "business",
            "sports",
            "sport",
            "health",
            "science",
            "entertainment",
            "movies",
            "politics",
            "national",
        ]),
        newsScope: extractNewsScope(tokens),
        newsTopic: extractNewsTopic(tokens),
        newsIndex: extractNewsIndex(tokens),
    };

    return { intent, confidence, entities, scores, sorted };
}

// ===============================
// TASK REGISTRY
// ===============================
interface Task {
    intent: string;
    minConfidence: number;
    action: (entities: {
        query: string;
        newsScope?: "local" | "international" | null;
        newsTopic?: { code: string; label: string } | null;
        newsIndex?: number | null;
    }) => void | Promise<void>;
}

interface Entities {
    query: string;
    newsScope?: "local" | "international" | null;
    newsTopic?: { code: string; label: string } | null;
    newsIndex?: number | null;
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
            openSpotifyAndPlay(query);
        },
    },
    {
        intent: "MUSIC_PAUSE",
        minConfidence: 3,
        action: () => {
            speak("Pausing the music.");
            controlSpotify("pause");
        },
    },
    {
        intent: "MUSIC_RESUME",
        minConfidence: 3,
        action: () => {
            speak("Resuming playback.");
            controlSpotify("play");
        },
    },
    {
        intent: "MUSIC_STOP",
        minConfidence: 3,
        action: () => {
            speak("Stopping the music.");
            controlSpotify("stop");
        },
    },
    {
        intent: "MUSIC_NEXT",
        minConfidence: 3,
        action: () => {
            speak("Playing the next song.");
            controlSpotify("next");
        },
    },
    {
        intent: "MUSIC_PREV",
        minConfidence: 3,
        action: () => {
            speak("Playing the previous song.");
            controlSpotify("prev");
        },
    },
    {
        intent: "MUSIC_REPLAY",
        minConfidence: 3,
        action: () => {
            speak("Replaying this song.");
            controlSpotify("replay");
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
            const hasCity = Boolean(query && query.trim());
            const city = hasCity ? query.trim() : "";

            speak(`Checking the weather ${hasCity ? `for ${city}` : ""}.`);

            try {
                let weatherUrl = "";
                let fallbackLocation = "";

                if (hasCity) {
                    updateWeatherState({ pendingCityPrompt: false });
                    fallbackLocation = city;
                    weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OPEN_WEATHER_API_KEY}&units=metric`;
                } else {
                    if (weatherState.pendingCityPrompt) {
                        speak("Which city should I use?");
                        return;
                    }
                    const coords = await getUserCoords();
                    if (coords) {
                        weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${coords.lat}&lon=${coords.lon}&appid=${OPEN_WEATHER_API_KEY}&units=metric`;
                    } else {
                        updateWeatherState({ pendingCityPrompt: true });
                        speak("I couldn't get your location. Which city should I use?");
                        return;
                    }
                }

                const response = await fetch(weatherUrl);
                if (!response.ok) {
                    throw new Error(`Weather HTTP ${response.status}`);
                }
                const data = await response.json();
                const speech = buildWeatherSpeech(data, fallbackLocation);
                speak(speech);
            } catch (e) {
                console.error("Weather fetch failed", e);
                speak("Sorry, I couldn't get the weather right now.");
            }
        },
    },
    {
        intent: "NEWS",
        minConfidence: 2,
        action: async ({ newsScope, newsTopic }) => {
            const rememberedScope = newsState.scope;
            const rememberedTopic = newsState.topic;
            const scope = newsScope || rememberedScope;
            const topic = newsTopic || rememberedTopic;

            if (!scope) {
                newsState.pending = true;
                speak("Do you want local or international news? You can also say a topic like tech, finance, or sports.");
                return;
            }

            newsState.pending = false;
            newsState.scope = scope;
            newsState.topic = topic || null;
            await fetchNews({ scope, topic: topic || null });
        },
    },
    {
        intent: "READ_NEWS_ITEM",
        minConfidence: 3,
        action: async ({ newsIndex }) => {
            if (latestNews.length === 0) {
                speak("I don't have fresh headlines yet. Ask for the latest news first.");
                return;
            }
            const index = newsIndex ?? newsState.lastReadIndex;
            if (index !== null && index !== undefined && latestNews[index]) {
                const item = latestNews[index];
                newsState.lastReadIndex = index;
                await readNewsSummaryThenFull(item);
            } else {
                speak("I couldn't find that news item.");
            }
        }
    },
    {
        intent: "NEWS_OPEN_ITEM",
        minConfidence: 3,
        action: ({ newsIndex }) => {
            if (latestNews.length === 0) {
                speak("I haven't fetched any news yet. Ask for the latest news first.");
                return;
            }
            const index = newsIndex ?? newsState.lastReadIndex;
            if (index !== null && index !== undefined && latestNews[index]) {
                const item = latestNews[index];
                newsState.lastReadIndex = index;
                speak("Opening that headline.");
                openTab(item.link);
            } else {
                speak("I couldn't find that news item.");
            }
        }
    },
    {
        intent: "NEWS_READ_FULL",
        minConfidence: 3,
        action: async ({ newsIndex }) => {
            if (latestNews.length === 0) {
                speak("I haven't fetched any news yet. Ask for the latest news first.");
                return;
            }
            const index = newsIndex ?? newsState.lastReadIndex;
            if (index !== null && index !== undefined && latestNews[index]) {
                const item = latestNews[index];
                newsState.lastReadIndex = index;
                await readNewsSummaryThenFull(item);
            } else {
                speak("I couldn't find that news item.");
            }
        }
    },
    {
        intent: "NEWS_READ_FULL_BODY",
        minConfidence: 3,
        action: async ({ newsIndex }) => {
            if (latestNews.length === 0) {
                speak("I haven't fetched any news yet. Ask for the latest news first.");
                return;
            }
            const index = newsIndex ?? newsState.lastReadIndex;
            if (index !== null && index !== undefined && latestNews[index]) {
                const item = latestNews[index];
                newsState.lastReadIndex = index;
                await readNewsSummaryThenFull(item);
            } else {
                speak("I couldn't find that news item.");
            }
        }
    },
    {
        intent: "NEWS_READ_ALL",
        minConfidence: 3,
        action: async () => {
            if (latestNews.length === 0) {
                speak("I haven't fetched any news yet. Ask for the latest news first.");
                return;
            }

            newsState.isReadingList = true;
            newsState.stopReadingList = false;

            for (let i = 0; i < latestNews.length; i++) {
                if (newsState.stopReadingList) break;

                newsState.lastReadIndex = i;
                const item = latestNews[i];
                const text = `${i + 1}. ${item.title}.`;

                await new Promise<void>((resolve) => {
                    speak(text, resolve);
                });
            }

            newsState.isReadingList = false;
            newsState.stopReadingList = false;
        }
    },
    {
        intent: "NEWS_LATEST",
        minConfidence: 3,
        action: async () => {
            if (latestNews.length === 0) {
                speak("I haven't fetched any news yet. Ask for the latest news first.");
                return;
            }
            const index = 0;
            const item = latestNews[index];
            newsState.lastReadIndex = index;
            await readNewsSummaryAndAsk(item);
        }
    },
    {
        intent: "NEWS_NEXT",
        minConfidence: 3,
        action: async () => {
            if (newsState.isReadingList) {
                chrome.tts.stop();
                return;
            }
            if (latestNews.length === 0) {
                speak("I haven't fetched any news yet. Ask for the latest news first.");
                return;
            }
            const current = newsState.lastReadIndex ?? 0;
            const nextIndex = Math.min(current + 1, latestNews.length - 1);
            if (nextIndex === current) {
                speak("You're already at the last headline.");
                return;
            }
            const item = latestNews[nextIndex];
            newsState.lastReadIndex = nextIndex;
            await readNewsSummaryAndAsk(item);
        }
    },
    {
        intent: "NEWS_PREV",
        minConfidence: 3,
        action: async () => {
            if (latestNews.length === 0) {
                speak("I haven't fetched any news yet. Ask for the latest news first.");
                return;
            }
            const current = newsState.lastReadIndex ?? 0;
            const prevIndex = Math.max(current - 1, 0);
            if (prevIndex === current) {
                speak("You're already at the first headline.");
                return;
            }
            const item = latestNews[prevIndex];
            newsState.lastReadIndex = prevIndex;
            await readNewsSummaryAndAsk(item);
        }
    },
    {
        intent: "NEWS_STOP",
        minConfidence: 2,
        action: () => {
            if (newsState.isReadingList) {
                newsState.stopReadingList = true;
            }
            stopReadingInternal();
            chrome.tts.stop();
            speak("Stopped the news.");
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

            await readTabById(tab.id, tab.url);
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
    if (newsState.pending) {
        const scope = entities.newsScope;
        const topic = entities.newsTopic || newsState.topic;
        if (scope || topic) {
            newsState.pending = false;
            const resolvedScope = scope || "international";
            newsState.scope = resolvedScope;
            newsState.topic = topic || null;
            fetchNews({ scope: resolvedScope, topic });
            return;
        }
        if (intent === "NEWS") {
            speak("Please say local or international. You can also add a topic like tech, finance, or sports.");
            return;
        }
    }
    if (newsState.pendingFullChoice) {
        const wantsFull = ["full", "article", "story", "read", "yes", "sure"].some((t) => command.toLowerCase().includes(t));
        const wantsSummaryOnly = ["summary", "no", "stop", "cancel"].some((t) => command.toLowerCase().includes(t));
        if (wantsFull) {
            newsState.pendingFullChoice = false;
            const index = newsState.lastReadIndex;
            if (index !== null && index !== undefined && latestNews[index]) {
                readNewsSummaryThenFull(latestNews[index]);
                return;
            }
        }
        if (wantsSummaryOnly) {
            newsState.pendingFullChoice = false;
            speak("Okay.");
            return;
        }
    }
    let effectiveIntent = intent;
    if (entities.newsIndex !== null && entities.newsIndex !== undefined && latestNews.length > 0) {
        const tokens = normalizeTokens(parse(command));
        const hasNewsWords = tokens.some((t) => ["news", "headline", "headlines", "article", "articles", "story", "stories"].includes(t));
        if (tokens.includes("open") && (hasNewsWords || tokens.includes("read"))) {
            effectiveIntent = "NEWS_OPEN_ITEM";
        } else if (tokens.some((t) => ["full", "article", "story", "fullpage", "page"].includes(t))) {
            effectiveIntent = "NEWS_READ_FULL_BODY";
        } else if (tokens.includes("read") || hasNewsWords) {
            effectiveIntent = "READ_NEWS_ITEM";
        }
    }
    if (DEBUG_INTENT) {
        const topThree = sorted.slice(0, 3).map(([k, v]) => `${k}:${v}`).join(" | ");
        console.log("[OPPA] command:", command);
        console.log("[OPPA] intent:", intent, "confidence:", confidence, "effective:", effectiveIntent);
        console.log("[OPPA] top3:", topThree);
        console.log("[OPPA] scores:", scores);
        console.log("[OPPA] entities:", entities);
    }

    const task = TASK_REGISTRY.find(
        (t) => t.intent === effectiveIntent && confidence >= t.minConfidence
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
        // The popup will start listening after the OPPA_SPEECH_END event.
        sendResponse({ status: "speaking" });
        return true;
    }
    if (msg.type === "OPPA_STOP_ALL") {
        stopReadingInternal();
        chrome.tts.stop();
        chrome.runtime.sendMessage({ type: "OPPA_SPEECH_END" }).catch(() => { });
        sendResponse({ status: "stopped" });
        return true;
    }
});
