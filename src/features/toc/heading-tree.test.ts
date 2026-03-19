import { describe, expect, it } from "bun:test";
import { flattenHeadingTitles } from "./heading-tree";

describe("flattenHeadingTitles", () => {
  it("preserves heading order across nested children", () => {
    expect(
      flattenHeadingTitles([
        {
          level: 1,
          title: "Overview",
          anchor_id: "overview",
          line_start: 1,
          children: [
            {
              level: 2,
              title: "Details",
              anchor_id: "details",
              line_start: 4,
              children: [],
            },
          ],
        },
        {
          level: 1,
          title: "Appendix",
          anchor_id: "appendix",
          line_start: 10,
          children: [],
        },
      ]),
    ).toEqual(["Overview", "Details", "Appendix"]);
  });
});
