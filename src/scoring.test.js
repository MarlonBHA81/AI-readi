import { describe, expect, it } from "vitest";
import {
  buildAnonymousPayload,
  buildBookingUrl,
  buildNamedBottleneck,
  buildPayload,
  buildTaaftSearchUrl,
  ceil500,
  computeResults,
  floor500,
  formatCurrency,
  priorityBandFor,
  recommendTool,
  resolveTier,
  roiRangeFor,
  roundToNearest500,
} from "./App.jsx";

// The worked example from the build spec (Q4 = 5-10h, Q6 = $75-150, both
// scores 3, quotes task, hot temperature).
const exampleAnswers = {
  lever: "efficiency",
  domain: "operations",
  task: "quotes",
  taskOther: "",
  freq: 3,
  hoursMid: 7.5,
  who: "owner",
  rate: 112,
  frictionType: "reliability",
  friction: 3,
  tried: "patched",
  magicWand: "I'd finally take weekends off",
  temp: "hot",
  delivery: "call",
};

describe("priority bands", () => {
  it("bands the freq x friction product 1-16", () => {
    expect(priorityBandFor(1)).toBe("Low");
    expect(priorityBandFor(4)).toBe("Low");
    expect(priorityBandFor(5)).toBe("Moderate");
    expect(priorityBandFor(8)).toBe("Moderate");
    expect(priorityBandFor(9)).toBe("High");
    expect(priorityBandFor(12)).toBe("High");
    expect(priorityBandFor(13)).toBe("Critical");
    expect(priorityBandFor(16)).toBe("Critical");
  });
});

describe("ROI anchor", () => {
  it("matches the spec worked example (7.5h x $112 = $840/wk, $42,000/yr)", () => {
    const r = computeResults(exampleAnswers);
    expect(r.weeklyROI).toBe(840);
    expect(r.annualROIRaw).toBe(42000);
    expect(r.annualROI).toBe(42000);
  });

  it("rounds the annual figure to the nearest $500", () => {
    expect(roundToNearest500(19600)).toBe(19500);
    expect(roundToNearest500(2625)).toBe(2500);
    expect(roundToNearest500(105000)).toBe(105000);
  });

  it("formats as whole-dollar US currency", () => {
    expect(formatCurrency(42000)).toBe("$42,000");
  });
});

describe("ROI range", () => {
  it("brackets the point estimate using the bucket edges (worked example)", () => {
    const r = computeResults(exampleAnswers); // hoursMid 7.5, rate 112
    expect(r.annualROILow).toBe(18500); // floor500(5 x 75 x 50 = 18750)
    expect(r.annualROIHigh).toBe(75000); // ceil500(10 x 150 x 50 = 75000)
    expect(r.annualROI).toBe(42000); // point estimate unchanged
    expect(r.annualROILow).toBeLessThanOrEqual(r.annualROI);
    expect(r.annualROIHigh).toBeGreaterThanOrEqual(r.annualROI);
  });

  it("computes range bounds for the smallest and largest buckets", () => {
    expect(roiRangeFor(1, 15)).toEqual({ annualROILow: 500, annualROIHigh: 2500 });
    expect(roiRangeFor(12, 175)).toEqual({ annualROILow: 75000, annualROIHigh: 187500 });
  });

  it("rounds the low bound down and the high bound up to the nearest 500", () => {
    expect(floor500(18750)).toBe(18500);
    expect(ceil500(18750)).toBe(19000);
  });
});

describe("tool recommendation decision tree", () => {
  const rec = (task, domain = "acquisition", who = "junior") =>
    recommendTool({ task, domain, who });

  it("rule 1: quotes, other, or data+operations -> custom Claude skill", () => {
    expect(rec("quotes").payloadLabel).toBe("Custom Claude skill");
    expect(rec("other").payloadLabel).toBe("Custom Claude skill");
    expect(rec("data", "operations").payloadLabel).toBe("Custom Claude skill");
  });

  it("rule 2: nuanced email/support (owner or senior) -> Claude Cowork", () => {
    expect(rec("email", "conversion", "owner").payloadLabel).toBe("Claude Cowork");
    expect(rec("email", "conversion", "senior").payloadLabel).toBe("Claude Cowork");
    expect(rec("support", "retention", "owner").payloadLabel).toBe("Claude Cowork");
    expect(rec("support", "retention", "senior").payloadLabel).toBe("Claude Cowork");
  });

  it("rule 3: everything else -> off-the-shelf category", () => {
    expect(rec("notes").payloadLabel).toBe("Off-the-shelf tool (meeting-notes AI)");
    expect(rec("data", "fulfillment").payloadLabel).toBe(
      "Off-the-shelf tool (automation platform)"
    );
    expect(rec("email", "conversion", "junior").payloadLabel).toBe(
      "Off-the-shelf tool (inbox AI)"
    );
    expect(rec("support", "retention", "nobody").payloadLabel).toBe(
      "Off-the-shelf tool (support chatbot)"
    );
  });

  it("rule 1 outranks rule 2 (quotes by an owner stays custom)", () => {
    expect(rec("quotes", "conversion", "owner").payloadLabel).toBe("Custom Claude skill");
  });
});

