import { UserMessageComponent, type SessionMessageEntry } from "@earendil-works/pi-coding-agent";
import { Box, Container, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, test } from "vitest";
import { collectPrompts } from "../src/prompts.ts";
import { fixture, mouse, Response } from "./fixtures.ts";

describe("sticky header", () => {
  test("at the bottom, shows the newest prompt, not the previous one", () => {
    const { header, scroll } = fixture();
    expect(scroll.isFollowingEnd).toBe(true);
    expect(header.render(80).join("\n")).toContain("newest prompt");
    expect(header.getActivePrompt()?.text).toBe("newest prompt\nsecond line");
  });

  test("follow-end selects the latest prompt before the layout update", () => {
    const { header, doc, latest } = fixture();
    header.render(80);
    const next = new UserMessageComponent("new streamed prompt");
    const nested = new Container();
    nested.addChild(next);
    nested.addChild(new Response(50));
    doc.addChild(nested);
    expect(header.render(80).join("\n")).toContain("new streamed prompt");
    expect(header.getActivePrompt()?.component).not.toBe(latest);
  });

  test("updates nested prompts with no change to direct child count", () => {
    const { header, doc, scroll, update } = fixture();
    const nested = new Container();
    doc.addChild(nested);
    header.render(80);
    const count = doc.children.length;
    nested.addChild(new UserMessageComponent("nested newest prompt"));
    update();
    scroll.scrollToEnd();
    expect(doc.children).toHaveLength(count);
    expect(header.render(80).join("\n")).toContain("nested newest prompt");
  });

  test("measures streamed output again after manual scrolling", () => {
    const { header, response, scroll, update, doc, first } = fixture({ mode: "always" });
    const oldLatest = collectPrompts(doc, 80)[1]!;
    scroll.scrollTo(oldLatest.start, { disableFollow: true });
    header.render(80);
    response.rows += 100;
    update();
    expect(header.render(80).join("\n")).toContain("previous prompt");
    expect(header.getActivePrompt()?.component).toBe(first);
  });

  test("auto mode shows the header at the bottom padding and hides it for a visible prompt", () => {
    const { header, doc, scroll, update } = fixture();
    // Add enough output to scroll to each boundary without a position limit.
    doc.addChild(new Response(80));
    update();
    const prompts = collectPrompts(doc, 80);
    const first = prompts[0]!;
    const latest = prompts[1]!;
    scroll.scrollTo(first.end - 2);
    expect(header.render(80)).toEqual([]);
    scroll.scrollTo(first.end - 1);
    expect(header.render(80).join("\n")).toContain("previous prompt");
    scroll.scrollTo(latest.start);
    expect(header.render(80)).toEqual([]);
    scroll.scrollTo(latest.end - 1);
    expect(header.render(80).join("\n")).toContain("newest prompt");
  });

  test("always mode chooses the first prompt at the beginning, not the last", () => {
    const { header, scroll } = fixture({ mode: "always" });
    scroll.scrollToStart();
    expect(header.render(80).join("\n")).toContain("previous prompt");
  });

  test("uses content width after subtracting a permanent scrollbar", () => {
    const { header, scroll, doc, update } = fixture({ mode: "always" }, true);
    doc.children.splice(0, 1, new UserMessageComponent("中文".repeat(30)));
    doc.addChild(new Response(80));
    update(12);
    const prompts = collectPrompts(doc, 11);
    scroll.scrollTo(prompts[1]!.start, { disableFollow: true });
    header.render(12);
    expect(header.getActivePrompt()?.index).toBe(1);
    expect(header.render(12).every((line) => visibleWidth(line) <= 12)).toBe(true);
  });

  test("navigation leaves follow-end; next on the latest returns to follow-end", () => {
    const { header, scroll } = fixture();
    header.render(80);
    header.navigate("prev");
    expect(scroll.isFollowingEnd).toBe(false);
    expect(header.render(80).join("\n")).toContain("previous prompt");
    header.navigate("next");
    expect(scroll.isFollowingEnd).toBe(false);
    // Keep the selected prompt when the scroll request reaches a position limit.
    expect(header.render(80).join("\n")).toContain("newest prompt");
    header.navigate("next");
    expect(scroll.isFollowingEnd).toBe(true);
  });

  test("stores expansion state per message and clears it on session changes", () => {
    const { header, doc, scroll, update } = fixture();
    expect(header.render(80).join("\n")).not.toContain("\n second line");
    header.toggleExpanded();
    expect(header.render(80).join("\n")).toContain("\n second line");
    header.toggleExpanded();
    expect(header.render(80).join("\n")).not.toContain("\n second line");
    header.toggleExpanded();
    doc.children.splice(2, 1, new UserMessageComponent("newest prompt\nsecond line"));
    update();
    scroll.scrollToEnd();
    expect(header.render(80).join("\n")).not.toContain("\n second line");
    header.toggleExpanded();
    header.reset();
    expect(header.getActivePrompt()).toBeUndefined();
    expect(header.render(80).join("\n")).not.toContain("\n second line");
  });

  test("shows no header when disabled or when the transcript is empty or has zero width", () => {
    const { header, doc } = fixture();
    header.render(80);
    header.config.enabled = false;
    expect(header.render(80)).toEqual([]);
    expect(header.getActivePrompt()).toBeUndefined();
    header.toggleExpanded();
    header.navigate("prev");
    header.config.enabled = true;
    expect(header.render(0)).toEqual([]);
    doc.clear();
    expect(header.render(80)).toEqual([]);
  });

  test("only content-row arrow clicks navigate; padding clicks expand once", () => {
    const { header, scroll } = fixture();
    header.render(80);
    expect(header.handleMouse(mouse(76, 1, "press"))).toEqual({ handled: true, render: false });
    expect(header.render(80).join("\n")).not.toContain("\n second line");
    expect(header.handleMouse({ ...mouse(76), button: "right" })).toBeUndefined();
    expect(header.handleMouse(mouse(76, 0))).toEqual({ handled: true });
    expect(header.render(80).join("\n")).toContain("\n second line");
    expect(header.handleMouse(mouse(76))).toEqual({ handled: true });
    expect(scroll.isFollowingEnd).toBe(false);
    expect(header.render(80).join("\n")).toContain("previous prompt");
  });

  test("reads message times from the active branch", () => {
    const { header, setBranch } = fixture({ showTimestamp: true });
    const entry = (id: string, timestamp: number): SessionMessageEntry => ({
      type: "message",
      id,
      parentId: null,
      timestamp: new Date(timestamp).toISOString(),
      message: { role: "user", content: [{ type: "text", text: id }], timestamp },
    });
    const time = new Date(2025, 0, 1, 13, 2).getTime();
    setBranch([entry("first", time - 3600000), entry("latest", time)]);
    expect(header.render(80).join("\n")).toContain("1:02 PM");
    // Compaction can keep older branch entries without a message in the display.
    setBranch([
      entry("compacted-away", time - 7200000),
      entry("first", time - 3600000),
      entry("latest", time),
    ]);
    expect(header.render(80).join("\n")).toContain("1:02 PM");
  });
});

test("measurement includes decorated response heights and repeated prompt identities", () => {
  const { doc, first } = fixture();
  const decorated = new Box(2, 3);
  decorated.addChild(new Response(40));
  doc.children.splice(1, 1, decorated);
  const repeated = new UserMessageComponent("previous prompt");
  const before = doc.render(80).length;
  doc.addChild(repeated);
  const prompts = collectPrompts(doc, 80);
  expect(prompts[0]?.component).toBe(first);
  expect(prompts[1]?.start).toBe(first.render(80).length + decorated.render(80).length);
  expect(prompts[2]?.component).toBe(repeated);
  expect(prompts[2]?.start).toBe(before);
});
