// Source of truth for the "Prepare Claude Request" Code node.
// SYSTEM_PROMPT is injected at build time from prompts/diagnosis-system-prompt.md
// by scripts/build-workflow.cjs — edit the prompt there, not the placeholder below.

const SYSTEM_PROMPT = __SYSTEM_PROMPT__;

const body = $input.first().json.body;

const userMessage =
  'Here is the completed AI readiness assessment. Based on all 12 answers, identify the top 3 focus areas where AI can deliver measurable impact.\n\nAssessment data:\n' +
  JSON.stringify(body, null, 2) +
  '\n\nReturn only the JSON output as specified.';

return [
  {
    json: {
      requestBody: {
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      }
    }
  }
];
