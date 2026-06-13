import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ════════════════════════════════════════════════════════════════════════
   CONFIG — edit these before deploying
   ════════════════════════════════════════════════════════════════════════ */

// n8n intake webhook URL — receives every submission instantly (lead captured
// server-side), then calls Claude async and forwards the enriched payload to
// GHL. See n8n/README.md for the importable workflow and setup steps.
const INTAKE_WEBHOOK_URL = "PASTE_YOUR_N8N_WEBHOOK_URL_HERE";

// GHL calendar booking link, embedded on the result screen for Tier 1/2
// and whenever the prospect asks for a call.
const CALENDAR_URL = "PASTE_YOUR_GHL_CALENDAR_LINK_HERE";

// Webhook retry backoff (ms) after a failed POST. Results always render
// regardless of webhook status.
const RETRY_DELAYS_MS = [5000, 15000, 45000];

const BRAND = { navy: "#1F3B57", accent: "#2E75B6" };

/* ════════════════════════════════════════════════════════════════════════
   QUESTION DEFINITIONS
   Tags (the `value` / score fields) drive scoring and routing only.
   They are never rendered to the prospect.
   ════════════════════════════════════════════════════════════════════════ */

export const QUESTIONS = [
  {
    id: "q1",
    key: "lever",
    title: "What would move the needle most for your business right now?",
    options: [
      { label: "More revenue and more sales", value: "effectiveness" },
      { label: "More time back in my week", value: "efficiency" },
      { label: "Happier, more loyal customers", value: "quality" },
      { label: "Honestly, all three are hurting", value: "overwhelmed" },
    ],
  },
  {
    id: "q2",
    key: "domain",
    title: "Which part of the business feels most stuck?",
    options: [
      { label: "Getting leads and new customers", value: "acquisition" },
      { label: "Following up and closing deals", value: "conversion" },
      { label: "Delivering the work / fulfillment", value: "fulfillment" },
      { label: "Admin, billing, scheduling, reporting", value: "operations" },
      { label: "Customer support and retention", value: "retention" },
    ],
  },
  {
    id: "q3",
    key: "task",
    title: "What's the one task you or your team repeat most every week?",
    otherValue: "other", // selecting this reveals an optional free-text field
    options: [
      { label: "Writing the same emails or messages over and over", value: "email" },
      { label: "Manually entering or moving data between tools", value: "data" },
      { label: "Creating quotes, proposals, or invoices", value: "quotes" },
      { label: "Taking notes or writing up calls and meetings", value: "notes" },
      { label: "Answering the same customer questions", value: "support" },
      { label: "Something else", value: "other" },
    ],
  },
  {
    id: "q4",
    key: "freq",
    title: "How many hours a week does that one task eat up?",
    options: [
      { label: "Under 2 hours", value: 1, hoursMid: 1 },
      { label: "2 to 5 hours", value: 2, hoursMid: 3.5 },
      { label: "5 to 10 hours", value: 3, hoursMid: 7.5 },
      { label: "More than 10 hours", value: 4, hoursMid: 12 },
    ],
  },
  {
    id: "q5",
    key: "who",
    title: "Who usually does that task?",
    options: [
      { label: "Me, the owner", value: "owner" },
      { label: "A senior or skilled team member", value: "senior" },
      { label: "An admin or junior team member", value: "junior" },
      { label: "Nobody consistently, it slips", value: "nobody" },
    ],
  },
  {
    id: "q6",
    key: "rate",
    title: "Roughly what is that person's time worth per hour?",
    options: [
      { label: "Under $25", value: 15 },
      { label: "$25 to $75", value: 50 },
      { label: "$75 to $150", value: 112 },
      { label: "$150 or more", value: 175 },
    ],
  },
  {
    id: "q7",
    key: "frictionType",
    title: "Where do things most often slow down or fall through the cracks?",
    options: [
      { label: "Leads go cold before anyone follows up", value: "acquisition_leak" },
      { label: "Work piles up and creates a bottleneck", value: "capacity" },
      { label: "Things get forgotten or dropped", value: "reliability" },
      { label: "Quality slips when we get busy", value: "quality" },
      { label: "We're flying blind, no clear data", value: "visibility" },
    ],
  },
  {
    id: "q8",
    key: "friction",
    title: "How painful is that breakdown when it happens?",
    options: [
      { label: "Mild annoyance", value: 1 },
      { label: "Costs us some money or goodwill", value: 2 },
      { label: "Regularly costs us real revenue", value: 3 },
      { label: "It's one of my biggest problems", value: 4 },
    ],
  },
  {
    id: "q9",
    key: "tried",
    title: "Have you tried to fix it before?",
    options: [
      { label: "No, never got to it", value: "never" },
      { label: "Tried a tool, it didn't stick", value: "tool" },
      { label: "Tried hiring, too expensive or slow", value: "hire" },
      { label: "Patched it together, still messy", value: "patched" },
    ],
  },
  {
    id: "q10",
    key: "magicWand",
    type: "text",
    title: "If that one thing ran itself tomorrow, what would change for you?",
    placeholder: "In your own words. One or two sentences is plenty.",
  },
  {
    id: "q11",
    key: "temp",
    title: "How ready are you to fix this in the next 30 days?",
    options: [
      { label: "Ready now, I just need the right fix", value: "hot" },
      { label: "Soon, if the ROI is clear", value: "warm" },
      { label: "Exploring, building a shortlist", value: "cool" },
      { label: "Just curious for now", value: "cold" },
    ],
  },
  {
    id: "q12",
    key: "delivery",
    title: "Best way to send your free assessment back?",
    options: [
      { label: "Book a 15-minute call", value: "call" },
      { label: "Email it to me", value: "email" },
      { label: "WhatsApp or text me", value: "whatsapp" },
    ],
  },
];

