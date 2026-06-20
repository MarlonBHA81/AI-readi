# Brief for Claude Cowork — AI Readiness Check email nurture sequence

Paste this whole file into Claude Cowork as the task brief.

---

## Your role
You're designing the email sequence inside GoHighLevel (GHL) for an AI
consultancy ("Small Business Helpdesk"). Leads complete a self-serve "60-Second
AI Readiness Check," see an instant on-screen result, and land in GHL as a
contact with rich assessment data attached. An n8n automation then triggers a
**personalized GHL email sequence based on their result tier**. Your job: design
that **full sequence — starting with the report itself as the first email** — to
turn leads into **booked 15-minute calls**, while staying genuinely useful (not
pushy). GHL sends every email; there is no separate report sender.

## What the lead just experienced
- Answered 12 questions about where their business is stuck.
- Saw their #1 bottleneck with a dollar figure (the value of time they'd reclaim) on screen.
- Opted in with their email/phone to receive the full **top-3 report** — ranked
  AI focus areas with reasoning, suggested tools, and a 30/60/90 roadmap.
- They have **not** received the report yet. **GHL delivers it as Email 1 of the
  sequence you design**, then continues with the tier-specific follow-ups.

## The data you can personalize with (GHL merge fields)
Use GHL syntax `{{contact.field_key}}`. Two groups — treat them differently:

**Safe to show in copy (human-readable):**
| Field | What it is | Example |
| --- | --- | --- |
| `{{contact.first_name}}` | First name | Eva |
| `{{contact.assessment_named_bottleneck}}` | One-sentence diagnosis of their #1 problem | "Your quotes-and-proposals process is a reliability gap…" |
| `{{contact.assessment_magic_wand}}` | Their dream outcome, **in their own words** | "I'd finally take weekends off" |
| `{{contact.assessment_annual_roi}}` | Reclaimed-time value per year, currency-formatted | R 395,000 / $42,000 |
| `{{contact.assessment_annual_roi_range}}` | Honest low–high range | $18,500–$75,000 |
| `{{contact.assessment_report_headline}}` | One-line finding | — |
| `{{contact.assessment_report_summary}}` | 2–3 sentence summary | — |
| `{{contact.assessment_report_html}}` | The full report as a ready HTML block — drop into a Custom HTML email element for Email 1 | — |
| `{{contact.assessment_top_areas}}` | Ranked top‑3 areas (multi-line text) | — |
| `{{contact.assessment_roadmap}}` | Now / Next / Later plan | — |
| `{{contact.assessment_report_url}}` | Link to the lead's hosted top-3 report page | https://reports.…/reports/abc123.html |
| `{{contact.assessment_report_pdf_url}}` | Link to the same report as a PDF | https://reports.…/reports/abc123.pdf |
| `{{contact.assessment_resource_url}}` | The lead's resource link — **their own report** when hosting is on, otherwise a tool-discovery link | (mirrors report_url) |
| `{{contact.assessment_resource_label}}` | Button/link text for that resource | "View your AI Readiness report" |
| `{{contact.company_name}}`, `{{contact.industry}}` | Business name, industry | Century 21 |

**For SEGMENTATION / conditional logic only — never print these raw codes in an email:**
| Field | Values | Use it to… |
| --- | --- | --- |
| `assessment_tier` | `Tier 1 Emergency Fix`, `Tier 2 Clear ROI`, `Tier 3 Roadmap`, `Tier 4 Starter` | Pick which track they enter |
| `assessment_temperature` | `hot`, `warm`, `cool`, `cold` | Set cadence + push level |
| `assessment_priority_band` | `Low`, `Moderate`, `High`, `Critical` | Set urgency |
| `assessment_lever` | `effectiveness`, `efficiency`, `quality`, `overwhelmed` | Choose the benefit angle (more revenue / time back / better CX / relief) |
| `assessment_domain` | `acquisition`, `conversion`, `fulfillment`, `operations`, `retention` | Choose relevant proof/examples |
| `assessment_friction_type` | `acquisition_leak`, `capacity`, `reliability`, `quality`, `visibility` | Name the failure mode in plain words |

