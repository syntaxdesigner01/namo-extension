// c:\Users\syntax\Documents\projects\namo-extension\src\permission.ts
const grantBtn = document.getElementById('grant-btn');
const denyBtn = document.getElementById('deny-btn');

if (grantBtn) {
    grantBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            window.close();
        } catch (error) {
            console.error("Microphone permission denied:", error);
            const errorMsg = document.getElementById('error-msg') as HTMLElement;
            if (errorMsg) errorMsg.style.display = 'block';
            if (denyBtn) (denyBtn as HTMLButtonElement).textContent = "Close";
            (grantBtn as HTMLButtonElement).disabled = true;
        }
    });
}

if (denyBtn) {
    denyBtn.addEventListener('click', () => {
        window.close();
    });
}
