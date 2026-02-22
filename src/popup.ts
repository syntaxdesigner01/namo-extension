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
    isListening = true;
    showMainContent();
    stopProcessingState();
    visualizer?.classList.add('listening');
    setupVisualizer();
    if (textOutput) {
        textOutput.textContent = "Listening...";
    }
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

const mainContent = document.getElementById('main-content');
const skeletonLoader = document.getElementById('skeleton-loader');
const networkError = document.getElementById('network-error');
const networkRetryBtn = document.getElementById('network-retry-btn');
let initTimeoutId: number | null = null;
let isInitialized = false;

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

document.addEventListener("DOMContentLoaded", () => {
    const speech = document.getElementById('speech');
    const listen = document.getElementById('listen');

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
            }
            if (msg.status === "ready_to_listen") {
                showMainContent();
                startListening();
            }
        }

        if (msg.type === "OPPA_SPEECH_START") {
            showMainContent();
            stopListening();
            startSpeaking();
            speech?.classList.remove('hidden');
            listen?.classList.add('hidden');
        }
        if (msg.type === "OPPA_SPEECH_END") {
            stopSpeaking();
            speech?.classList.add('hidden');
            listen?.classList.remove('hidden');
            startListening();
        }
    });

    chrome.runtime.sendMessage({ type: "OPPA_POPUP_OPENED" }, (response) => {
        if (response?.status === "ready_to_listen" || response?.status === "speaking") {
            showMainContent();
            if (response.status === "ready_to_listen") {
                startListening();
            } else {
                startSpeaking();
            }
        }
        // If not ready, we keep skeleton and wait for message or timeout
    });
});

recognition.onerror = (event: any) => {
    stopProcessingState();
    visualizer?.classList.remove('listening');
    stopVisualizer();
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
            textOutput.textContent = "I didn't hear anything. Try again?";
            textOutput.classList.replace("text-red-400", "text-amber-200");
        } else {
            textOutput.textContent = `Error: ${event.error}. Please try again.`;
        }
    }
    retryBtn?.classList.remove('hidden');
};