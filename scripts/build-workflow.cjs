#!/usr/bin/env node
// Injects the two Code-node sources (n8n/nodes/*.js) and the Claude system
// prompt (prompts/diagnosis-system-prompt.md) into the importable workflow JSON,
// so the workflow stays in sync with its reviewable source. Run after editing
// the prompt or either node file:  node scripts/build-workflow.cjs
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

// 1. Extract the system prompt from the first fenced block under "## System prompt".
const md = fs.readFileSync(path.join(root, "prompts/diagnosis-system-prompt.md"), "utf8");
const heading = md.indexOf("## System prompt");
const open = md.indexOf("```", heading);
const close = md.indexOf("```", open + 3);
if (heading < 0 || open < 0 || close < 0) throw new Error("Could not locate the system-prompt code fence");
const prompt = md.slice(open + 3, close).replace(/^\n/, "").replace(/\s+$/, "");

// 2. Load the node sources; inject the prompt as a JSON string literal.
const prepare = fs
  .readFileSync(path.join(root, "n8n/nodes/prepare-claude-request.js"), "utf8")
  .replace("__SYSTEM_PROMPT__", JSON.stringify(prompt));
const parse = fs.readFileSync(path.join(root, "n8n/nodes/parse-build-report.js"), "utf8");

// 3. Syntax-check both bodies (n8n wraps Code nodes in a function, so top-level
//    return is valid — Function bodies allow it too). Throws on a syntax error.
for (const [name, code] of [["prepare-claude-request", prepare], ["parse-build-report", parse]]) {
  try {
    new Function(code); // eslint-disable-line no-new-func
  } catch (e) {
    throw new Error(`Syntax error in ${name}.js: ${e.message}`);
  }
}

// 4. Splice into the workflow and write it back (everything else untouched).
const wfPath = path.join(root, "n8n/ai-readiness-report.workflow.json");
const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));
let updated = 0;
for (const node of wf.nodes) {
  if (node.name === "Prepare Claude Request") {
    node.parameters.jsCode = prepare;
    updated++;
  }
  if (node.name === "Parse & Build Report") {
    node.parameters.jsCode = parse;
    updated++;
  }
}
if (updated !== 2) throw new Error(`Expected to update 2 nodes, updated ${updated}`);
fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");
console.log(`Workflow rebuilt. System prompt: ${prompt.length} chars. Nodes updated: ${updated}.`);
