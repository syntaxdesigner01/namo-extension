import type { NewsItem, NewsTopic, NewsState, ReadingState, WeatherState } from "./types.ts";

export let hasGreetedThisSession = false;
export function setHasGreetedThisSession(val: boolean) { hasGreetedThisSession = val; }

export let latestNews: NewsItem[] = [];
export function setLatestNews(val: NewsItem[]) { latestNews = val; }

export let lastFetchTime = 0;
export function setLastFetchTime(val: number) { lastFetchTime = val; }

export let cachedNewsOptions: { scope: string; topic?: NewsTopic | null } | null = null;
export function setCachedNewsOptions(val: { scope: string; topic?: NewsTopic | null } | null) { cachedNewsOptions = val; }

export const newsState: NewsState = {
    pending: false,
    scope: null,
    topic: null,
    lastReadIndex: null,
    pendingFullChoice: false,
    isReadingList: false,
    stopReadingList: false,
};

export const readingState: ReadingState = {
    chunks: [],
    index: 0,
    isReading: false,
    sourceUrl: "",
};

export let weatherState: WeatherState = {
    pendingCityPrompt: false,
};
export function setWeatherState(patch: Partial<WeatherState>) {
    weatherState = { ...weatherState, ...patch };
    chrome.storage.local.set({ weatherState });
}