/* ════════════════════════════════════════════════════════════════════════
   DISPLAY LABELS (prospect-facing language for internal tags)
   ════════════════════════════════════════════════════════════════════════ */

const LABELS = {
  domain: {
    acquisition: "lead generation",
    conversion: "sales follow-up",
    fulfillment: "delivery and fulfillment",
    operations: "operations and admin",
    retention: "customer support and retention",
  },
  // Used in the headline: "Your biggest AI opportunity: {friction} in {domain}."
  frictionHeadline: {
    acquisition_leak: "leads going cold",
    capacity: "work piling up",
    reliability: "things falling through the cracks",
    quality: "quality slipping under load",
    visibility: "no clear visibility",
  },
  // Used inside the named-bottleneck sentence.
  frictionNoun: {
    acquisition_leak: "leak where leads go cold before anyone follows up",
    capacity: "capacity bottleneck where work piles up",
    reliability: "reliability gap where things get forgotten or dropped",
    quality: "pressure point where quality slips when things get busy",
    visibility: "blind spot that leaves you without clear data",
  },
  task: {
    email: "repetitive email and messaging",
    data: "manual data entry",
    quotes: "quotes and proposals",
    notes: "call and meeting write-ups",
    support: "repeat customer questions",
    other: "that recurring task",
  },
  who: {
    owner: "you, the owner,",
    senior: "your senior people",
    junior: "your admin team",
    nobody: "whoever happens to pick it up",
  },
  lever: {
    effectiveness: "more revenue",
    efficiency: "getting time back",
    quality: "customer experience",
  },
};

/* ════════════════════════════════════════════════════════════════════════
   SCORING ENGINE (pure functions, exported for tests)
   ════════════════════════════════════════════════════════════════════════ */

// priorityScore = freq (1-4) x friction (1-4), banded.
export function priorityBandFor(score) {
  if (score <= 4) return "Low";
  if (score <= 8) return "Moderate";
  if (score <= 12) return "High";
  return "Critical";
}

export function roundToNearest500(n) {
  return Math.round(n / 500) * 500;
}