> The coded fields are tags — translate them into plain language yourself; don't
> merge `efficiency` or `acquisition_leak` into visible copy.

## Email 1 is the report — in every track
The first email of all four tracks is the **report delivery** (Day 0, sent
immediately). Design it once as a base, then adjust only its framing/subject per
tier. It should:
- open with `{{contact.first_name}}` and mirror their `{{contact.assessment_magic_wand}}` / `{{contact.assessment_named_bottleneck}}`,
- deliver the report — either drop `{{contact.assessment_report_html}}` into a Custom HTML block, **or** give a short summary (`assessment_report_headline` + `assessment_report_summary` + `assessment_top_areas`) and a button to `{{contact.assessment_report_url}}` (and offer the PDF, `{{contact.assessment_report_pdf_url}}`),
- state the ROI as reclaimed-time value (`{{contact.assessment_annual_roi}}`, "roughly"),
- end with the booking CTA. Tier 1's version leads with urgency; Tier 4's is low-key.

## The four tracks (segment on `assessment_tier`)
Design a distinct sequence for each. Email 1 = the report (above); the follow-ups
below differ by tier. Cadence and intent differ; voice stays constant.

1. **Tier 1 — Emergency Fix (hot, High/Critical).** Highest intent, real money bleeding now. Email 1 (report, urgent framing) + ~3 follow-ups over 7 days. Lead with the cost of waiting. Primary CTA: book a call **this week**. (An internal SMS/email alert to the operator also fires — you can draft that too.)
2. **Tier 2 — Clear ROI (warm).** Convinced of value, weighing it up. Email 1 (report) + ~3 follow-ups over 5 days: (a) the cost of waiting, (b) what the fix actually looks like, (c) a similar-business example. CTA: scope it on a 15-minute call.
3. **Tier 3 — Roadmap (cool).** Early, smart, not ready. Email 1 (report) + ~4 weekly follow-ups. Teach around their `assessment_domain` and `friction_type`. Soft CTA: book when ready.
4. **Tier 4 — Starter (cold/Low).** Long horizon. Email 1 (report) + monthly, low-pressure, useful-only follow-ups. CTA: a resource, not a call — use `{{contact.assessment_resource_label}}` as the link text pointing to `{{contact.assessment_resource_url}}` (their own report when hosting is on, else a tool-discovery link).

## Voice & guardrails (non-negotiable)
- Calm, plain, direct. Talk like a helpful expert, not a marketer.
- **No hype words** (amazing, game-changing, revolutionary) and **no exclamation marks**.
- ROI is the **value of reclaimed time** — frame as "roughly" / "up to", never a guarantee, and never call it new revenue.
- Open with the prospect's own words (`assessment_magic_wand`) or their named bottleneck wherever natural — that's the emotional hook.
- One idea, one CTA per email. Keep each email under ~150 words. Mobile-first, mostly plain text.
- Acknowledge that they may have **tried before** — position this as "done with you," not another tool to figure out alone. The exact build is mapped on the call (don't give the full how-to in email).
- Always offer a graceful out / fallback if a merge field might be empty.

## What to deliver
First, the shared **Email 1 (the report)** as a reusable base, plus its one-line
per-tier framing/subject tweaks. Then, for **each of the 4 tracks**, a table of
the follow-up emails with these columns:
**Email # · Send delay (day offset) · Subject line · Preview text · Body (with merge fields) · CTA button text + link · Goal of this email.**

Then add:
- 2 subject-line variants per email (for A/B testing).
- The Tier 1 internal operator alert (SMS + email) using `assessment_named_bottleneck`, `assessment_annual_roi`, `assessment_magic_wand`.
- A short note on exit conditions (e.g., stop the sequence once a call is booked).

The CTA link is the GHL calendar booking link (the operator will paste the real
URL). Output everything ready to paste into GHL email steps.

## Start by
Drafting the shared **Email 1 (the report)** first, then confirming the four
tracks with their follow-up count + cadence, then writing Track 1 (Tier 1) in
full before moving on.
