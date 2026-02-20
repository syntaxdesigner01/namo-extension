import { speak } from "../utils/speech.ts";
import { splitIntoParagraphs } from "../utils/helpers.ts";
import { readingState } from "../state.ts";

export function stopReadingInternal() {
    readingState.isReading = false;
    chrome.tts.stop();
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

import { withListenSuppressed } from "../utils/speech.ts";

export async function readFromIndex(startIndex: number, autoContinue: boolean) {
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

export async function readTabById(tabId: number, url?: string) {
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

        const text = (results?.[0]?.result as string);
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
