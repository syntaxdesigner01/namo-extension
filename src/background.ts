import {
    hasGreetedThisSession,
    setHasGreetedThisSession,
    latestNews,
    setLatestNews,
    setLastFetchTime,
    setCachedNewsOptions,
    newsState,
} from "./state.ts";

import {
    speak,
} from "./utils/speech.ts";

import {
    parse,
    normalizeTokens,
} from "./utils/helpers.ts";

import {
    fetchNews,
    readNewsSummaryThenFull,
} from "./services/news.ts";

import {
    stopReadingInternal
} from "./services/reader.ts";

import type { NewsItem } from "./types.ts";

import { understand } from "./nlp/processor.ts";
import { TASK_REGISTRY } from "./nlp/tasks.ts";

// ===============================
// INITIALIZATION
// ===============================
chrome.storage.local.get(["latestNews", "lastFetchTime", "cachedNewsOptions"], (result: { [key: string]: any }) => {
    if (result.latestNews) setLatestNews(result.latestNews as NewsItem[]);
    if (result.lastFetchTime) setLastFetchTime(result.lastFetchTime as number);
    if (result.cachedNewsOptions) setCachedNewsOptions(result.cachedNewsOptions);
});

console.log("Oppa background running");

// ===============================
// COMMAND QUEUE
// ===============================
const commandQueue: string[] = [];
let isProcessingCommand = false;

// ===============================
// EXECUTOR
// ===============================
async function handleCommandAsync(command: string): Promise<void> {
    const { intent, confidence, entities } = understand(command);

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
                await readNewsSummaryThenFull(latestNews[index]);
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

    const task = TASK_REGISTRY.find(
        (t) => t.intent === effectiveIntent && confidence >= t.minConfidence
    );

    if (task) {
        await task.action(entities);
    } else {
        speak("I’m not sure I understood that.");
    }
}

async function processCommandQueue(): Promise<void> {
    if (isProcessingCommand || commandQueue.length === 0) return;
    isProcessingCommand = true;
    const command = commandQueue.shift()!;
    try {
        await handleCommandAsync(command);
    } finally {
        isProcessingCommand = false;
        if (commandQueue.length > 0) {
            // Macrotask yield via setTimeout(0): gives Chrome IPC a full
            // event loop turn to deliver OPPA_SPEECH_END / ready_to_listen
            // to the popup before the next command’s TTS begins.
            setTimeout(processCommandQueue, 0);
        }
    }
}

// ===============================
// MESSAGE LISTENER
// ===============================
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "OPPA_POPUP_OPENED") {
        if (!hasGreetedThisSession) {
            speak("Hi. I’m Oppa.");
            setHasGreetedThisSession(true);
            sendResponse({ status: "speaking" });
        } else {
            sendResponse({ status: "ready_to_listen" });
        }
        return true;
    }

    if (msg.type === "OPPA_VOICE_COMMAND") {
        commandQueue.push(msg.text);
        processCommandQueue(); // idempotent — no-op if already processing
        sendResponse({ status: "speaking" });
        return true;
    }

    if (msg.type === "OPPA_STOP_ALL") {
        commandQueue.length = 0;     // discard any pending commands
        isProcessingCommand = false; // release lock so future commands work
        stopReadingInternal();
        chrome.tts.stop();
        chrome.runtime.sendMessage({ type: "OPPA_SPEECH_END" }).catch(() => { });
        sendResponse({ status: "stopped" });
        return true;
    }
});