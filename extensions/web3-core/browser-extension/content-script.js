const injectedUrl = chrome.runtime.getURL("injected.js");
const script = document.createElement("script");
script.src = injectedUrl;
script.type = "text/javascript";
script.dataset.openclaw = "true";

// Wait for the script to actually execute before removing from DOM
script.addEventListener("load", () => script.remove());
script.addEventListener("error", () => script.remove());

(document.head || document.documentElement).appendChild(script);

// Relay provider events from the page context to the service worker
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.type !== "OPENCLAW_WEB3_REQUEST") return;
  chrome.runtime.sendMessage({
    type: "OPENCLAW_WEB3_REQUEST",
    payload: data.payload,
  });
});
