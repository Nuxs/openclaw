/**
 * Service worker for the OpenClaw Web3 Audit Bridge.
 *
 * Receives provider request events from content scripts and forwards them
 * to the Gateway ingest endpoint with retry + exponential back-off.
 */

const DEFAULT_CONFIG = {
  endpoint: "http://127.0.0.1:18789/plugins/web3-core/ingest",
  token: "",
};

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 500;
const MAX_QUEUE_SIZE = 200;

/** @type {{ payload: unknown; attempt: number }[]} */
const retryQueue = [];
let retryTimerId = null;

async function loadConfig() {
  return await chrome.storage.local.get(DEFAULT_CONFIG);
}

async function postToGateway(payload, attempt = 0) {
  const config = await loadConfig();
  const headers = { "Content-Type": "application/json" };
  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  }

  try {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    // Server-side transient errors — queue for retry
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      enqueueRetry(payload, attempt);
    }
  } catch {
    // Network failure — queue for retry
    if (attempt < MAX_RETRIES) {
      enqueueRetry(payload, attempt);
    }
  }
}

function enqueueRetry(payload, attempt) {
  if (retryQueue.length >= MAX_QUEUE_SIZE) {
    // Drop oldest to prevent unbounded memory growth
    retryQueue.shift();
  }
  retryQueue.push({ payload, attempt: attempt + 1 });
  scheduleFlush();
}

function scheduleFlush() {
  if (retryTimerId !== null) return;
  // Exponential back-off based on the oldest entry's attempt count
  const oldest = retryQueue[0];
  const delay = oldest ? BASE_DELAY_MS * 2 ** oldest.attempt : BASE_DELAY_MS;
  retryTimerId = setTimeout(() => {
    retryTimerId = null;
    void flushQueue();
  }, delay);
}

async function flushQueue() {
  const batch = retryQueue.splice(0, retryQueue.length);
  for (const entry of batch) {
    await postToGateway(entry.payload, entry.attempt);
  }
}

// Listen for events relayed from content scripts
chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "OPENCLAW_WEB3_REQUEST") return;
  if (!message.payload) return;
  void postToGateway(message.payload);
});
