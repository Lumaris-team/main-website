const accountMatch = window.location.pathname.match(/^\/account\/([A-Za-z0-9_-]+)/);
const accountBase = accountMatch ? `/account/${accountMatch[1]}` : "";
window.__ACCOUNT_BASE_PATH__ = accountBase;

const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url, window.location.origin);
  if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
    url.pathname = `${accountBase}${url.pathname}`;
    return originalFetch(new Request(url, request));
  }
  return originalFetch(input, init);
};
