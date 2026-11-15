const ACCOUNT_PATH = /^\/account\/([A-Za-z0-9_-]+)(\/.*)?$/;
const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function accountBackendUrl(username, path, search) {
  return `https://main-client-worker.${username}-cloudflare-account.workers.dev${path}${search}`;
}

function loginWorkerUrl(username, path = "/api/login") {
  return `https://login-client-worker.${username}-cloudflare-account.workers.dev${path}`;
}

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
    .replaceAll('window.location.href = "/pages/', `window.location.href = "${prefix}/pages/`)
    .replaceAll("window.location.href = '/pages/", `window.location.href = '${prefix}/pages/`);
}

async function serveAccountPage(request, env, username, accountPath) {
  let assetPath = accountPath || "/pages/home";
  if (assetPath === "/" || assetPath === "/pages" || assetPath === "/pages/") {
    assetPath = "/pages/home";
  } else if (assetPath === "/settings" || assetPath === "/study-notes") {
    assetPath = `/pages${assetPath}`;
  }
  if (assetPath.startsWith("/pages/")) {
    if (!assetPath.match(/\.[a-z0-9]+$/i)) {
      assetPath = `${assetPath.replace(/\/+$/, "")}/index.html`;
    }
    assetPath = `/account-pages/${assetPath.slice("/pages/".length)}`;
  } else if (assetPath.startsWith("/assets/")) {
    assetPath = `/account-assets/${assetPath.slice("/assets/".length)}`;
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
      if (accountPath.startsWith("/api/")) {
        const backendUrl = accountBackendUrl(username, accountPath, url.search);
        return fetch(new Request(backendUrl, request));
      }
      return serveAccountPage(request, env, username, accountPath);
    }

    if (url.pathname === "/api/config" && method === "GET") {
      return new Response(JSON.stringify({
        turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/api/login" && method === "POST") {
      try {
        const payload = await request.json();
        const identifier = String(payload?.identifier || "").trim();
        const password = String(payload?.password || "");
        if (!identifier || identifier.includes("@")) {
          return new Response(JSON.stringify({ error: "LOGIN_METHOD_UNAVAILABLE" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const response = await fetch(loginWorkerUrl(identifier), {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
          body: JSON.stringify({ username: identifier, password, ip }),
        });
        if (!response.ok) return new Response("Not found", { status: 404 });
        const result = await response.json();
        return new Response(JSON.stringify(result), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("LOGIN PROXY ERROR:", error?.stack || error);
        return new Response("Not found", { status: 404 });
      }
    }

    if (url.pathname === "/api/turnstile" && method === "POST") {
      try {
        const payload = await request.json();
        const token = String(payload?.token || "");
        if (!env.TURNSTILE_SECRET_KEY || !token) {
          return new Response(JSON.stringify({ success: false, reason: "turnstile_not_configured" }), {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const verification = new FormData();
        verification.append("secret", env.TURNSTILE_SECRET_KEY);
        verification.append("response", token);
        const clientIp = request.headers.get("CF-Connecting-IP");
        if (clientIp) verification.append("remoteip", clientIp);
        const verificationResponse = await fetch(TURNSTILE_SITEVERIFY_URL, {
          method: "POST",
          body: verification,
        });
        if (!verificationResponse.ok) {
          throw new Error(`Turnstile siteverify failed with status ${verificationResponse.status}`);
        }
        const result = await verificationResponse.json();
        return new Response(JSON.stringify({
          success: result.success === true,
          reason: result.success === true ? undefined : "verification_failed",
        }), {
          status: result.success === true ? 200 : 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("TURNSTILE VERIFICATION ERROR:", error?.stack || error);
        return new Response(JSON.stringify({ success: false, reason: "proxy_error" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    
    // =========================
    // 📶 MAIN API
    // =========================
if (url.pathname.startsWith("/api/")) {
      try {
        let resp = {object: "nothing"};
        // Return res111ponse
        return new Response(JSON.stringify({
          resp
        }), {
          headers: corsHeaders
        })
      } catch (e) {
        console.error("API ERROR:", e?.stack || e);
        // await sendErrorEmail(env, e, `API ${url.pathname}`);
        return new Response(JSON.stringify({
          error: e?.message,
        }), {
          status: 500,
          headers: corsHeaders
        });
      }
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
