import { describe, expect, it } from "vitest";

import {
  TEMPLATE_FORMATS,
  templateEyebrow,
  templateFormatLabel,
  templateVenueLabel,
} from "./template-formats-i18n";

describe("template formats", () => {
  it("lists every built-in publisher format", () => {
    expect(TEMPLATE_FORMATS.map((item) => item.value)).toEqual(["ieee", "springer", "elsevier"]);
  });

  it("labels known formats and upper-cases unknown ones", () => {
    expect(templateFormatLabel("springer")).toBe("Springer");
    expect(templateFormatLabel("ACM")).toBe("ACM");
    expect(templateFormatLabel("apa")).toBe("APA");
  });

  it("localizes venues and keeps unknown venues as-is", () => {
    expect(templateVenueLabel("conference", "en")).toBe("Conference");
    expect(templateVenueLabel("journal", "vi")).toBe("Tạp chí");
    expect(templateVenueLabel("Workshop", "vi")).toBe("Workshop");
  });

  it("builds the card eyebrow from format and venue", () => {
    expect(templateEyebrow({ format: "acm", venue: "conference", author: "ACM" }, "en")).toBe(
      "ACM · Conference",
    );
    expect(templateEyebrow({ format: "elsevier", venue: "journal" }, "vi")).toBe(
      "Elsevier · Tạp chí",
    );
    expect(templateEyebrow({ format: "", venue: "", author: "Edico" }, "en")).toBe("Edico");
  });
});
