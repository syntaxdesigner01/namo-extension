// c:\Users\syntax\Documents\projects\namo-extension\src\permission.ts
const grantBtn = document.getElementById('grant-btn');
const denyBtn = document.getElementById('deny-btn');

if (grantBtn) {
    grantBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Stop the tracks immediately after getting permission, we just needed the grant
            stream.getTracks().forEach(track => track.stop());

            // Notify background script to initialize offscreen recording
            chrome.runtime.sendMessage({ type: "INIT_OFFSCREEN" });
            chrome.runtime.sendMessage({ type: "START_RECORDING" });

            window.close();
        } catch (error) {
            console.error("Permission denied:", error);
            alert("Permission is required to use this feature.");
        }
    });
}

if (denyBtn) {
    denyBtn.addEventListener('click', () => {
        window.close();
    });
}
