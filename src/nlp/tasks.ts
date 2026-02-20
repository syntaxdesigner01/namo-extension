import { speak } from "../utils/speech.ts";
import { pick, openTab, humanizeTime } from "../utils/helpers.ts";
import { fetchNews, readNewsSummaryThenFull, readNewsSummaryAndAsk } from "../services/news.ts";
import { readTabById, readFromIndex, stopReadingInternal } from "../services/reader.ts";
import { controlSpotify, openSpotifyAndPlay } from "../services/spotify.ts";
import { fetchWeather } from "../services/weather.ts";
import { searchAndRead } from "../services/duckduckgo.ts";
import { latestNews, newsState, readingState } from "../state.ts";
import type { Task } from "../types.ts";

export const TASK_REGISTRY: Task[] = [
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
                    "I’m Oppa. I'm your personal assistant.",
                    "My name is Oppa. I was created to help you browse the web.",
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
            await searchAndRead(query);
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
            speak(`The time is ${humanizeTime(d)}.`);
        },
    },
    {
        intent: "WEATHER",
        minConfidence: 2,
        action: async ({ query }) => {
            await fetchWeather(query);
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
