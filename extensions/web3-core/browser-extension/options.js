const DEFAULT_CONFIG = {
  endpoint: "http://127.0.0.1:18789/plugins/web3-core/ingest",
  token: "",
};

const endpointEl = document.getElementById("endpoint");
const tokenEl = document.getElementById("token");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("save");

async function loadConfig() {
  const config = await chrome.storage.local.get(DEFAULT_CONFIG);
  endpointEl.value = config.endpoint ?? DEFAULT_CONFIG.endpoint;
  tokenEl.value = config.token ?? "";
}

async function saveConfig() {
  const endpoint = endpointEl.value.trim();
  const token = tokenEl.value.trim();
  await chrome.storage.local.set({
    endpoint: endpoint || DEFAULT_CONFIG.endpoint,
    token,
  });
  statusEl.textContent = "Saved";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 1200);
}

saveBtn.addEventListener("click", () => {
  void saveConfig();
});

void loadConfig();
