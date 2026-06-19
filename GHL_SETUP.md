# GoHighLevel Setup Guide

Everything to configure inside GHL so the assessment routes leads correctly.
Order matters: create the custom fields first, then the webhook workflow, then
the nurture workflows and email template.

## 1. Inbound webhook

The assessment no longer posts to GHL directly. The browser posts to an **n8n
webhook** instead. n8n responds immediately, runs the Claude report pipeline,
and then forwards the enriched payload to GHL.

**Only opted-in leads reach GHL.** The app fires two kinds of event to n8n: an
anonymous "results viewed" event (no contact info, stored for data) and an
opt-in "report requested" event (full contact info). n8n routes only the opt-in
event to this GHL webhook, so every contact created here is someone who entered
their email asking for the top-3 report.

1. In your sub-account: **Automation > Workflows > Create Workflow > Start from
   scratch**.
2. Add trigger: **Inbound Webhook**.
3. Copy the webhook URL and paste it into the **GHL - Push Enriched Lead** node
   inside the n8n workflow (see `n8n/README.md`). Do not paste it into
   `src/App.jsx` — that constant now holds the n8n webhook URL instead.
4. Submit one test assessment and opt in, then use GHL's "mapping reference" on
   the trigger to map the payload fields below (original fields plus the five new
   report fields).

## 2. Contact custom fields

Create these exact field keys (Settings > Custom Fields, object: Contact).
The first 13 are the original assessment fields; the last 5 are added by the
n8n Claude pipeline and arrive in the same GHL push a few seconds later.

### Original assessment fields

| GHL custom field | Payload key | Type |
| --- | --- | --- |
| `assessment_lever` | `lever` | Text |
| `assessment_domain` | `domain` | Text |
| `assessment_task` | `primaryTask` (see `taskOther` note) | Text |
| `assessment_priority_score` | `priorityScore` | Number |
| `assessment_priority_band` | `priorityBand` | Text |
| `assessment_annual_roi` | `annualROI` (or `annualROIFormatted`) | Number (or Text) |
| `assessment_friction_type` | `frictionType` | Text |
| `assessment_temperature` | `temperature` | Text |
| `assessment_tier` | `readinessTier` | Text |
| `assessment_tool_rec` | `toolRecommendation` | Text |
| `assessment_magic_wand` | `magicWand` | Text (multi-line) |
| `assessment_named_bottleneck` | `namedBottleneck` | Text (multi-line) |
| `assessment_delivery_pref` | `deliveryPreference` | Text |

### Claude report fields (added by n8n)

| GHL custom field | Payload key | Type |
| --- | --- | --- |
| `assessment_top_areas` | `assessment_top_areas` | Text (multi-line) |
| `assessment_tool_suggestions` | `assessment_tool_suggestions` | Text (multi-line) |
| `assessment_roadmap` | `assessment_roadmap` | Text (multi-line) |
| `assessment_resource_url` | `assessment_resource_url` | Text |
| `assessment_resource_label` | `assessment_resource_label` | Text |
| `assessment_report_html` | `assessment_report_html` | Text (multi-line) |
| `assessment_report_headline` | `assessment_report_headline` | Text |
| `assessment_report_summary` | `assessment_report_summary` | Text |
| `assessment_annual_roi_range` | `annualROIRangeFormatted` | Text |

**`assessment_top_areas`** contains the full ranked text block, one area per
section. Each area now carries decision-grade detail: an impact/effort/approach
line (with a rough investment band), the Claude reasoning, the expected outcome,
tool suggestions, the theresanaiforthat.com link, and one "worth a conversation"
open question. Use this as the main body merge field in the report email.

**`assessment_roadmap`** is a short now / next / later sequence across the three
areas — handy as a "your next 90 days" block.

**`assessment_report_html`** is a ready-to-use HTML fragment (no `<html>` or
`<body>` wrapper) containing headings, paragraphs, and anchor links. Paste
it into a GHL "Custom HTML" email block or use it via a merge field if your
email builder supports raw HTML merge fields.

Notes:

- Standard fields (`firstName`, `lastName`, `email`, `phone`, `businessName`,
  `industry`) map to GHL's native contact fields.
- If `primaryTask` is `other`, the payload's `taskOther` field carries the
  prospect's own description — append it to `assessment_task` in the mapping
  or store it in an extra field if you want it verbatim.
- For `assessment_annual_roi`, map `annualROIFormatted` (e.g. `$42,000`) into a
  Text field if you want clean formatting in emails; the raw number is also
  available as `annualROI`. `weeklyROI`, `frequencyScore`, `frictionScore`,
  `triedBefore`, and `whoDoesIt` are in the payload too if you want extra
  fields for reporting.
- The ROI is the **value of reclaimed time** (`hours × rate × 50 weeks`), not a
  revenue projection — keep the email wording consistent with that. An honest
  range rides along: map `annualROIRangeFormatted` (e.g. `$18,500–$75,000`) to a
  Text field `assessment_annual_roi_range` for the email's range line; the raw
  bounds are also available as `annualROILow` / `annualROIHigh`.
