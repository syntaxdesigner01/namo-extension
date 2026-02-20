// TTS CONFIG
export const OPPA_VOICE = {
    lang: "en-GB",
    rate: 0.85,
    pitch: 0.9,
    volume: 1,
    voiceName: "Google UK English Female",
};

export let suppressListenReady = false;
export let listenSuppressCount = 0;

export function setSuppressListenReady(value: boolean) {
    suppressListenReady = value;
}

export function setListenSuppressCount(value: number) {
    listenSuppressCount = value;
}

export function incrementListenSuppressCount() {
    listenSuppressCount++;
}

export function decrementListenSuppressCount() {
    listenSuppressCount = Math.max(0, listenSuppressCount - 1);
}

export function speak(text: string, onEnd?: () => void, options?: { interrupt?: boolean; suppressListen?: boolean }) {
    if (options?.interrupt !== false) {
        chrome.tts.stop();
    }

    if (options?.suppressListen) {
        incrementListenSuppressCount();
    }

    chrome.runtime.sendMessage({ type: "OPPA_LISTEN_STATUS", status: "speaking" }).catch(() => { });
    chrome.runtime.sendMessage({ type: "OPPA_SPEECH_START" }).catch(() => { });

    chrome.tts.speak(text, {
        ...OPPA_VOICE,
        onEvent: (event) => {
            if (event.type === "end" || event.type === "cancelled") {
                chrome.runtime.sendMessage({ type: "OPPA_SPEECH_END" }).catch(() => { });
                if (options?.suppressListen) {
                    decrementListenSuppressCount();
                }
                if (!suppressListenReady && listenSuppressCount === 0) {
                    chrome.runtime.sendMessage({ type: "OPPA_LISTEN_STATUS", status: "ready_to_listen" }).catch(() => { });
                }
                if (onEnd) onEnd();
            }
        },
    });
}

export async function withListenSuppressed<T>(fn: () => Promise<T>) {
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

export async function speakSequential(chunks: string[]) {
    await withListenSuppressed(async () => {
        for (const chunk of chunks) {
            await new Promise<void>((resolve) => {
                speak(chunk, resolve, { interrupt: false });
            });
        }
    });
}