export function formatCurrency(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

// Tool recommendation decision tree, resolved in priority order.
// "Nuance/judgment" for email/support is inferred from who does the task:
// owner or senior implies judgment-heavy work (spec default: yes for
// owner-handled email); junior/nobody implies a common, well-solved case.
export function recommendTool({ task, domain, who }) {
  if (task === "quotes" || task === "other" || (task === "data" && domain === "operations")) {
    return {
      key: "custom",
      payloadLabel: "Custom Claude skill",
      category: null,
    };
  }
  const nuanced = who === "owner" || who === "senior";
  if ((task === "email" || task === "support") && nuanced) {
    return {
      key: "cowork",
      payloadLabel: "Claude Cowork",
      category: null,
    };
  }
  const category = {
    notes: "meeting-notes AI",
    data: "automation platform",
    email: "inbox AI",
    support: "support chatbot",
  }[task];
  return {
    key: "offshelf",
    payloadLabel: `Off-the-shelf tool (${category})`,
    category,
  };
}

// Readiness tier, evaluated top-down, first match wins.
// Rule 2 accepts Moderate and above so that warm + Critical resolves to
// Tier 2 — the spec's else-branch is defined as exactly
// (temp == cold OR priorityBand == Low). Hot + High/Critical is already
// captured by rule 1 before rule 2 is evaluated.
export function resolveTier(temp, priorityBand) {
  if (temp === "hot" && (priorityBand === "High" || priorityBand === "Critical")) {
    return { tier: 1, name: "Emergency Fix", payloadLabel: "Tier 1 Emergency Fix" };
  }
  if (
    (temp === "hot" || temp === "warm") &&
    (priorityBand === "Moderate" || priorityBand === "High" || priorityBand === "Critical")
  ) {
    return { tier: 2, name: "Clear ROI", payloadLabel: "Tier 2 Clear ROI" };
  }
  if (temp === "cool") {
    return { tier: 3, name: "Roadmap", payloadLabel: "Tier 3 Roadmap" };
  }
  return { tier: 4, name: "Starter", payloadLabel: "Tier 4 Starter" };
}

// The named bottleneck: task (Q3) + friction type (Q7) + who (Q5) + lever (Q1).
export function buildNamedBottleneck(a) {
  const taskLabel =
    a.task === "other" && a.taskOther?.trim()
      ? `"${a.taskOther.trim()}"`
      : LABELS.task[a.task];
  const first = `Your ${taskLabel} process is a ${LABELS.frictionNoun[a.frictionType]}, and it's pulling ${LABELS.who[a.who]} away from higher-value work.`;
  const second =
    a.lever === "overwhelmed"
      ? "Because you told us revenue, time, and customer experience are all hurting right now, this is the single highest-leverage thing to fix."
      : `Because you told us ${LABELS.lever[a.lever]} matters most right now, this is the single highest-leverage thing to fix.`;
  return `${first} ${second}`;
}

// Assembles every derived value from the raw answers.
export function computeResults(a) {
  const priorityScore = a.freq * a.friction; // 1-16
  const priorityBand = priorityBandFor(priorityScore);
  const weeklyROI = a.hoursMid * a.rate;
  const annualROIRaw = weeklyROI * 50;
  const annualROI = roundToNearest500(annualROIRaw); // headline + payload number
  const tool = recommendTool(a);
  const tier = resolveTier(a.temp, priorityBand);
  return {
    priorityScore,
    priorityBand,
    weeklyROI,
    annualROIRaw,
    annualROI,
    tool,
    tier,
    namedBottleneck: buildNamedBottleneck(a),
    headline: `Your biggest AI opportunity: ${LABELS.frictionHeadline[a.frictionType]} in ${LABELS.domain[a.domain]}.`,
  };
}

// Full GHL webhook payload. annualROI is the rounded headline number so the
// figure in the report email matches the result screen exactly.
export function buildPayload(answers, contact, results, submittedAt) {
  return {
    firstName: contact.firstName.trim(),
    lastName: contact.lastName.trim(),
    email: contact.email.trim(),
    phone: contact.phone.trim(),
    businessName: contact.businessName.trim(),
    industry: contact.industry.trim(),
    lever: answers.lever,
    domain: answers.domain,
    primaryTask: answers.task,
    taskOther: answers.taskOther?.trim() || "",
    frequencyScore: answers.freq,
    frictionScore: answers.friction,
    priorityScore: results.priorityScore,
    priorityBand: results.priorityBand,
    whoDoesIt: answers.who,
    weeklyROI: results.weeklyROI,
    annualROI: results.annualROI,
    annualROIFormatted: formatCurrency(results.annualROI),
    frictionType: answers.frictionType,
    triedBefore: answers.tried,
    magicWand: answers.magicWand.trim(),
    temperature: answers.temp,
    readinessTier: results.tier.payloadLabel,
    toolRecommendation: results.tool.payloadLabel,
    deliveryPreference: answers.delivery,
    namedBottleneck: results.namedBottleneck,
    submittedAt,
  };
}

// Encodes a query into the TAAFT top-rated search URL.
// Spaces → "+" (TAAFT's confirmed URL format); other chars pass through.
export function buildTaaftSearchUrl(query) {
  return `https://theresanaiforthat.com/s/${query.trim().toLowerCase().replace(/\s+/g, "+")}/top-rated/`;
}

/* ════════════════════════════════════════════════════════════════════════
   PROSPECT-FACING RESULT COPY
   ════════════════════════════════════════════════════════════════════════ */

function toolDirectionCopy(tool) {
  const closing = "The exact setup depends on your tools, which we'll map on a quick call.";
  if (tool.key === "custom") {
    return `A custom-built Claude skill: a repeatable AI workflow designed around exactly how your business handles this, instead of forcing your process into a generic tool. ${closing}`;
  }
  if (tool.key === "cowork") {
    return `Claude Cowork: an AI coworker that handles the judgment-heavy parts of this work with you, drafting in your voice while you stay in control of what goes out. ${closing}`;
  }
  return `A proven off-the-shelf ${tool.category}. This is a well-solved problem, so you likely don't need anything custom built; the win is choosing the right category and setting it up properly. ${closing}`;
}

const TIER_CTA = {
  1: "This is costing you real money every week. Let's fix it this week.",
  2: "The ROI here is clear. Let's scope what it takes to build it.",
  3: "You're early, and that's smart. Here's a roadmap, and we can talk when you're ready.",
  4: "Here's your starter assessment. When you're ready to go deeper, we're here.",
};

/* ════════════════════════════════════════════════════════════════════════
   DOWNLOADABLE REPORT (self-contained HTML file)
   ════════════════════════════════════════════════════════════════════════ */

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildReportHtml(results, answers, contact) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  const roi = formatCurrency(results.annualROI);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>AI Readiness Assessment</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND.navy};max-width:640px;margin:40px auto;padding:0 20px;line-height:1.55}
h1{font-size:22px} h2{font-size:16px;margin-top:28px} .roi{font-size:34px;color:${BRAND.accent};font-weight:700}
.note{color:#5a6b7d;font-size:13px} blockquote{border-left:3px solid ${BRAND.accent};margin:12px 0;padding:4px 14px;color:#33475b}
</style></head><body>
<p class="note">The 60-Second AI Readiness Check${name ? ` &middot; Prepared for ${escapeHtml(name)}` : ""}${contact.businessName ? `, ${escapeHtml(contact.businessName)}` : ""}</p>
<h1>${escapeHtml(results.headline)}</h1>
<h2>The number</h2>
<p class="roi">~${roi}/year</p>
<p>Automating this could give you back roughly ${roi} per year in reclaimed time and lost revenue. Treat this as a directional estimate based on your answers, not a guarantee.</p>
<h2>The bottleneck</h2>
<p>${escapeHtml(results.namedBottleneck)}</p>
<h2>In your own words</h2>
<blockquote>"${escapeHtml(answers.magicWand.trim())}"</blockquote>
<p>That's exactly what the right fix delivers.</p>
<h2>Recommended direction</h2>
<p>${escapeHtml(toolDirectionCopy(results.tool))}</p>
</body></html>`;
}

function downloadReport(results, answers, contact) {
  const blob = new Blob([buildReportHtml(results, answers, contact)], {
    type: "text/html",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "AI-Readiness-Assessment.html";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ════════════════════════════════════════════════════════════════════════
   UI PRIMITIVES
   ════════════════════════════════════════════════════════════════════════ */

function PrimaryButton({ children, ...props }) {
  return (
    <button
      {...props}
      className={`w-full rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy disabled:cursor-not-allowed disabled:opacity-40 ${props.className || ""}`}
    >
      {children}
    </button>
  );
}

function OptionButton({ label, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-xl border px-4 py-3.5 text-left text-[15px] leading-snug transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        selected
          ? "border-accent bg-accent/10 font-semibold text-navy"
          : "border-slate-200 bg-white text-navy hover:border-accent/60"
      }`}
    >
      {label}
    </button>
  );
}

