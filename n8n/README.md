# n8n Workflow Setup

Import and configure the `ai-readiness-report.workflow.json` workflow to wire up
the Claude report pipeline. Once running, every assessment is captured
server-side instantly. Opt-ins are enriched with a ranked top-3 AI opportunity
report (powered by Claude) and pushed to GoHighLevel; anonymous completions are
stored for aggregate data.

## Two kinds of intake event

The app posts to the same webhook twice over a session, distinguished by the
`optedIn` flag and `stage` field:

| Event | When it fires | `optedIn` | `stage` | Contains PII? | What n8n does |
| --- | --- | --- | --- | --- | --- |
| **Anonymous** | The instant the result screen is revealed (after Q12) | `false` | `results_viewed` | No | Routes to **Store Anonymous Submission** for future data |
| **Opt-in** | When the prospect submits the email form for the top-3 | `true` | `report_requested` | Yes | Runs Claude → GHL → email |

Both events share a per-session `submissionId`, so you can later reconcile how
many people completed the assessment versus how many opted in.

The **Opted In?** IF node does this routing: `optedIn === true` goes down the
Claude/GHL path; `false` goes to the anonymous store.

## Why n8n instead of a direct browser-to-GHL POST

The previous approach posted from the browser directly to GHL. If the user
closed the tab mid-retry, the lead was silently lost. n8n solves this:

1. The browser POSTs to the n8n webhook and gets `{"ok":true}` back immediately.
2. n8n captures the data server-side and processes Claude async — no data loss
   even if the user's tab closes.
3. For opt-ins, the enriched payload (original fields + top-3 report) reaches GHL
   a few seconds later, after Claude finishes.
4. Anonymous completions are recorded too, so even non-converters become useful
   aggregate data (completion rate, most common bottlenecks, ROI distribution).

## Import steps

1. In your n8n instance: **Workflows > Import from file**.
2. Select `n8n/ai-readiness-report.workflow.json`.
3. Complete the five configuration steps below, then activate the workflow.

## Step 1 — Set the webhook URL in the app

After importing, open the **Intake Webhook** node. Copy the **Production URL**
(shown at the top of the node panel after you activate the workflow). Paste it
into `INTAKE_WEBHOOK_URL` at the top of `src/App.jsx`.

The path is `/ai-readiness` by default. You can change it in the node's `path`
parameter if needed.

## Step 2 — Add your Anthropic API credential

1. Go to **Settings > Credentials > Add Credential > Header Auth**.
2. Name it exactly **Anthropic API Key**.
3. Set `Header Name` to `x-api-key`.
4. Set `Header Value` to your Anthropic API key (from console.anthropic.com).
5. Open the **Claude - Generate Report** node and connect this credential in the
   **Credential for Generic Auth** field.

**Model**: The workflow defaults to `claude-sonnet-4-6`. To change it, open the
**Prepare Claude Request** Code node and edit the `model` field on the last few
lines. Options from cheapest to most capable:
- `claude-haiku-4-5-20251001` — fastest, lowest cost
- `claude-sonnet-4-6` — recommended default (strong reasoning, moderate cost)
- `claude-opus-4-8` — higher quality, higher cost
- `claude-fable-5` — maximum quality

## Step 3 — Set the GHL inbound webhook URL

1. In GHL: **Automation > Workflows > Create > Start from Scratch**.
2. Add trigger: **Inbound Webhook**.
3. Copy the webhook URL.
4. Open the **GHL - Push Enriched Lead** node and paste the URL into the `URL`
   parameter (replacing `PASTE_YOUR_GHL_INBOUND_WEBHOOK_URL_HERE`).

The enriched payload contains all the original fields (see GHL_SETUP.md) plus
the new report fields listed below.

## Step 4 — Map the new custom fields in GHL

In the GHL workflow triggered by the inbound webhook, map these additional fields
to the new contact custom fields (see GHL_SETUP.md section 2 for the full list):

| Payload key | GHL custom field | Type |
| --- | --- | --- |
| `assessment_top_areas` | `assessment_top_areas` | Text (multi-line) |
| `assessment_tool_suggestions` | `assessment_tool_suggestions` | Text (multi-line) |
| `assessment_report_html` | `assessment_report_html` | Text (multi-line) |
| `assessment_report_headline` | `assessment_report_headline` | Text |
| `assessment_report_summary` | `assessment_report_summary` | Text |

