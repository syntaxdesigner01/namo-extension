const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

// Get a reference to the visualizer element from popup.html
const visualizer = document.getElementById('visualizer');
const textOutput = document.getElementById('text-output');
const retryBtn = document.getElementById('retry-btn');

const recognition = new SpeechRecognition();
recognition.lang = "en-GB";
recognition.continuous = false;
recognition.interimResults = false;

let isListening = false;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let dataArray: Uint8Array<ArrayBuffer> | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let stream: MediaStream | null = null;
let animationId: number | null = null;
let isVisualizerActive = false;
let processingTimeout: number | null = null;
let listeningTimeout: number | null = null;
let noSpeechRetryCount = 0;
const NO_SPEECH_RETRY_LIMIT = 2;
const NO_SPEECH_RETRY_DELAY_MS = 600;


/**
 * Adds the 'speaking' class to the visualizer element to trigger animations.
 */
function startSpeaking() {
    visualizer?.classList.add('speaking');
}

/**
 * Removes the 'speaking' class from the visualizer element to stop animations.
 */
function stopSpeaking() {
    visualizer?.classList.remove('speaking');
}

function stopListening() {
    if (isListening) {
        recognition.stop();
    }
}

function startListening() {
    if (!isListening) {
        try {
            recognition.start();
            isListening = true;
        } catch (e) {
            console.error("Failed to start recognition:", e);
            isListening = false;
        }
    }
}

async function setupVisualizer() {
    isVisualizerActive = true;
    try {
        const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        if (!isVisualizerActive) {
            localStream.getTracks().forEach(track => track.stop());
            return;
        }

        stream = localStream;
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength) as Uint8Array<ArrayBuffer>;

        source.connect(analyser);

        visualize();
    } catch (err) {
        console.error("Visualizer setup failed:", err);
    }
}

function visualize() {
    if (!analyser || !dataArray || !visualizer) return;

    animationId = requestAnimationFrame(visualize);

    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    const scale = 1 + (average / 255) * 0.5;

    visualizer.style.transform = `scale(${scale})`;
}

function stopVisualizer() {
    isVisualizerActive = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    if (visualizer) {
        visualizer.style.transform = 'scale(1)';
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}

function startProcessingAnimation() {
    if (!textOutput) return;
    textOutput.textContent = "Processing";
    textOutput.classList.add('processing');
}

function stopProcessingState() {
    if (textOutput) {
        textOutput.classList.remove('processing');
    }
    if (processingTimeout) {
        clearTimeout(processingTimeout);
        processingTimeout = null;
    }
}

recognition.onresult = (event: any) => {
    stopProcessingState();
    if (listeningTimeout) {
        clearTimeout(listeningTimeout);
        listeningTimeout = null;
    }
    noSpeechRetryCount = 0;
    const text = event.results[0][0].transcript;

    if (textOutput) {
        textOutput.textContent = text;
    }

    chrome.runtime.sendMessage({
        type: "OPPA_VOICE_COMMAND",
        text
    });

};

recognition.onstart = () => {
    isListening = true;
    stopProcessingState();
    visualizer?.classList.add('listening');
    setupVisualizer();
    if (textOutput) {
        textOutput.textContent = "Listening...";
    }

    // Set a timeout to force stop listening if no speech is detected within 10 seconds
    listeningTimeout = window.setTimeout(() => {
        if (isListening) {
            recognition.stop();
        }
    }, 10000);
};

recognition.onspeechstart = () => {
    if (textOutput) {
        textOutput.textContent = "Listening...";
    }
    noSpeechRetryCount = 0;
};

recognition.onspeechend = () => {
    startProcessingAnimation();

    if (processingTimeout) clearTimeout(processingTimeout);
    processingTimeout = window.setTimeout(() => {
        stopProcessingState();
        if (textOutput) {
            textOutput.textContent = "No result. Try again.";
        }
        // `isListening` is set to false in the `onend` handler.
        retryBtn?.classList.remove('hidden');
    }, 5000);

    visualizer?.classList.remove('listening');
    stopVisualizer();
};

recognition.onend = () => {
    isListening = false;
    visualizer?.classList.remove('listening');
    stopVisualizer();
};

recognition.onerror = (event: any) => {
    stopProcessingState();
    if (listeningTimeout) {
        clearTimeout(listeningTimeout);
        listeningTimeout = null;
    }
    visualizer?.classList.remove('listening');
    stopVisualizer();
    if (event.error !== 'no-speech') {
        console.error("Recognition error:", event.error);
    }
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        if (textOutput) {
            textOutput.textContent = "Microphone access denied. Please allow permissions.";
            textOutput.classList.remove("text-white");
            textOutput.classList.add("text-red-500");
        }
        retryBtn?.classList.remove('hidden');
    } else if (event.error === 'no-speech') {
        if (noSpeechRetryCount < NO_SPEECH_RETRY_LIMIT) {
            noSpeechRetryCount += 1;
            if (textOutput) {
                textOutput.textContent = "I didn't catch that. Listening again...";
            }
            window.setTimeout(() => {
                if (!isListening) {
                    startListening();
                }
            }, NO_SPEECH_RETRY_DELAY_MS);
        } else {
            if (textOutput) {
                textOutput.textContent = "No speech detected. Try again.";
            }
            retryBtn?.classList.remove('hidden');
        }
    }
};

// Ensure the element exists before adding event listeners or calling functions.
if (visualizer) {
    visualizer.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: "OPPA_STOP_ALL" }, () => { });
        stopSpeaking();
        stopProcessingState();
        visualizer.classList.remove('speaking');
        visualizer.classList.add('listening');
        startListening();
    });
} else {
    console.error('Error: Visualizer element with ID "visualizer" not found.');
}

if (retryBtn) {
    retryBtn.addEventListener('click', () => {
        retryBtn.classList.add('hidden');
        if (textOutput) {
            textOutput.textContent = "";
            textOutput.classList.remove("text-red-500");
            textOutput.classList.add("text-white");
        }
        startListening();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const startChat = document.getElementById('Start-chat');
    const speech = document.getElementById('speech');
    const listen = document.getElementById('listen');
    const loading = document.getElementById('loading');

    startChat?.classList.add('hidden');
    loading?.classList.remove('hidden');

    // Set a timeout to handle cases where the background script doesn't respond
    const timeoutId = setTimeout(() => {
        loading?.classList.add('hidden');
        startChat?.classList.remove('hidden');
        console.warn('Background script did not respond within timeout period.');
    }, 5000); // 5 seconds timeout

    chrome.runtime.sendMessage({ type: "OPPA_POPUP_OPENED" }, (response) => {
        clearTimeout(timeoutId);
        loading?.classList.add('hidden');
        startChat?.classList.remove('hidden');
        if (response?.status === "ready_to_listen") {
            startListening();
        }
    });

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === "OPPA_LISTEN_STATUS") {
            if (msg.status === "speaking") {
                stopListening();
            } else if (msg.status === "ready_to_listen") {
                startListening();
            }
        }
        if (msg.type === "OPPA_SPEECH_START") {
            startSpeaking();
            speech?.classList.remove('hidden');
            listen?.classList.add('hidden');
        }
        if (msg.type === "OPPA_SPEECH_END") {
            stopSpeaking();
            speech?.classList.add('hidden');
            listen?.classList.remove('hidden');
        }
    });
});
