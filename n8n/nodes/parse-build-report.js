// Source of truth for the "Parse & Build Report" Code node.
// Parses Claude's JSON, builds TAAFT URLs, and assembles the enriched GHL
// payload (original fields + decision-grade report fields). Every new field is
// guarded, so an older or partial Claude response still renders.

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

const roiFormatted = '$' + Number(webhookBody.annualROI || 0).toLocaleString();
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

// --- 5. Enriched payload (original fields + report fields) ---
const roadmapText = roadmap
  ? ['Now: ' + (roadmap.now || ''), 'Next: ' + (roadmap.next || ''), 'Later: ' + (roadmap.later || '')].join('\n')
  : '';

return [
  {
    json: Object.assign({}, webhookBody, {
      assessment_top_areas: topAreasText,
      assessment_tool_suggestions: topAreas.map(function (a) {
        return a.area + ': ' + (a.candidateTools || []).join(', ');
      }).join('\n'),
      assessment_roadmap: roadmapText,
      assessment_report_html: reportHtml,
      assessment_report_headline: (diagnosis && diagnosis.headline) || '',
      assessment_report_summary: (diagnosis && diagnosis.summary) || ''
    })
  }
];
