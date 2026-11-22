const ACCOUNT_PATH = /^\/account\/([A-Za-z0-9_-]+)(\/.*)?$/;

function rewriteAccountHtml(html, username) {
  const prefix = `/account/${username}`;
  return html
    .replace("</head>", '  <script src="/account-runtime.js"></script>\n</head>')
    .replaceAll('href="/pages/', `href="${prefix}/pages/`)
    .replaceAll("href='/pages/", `href='${prefix}/pages/`)
    .replaceAll('src="/pages/', `src="${prefix}/pages/`)
    .replaceAll("src='/pages/", `src='${prefix}/pages/`)
    .replaceAll('href="/assets/', `href="${prefix}/assets/`)
    .replaceAll('src="/assets/', `src="${prefix}/assets/`)
    .replaceAll('href="/lib/', `href="${prefix}/lib/`)
    .replaceAll('src="/lib/', `src="${prefix}/lib/`)
    .replaceAll('href="/styles/', `href="${prefix}/styles/`)
    .replaceAll('src="/styles/', `src="${prefix}/styles/`)
    .replaceAll('window.location.href = "/pages/', `window.location.href = "${prefix}/pages/`)
    .replaceAll("window.location.href = '/pages/", `window.location.href = '${prefix}/pages/`)
    .replaceAll('import { guardPage } from "/lib/auth.js";', `import { guardPage } from "${prefix}/lib/auth.js";`)
    .replaceAll('import { hideLoadingOverlay } from "/lib/loading.js";', `import { hideLoadingOverlay } from "${prefix}/lib/loading.js";`)
    .replaceAll('import { navigateWithAuth } from "/lib/auth.js";', `import { navigateWithAuth } from "${prefix}/lib/auth.js";`)
    .replaceAll('import { authedFetch } from "/lib/auth.js";', `import { authedFetch } from "${prefix}/lib/auth.js";`)
    .replaceAll('import { getTurnstileToken, preloadTurnstile } from "/lib/turnstile.js";', `import { getTurnstileToken, preloadTurnstile } from "${prefix}/lib/turnstile.js";`);
}

async function serveAccountPage(request, env, username, accountPath) {
  let assetPath = accountPath || "/pages/home";
  if (assetPath === "/" || assetPath === "/pages" || assetPath === "/pages/") {
    assetPath = "/pages/home";
  } else if (assetPath === "/settings") {
    assetPath = `/pages${assetPath}`;
  }
  if (assetPath.startsWith("/pages/")) {
    if (/\.html$/i.test(assetPath) || !/\.[a-z0-9]+$/i.test(assetPath)) {
      // Page route: request the directory (trailing slash) so ASSETS serves
      // index.html directly with a 200 instead of redirecting to it.
      assetPath = assetPath.replace(/\.html$/i, "").replace(/\/+$/, "") + "/";
    }
    assetPath = `/account-pages/${assetPath.slice("/pages/".length)}`;
  } else if (assetPath.startsWith("/assets/")) {
    assetPath = `/account-assets/${assetPath.slice("/assets/".length)}`;
  } else if (assetPath.startsWith("/lib/") || assetPath.startsWith("/styles/")) {
    // Serve lib and styles directly from frontend
    assetPath = assetPath;
  }

  const assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
    return response;
  }
  const html = rewriteAccountHtml(await response.text(), username);
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=UTF-8");
  return new Response(html, { status: response.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    // Redirection forcée HTTP vers HTTPS pour Googlebot et bonne expérience page
    if (request.url.startsWith("http://")) {
      const httpsUrl = request.url.replace("http://", "https://");
      return Response.redirect(httpsUrl, 301);
    }

    const url = new URL(request.url);
    const method = request.method;
    const accountMatch = url.pathname.match(ACCOUNT_PATH);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, PUT, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    if (accountMatch) {
      const username = accountMatch[1];
      const accountPath = accountMatch[2] || "/";
      if (accountPath === "/pages/auth" || accountPath === "/pages/auth/") {
        return Response.redirect(new URL("/sign-in", request.url), 302);
      }
      
      // Handle lib and styles for account pages - serve directly from frontend
      if (accountPath.startsWith("/lib/") || accountPath.startsWith("/styles/")) {
        const assetUrl = new URL(request.url);
        assetUrl.pathname = accountPath;
        return env.ASSETS.fetch(new Request(assetUrl, request));
      }
      
      return serveAccountPage(request, env, username, accountPath);
    }
    // =========================
    // 🌐 SITE (Cloudflare assets)
    // =========================
    // Add CORS headers for assets to allow browser loading
    if (url.pathname.startsWith("/assets/") && method === "GET") {
      const assetResponse = await env.ASSETS.fetch(request);
      
      if (assetResponse.ok) {
        const responseHeaders = new Headers(assetResponse.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => responseHeaders.set(key, value));
        return new Response(assetResponse.body, {
          status: assetResponse.status,
          headers: responseHeaders
        });
      }
      return assetResponse;
    }
    if (url.pathname === "/sitemap.xml" || url.pathname === "/robots.txt") {
      const assetResponse = await env.ASSETS.fetch(new Request(request, {
        redirect: "follow"
      }));
      const responseHeaders = new Headers(assetResponse.headers);
      responseHeaders.set(
        "Content-Type",
        url.pathname === "/sitemap.xml"
          ? "application/xml; charset=UTF-8"
          : "text/plain; charset=UTF-8"
      );
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        headers: responseHeaders
      });
    }
    if (url.pathname === "/" || url.pathname === "" || url.pathname === "/home") {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/pages/index.html";
      const pageResponse = await env.ASSETS.fetch(new Request(assetUrl, {
        method: "GET",
        headers: request.headers,
        redirect: "follow"
      }));
      return new Response(pageResponse.body, {
        status: pageResponse.status,
        headers: pageResponse.headers
      });
    }
    const siteRoutes = {
      '/how-it-works': '/pages/how-it-works/index.html',
      '/about-us': '/pages/about-us/index.html',
      '/security': '/pages/security/index.html',
      '/sign-in': '/pages/sign-in/index.html',
      '/sign-in-card': '/pages/sign-in/card.html',
      '/sign-up': '/pages/sign-up/index.html',
    };
    const cleanPath = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    if (siteRoutes[cleanPath]) {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = siteRoutes[cleanPath];
      return env.ASSETS.fetch(new Request(assetUrl, {
        method,
        headers: request.headers,
        redirect: "follow"
      }));
    }
    return env.ASSETS.fetch(request);
  }
};
