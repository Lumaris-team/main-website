export default {
  async fetch(request, env, ctx) {
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
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }
    return env.ASSETS.fetch(request)
  }
