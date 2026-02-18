(() => {
  // Guard against repeated injection — non-writable, non-configurable
  const MARK = "__openclaw_web3_injected__";
  if (window[MARK]) return;
  Object.defineProperty(window, MARK, {
    value: true,
    writable: false,
    configurable: false,
    enumerable: false,
  });

  const emit = (payload) => {
    window.postMessage({ type: "OPENCLAW_WEB3_REQUEST", payload }, "*");
  };

  const buildRequestId = () => {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const patchProvider = (provider) => {
    if (!provider || provider.__openclawWrapped) return;
    if (typeof provider.request !== "function") return;

    // Mark as wrapped — also non-configurable to prevent DApp tampering
    Object.defineProperty(provider, "__openclawWrapped", {
      value: true,
      writable: false,
      configurable: false,
      enumerable: false,
    });

    const originalRequest = provider.request.bind(provider);

    provider.request = async (...args) => {
      const request = args?.[0] ?? {};
      const method = typeof request.method === "string" ? request.method : "unknown";
      const requestId = buildRequestId();
      const startedAt = Date.now();

      let ok = true;
      let errorMessage;
      try {
        const result = await originalRequest(...args);
        return result;
      } catch (err) {
        ok = false;
        errorMessage = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        const durationMs = Date.now() - startedAt;
        emit({
          method,
          origin: window.location.origin,
          url: window.location.href,
          chainId: provider.chainId ?? null,
          requestId,
          ok,
          durationMs,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }
    };
  };

  // Patch a single provider or an array of providers
  const tryPatch = () => {
    let found = false;
    if (window.ethereum) {
      patchProvider(window.ethereum);
      found = true;
      // Some wallets expose additional providers as an array
      if (Array.isArray(window.ethereum.providers)) {
        for (const p of window.ethereum.providers) {
          patchProvider(p);
        }
      }
    }
    return found;
  };

  // EIP-6963: listen for provider announcements (multi-wallet discovery)
  window.addEventListener("eip6963:announceProvider", (event) => {
    const info = event?.detail?.provider;
    if (info) patchProvider(info);
  });

  if (!tryPatch()) {
    window.addEventListener(
      "ethereum#initialized",
      () => {
        tryPatch();
      },
      { once: true },
    );
  }

  // Fallback: observe DOM mutations in case the provider is injected late
  const observer = new MutationObserver(() => {
    if (tryPatch()) {
      observer.disconnect();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setTimeout(() => observer.disconnect(), 10_000);
})();