function TextField({ label, error, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy">{label}</span>
      <input
        {...props}
        className={`w-full rounded-xl border bg-white px-4 py-3 text-[15px] text-navy placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          error ? "border-red-400" : "border-slate-200"
        }`}
      />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

function CalendarEmbed({ prominent }) {
  const configured = !CALENDAR_URL.startsWith("PASTE_");
  if (!configured) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
        Calendar embed placeholder. Set CALENDAR_URL at the top of App.jsx to your
        GHL booking link.
      </div>
    );
  }
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${prominent ? "" : "opacity-95"}`}>
      <iframe
        src={CALENDAR_URL}
        title="Book a 15-minute call"
        className="h-[620px] w-full border-0"
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN APP
   Steps: 0 = intro, 1..12 = questions, 13 = contact, 14 = results.
   State lives in React only — no localStorage (sandboxed embeds).
   ════════════════════════════════════════════════════════════════════════ */

const CONTACT_STEP = QUESTIONS.length + 1; // 13
const RESULT_STEP = CONTACT_STEP + 1; // 14
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function App() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    lever: null,
    domain: null,
    task: null,
    taskOther: "",
    freq: null,
    hoursMid: null,
    who: null,
    rate: null,
    frictionType: null,
    friction: null,
    tried: null,
    magicWand: "",
    temp: null,
    delivery: null,
  });
  const [contact, setContact] = useState({
    firstName: "",
    lastName: "",
    businessName: "",
    email: "",
    phone: "",
    industry: "",
  });
  const [contactErrors, setContactErrors] = useState({});
  // idle | sending | sent | failed (failed = all retries exhausted)
  const [webhookStatus, setWebhookStatus] = useState("idle");
  const advanceTimer = useRef(null);
  const retryTimer = useRef(null);

  const results = useMemo(
    () => (step === RESULT_STEP ? computeResults(answers) : null),
    [step, answers]
  );

  // Report height to the parent page so a GHL iframe embed can auto-size.
  useEffect(() => {
    const post = () => {
      if (window.parent !== window) {
        window.parent.postMessage(
          { type: "ai-readiness-check:height", height: document.documentElement.scrollHeight },
          "*"
        );
      }
    };
    post();
    window.addEventListener("resize", post);
    return () => window.removeEventListener("resize", post);
  }, [step]);

  useEffect(
    () => () => {
      clearTimeout(advanceTimer.current);
      clearTimeout(retryTimer.current);
    },
    []
  );

  const goBack = useCallback(() => {
    clearTimeout(advanceTimer.current);
    setStep((s) => Math.max(0, s - 1));
  }, []);

  // Single-select answers advance automatically after a brief confirmation
  // beat; "Something else" on Q3 stays put so the optional text can be typed.
  const selectOption = useCallback((question, option) => {
    clearTimeout(advanceTimer.current);
    setAnswers((prev) => {
      const next = { ...prev, [question.key]: option.value };
      if (question.key === "freq") next.hoursMid = option.hoursMid;
      if (question.key === "task" && option.value !== "other") next.taskOther = "";
      return next;
    });
    if (!(question.otherValue && option.value === question.otherValue)) {
      advanceTimer.current = setTimeout(() => setStep((s) => s + 1), 220);
    }
  }, []);

  const submitAll = useCallback(() => {
    const errors = {};
    if (!contact.firstName.trim()) errors.firstName = "We need a first name for your report.";
    if (!EMAIL_RE.test(contact.email.trim())) errors.email = "Enter a valid email address.";
    const phoneRequired = answers.delivery === "call" || answers.delivery === "whatsapp";
    const phoneDigits = contact.phone.replace(/\D/g, "");
    if (phoneRequired && phoneDigits.length < 7) {
      errors.phone =
        answers.delivery === "call"
          ? "We need a phone number to confirm your call."
          : "We need a number to send your assessment by WhatsApp or text.";
    }
    setContactErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const computed = computeResults(answers);
    const payload = buildPayload(answers, contact, computed, new Date().toISOString());
    setStep(RESULT_STEP);
    sendToGHL(payload);
  }, [answers, contact]);

  // POST to GHL on final submit. Failures never block the result screen:
  // retries are queued in the background and the UI falls back to a calm
  // "we'll email your results" message if every attempt fails.
  const sendToGHL = useCallback((payload, attempt = 0) => {
    if (INTAKE_WEBHOOK_URL.startsWith("PASTE_")) {
      console.warn("INTAKE_WEBHOOK_URL is not configured; skipping webhook POST.", payload);
      setWebhookStatus("sent");
      return;
    }
    setWebhookStatus("sending");
    fetch(INTAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
        setWebhookStatus("sent");
      })
      .catch(() => {
        if (attempt < RETRY_DELAYS_MS.length) {
          retryTimer.current = setTimeout(
            () => sendToGHL(payload, attempt + 1),
            RETRY_DELAYS_MS[attempt]
          );
        } else {
          setWebhookStatus("failed");
        }
      });
  }, []);

  /* ── screens ─────────────────────────────────────────────────────────── */

  let screen;
  if (step === 0) {
    screen = <IntroScreen onStart={() => setStep(1)} />;
  } else if (step >= 1 && step <= QUESTIONS.length) {
    const question = QUESTIONS[step - 1];
    screen = (
      <QuestionScreen
        question={question}
        answers={answers}
        setAnswers={setAnswers}
        onSelect={selectOption}
        onNext={() => setStep((s) => s + 1)}
      />
    );
  } else if (step === CONTACT_STEP) {
    screen = (
      <ContactScreen
        contact={contact}
        setContact={setContact}
        errors={contactErrors}
        delivery={answers.delivery}
        onSubmit={submitAll}
      />
    );
  } else {
    screen = (
      <ResultScreen
        results={results}
        answers={answers}
        contact={contact}
        webhookStatus={webhookStatus}
      />
    );
  }

  const inFlow = step >= 1 && step <= CONTACT_STEP;
  const progress = inFlow ? ((step - 1) / CONTACT_STEP) * 100 : 0;

  return (
    <div className="min-h-screen bg-mist px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-xl">
        {inFlow && (
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
              <button
                type="button"
                onClick={goBack}
                className="rounded px-1 py-0.5 text-navy underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Back
              </button>
              <span>
                {step <= QUESTIONS.length
                  ? `Question ${step} of ${QUESTIONS.length}`
                  : "Last step"}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        {screen}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   SCREENS
   ════════════════════════════════════════════════════════════════════════ */

function IntroScreen({ onStart }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">
        Free assessment
      </p>
      <h1 className="text-2xl font-bold leading-tight text-navy sm:text-3xl">
        The 60-Second AI Readiness Check
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
        Answer 12 quick questions about how your business runs. We'll pinpoint the
        one bottleneck where AI would pay for itself fastest, put a dollar figure
        on it, and send you a personalized assessment.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
        <li>Takes about a minute</li>
        <li>No tech knowledge needed</li>
        <li>Your result appears instantly at the end</li>
      </ul>
      <div className="mt-6">
        <PrimaryButton onClick={onStart}>Start the check</PrimaryButton>
      </div>
    </div>
  );
}

function QuestionScreen({ question, answers, setAnswers, onSelect, onNext }) {
  const selected = answers[question.key];

  if (question.type === "text") {
    const value = answers[question.key] || "";
    const valid = value.trim().length > 0;
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-bold leading-snug text-navy">{question.title}</h2>
        <textarea
          value={value}
          onChange={(e) => setAnswers((p) => ({ ...p, [question.key]: e.target.value }))}
          placeholder={question.placeholder}
          rows={4}
          maxLength={500}
          autoFocus
          className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-navy placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="mt-5">
          <PrimaryButton onClick={onNext} disabled={!valid}>
            Next
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const showOtherText = question.otherValue && selected === question.otherValue;
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold leading-snug text-navy">{question.title}</h2>
      <div className="mt-4 space-y-2.5">
        {question.options.map((option) => (
          <OptionButton
            key={String(option.value)}
            label={option.label}
            selected={selected === option.value}
            onClick={() => onSelect(question, option)}
          />
        ))}
      </div>
      {showOtherText && (
        <div className="mt-4">
          <input
            type="text"
            value={answers.taskOther}
            onChange={(e) => setAnswers((p) => ({ ...p, taskOther: e.target.value }))}
            placeholder="Briefly describe it (optional)"
            maxLength={200}
            autoFocus
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-navy placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <div className="mt-4">
            <PrimaryButton onClick={onNext}>Next</PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactScreen({ contact, setContact, errors, delivery, onSubmit }) {
  const phoneRequired = delivery === "call" || delivery === "whatsapp";
  const set = (key) => (e) => setContact((p) => ({ ...p, [key]: e.target.value }));
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold leading-snug text-navy">
        Where should we send your assessment?
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Your personalized result appears on the next screen, and the full report
        goes to your inbox.
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        noValidate
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            value={contact.firstName}
            onChange={set("firstName")}
            error={errors.firstName}
            autoComplete="given-name"
          />
          <TextField
            label="Last name"
            value={contact.lastName}
            onChange={set("lastName")}
            autoComplete="family-name"
          />
        </div>
        <TextField
          label="Business name"
          value={contact.businessName}
          onChange={set("businessName")}
          autoComplete="organization"
        />
        <TextField
          label="Email"
          type="email"
          value={contact.email}
          onChange={set("email")}
          error={errors.email}
          autoComplete="email"
          inputMode="email"
        />
        <TextField
          label={phoneRequired ? "Phone" : "Phone (optional)"}
          type="tel"
          value={contact.phone}
          onChange={set("phone")}
          error={errors.phone}
          autoComplete="tel"
          inputMode="tel"
        />
        <TextField
          label="Industry"
          value={contact.industry}
          onChange={set("industry")}
          placeholder="e.g. trades, agency, e-commerce, professional services"
        />
        <PrimaryButton type="submit">See my results</PrimaryButton>
        <p className="text-center text-xs text-slate-400">
          We only use this to send your assessment. No spam.
        </p>
      </form>
    </div>
  );
}

function ResultScreen({ results, answers, contact, webhookStatus }) {
  if (!results) return null;
  const roi = formatCurrency(results.annualROI);
  const showCalendar = results.tier.tier <= 2 || answers.delivery === "call";

  const deliveryLine =
    webhookStatus === "failed"
      ? `We're finalizing your report and will email your results to ${contact.email} shortly.`
      : answers.delivery === "whatsapp"
        ? `Your full report is on its way to ${contact.email}, with a copy by WhatsApp or text to ${contact.phone}.`
        : `Your full report is on its way to ${contact.email}.`;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">
          Your AI Readiness Check results
        </p>
        <h1 className="text-2xl font-bold leading-tight text-navy">{results.headline}</h1>

        <div className="mt-5 rounded-xl bg-navy p-5 text-white">
          <p className="text-sm text-white/80">The number</p>
          <p className="mt-1 text-3xl font-bold">~{roi}/year</p>
          <p className="mt-2 text-sm leading-relaxed text-white/90">
            Automating this could give you back roughly {roi}/year in reclaimed
            time and lost revenue.
          </p>
          <p className="mt-2 text-xs text-white/60">
            A directional estimate based on your answers, not a guarantee.
          </p>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            The bottleneck
          </h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-navy">
            {results.namedBottleneck}
          </p>
        </div>

        <div className="mt-5 rounded-xl border-l-4 border-accent bg-mist p-4">
          <p className="text-[15px] leading-relaxed text-navy">
            You said that if this ran itself, "{answers.magicWand.trim()}." That's
            exactly what the right fix delivers.
          </p>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recommended direction
          </h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-navy">
            {toolDirectionCopy(results.tool)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold leading-snug text-navy">
          {TIER_CTA[results.tier.tier]}
        </h2>

        {showCalendar && (
          <div className="mt-4">
            <CalendarEmbed prominent={results.tier.tier === 1} />
          </div>
        )}

        {!showCalendar && results.tier.tier === 3 && (
          <div className="mt-4">
            <a
              href={CALENDAR_URL.startsWith("PASTE_") ? "#" : CALENDAR_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-xl border border-accent px-5 py-3 text-sm font-semibold text-accent transition hover:bg-accent/10"
            >
              Book a quick call when you're ready
            </a>
          </div>
        )}

        {results.tier.tier >= 3 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => downloadReport(results, answers, contact)}
              className="w-full rounded-xl bg-navy px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Download your assessment
            </button>
          </div>
        )}

        <p className="mt-4 text-sm text-slate-500">{deliveryLine}</p>
      </div>
    </div>
  );
}