## Step 5 — Wire up the anonymous data store

The **Store Anonymous Submission** node is a placeholder (NoOp) on the `false`
branch of **Opted In?**. Anonymous completions (no PII) flow here so you can
measure completion rate and the most common bottlenecks. Replace it with the
store of your choice:

- **Google Sheets** → "Append row" (simplest to start)
- **Postgres / MySQL** → "Insert"
- **Cloudflare D1** → query node / HTTP request
- **Airtable** → "Create record"

Suggested columns: `submissionId`, `submittedAt`, `domain`, `primaryTask`,
`priorityScore`, `priorityBand`, `annualROI`, `temperature`, `readinessTier`.
The matching opt-in (if the prospect converts) shares the same `submissionId`,
so you can join the two later. Until you wire this up, anonymous events are
acknowledged (200) and simply not stored — the opt-in path is unaffected.

If you would rather not collect anonymous data at all, delete the **Opted In?**
and **Store Anonymous Submission** nodes and connect **Intake Webhook** straight
to **Prepare Claude Request** (anonymous events have no email, so Claude/GHL
would no-op harmlessly — but skipping them saves the Claude call).

## Activate and test

1. Toggle the workflow to **Active**.
2. Run a test assessment end-to-end. In n8n, open **Executions** and confirm:
   - The workflow ran twice: once when results appear (anonymous, routed to
     **Store Anonymous Submission**), once when you submit the email opt-in
     (routed through **Claude → GHL**).
   - The **Respond 200** node fired first on both (browser got the instant ack).
   - On the opt-in run, **Claude - Generate Report** returned a valid response
     and **GHL - Push Enriched Lead** returned a 2xx status.
3. In GHL, verify the test contact was created with all fields populated,
   including `assessment_top_areas`.

## Optional: Firecrawl enrichment

If you want live tool data from theresanaiforthat.com (rather than Claude's
trained knowledge), add a Firecrawl HTTP Request node between **Parse & Build
Report** and **GHL - Push Enriched Lead**:

- For each `topAreas[n].taaftUrl` in the parse node output, make a Firecrawl
  scrape call (see Firecrawl docs for the `/scrape` endpoint).
- Set `timeout` to 10 000 ms. If it times out or returns an error, continue with
  Claude's `candidateTools` as the fallback — do not block the GHL push.
- TAAFT may throttle automated requests; test thoroughly before enabling in
  production and respect their Terms of Service.

The `taaftUrl` for each area is already in the parse node output, ready to use.

## Editing the prompt and the Code nodes

The two Code nodes and the system prompt are version-controlled as plain source,
then spliced into the workflow JSON by a build script — so you never hand-edit
escaped JSON:

- **`prompts/diagnosis-system-prompt.md`** — the Claude system prompt (source of
  truth).
- **`n8n/nodes/prepare-claude-request.js`** — the "Prepare Claude Request" node
  (model, `max_tokens`, message assembly). `SYSTEM_PROMPT` is injected from the
  `.md` at build time.
- **`n8n/nodes/parse-build-report.js`** — the "Parse & Build Report" node
  (JSON parsing, TAAFT URLs, report assembly).

After editing any of those, regenerate the importable workflow and re-import it:

```bash
node scripts/build-workflow.cjs
```

The script syntax-checks both node bodies and rewrites
`n8n/ai-readiness-report.workflow.json` in place.

### What the report now contains

The Claude output is decision-grade: each of the top-3 areas carries an
impact/effort rating, a build-vs-buy `approach` with a rough investment band, an
expected outcome, tool suggestions + a TAAFT link, and one "open question" left
for the call — plus a top-level now/next/later `roadmap`. All new fields degrade
gracefully (the parse node defaults anything missing to empty).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Webhook returns 404 | Workflow is not active — toggle to Active |
| Claude node fails with 401 | API key credential not connected to the node |
| Claude node returns non-JSON | Claude refused or hallucinated; check the raw response in Executions. The parse node handles this gracefully and continues with empty report fields |
| GHL push returns 4xx | GHL webhook URL is wrong or the contact fields aren't mapped |
| Assessment shows "failed" in the browser | Only happens after all 3 retries fail — check that INTAKE_WEBHOOK_URL in App.jsx matches the n8n Production URL |
