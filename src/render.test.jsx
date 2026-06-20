import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import App, { QUESTIONS } from "./App.jsx";

describe("app render smoke test", () => {
  it("renders the intro screen without crashing", () => {
    const html = renderToString(<App />);
    expect(html).toContain("The 60-Second AI Readiness Check");
    expect(html).toContain("Start the check");
  });

  it("defines exactly 12 questions with the spec's copy", () => {
    expect(QUESTIONS).toHaveLength(12);
    expect(QUESTIONS[0].title).toBe(
      "What would move the needle most for your business right now?"
    );
    expect(QUESTIONS[11].options.map((o) => o.value)).toEqual([
      "call",
      "email",
      "whatsapp",
    ]);
  });

  it("keeps internal tags out of every prospect-facing label", () => {
    for (const q of QUESTIONS) {
      expect(q.title).not.toMatch(/[[\]]/);
      for (const o of q.options ?? []) {
        expect(o.label).not.toMatch(/[[\]:]/);
      }
    }
  });

  it("uses no exclamation marks or emojis in question copy", () => {
    for (const q of QUESTIONS) {
      expect(q.title).not.toContain("!");
      for (const o of q.options ?? []) {
        expect(o.label).not.toContain("!");
        expect(o.label).toMatch(/^[\x20-\x7E$']+$/);
      }
    }
  });
});
