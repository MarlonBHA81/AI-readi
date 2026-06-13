import { describe, expect, it } from "vitest";
import {
  buildNamedBottleneck,
  buildPayload,
  buildTaaftSearchUrl,
  computeResults,
  formatCurrency,
  priorityBandFor,
  recommendTool,
  resolveTier,
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
});
