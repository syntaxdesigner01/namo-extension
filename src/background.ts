// ===============================
// Session State
// ===============================
let hasGreetedThisSession = false;

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

function speak(text: string) {
    chrome.tts.stop();

    chrome.runtime.sendMessage({ type: "OPPA_SPEECH_START" });
    chrome.runtime.sendMessage({ type: "OPPA_SPEECH_START" }).catch(() => { });

    chrome.tts.speak(text, {
        ...OPPA_VOICE,
        onEvent: (event) => {
            if (event.type === "end" || event.type === "cancelled") {
                chrome.runtime.sendMessage({ type: "OPPA_SPEECH_END" });
                chrome.runtime.sendMessage({ type: "OPPA_SPEECH_END" }).catch(() => { });
            }
        },
    });
}

function openTab(url: string) {
    chrome.tabs.create({ url });
}

// ===============================
// NLP CORE
// ===============================

// ---- Aliases (normalize meaning)
const ALIASES: Record<string, string> = {
    go: "open",
    launch: "open",
    start: "play",
    listen: "play",
    picture: "image",
    photo: "image",
    images: "image",
    get: "open",

};

// ---- Parse input
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

// ---- Intent detection with confidence
function detectIntent(tokens: string[]) {
    const scores: Record<string, number> = {
        GREET: 0,
        OPEN_SITE: 0,
        SEARCH_WEB: 0,
        PLAY_MUSIC: 0,
        PLAY_YOUTUBE: 0,
        MEDIA_CONTROL: 0,
        GET_IMAGE: 0,
        DEV_SEARCH: 0,
        TAB_CONTROL: 0,
        TIME: 0,
        DATE: 0,
        HELP: 0,
        WEATHER: 0,
        UNKNOWN: 0,
    };

    tokens.forEach((t) => {
        if (["hi", "hello", "hey"].includes(t)) scores.GREET += 1;
        if (t === "open") scores.OPEN_SITE += 2;
        if (["search", "find"].includes(t)) scores.SEARCH_WEB += 2;
        if (t === "play") scores.PLAY_MUSIC += 2;
        if (t === "youtube") scores.PLAY_YOUTUBE += 2;
        if (["pause", "resume", "stop"].includes(t)) scores.MEDIA_CONTROL += 2;
        if (t === "image") scores.GET_IMAGE += 2;
        if (["github", "npm", "stackoverflow"].includes(t)) scores.DEV_SEARCH += 2;
        if (["tab", "next", "close"].includes(t)) scores.TAB_CONTROL += 2;
        if (t === "time") scores.TIME += 2;
        if (t === "date") scores.DATE += 2;
        if (["help", "commands"].includes(t)) scores.HELP += 2;
        if (t === "weather") scores.WEATHER += 2;
    });

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [intent, confidence] = sorted[0];

    return { intent, confidence };
}

// ---- Entity extraction
function extractQuery(tokens: string[], ignore: string[]) {
    return tokens.filter((t) => !ignore.includes(t)).join(" ");
}

// ---- Understand (single source of truth)
function understand(input: string) {
    let tokens = parse(input);
    tokens = normalizeTokens(tokens);

    const { intent, confidence } = detectIntent(tokens);

    const entities = {
        query: extractQuery(tokens, [
            "play",
            "open",
            "search",
            "image",
            "weather",
            "youtube",
            "me",
            "some",
            "a",
            "an",
            "to",
            "on",
            "for",
            "in",
            "get",
            "date"

        ]),
    };

    return { intent, confidence, entities };
}

// ===============================
// TASK REGISTRY
// ===============================
interface Task {
    intent: string;
    minConfidence: number;
    action: (entities: { query: string }) => void;
}

const TASK_REGISTRY: Task[] = [
    {
        intent: "GREET",
        minConfidence: 1,
        action: () => speak("Hello. What would you like me to do?"),
    },
    {
        intent: "PLAY_MUSIC",
        minConfidence: 2,
        action: ({ query }) => {
            speak("Alright. Playing it now.");
            openTab(`https://open.spotify.com/search/${query}`);
        },
    },
    {
        intent: "PLAY_YOUTUBE",
        minConfidence: 2,
        action: ({ query }) => {
            speak("Opening YouTube.");
            openTab(
                `https://www.youtube.com/results?search_query=${query}`
            );
        },
    },
    {
        intent: "GET_IMAGE",
        minConfidence: 2,
        action: ({ query }) => {
            speak("Here you go.");
            openTab(`https://www.google.com/search?tbm=isch&q=${query || "nature"}`)
        },
    },
    {
        intent: "SEARCH_WEB",
        minConfidence: 2,
        action: ({ query }) => {
            speak("Searching.");
            openTab(`https://www.google.com/search?q=${query}`);
        },
    },
    {
        intent: "DEV_SEARCH",
        minConfidence: 2,
        action: ({ query }) => {
            speak("Searching developer resources.");
            openTab(`https://github.com/search?q=${query}`);
        },
    },
    {
        intent: "TIME",
        minConfidence: 2,
        action: () => {
            const time = new Date();
            let hr = time.getHours().toLocaleString()
            let mins = time.getMinutes().toLocaleString()
            let am = time.getHours() >= 12 ? 'PM' : 'AM';
            speak(`The time is ${hr} : ${mins} ${am}`);
        },
    },
    {
        intent: "DATE",
        minConfidence: 2,
        action: () => {
            const time = new Date();
            let date = time.toString().split(' ').splice(1, 3).join(" ")
            speak(`Today’s date is ${date}`);
        },
    },
    {
        intent: "WEATHER",
        minConfidence: 2,
        action: ({ query }) => {
            speak(`Checking the weather ${query ? `for ${query}` : ''}.`);
            openTab(`https://www.google.com/search?q=weather+${query}`);
        },
    },
    {
        intent: "HELP",
        minConfidence: 1,
        action: () => {
            speak(
                "You can ask me to play music, open websites, search the web, or get images."
            );
        },
    },
];

// ===============================
// COMMAND HANDLER
// ===============================
function handleCommand(command: string) {
    const { intent, confidence, entities } = understand(command);

    console.log({ intent, confidence, entities });

    const task = TASK_REGISTRY.find(
        (t) => t.intent === intent && confidence >= t.minConfidence
    );

    if (!task) {
        speak("Sorry, I didn’t understand that. Try saying help.");
        return;
    }

    task.action(entities);
}

// ===============================
// MESSAGE LISTENER
// ===============================
chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
    if (msg.type === "OPPA_POPUP_OPENED") {
        if (!hasGreetedThisSession) {
            // speak("Hi. what do you want to do today?. ");
            hasGreetedThisSession = true;
        }
        sendResponse({ status: "ready" });
    }

    if (msg.type === "OPPA_VOICE_COMMAND") {
        handleCommand(msg.text);
    }
});
