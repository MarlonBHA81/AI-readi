// Source of truth for the "Parse & Build Report" Code node.
// Parses Claude's JSON, builds TAAFT URLs, and assembles the enriched GHL
// payload (original fields + decision-grade report fields) plus a ready-to-send
// customer email (emailSubject + emailHtml) for the Resend node. Every new field
// is guarded, so an older or partial Claude response still renders.

// Booking link used for the email CTA (prefilled with the lead's details).
// Keep in sync with CALENDAR_URL in src/App.jsx.
const BOOKING_URL = "https://link.storyadvantage.co.za/widget/booking/OqhZq68Xp8tgjqTnshgm";

// Optional: your own resource/case-study link per business area (domain). Fill
// any of these to override the auto-picked tool-discovery link. Leave blank to
// fall back to the live theresanaiforthat.com link for the lead's #1 area.
const RESOURCE_LINKS = {
  acquisition: "",
  conversion: "",
  fulfillment: "",
  operations: "",
  retention: "",
};

// Public base URL where the hosted report page + PDF live (e.g. your Cloudflare
// R2 public URL or custom domain, with trailing slash). When set, the report's
// page/PDF URLs are computed deterministically from submissionId and become the
// lead's resource link. Leave blank until the R2/hosting step is wired.
const REPORT_BASE_URL = "";

const claudeResponse = $input.first().json;
const webhookBody = $('Intake Webhook').first().json.body;

// --- 1. Extract Claude's JSON ---
let diagnosis = null;
try {
  const content = claudeResponse.content && claudeResponse.content[0];
  if (content && content.type === 'text') {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) diagnosis = JSON.parse(jsonMatch[0]);
  }
} catch (e) {
  // Parse failed; continue with null diagnosis (report fields fall back to empty).
}

// --- 2. TAAFT search URL per area (same encoding as buildTaaftSearchUrl) ---
function taaftUrl(query) {
  return 'https://theresanaiforthat.com/s/' +
    String(query || '').trim().toLowerCase().replace(/\s+/g, '+') +
    '/top-rated/';
}

const topAreas = ((diagnosis && diagnosis.topAreas) || []).map(function (area) {
  return Object.assign({}, area, { taaftUrl: taaftUrl(area.taaftQuery || area.area) });
});

// --- 3. Plain-text block for the GHL custom field ---
function metaLine(a) {
  const bits = [];
  if (a.impact) bits.push('Impact: ' + a.impact);
  if (a.effort) bits.push('Effort: ' + a.effort);
  if (a.approach) bits.push('Approach: ' + a.approach + (a.roughInvestment ? ' (' + a.roughInvestment + ')' : ''));
  return bits.join('  |  ');
}

const topAreasText = topAreas.map(function (a) {
  const lines = ['#' + a.rank + '. ' + a.area];
  const meta = metaLine(a);
  if (meta) lines.push(meta);
  lines.push(a.why || '');
  if (a.expectedOutcome) lines.push('Expected outcome: ' + a.expectedOutcome);
  lines.push('Tools: ' + (a.candidateTools || []).join(', '));
  lines.push('Browse: ' + a.taaftUrl);
  if (a.openQuestion) lines.push('Worth a conversation: ' + a.openQuestion);
  return lines.join('\n');
}).join('\n\n');

// --- 4. HTML report fragment for the email ---
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function badgeHtml(a) {
  const tags = [];
  if (a.impact) tags.push('Impact: ' + esc(a.impact));
  if (a.effort) tags.push('Effort: ' + esc(a.effort));
  if (a.approach) tags.push(esc(a.approach) + (a.roughInvestment ? ' (' + esc(a.roughInvestment) + ')' : ''));
  return tags.length ? '<p style="color:#5a6b7d;font-size:13px;margin:4px 0">' + tags.join(' &middot; ') + '</p>' : '';
}

const areasHtml = topAreas.map(function (a) {
  return '<h3>' + esc(a.rank) + '. ' + esc(a.area) + '</h3>' +
    badgeHtml(a) +
    '<p>' + esc(a.why) + '</p>' +
    (a.expectedOutcome ? '<p><strong>Expected outcome:</strong> ' + esc(a.expectedOutcome) + '</p>' : '') +
    '<p><strong>Tools to explore:</strong> ' + esc((a.candidateTools || []).join(', ')) + '</p>' +
    '<p><a href="' + esc(a.taaftUrl) + '">Browse top-rated tools for ' + esc(a.area) + ' &rarr;</a></p>' +
    (a.openQuestion ? '<p style="color:#33475b"><em>Worth a conversation: ' + esc(a.openQuestion) + '</em></p>' : '');
}).join('');

const roadmap = (diagnosis && diagnosis.roadmap) || null;
const roadmapHtml = roadmap
  ? '<h3>Suggested sequence</h3><ol>' +
    (roadmap.now ? '<li><strong>Now:</strong> ' + esc(roadmap.now) + '</li>' : '') +
    (roadmap.next ? '<li><strong>Next:</strong> ' + esc(roadmap.next) + '</li>' : '') +
    (roadmap.later ? '<li><strong>Later:</strong> ' + esc(roadmap.later) + '</li>' : '') +
    '</ol>'
  : '';

// Prefer the currency-correct string the client already formatted; fall back to $.
const roiFormatted = webhookBody.annualROIFormatted || ('$' + Number(webhookBody.annualROI || 0).toLocaleString());
const roiRange = webhookBody.annualROIRangeFormatted || '';

