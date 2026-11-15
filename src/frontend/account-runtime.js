const accountMatch = window.location.pathname.match(/^\/account\/([A-Za-z0-9_-]+)/);
const accountBase = accountMatch ? `/account/${accountMatch[1]}` : "";
const accountUsername = accountMatch?.[1] || "";
const accountWorkerBase = accountUsername
  ? `https://main-client-worker.${accountUsername}-cloudflare-account.workers.dev`
  : "";
window.__ACCOUNT_BASE_PATH__ = accountBase;
window.__ACCOUNT_WORKER_BASE__ = accountWorkerBase;

const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url, window.location.origin);
  if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
    if (!accountWorkerBase) return originalFetch(input, init);
    url.protocol = "https:";
    url.hostname = new URL(accountWorkerBase).hostname;
    url.pathname = url.pathname;
    return originalFetch(new Request(url, request));
  }
  return originalFetch(input, init);
};
