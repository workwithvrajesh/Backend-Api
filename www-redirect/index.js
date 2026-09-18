/**
 * Edge 301: https://www.workwithvrajesh.com/* → https://workwithvrajesh.com/*
 * Runs on Cloudflare before origin, so www never hits the broken SSL origin (525).
 * Path and query string are preserved. Apex traffic is not handled by this Worker.
 */
const CANONICAL_HOST = "workwithvrajesh.com";
const WWW_HOST = `www.${CANONICAL_HOST}`;

export default {
  async fetch(request) {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return new Response(null, { status: 400 });
    }

    if (url.hostname.toLowerCase() !== WWW_HOST) {
      return new Response("Not found", { status: 404 });
    }

    url.protocol = "https:";
    url.hostname = CANONICAL_HOST;
    url.port = "";

    return new Response(null, {
      status: 301,
      headers: {
        Location: url.href,
        "Cache-Control": "public, max-age=86400",
      },
    });
  },
};
