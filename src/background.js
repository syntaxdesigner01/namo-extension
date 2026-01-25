// Background service worker

console.log("Namo AI background script loaded");

// You can add background event listeners and other logic here
chrome.runtime.onInstalled.addListener(() => {
    console.log("Namo AI extension installed");
});

