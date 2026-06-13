# The 60-Second AI Readiness Check

A self-serve, scored lead-qualification assessment. A business owner answers 12
questions; the app scores them in real time, shows a personalized result with a
dollar figure attached to their biggest bottleneck, and sends the payload to an
n8n backend that captures the lead server-side, calls Claude to generate a
ranked top-3 AI opportunity report, and routes the enriched contact into the
right GoHighLevel (GHL) nurture or sales workflow.

## Architecture

```
Browser (instant, client-side)
  │
  │  POST  (keepalive:true)
  ▼
n8n Intake Webhook  ──►  200 OK  (lead captured server-side)
  │
  │  (async, ~3-10 s)
  ▼
Claude API (claude-sonnet-4-6)
  │  Returns: top-3 focus areas ranked + reasoning + tool suggestions
  ▼
Parse & Build Report
  │  Appends theresanaiforthat.com search URL per area
  │  Builds GHL-ready text + HTML report fragments
  ▼
GHL Inbound Webhook
  │  Creates/updates contact with all fields + report
  ▼
GHL Workflows (Tier 1–4 routing → email → CTA)
```

**Why n8n?** The previous browser-to-GHL approach could silently lose leads if
the user closed the tab mid-retry. n8n captures the submission the moment it
arrives — before Claude even runs — so no lead is ever lost.

**Why Claude?** The deterministic scoring engine (client-side) quantifies one
bottleneck well but is coarse at prescribing. Claude ranks all 12 answers
together to produce a top-3 prioritized plan: which areas matter most, why,
and which existing tools to explore — making the follow-up call more valuable
without adding friction to the assessment itself.

Built as a single-page React + Tailwind app. The entire assessment — questions,
scoring engine, result screen, webhook push — lives in one file:
[`src/App.jsx`](src/App.jsx).

The n8n workflow is in [`n8n/`](n8n/) and the Claude system prompt is in
[`prompts/`](prompts/).

## Quick start

```bash
npm install
npm run dev        # local preview at http://localhost:5173
npm test           # scoring-engine unit tests
npm run build      # static build in dist/
```

## Configuration

Two constants at the top of `src/App.jsx`:

| Constant | What it is |
| --- | --- |
| `INTAKE_WEBHOOK_URL` | Your n8n intake webhook URL (from the Intake Webhook node after activating the workflow). See [n8n/README.md](n8n/README.md). |
| `CALENDAR_URL` | Your GHL calendar booking link, embedded on the result screen for hot leads and anyone who asked for a call. |

Until the webhook URL is configured, submissions log to the console instead of
POSTing (so you can preview the full flow locally).

### Changing the Claude model

Open the **Prepare Claude Request** Code node in n8n and change the `model`
field. See [n8n/README.md](n8n/README.md) for the available options and their
cost/quality trade-offs.

## Deploying and embedding in a GHL funnel

1. `npm run build` and deploy `dist/` to any static host (Vercel, Netlify,
   Cloudflare Pages). Asset paths are relative, so it works from any subpath.
2. In your GHL funnel page, add a **Custom JS/HTML** element with:

```html
<iframe
  src="https://YOUR-DEPLOY-URL/"
  style="width:100%;min-height:760px;border:0;display:block"
  title="The 60-Second AI Readiness Check"
></iframe>
```

3. (Optional) The app posts its content height to the parent page on every
   step change. To auto-size the iframe, add this below the embed:

```html
<script>
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "ai-readiness-check:height") {
      document.querySelector('iframe[title="The 60-Second AI Readiness Check"]')
        .style.height = e.data.height + "px";
    }
  });
</script>
```

## How scoring works

All scoring runs client-side and renders instantly; the GHL POST fires once on
final submit. Nothing is stored in localStorage — state lives in React only,
so the app is safe in sandboxed embeds.

- **Priority score** = frequency (Q4, 1–4) × friction (Q8, 1–4), banded
  Low (1–4) / Moderate (5–8) / High (9–12) / Critical (13–16).
- **ROI anchor**: `weeklyROI = hours_mid × rate_mid`, `annualROI = weeklyROI × 50`,
  displayed rounded to the nearest $500 and always framed as "roughly", never a
  guarantee.
- **Tool recommendation** (first match wins): quotes / "something else" /
  data-in-operations → custom Claude skill; judgment-heavy email or support
  (handled by the owner or a senior person) → Claude Cowork; everything else →
  an off-the-shelf category (meeting-notes AI, inbox AI, automation platform,
  support chatbot). Categories only — never a brand name on the result screen.
- **Readiness tier**: hot + High/Critical → Tier 1 Emergency Fix;
  hot/warm + Moderate or above → Tier 2 Clear ROI; cool → Tier 3 Roadmap;
  cold or Low priority → Tier 4 Starter.

Internal scores, tags, bands, and tier names are never shown to the prospect;
they ride along in the webhook payload for routing.

### Webhook resilience

Submissions post to n8n with `keepalive: true`, which keeps the request alive
even if the user closes the tab immediately. n8n stores the lead before Claude
runs, so no submission is ever lost at the network layer. If n8n itself is
unreachable, the app retries in the background (5s / 15s / 45s backoff), and
after the final failure the prospect sees a calm "we'll email your results"
fallback instead of an error.

## Spec interpretation notes

Decisions made where the build spec left room:

- **Warm + Critical resolves to Tier 2.** The tier rules are evaluated
  top-down, and the spec defines the final else-branch as exactly
  "temp == cold OR priorityBand == Low" — so rule 2 accepts Moderate and
  above. A warm lead with a critical bottleneck is a Clear ROI lead, not a
  Starter.
- **"Nuance/judgment" for the Cowork branch** is inferred from Q5: email or
  support handled by the owner or a senior person counts as judgment-heavy
  (the spec's stated default for owner-handled email); junior/nobody-handled
  email and support route to off-the-shelf categories.
- **First name is required** alongside email, because the GHL report email
  personalizes its subject line with `{{contact.first_name}}`.
- **`annualROI` in the payload is the rounded headline number** so the figure
  in the report email always matches the result screen. The raw weekly figure
  is sent as `weeklyROI`, and a pre-formatted `annualROIFormatted` (for
  example `$42,000`) is included for clean email merge fields.

## GoHighLevel setup

Custom fields, workflow branches (Tier 1–4 routing), and the report email
template are documented step-by-step in [GHL_SETUP.md](GHL_SETUP.md).