const reportHtml =
  '<h2>' + esc((diagnosis && diagnosis.headline) || 'Your AI Readiness Report') + '</h2>' +
  '<p>' + esc((diagnosis && diagnosis.summary) || '') + '</p>' +
  areasHtml +
  roadmapHtml +
  '<hr>' +
  '<p><em>ROI estimate: roughly ' + roiFormatted + '/year' +
  (roiRange ? ' (about ' + esc(roiRange) + ')' : '') +
  ' in reclaimed-time value. Treat as directional, not a guarantee; it does not assume new revenue.</em></p>';

// --- 5. Customer email (subject + full HTML) for the Resend node ---
const firstName = webhookBody.firstName || '';
const emailSubject =
  (firstName ? firstName + ', ' : '') + 'your AI Readiness report' +
  (roiFormatted ? ' — roughly ' + roiFormatted + '/year on the table' : '');

// Booking CTA, prefilled with the lead's details (same params GHL reads).
const bp = new URLSearchParams();
if (webhookBody.firstName) bp.set('first_name', webhookBody.firstName);
if (webhookBody.lastName) bp.set('last_name', webhookBody.lastName);
if (webhookBody.email) bp.set('email', webhookBody.email);
if (webhookBody.phone) bp.set('phone', webhookBody.phone);
const bookingUrl = BOOKING_URL + (BOOKING_URL.indexOf('?') > -1 ? '&' : '?') + bp.toString();
const ctaHtml =
  '<p style="margin:24px 0"><a href="' + esc(bookingUrl) +
  '" style="background:#2e75b6;color:#fff;text-decoration:none;padding:12px 20px;' +
  'border-radius:8px;display:inline-block;font-weight:600">Book a 15-minute call</a></p>';

const emailHtml =
  '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;' +
  'color:#1f3b57;max-width:640px;margin:0 auto;line-height:1.55;padding:8px 4px">' +
  '<p>Hi ' + esc(firstName || 'there') + ',</p>' +
  '<p>Thanks for taking the AI Readiness Check — here is your full report.</p>' +
  reportHtml +
  ctaHtml +
  '<p style="margin-top:24px">Talk soon,<br>The Small Business Helpdesk team</p>' +
  '</div>';

// --- 5b. Standalone report document (source for the hosted page + the PDF) ---
const fullName = [webhookBody.firstName, webhookBody.lastName].filter(Boolean).join(' ').trim();
const preparedFor = (fullName ? 'Prepared for ' + fullName : 'Prepared for you') +
  (webhookBody.businessName ? ', ' + webhookBody.businessName : '');
const reportPageHtml =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>Your AI Readiness Report</title><style>' +
  'body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f3b57;' +
  'max-width:760px;margin:0 auto;padding:36px 22px;line-height:1.55}' +
  'h1{font-size:24px;margin:6px 0 2px}h2{font-size:18px;margin-top:26px}h3{font-size:15px;margin-top:20px}' +
  '.brand{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#2e75b6;font-weight:700;margin:0}' +
  '.prepared{color:#5a6b7d;font-size:13px;margin:2px 0 18px}' +
  'a.book{background:#2e75b6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;' +
  'display:inline-block;font-weight:600}hr{border:0;border-top:1px solid #e2e8f0;margin:22px 0}' +
  '@media print{a.book{border:1px solid #2e75b6}}</style></head><body>' +
  '<p class="brand">Small Business Helpdesk · AI Readiness Report</p>' +
  '<p class="prepared">' + esc(preparedFor) + '</p>' +
  reportHtml +
  '<p style="margin:24px 0"><a class="book" href="' + esc(bookingUrl) + '">Book a 15-minute call</a></p>' +
  '</body></html>';

// --- 6. Report URLs (deterministic from submissionId) + per-lead resource ---
const sid = webhookBody.submissionId || ('sub-' + Date.now());
const reportUrl = REPORT_BASE_URL ? REPORT_BASE_URL + 'reports/' + sid + '.html' : '';
const reportPdfUrl = REPORT_BASE_URL ? REPORT_BASE_URL + 'reports/' + sid + '.pdf' : '';

const primaryArea = topAreas[0] || null;
// The lead's own report is the best resource; fall back to your content, then TAAFT.
const resourceUrl =
  reportUrl ||
  RESOURCE_LINKS[webhookBody.domain] ||
  (primaryArea && primaryArea.taaftUrl) ||
  taaftUrl(webhookBody.domain || 'small business');
const resourceLabel = reportUrl
  ? 'View your AI Readiness report'
  : primaryArea
    ? 'Explore tools for ' + primaryArea.area
    : 'Explore AI tools for your business';

// --- 7. Enriched payload (original fields + report fields + email + resource) ---
const roadmapText = roadmap
  ? ['Now: ' + (roadmap.now || ''), 'Next: ' + (roadmap.next || ''), 'Later: ' + (roadmap.later || '')].join('\n')
  : '';

return [
  {
    json: Object.assign({}, webhookBody, {
      assessment_resource_url: resourceUrl,
      assessment_resource_label: resourceLabel,
      assessment_top_areas: topAreasText,
      assessment_tool_suggestions: topAreas.map(function (a) {
        return a.area + ': ' + (a.candidateTools || []).join(', ');
      }).join('\n'),
      assessment_roadmap: roadmapText,
      assessment_report_html: reportHtml,
      assessment_report_headline: (diagnosis && diagnosis.headline) || '',
      assessment_report_summary: (diagnosis && diagnosis.summary) || '',
      // Hosted report page + PDF (URLs are deterministic; the upload nodes write
      // to the matching keys). assessment_report_page_html is the standalone
      // document to host and to render to PDF — not for GHL, used by the R2/PDF
      // nodes downstream.
      assessment_report_url: reportUrl,
      assessment_report_pdf_url: reportPdfUrl,
      assessment_report_page_html: reportPageHtml,
      // Ready-to-send customer email for the Resend node:
      emailSubject: emailSubject,
      emailHtml: emailHtml
    })
  }
];
