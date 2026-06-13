# n8n Workflow Setup

Import and configure the `ai-readiness-report.workflow.json` workflow to wire up
the Claude report pipeline. Once running, every assessment submission is captured
server-side instantly, then enriched with a ranked top-3 AI opportunity report
(powered by Claude) and pushed to GoHighLevel.

## Why n8n instead of a direct browser-to-GHL POST

The previous approach posted from the browser directly to GHL. If the user
closed the tab mid-retry, the lead was silently lost. n8n solves this:

1. The browser POSTs to the n8n webhook and gets `{"ok":true}` back immediately.
2. n8n captures the lead server-side and processes Claude async — no data loss
   even if the user's tab closes.
3. The enriched payload (original fields + top-3 report) reaches GHL a few
   seconds later, after Claude finishes.

## Import steps

1. In your n8n instance: **Workflows > Import from file**.
2. Select `n8n/ai-readiness-report.workflow.json`.
3. Complete the four configuration steps below, then activate the workflow.

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

## Activate and test

1. Toggle the workflow to **Active**.
2. Run a test assessment end-to-end. In n8n, open **Executions** and confirm:
   - The workflow ran.
   - The **Respond 200** node fired first (browser got the instant response).
   - The **Claude - Generate Report** node returned a valid response.
   - The **GHL - Push Enriched Lead** node returned a 2xx status.
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

## Prompt updates

The Claude system prompt lives in two places:

1. **`prompts/diagnosis-system-prompt.md`** — the version-controlled reference.
   Edit here.
2. **Prepare Claude Request** Code node — the runtime copy (embedded as the
   `SYSTEM_PROMPT` constant). After editing the .md file, paste the updated
   prompt into the Code node and re-save.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Webhook returns 404 | Workflow is not active — toggle to Active |
| Claude node fails with 401 | API key credential not connected to the node |
| Claude node returns non-JSON | Claude refused or hallucinated; check the raw response in Executions. The parse node handles this gracefully and continues with empty report fields |
| GHL push returns 4xx | GHL webhook URL is wrong or the contact fields aren't mapped |
| Assessment shows "failed" in the browser | Only happens after all 3 retries fail — check that INTAKE_WEBHOOK_URL in App.jsx matches the n8n Production URL |
