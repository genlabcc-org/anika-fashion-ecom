const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET");

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Meta's one-time verification handshake
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // Incoming events (delivery statuses, customer replies)
  if (req.method === "POST") {
    const raw = await req.text();

    // Check the request really came from Meta
    if (APP_SECRET) {
      const sig = req.headers.get("x-hub-signature-256") ?? "";
      const key = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(APP_SECRET),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
      );
      const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
      const expected = "sha256=" + [...new Uint8Array(mac)]
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      if (sig !== expected) return new Response("Invalid signature", { status: 401 });
    }

    try {
      const body = JSON.parse(raw);
      console.log("WA event:", JSON.stringify(body));
      // Later: read entry[].changes[].value.statuses[] and update the order's WhatsApp status
    } catch (e) {
      console.error("Bad webhook body", e);
    }
    return new Response("OK", { status: 200 }); // always answer 200 quickly
  }

  return new Response("Method not allowed", { status: 405 });
});
