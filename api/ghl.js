// Optional serverless relay for the GHL webhook (Vercel functions format,
// works as-is on Netlify via @netlify/functions-compatible adapters too).
//
// Use this if you prefer not to expose the GHL webhook URL in client code,
// or if a browser extension / strict embed context blocks the cross-origin
// POST. Setup:
//   1. Set the GHL_WEBHOOK_URL environment variable in your hosting dashboard.
//   2. In src/App.jsx, set GHL_WEBHOOK_URL = "/api/ghl".
//
// The relay forwards the JSON payload unchanged.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req, res) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const target = process.env.GHL_WEBHOOK_URL;
  if (!target) {
    return res.status(500).json({ error: "GHL_WEBHOOK_URL env var is not configured" });
  }

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
    });
    return res.status(upstream.ok ? 200 : 502).json({ ok: upstream.ok });
  } catch {
    return res.status(502).json({ ok: false, error: "Upstream webhook unreachable" });
  }
}
