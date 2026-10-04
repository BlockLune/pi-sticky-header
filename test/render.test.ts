import { sliceByColumn, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, test } from "vitest";
import { formatTime, plainText, renderHeader } from "../src/render.ts";
import { plainTheme } from "./fixtures.ts";
import { getThemeByName } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { backgroundAt } from "./ansi.ts";

const options = {
  text: "中文 👩‍💻 e\u0301 long text",
  time: "12:34 PM",
  navigation: true,
  previous: true,
  next: false,
  expanded: false,
};

describe("header rendering", () => {
  test("fits each row within the terminal width for CJK text, emoji, and combining marks", () => {
    for (let width = 0; width <= 120; width++) {
      for (const expanded of [false, true]) {
        const { lines } = renderHeader(width, plainTheme, {
          ...options,
          expanded,
          text: options.text + "\n" + "🙂".repeat(80),
        });
        expect(
          lines.every((line) => visibleWidth(line) <= width),
          `width=${width}`,
        ).toBe(true);
      }
    }
  });

  test("keeps two columns between truncated text and the time or arrows", () => {
    for (const [time, navigation] of [
      ["12:34 PM", true],
      ["12:34 PM", false],
      ["", true],
    ] as const) {
      const layout = renderHeader(40, plainTheme, {
        ...options,
        time,
        navigation,
        text: "x".repeat(80),
      });
      expect(layout.lines[1]).toContain(`…  ${time || "↑"}`);
      expect(visibleWidth(layout.lines[1]!)).toBe(40);
      expect(layout.previousColumn).toBe(navigation ? 36 : undefined);
      const arrow =
        layout.previousColumn === undefined
          ? undefined
          : sliceByColumn(layout.lines[1]!, layout.previousColumn, 1);
      expect(arrow).toBe(navigation ? "↑" : undefined);
    }
  });

  test("ellipsis keeps the native message background with real light and dark themes", () => {
    for (const name of ["light", "dark"]) {
      const theme = getThemeByName(name)!;
      const { lines } = renderHeader(40, theme, {
        ...options,
        text: "中文 long prompt ".repeat(30),
      });
      const content = lines[1]!;
      const ellipsis = content.indexOf("…");
      expect(ellipsis).toBeGreaterThan(0);
      const background = backgroundAt(
        theme.style("x", { bg: "userMessageBg" }),
        theme.style("x", { bg: "userMessageBg" }).indexOf("x"),
      );
      expect(background).toBeDefined();
      expect(backgroundAt(content, ellipsis)).toBe(background);
      expect(content.slice(ellipsis + 1, ellipsis + 3)).toBe("  ");
      expect(backgroundAt(content, ellipsis + 2)).toBe(background);
    }
  });

  test("limits expanded rows and fits the remaining-line count within the width", () => {
    const text = Array<string>(20).fill("line").join("\n");
    const { lines } = renderHeader(24, plainTheme, { ...options, text, expanded: true });
    expect(lines).toHaveLength(12);
    expect(lines.join("\n")).toContain("12 more lines");
    expect(
      renderHeader(2, plainTheme, { ...options, text, expanded: true }).lines.every(
        (line) => visibleWidth(line) <= 2,
      ),
    ).toBe(true);
  });

  test("hides the time before the arrows and uses the correct click positions", () => {
    const full = renderHeader(40, plainTheme, options);
    expect(full.lines[1]).toContain("12:34 PM");
    expect(sliceByColumn(full.lines[1]!, full.previousColumn!, 1)).toBe("↑");
    expect(sliceByColumn(full.lines[1]!, full.nextColumn!, 1)).toBe("↓");
    const narrow = renderHeader(10, plainTheme, options);
    expect(narrow.lines[1]).not.toContain("PM");
    expect(narrow.previousColumn).toBe(6);
    expect(renderHeader(5, plainTheme, options).previousColumn).toBeUndefined();
    expect(
      renderHeader(40, plainTheme, { ...options, navigation: false }).previousColumn,
    ).toBeUndefined();
  });

  test("removes terminal escape sequences and control characters", () => {
    expect(plainText("\x1b[31mred\x1b[0m\x1b]0;title\x07\x00\b\t\nnext")).toBe("red\t\nnext");
    const { lines } = renderHeader(40, plainTheme, { ...options, text: "\x1b[2Jdanger" });
    expect(lines.join("\n")).not.toContain("\x1b");
    expect(lines.join("\n")).toContain("danger");
    const expanded = renderHeader(8, plainTheme, { ...options, text: "a\tb", expanded: true });
    expect(expanded.lines.join("\n")).not.toContain("\t");
    expect(expanded.lines.every((line) => visibleWidth(line) <= 8)).toBe(true);
  });

  test("uses one collapsed text row and keeps line breaks when expanded", () => {
    const text = " first\r\n second\rthird ";
    expect(renderHeader(40, plainTheme, { ...options, text }).lines[1]).toContain(
      "first second third",
    );
    expect(renderHeader(40, plainTheme, { ...options, text, expanded: true }).lines).toHaveLength(
      6,
    );
  });

  test("time formatting accepts epoch zero, invalid and missing timestamps", () => {
    expect(formatTime(undefined)).toBe("");
    expect(formatTime("bad")).toBe("");
    expect(formatTime(Number.NaN)).toBe("");
    expect(formatTime(0)).not.toBe("");
    expect(formatTime(new Date(2025, 0, 1, 0, 5).getTime())).toBe("12:05 AM");
    expect(formatTime(new Date(2025, 0, 1, 12, 30).toISOString())).toBe("12:30 PM");
  });
});
