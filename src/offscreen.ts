/// <reference types="chrome" />

console.log("Offscreen script loaded");

async function startListening() {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.error("Speech recognition not supported in this browser.");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                const transcript = event.results[i][0].transcript.trim().toLowerCase();
                console.log("Offscreen Heard:", transcript);

                if (transcript.includes("hey oppa") || transcript.includes("hey opa")) {
                    chrome.runtime.sendMessage({ type: "WAKE_WORD_DETECTED" });
                }
            }
        }
    };

    recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        // Restart on error if needed, or handle specific errors
        if (event.error === 'not-allowed') {
            console.error("Microphone permission denied.");
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        recognition.start();
        console.log("Listening for 'Hey Oppa' in offscreen...");
    } catch (e) {
        console.error("Failed to start recognition:", e);
    }
}

// Listen for messages from background to start/stop if needed
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'START_RECORDING') startListening();
});