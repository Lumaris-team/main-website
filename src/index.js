export default {
  async fetch(request, env, ctx) {
    // Redirection forcée HTTP vers HTTPS pour Googlebot et bonne expérience page
    if (request.url.startsWith("http://")) {
      const httpsUrl = request.url.replace("http://", "https://");
      return Response.redirect(httpsUrl, 301);
    }

    const url = new URL(request.url);
    const method = request.method;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, PUT, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };
    
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
    };
    const cleanPath = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    if (siteRoutes[cleanPath]) {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = siteRoutes[cleanPath];
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }
    return env.ASSETS.fetch(request);
  }
};
