import { ALIASES } from "../nlp/aliases.ts";

export function parse(input: string): string[] {
    return input
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .trim()
        .split(/\s+/);
}

export function normalizeTokens(tokens: string[]): string[] {
    return tokens.map((t) => ALIASES[t] ?? t);
}

export function hasPhrase(tokens: string[], phrase: string[]) {
    return phrase.every(p => tokens.includes(p));
}

export function pick(arr: string[]) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function openTab(url: string) {
    chrome.tabs.create({ url });
}

export async function getCountryCode() {
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

export async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, timeout = 10000): Promise<Response> {
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

export function splitIntoParagraphs(text: string): string[] {
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

export function describeTemp(tempC: number) {
    if (tempC <= 0) return "freezing";
    if (tempC <= 10) return "chilly";
    if (tempC <= 18) return "cool";
    if (tempC <= 24) return "mild";
    if (tempC <= 30) return "warm";
    return "hot";
}

export function describeWind(speed: number) {
    if (speed <= 2.5) return "light breeze";
    if (speed <= 6) return "gentle breeze";
    if (speed <= 10) return "breezy";
    if (speed <= 15) return "windy";
    return "very windy";
}

export function buildNewsRssUrl(options: { scope: "local" | "international"; topic?: { code: string; label: string } | null; countryCode?: string | null }) {
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

export function humanizeTime(d: Date) {
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