- The prospect picks their **currency** (USD, ZAR, GBP, EUR, AUD, CAD). It rides
  along as `currency` (e.g. `ZAR`), and every ROI figure (`annualROIFormatted`,
  `annualROIRangeFormatted`) is already formatted in that currency — so the email
  merge fields display correctly without any per-currency logic in GHL. Map
  `currency` to a `assessment_currency` Text field if you want it for reporting.
- Tracking fields also ride along: `submissionId` (links to the anonymous
  "results viewed" record for the same session), `stage` (always
  `report_requested` for leads that reach GHL), and `optedIn` (always `true`
  here). Store `submissionId` in a text field if you want to join GHL contacts
  back to your anonymous data store.

## 3. Routing workflow (branches by tier/temperature)

Trigger: the Inbound Webhook from step 1. Add an **If/Else** on
`readinessTier` (or `temperature`) with four branches. All branches stamp
`submittedAt` and store `magicWand` + `namedBottleneck` so any human follow-up
can quote the prospect's own words.

### Branch A — Tier 1 Emergency Fix (or temperature = hot)

1. Add tag `hot-lead`.
2. Internal notification to the operator instantly: SMS + email, including
   `namedBottleneck`, `annualROI`, and `magicWand`.
3. Send the personalized report email (template below) immediately.
4. If `deliveryPreference` = `call`: send the calendar link by SMS within
   2 minutes (Wait 2 min > SMS).
5. Create an Opportunity in the pipeline at stage **Assessment Booked**.

### Branch B — Tier 2 Clear ROI (or temperature = warm)

1. Add tag `warm-lead`.
2. Send the report email.
3. Start a 3-email ROI nurture over 5 days (day 0, day 2, day 5), each email
   reinforcing the `assessment_annual_roi` figure from a different angle:
   cost of waiting, what the fix looks like, what similar businesses did.
4. Create an Opportunity at stage **Nurturing**.

### Branch C — Tier 3 Roadmap (or temperature = cool)

1. Add tag `cool-lead`.
2. Send the report + roadmap email (report template plus a short
   "your next 90 days" section).
3. Drop into the weekly value newsletter sequence.
4. No opportunity yet.

### Branch D — Tier 4 Starter (or temperature = cold)

1. Add tag `cold-lead`.
2. Send the starter report email.
3. Long-cycle monthly nurture.

## 4. Personalized report email template

Keep it under 300 words, one CTA button, no hype. GHL merge syntax for contact
custom fields is `{{contact.assessment_annual_roi}}` (the `custom_values.*`
namespace is for account-level values, not contact fields).

**Subject:**

```
{{contact.first_name}}, your AI assessment: ~${{contact.assessment_annual_roi}}/yr on the table
```

**Body:**

```
Hi {{contact.first_name}},

Thanks for taking the AI Readiness Check. Here is what stands out.

{{contact.assessment_report_headline}}

{{contact.assessment_report_summary}}

Your top 3 areas to fix, in order:

{{contact.assessment_top_areas}}

The number that matters: this is the value of the time you'd reclaim —
roughly ${{contact.assessment_annual_roi}} per year (about
{{contact.assessment_annual_roi_range}} depending on the exact hours and
rate). Treat that as a directional estimate, not a guarantee; it does not
assume any new revenue.

In your own words, fixing this means:
"{{contact.assessment_magic_wand}}"

The exact setup depends on your specific tools and workflows — that's what
we'll map together on a quick call.

[CTA BUTTON]

Talk soon,
{{user.name}}
```

**Alternative (HTML email builder):** Paste `{{contact.assessment_report_html}}`
into a Custom HTML email block for a formatted version with headings, tool links,
and theresanaiforthat.com browse links per area. This requires your GHL email
builder to support raw HTML merge fields.

**CTA button by branch:**

| Branch | Button text | Link |
| --- | --- | --- |
| A (Tier 1) | Book your fix-it call this week | Calendar link |
| B (Tier 2) | Scope the build on a 15-minute call | Calendar link |
| C (Tier 3) | Grab a time when you're ready | Calendar link |
| D (Tier 4) | See how businesses like yours use AI | Resource / case-study page |

## 5. Operator notes

- When `toolRecommendation` is an off-the-shelf category, confirm the exact
  tool before the call via theresanaiforthat.com or futurepedia.io. The
  prospect only ever sees the category, never a guessed brand name.
- `magicWand` is the prospect's own words — open the call with it.
- `priorityBand` + `temperature` tell you how hard to push: Critical/hot means
  book this week; Low/cold means stay useful and patient.

## 6. Funnel page embed

See the README's "Deploying and embedding" section for the iframe snippet and
optional auto-resize script to drop into a GHL Custom JS/HTML element.
