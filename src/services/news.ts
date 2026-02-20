import { speak, speakSequential } from "../utils/speech.ts";
import { buildNewsRssUrl, fetchWithRetry } from "../utils/helpers.ts";
import { getCountryCode } from "../utils/helpers.ts";
import { latestNews, setLatestNews, lastFetchTime, setLastFetchTime, cachedNewsOptions, setCachedNewsOptions, newsState } from "../state.ts";
import { readTabById } from "./reader.ts";
import type { NewsItem, NewsTopic } from "../types.ts";

export async function readNewsSummaryThenFull(item: { title: string; summary: string; link: string }) {
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

export async function readNewsSummaryAndAsk(item: { title: string; summary: string; link: string }) {
    const summary = item.summary
        ? `${item.title}. ${item.summary}`
        : `${item.title}. I couldn't find a summary, but I can open the full article.`;
    await speakSequential([summary, "Would you like me to read the full article?"]);
    newsState.pendingFullChoice = true;
}

export async function fetchNews(options: { scope: "local" | "international"; topic?: NewsTopic | null }) {
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

        let fetchedItems: NewsItem[] = [];
        if (data?.status === "ok" && Array.isArray(data.items) && data.items.length > 0) {
            fetchedItems = data.items.slice(0, 6).map((item: any) => ({
                title: item.title.split(" - ")[0],
                link: item.link,
                summary: (item.description || item.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            }));
        } else {
            // Fallback: fetch RSS XML directly and parse minimal fields
            const rssResp = await fetchWithRetry(rssUrl);
            const rssText = await rssResp.text();
            const items = rssText.match(/<item>[\s\S]*?<\/item>/gi) || [];
            fetchedItems = items.slice(0, 6).map((raw) => {
                const titleMatch = raw.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
                const linkMatch = raw.match(/<link>(.*?)<\/link>/i);
                const descMatch = raw.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/i);
                const title = (titleMatch?.[1] || titleMatch?.[2] || "").split(" - ")[0].trim();
                const link = (linkMatch?.[1] || "").trim();
                const summary = (descMatch?.[1] || descMatch?.[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                return { title, link, summary };
            }).filter((n) => n.title && n.link);
        }

        setLatestNews(fetchedItems);
        setLastFetchTime(Date.now());
        setCachedNewsOptions(options);
        chrome.storage.local.set({ latestNews: fetchedItems, lastFetchTime: Date.now(), cachedNewsOptions: options });

        if (fetchedItems.length > 0) {
            const titles = fetchedItems.map((n) => n.title);
            speak(`Here are the top ${titles.length} headlines: ${titles.join(". ")}. You can ask me to read a specific one or open all of them.`);
        } else {
            speak("I couldn't find any news.");
        }
    } catch (e) {
        console.error("News fetch error:", e);
        speak("Sorry, I couldn't get the news.");
    }
}
