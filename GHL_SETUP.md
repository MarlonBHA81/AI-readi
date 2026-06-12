# GoHighLevel Setup Guide

Everything to configure inside GHL so the assessment routes leads correctly.
Order matters: create the custom fields first, then the webhook workflow, then
the nurture workflows and email template.

## 1. Inbound webhook

1. In your sub-account: **Automation > Workflows > Create Workflow > Start from
   scratch**.
2. Add trigger: **Inbound Webhook**.
3. Copy the webhook URL and paste it into `GHL_WEBHOOK_URL` at the top of
   `src/App.jsx` (or into the `GHL_WEBHOOK_URL` env var if using the
   `api/ghl.js` relay).
4. Submit one test assessment, then use GHL's "mapping reference" on the
   trigger to map the payload fields below.

## 2. Contact custom fields

Create these exact field keys (Settings > Custom Fields, object: Contact):

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

Keep it under 200 words, one CTA button, no hype. GHL merge syntax for contact
custom fields is `{{contact.assessment_annual_roi}}` (the `custom_values.*`
namespace is for account-level values, not contact fields).

**Subject:**

```
{{contact.first_name}}, your AI assessment: ~${{contact.assessment_annual_roi}}/yr on the table
```

**Body:**

```
Hi {{contact.first_name}},

Thanks for taking the AI Readiness Check. Here is the short version.

Your bottleneck:
{{contact.assessment_named_bottleneck}}

The number that matters: automating this could give you back roughly
${{contact.assessment_annual_roi}} per year in reclaimed time and lost
revenue. Treat that as a directional estimate, not a guarantee.

In your own words, fixing this means:
"{{contact.assessment_magic_wand}}"

Recommended direction: {{contact.assessment_tool_rec}}. The exact setup
depends on your tools, which we can map together on a quick call.

[CTA BUTTON]

Talk soon,
{{user.name}}
```

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
