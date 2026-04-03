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

recognition.onerror = (event: any) => {
    stopProcessingState();
    visualizer?.classList.remove('listening');
    stopVisualizer();
    console.error("Recognition error:", event.error);
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showPermissionScreen(true);
    } else if (event.error === 'no-speech') {
        if (textOutput) {
            textOutput.textContent = "No speech detected. Try again.";
        }
        retryBtn?.classList.remove('hidden');
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

// ===============================
// PERMISSION SCREEN
// ===============================
const permissionScreen = document.getElementById('permission-screen');
const allowMicBtn = document.getElementById('allow-mic-btn');
const blockedMsg = document.getElementById('blocked-msg');

function showPermissionScreen(blocked: boolean) {
    permissionScreen?.classList.remove('hidden');
    permissionScreen?.classList.add('flex');
    if (blocked) {
        allowMicBtn?.classList.add('hidden');
        blockedMsg?.classList.remove('hidden');
    } else {
        allowMicBtn?.classList.remove('hidden');
        blockedMsg?.classList.add('hidden');
    }
}

function hidePermissionScreen() {
    permissionScreen?.classList.add('hidden');
    permissionScreen?.classList.remove('flex');
}

document.addEventListener("DOMContentLoaded", async () => {
    const startChat = document.getElementById('Start-chat');
    const speech = document.getElementById('speech');
    const listen = document.getElementById('listen');
    const loading = document.getElementById('loading');

    startChat?.classList.add('hidden');
    loading?.classList.remove('hidden');

    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === "OPPA_LISTEN_STATUS") {
            if (msg.status === "speaking") {
                stopListening();
            }
            if (msg.status === "ready_to_listen") {
                startListening();
            }
        }

        if (msg.type === "OPPA_SPEECH_START") {
            stopListening();
            startSpeaking();
            speech?.classList.remove('hidden');
            listen?.classList.add('hidden');
        }
        if (msg.type === "OPPA_SPEECH_END") {
            stopSpeaking();
            speech?.classList.add('hidden');
            listen?.classList.remove('hidden');
            // UI only. startListening() is triggered solely by
            // OPPA_LISTEN_STATUS: ready_to_listen — the single authoritative
            // signal from speak()'s onEvent microtask.
        }
    });

    function connectToBackground() {
        const timeoutId = setTimeout(() => {
            loading?.classList.add('hidden');
            startChat?.classList.remove('hidden');
            console.warn('Background script did not respond within timeout period.');
        }, 5000);

        chrome.runtime.sendMessage({ type: "OPPA_POPUP_OPENED" }, (response) => {
            clearTimeout(timeoutId);
            loading?.classList.add('hidden');
            startChat?.classList.remove('hidden');
            if (response?.status === "ready_to_listen") {
                startListening();
            }
        });
    }

    // Check microphone permission before connecting to background.
    // Differentiates: granted (proceed), prompt (show allow screen), denied (show blocked screen).
    let micGranted = false;
    try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        micGranted = result.state === 'granted';
        if (result.state === 'denied') {
            loading?.classList.add('hidden');
            showPermissionScreen(true);
        } else if (result.state === 'prompt') {
            loading?.classList.add('hidden');
            showPermissionScreen(false);
        }
        // Re-check if the user grants permission from the browser's own prompt
        result.addEventListener('change', () => {
            if (result.state === 'granted') {
                hidePermissionScreen();
                loading?.classList.remove('hidden');
                connectToBackground();
            } else if (result.state === 'denied') {
                showPermissionScreen(true);
            }
        });
    } catch {
        // Permissions API unavailable — proceed and let recognition.onerror handle it
        micGranted = true;
    }

    allowMicBtn?.addEventListener('click', () => {
        // Open the permission page in a new tab. The popup would close if
        // getUserMedia triggered a browser dialog here (focus loss closes popups).
        // The permissions.query change listener above handles re-connecting once granted.
        chrome.tabs.create({ url: chrome.runtime.getURL('src/permission.html') });
    });

    if (micGranted) {
        connectToBackground();
    }
});