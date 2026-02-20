import { speak } from "../utils/speech.ts";

export function controlSpotify(action: "play" | "pause" | "next" | "prev" | "replay" | "stop") {
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

export function openSpotifyAndPlay(query: string) {
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
