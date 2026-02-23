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
let isStartingListening = false;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let dataArray: Uint8Array<ArrayBuffer> | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let stream: MediaStream | null = null;
let animationId: number | null = null;
let isVisualizerActive = false;
let processingTimeout: number | null = null;
let startGuardTimeout: number | null = null;


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

async function startListening() {
    if (isListening || isStartingListening) {
        return;
    }

    isStartingListening = true;
    try {
        recognition.start();

        // If onstart is not fired, recover from a stuck startup state.
        if (startGuardTimeout) clearTimeout(startGuardTimeout);
        startGuardTimeout = window.setTimeout(() => {
            if (!isListening) {
                isStartingListening = false;
                if (textOutput) {
                    textOutput.textContent = "Mic did not start. Tap to retry.";
                    textOutput.classList.remove("text-white", "text-amber-200");
                    textOutput.classList.add("text-red-400");
                }
                retryBtn?.classList.remove('hidden');
            }
        }, 3000);
    } catch (e) {
        console.error("Failed to start recognition:", e);
        isListening = false;
        isStartingListening = false;
        if (textOutput) {
            textOutput.textContent = "Could not access microphone.";
            textOutput.classList.add("text-red-400");
            retryBtn?.classList.remove('hidden');
        }
    }
}

async function setupVisualizer() {
    if (isVisualizerActive && stream) return; // Prevent double-requesting hardware
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
        isVisualizerActive = false;
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
    // Smoother scaling
    const scale = 1 + (average / 150) * 0.4;

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
    const text = event.results[0][0].transcript;

    if (textOutput) {
        textOutput.textContent = text;
    }

    chrome.runtime.sendMessage({
        type: "OPPA_VOICE_COMMAND",
        text
    });

    isListening = false;
};

recognition.onstart = () => {
    if (startGuardTimeout) {
        clearTimeout(startGuardTimeout);
        startGuardTimeout = null;
    }
    isStartingListening = false;
    isListening = true;
    showMainContent();
    stopProcessingState();
    setupVisualizer().catch((err) => {
        console.warn("Visualizer setup skipped:", err);
    });
    updateUIVisuals('listening');
    if (textOutput) {
        textOutput.textContent = "Listening...";
        textOutput.classList.remove("text-red-400", "text-amber-200");
        textOutput.classList.add("text-white");
    }
    retryBtn?.classList.add('hidden');
};

recognition.onspeechstart = () => {
    if (textOutput) {
        textOutput.textContent = "Listening...";
    }
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
    if (startGuardTimeout) {
        clearTimeout(startGuardTimeout);
        startGuardTimeout = null;
    }
    isStartingListening = false;
    isListening = false;
    visualizer?.classList.remove('listening');
    stopVisualizer();
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
            textOutput.classList.remove("text-red-400", "text-amber-200", "text-amber-200/60");
            textOutput.classList.add("text-white");
        }
        startListening();
    });
}

const mainContent = document.getElementById('main-content') || document.getElementById('Start-chat');
const skeletonLoader = document.getElementById('skeleton-loader') || document.getElementById('loading');
const networkError = document.getElementById('network-error');
const networkRetryBtn = document.getElementById('network-retry-btn');
const speechVisual = document.getElementById('speech');
const listenVisual = document.getElementById('listen');

let initTimeoutId: number | null = null;
let isInitialized = false;
let speechEndTimeout: number | null = null;

function showMainContent() {
    if (isInitialized) return;
    isInitialized = true;
    if (initTimeoutId) clearTimeout(initTimeoutId);

    // Smooth transition
    setTimeout(() => {
        if (skeletonLoader) skeletonLoader.style.display = 'none';
        if (networkError) networkError.style.display = 'none';
        if (mainContent) mainContent.style.display = 'flex';
    }, 300);
}

function showNetworkError() {
    if (initTimeoutId) clearTimeout(initTimeoutId);
    if (skeletonLoader) skeletonLoader.style.display = 'none';
    if (mainContent) mainContent.style.display = 'none';
    if (networkError) networkError.style.display = 'flex';
}

if (networkRetryBtn) {
    networkRetryBtn.addEventListener('click', () => {
        if (networkError) networkError.style.display = 'none';
        if (skeletonLoader) skeletonLoader.style.display = 'flex';

        // Restart init timeout
        initTimeoutId = window.setTimeout(showNetworkError, 120000); // 2 minutes
        startListening();
    });
}

function updateUIVisuals(state: 'speaking' | 'listening' | 'idle') {
    if (state === 'speaking') {
        visualizer?.classList.add('speaking');
        visualizer?.classList.remove('listening');
        speechVisual?.classList.remove('hidden');
        listenVisual?.classList.add('hidden');
    } else if (state === 'listening') {
        visualizer?.classList.remove('speaking');
        visualizer?.classList.add('listening');
        speechVisual?.classList.add('hidden');
        listenVisual?.classList.remove('hidden');
    } else {
        visualizer?.classList.remove('speaking', 'listening');
        speechVisual?.classList.add('hidden');
        listenVisual?.classList.remove('hidden');
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // Show skeleton initially
    if (skeletonLoader) skeletonLoader.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'none';
    if (networkError) networkError.style.display = 'none';

    // Set a 2-minute timeout for network issues
    initTimeoutId = window.setTimeout(showNetworkError, 120000);

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === "OPPA_LISTEN_STATUS") {
            if (msg.status === "speaking") {
                stopListening();
                updateUIVisuals('speaking');
            }
            if (msg.status === "ready_to_listen") {
                showMainContent();
                if (speechEndTimeout) clearTimeout(speechEndTimeout);
                // 1000ms delay to ensure hardware is fully released by TTS
                speechEndTimeout = window.setTimeout(() => {
                    startListening();
                }, 1000);
            }
        }

        if (msg.type === "OPPA_SPEECH_START") {
            showMainContent();
            stopListening();
            updateUIVisuals('speaking');
            startSpeaking();
        }
        if (msg.type === "OPPA_SPEECH_END") {
            stopSpeaking();
            updateUIVisuals('listening');
            // Logic moved entirely to ready_to_listen to avoid double-starting
        }
    });

    chrome.runtime.sendMessage({ type: "OPPA_POPUP_OPENED" }, (response) => {
        if (response?.status === "ready_to_listen" || response?.status === "speaking") {
            showMainContent();
            if (response.status === "ready_to_listen") {
                // If already greeted, we can skip the wait
                startListening();
            } else {
                updateUIVisuals('speaking');
            }
        }
    });
});

recognition.onerror = (event: any) => {
    if (startGuardTimeout) {
        clearTimeout(startGuardTimeout);
        startGuardTimeout = null;
    }
    stopProcessingState();
    visualizer?.classList.remove('listening');
    stopVisualizer();
    isListening = false;
    isStartingListening = false;
    console.error("Recognition error:", event.error);

    if (textOutput) {
        textOutput.classList.remove("text-white");
        textOutput.classList.add("text-red-400");

        if (event.error === 'network') {
            textOutput.textContent = "Network error. Please check your connection.";
            if (!isInitialized) {
                showNetworkError();
            }
        } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            textOutput.textContent = "Microphone access denied. Please allow permissions.";
        } else if (event.error === 'no-speech') {
            if (!isInitialized) {
                // One-time retry if it happens during greeting
                console.warn("No speech during init, retrying...");
                startListening();
                return;
            }
            textOutput.textContent = "No speech detected. Try again.";
            textOutput.classList.replace("text-red-400", "text-amber-200");
        } else {
            textOutput.textContent = `Error: ${event.error}. Please try again.`;
        }
    }
    retryBtn?.classList.remove('hidden');
};