describe("readiness tier (top-down, first match wins)", () => {
  it("Tier 1: hot + High/Critical", () => {
    expect(resolveTier("hot", "High").payloadLabel).toBe("Tier 1 Emergency Fix");
    expect(resolveTier("hot", "Critical").payloadLabel).toBe("Tier 1 Emergency Fix");
  });

  it("Tier 2: hot/warm + Moderate and up (warm+Critical is not a starter)", () => {
    expect(resolveTier("hot", "Moderate").payloadLabel).toBe("Tier 2 Clear ROI");
    expect(resolveTier("warm", "Moderate").payloadLabel).toBe("Tier 2 Clear ROI");
    expect(resolveTier("warm", "High").payloadLabel).toBe("Tier 2 Clear ROI");
    expect(resolveTier("warm", "Critical").payloadLabel).toBe("Tier 2 Clear ROI");
  });

  it("Tier 3: cool regardless of band", () => {
    expect(resolveTier("cool", "Low").payloadLabel).toBe("Tier 3 Roadmap");
    expect(resolveTier("cool", "Critical").payloadLabel).toBe("Tier 3 Roadmap");
  });

  it("Tier 4: cold or Low band", () => {
    expect(resolveTier("cold", "Critical").payloadLabel).toBe("Tier 4 Starter");
    expect(resolveTier("cold", "Low").payloadLabel).toBe("Tier 4 Starter");
    expect(resolveTier("hot", "Low").payloadLabel).toBe("Tier 4 Starter");
    expect(resolveTier("warm", "Low").payloadLabel).toBe("Tier 4 Starter");
  });
});

describe("named bottleneck", () => {
  it("combines task, friction type, who, and lever", () => {
    const text = buildNamedBottleneck(exampleAnswers);
    expect(text).toBe(
      "Your quotes and proposals process is a reliability gap where things get " +
        "forgotten or dropped, and it's pulling you, the owner, away from " +
        "higher-value work. Because you told us getting time back matters most " +
        "right now, this is the single highest-leverage thing to fix."
    );
  });

  it("uses the prospect's own words for an 'other' task", () => {
    const text = buildNamedBottleneck({
      ...exampleAnswers,
      task: "other",
      taskOther: "scheduling field crews",
    });
    expect(text).toContain('Your "scheduling field crews" process');
  });

  it("handles the overwhelmed lever with the all-three phrasing", () => {
    const text = buildNamedBottleneck({ ...exampleAnswers, lever: "overwhelmed" });
    expect(text).toContain("revenue, time, and customer experience are all hurting");
  });
});

describe("TAAFT search URL builder", () => {
  it("joins words with + and appends /top-rated/", () => {
    expect(buildTaaftSearchUrl("follow-up emails")).toBe(
      "https://theresanaiforthat.com/s/follow-up+emails/top-rated/"
    );
    expect(buildTaaftSearchUrl("proposal generation")).toBe(
      "https://theresanaiforthat.com/s/proposal+generation/top-rated/"
    );
    expect(buildTaaftSearchUrl("meeting notes")).toBe(
      "https://theresanaiforthat.com/s/meeting+notes/top-rated/"
    );
  });

  it("normalises case and trims whitespace", () => {
    expect(buildTaaftSearchUrl("  Invoice Automation  ")).toBe(
      "https://theresanaiforthat.com/s/invoice+automation/top-rated/"
    );
  });
});

describe("calendar booking prefill URL", () => {
  const base = "https://link.example.com/widget/booking/abc";
  const contact = {
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@acme.com",
    phone: "+1 555 0100",
  };

  it("appends GHL prefill params from the contact", () => {
    const url = buildBookingUrl(base, contact);
    expect(url.startsWith(`${base}?`)).toBe(true);
    expect(url).toContain("first_name=Jane");
    expect(url).toContain("last_name=Doe");
    expect(url).toContain("email=jane%40acme.com");
    expect(url).toContain("phone=");
  });

  it("only includes fields that are present", () => {
    const url = buildBookingUrl(base, { email: "solo@acme.com" });
    expect(url).toBe(`${base}?email=solo%40acme.com`);
  });

  it("returns the base URL unchanged when there is nothing to prefill", () => {
    expect(buildBookingUrl(base, {})).toBe(base);
    expect(buildBookingUrl(base, { firstName: "  " })).toBe(base);
  });

  it("leaves an unconfigured placeholder alone", () => {
    expect(buildBookingUrl("PASTE_YOUR_GHL_CALENDAR_LINK_HERE", contact)).toBe(
      "PASTE_YOUR_GHL_CALENDAR_LINK_HERE"
    );
  });

  it("uses & when the base already has a query string", () => {
    expect(buildBookingUrl(`${base}?ref=ad`, { email: "x@y.com" })).toBe(
      `${base}?ref=ad&email=x%40y.com`
    );
  });
});

describe("GHL payload", () => {
  it("matches the spec example field-for-field", () => {
    const contact = {
      firstName: "Jane",
      lastName: "Doe",
      businessName: "Acme Plumbing",
      email: "jane@acme.com",
      phone: "+1 555 0100",
      industry: "trades",
    };
    const results = computeResults(exampleAnswers);
    const payload = buildPayload(
      exampleAnswers,
      contact,
      results,
      "2026-06-12T12:00:00.000Z"
    );
    expect(payload).toMatchObject({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@acme.com",
      phone: "+1 555 0100",
      businessName: "Acme Plumbing",
      industry: "trades",
      lever: "efficiency",
      domain: "operations",
      primaryTask: "quotes",
      taskOther: "",
      frequencyScore: 3,
      frictionScore: 3,
      priorityScore: 9,
      priorityBand: "High",
      whoDoesIt: "owner",
      weeklyROI: 840,
      annualROI: 42000,
      annualROIFormatted: "$42,000",
      frictionType: "reliability",
      triedBefore: "patched",
      magicWand: "I'd finally take weekends off",
      temperature: "hot",
      readinessTier: "Tier 1 Emergency Fix",
      toolRecommendation: "Custom Claude skill",
      deliveryPreference: "call",
      submittedAt: "2026-06-12T12:00:00.000Z",
    });
    expect(payload.namedBottleneck.length).toBeGreaterThan(40);
  });

  it("flags an opt-in payload and carries the submissionId meta", () => {
    const contact = {
      firstName: "Jane",
      lastName: "Doe",
      businessName: "Acme Plumbing",
      email: "jane@acme.com",
      phone: "+1 555 0100",
      industry: "trades",
    };
    const results = computeResults(exampleAnswers);
    const payload = buildPayload(exampleAnswers, contact, results, "2026-06-12T12:00:00.000Z", {
      submissionId: "sub_123",
    });
    expect(payload.optedIn).toBe(true);
    expect(payload.stage).toBe("report_requested");
    expect(payload.submissionId).toBe("sub_123");
  });
});

describe("anonymous payload (for future data)", () => {
  it("carries the assessment + scores but no contact PII", () => {
    const results = computeResults(exampleAnswers);
    const payload = buildAnonymousPayload(exampleAnswers, results, "2026-06-12T12:00:00.000Z", {
      submissionId: "sub_123",
    });
    // Assessment + scoring data is present.
    expect(payload).toMatchObject({
      domain: "operations",
      primaryTask: "quotes",
      priorityScore: 9,
      priorityBand: "High",
      annualROI: 42000,
      readinessTier: "Tier 1 Emergency Fix",
      optedIn: false,
      stage: "results_viewed",
      submissionId: "sub_123",
    });
    // No personal contact fields leak into the anonymous record.
    expect(payload.firstName).toBeUndefined();
    expect(payload.lastName).toBeUndefined();
    expect(payload.email).toBeUndefined();
    expect(payload.phone).toBeUndefined();
    expect(payload.businessName).toBeUndefined();
  });

  it("links to a later opt-in via the shared submissionId", () => {
    const contact = {
      firstName: "Jane",
      lastName: "Doe",
      businessName: "Acme Plumbing",
      email: "jane@acme.com",
      phone: "+1 555 0100",
      industry: "trades",
    };
    const results = computeResults(exampleAnswers);
    const anon = buildAnonymousPayload(exampleAnswers, results, "t1", { submissionId: "sub_abc" });
    const optIn = buildPayload(exampleAnswers, contact, results, "t2", { submissionId: "sub_abc" });
    expect(anon.submissionId).toBe(optIn.submissionId);
    expect(anon.optedIn).toBe(false);
    expect(optIn.optedIn).toBe(true);
  });
});
