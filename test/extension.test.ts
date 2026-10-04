import { UserMessageComponent } from "@earendil-works/pi-coding-agent";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
  ExtensionUIContext,
  TerminalInputHandler,
} from "@earendil-works/pi-coding-agent";
import {
  TuiAltScreen,
  TuiMainScreen,
  VStack,
  type Component,
  type Terminal,
  type TUI,
} from "@earendil-works/pi-tui";
import { describe, expect, test, vi } from "vitest";
// Use Pi's real layout engine with a fixed terminal height.
import { renderLayoutFrame } from "../node_modules/@earendil-works/pi-tui/dist/layout.js";
import extension from "../sticky-header.ts";
import { getFullscreenHost } from "../src/fullscreen.ts";
import { fixture, plainTheme, Response } from "./fixtures.ts";

function terminal(): Terminal {
  return {
    columns: 80,
    rows: 30,
    kittyProtocolActive: false,
    start() {},
    stop() {},
    async drainInput() {},
    write() {},
    moveBy() {},
    hideCursor() {},
    showCursor() {},
    clearLine() {},
    clearFromCursor() {},
    clearScreen() {},
    setTitle() {},
    setProgress() {},
  };
}

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
type Command = Parameters<ExtensionAPI["registerCommand"]>[1];

function harness(mode: ExtensionContext["mode"] = "tui", regular = false) {
  const { scroll, doc } = fixture();
  const tui: TUI = regular ? new TuiMainScreen(terminal()) : new TuiAltScreen(terminal());
  const requestRender = vi.spyOn(tui, "requestRender").mockImplementation(() => {});
  const original = new VStack([
    { component: scroll, basis: 0, grow: 1, minSize: 1 },
    { component: new Response(3), basis: "auto", grow: 0 },
  ]);
  if (tui instanceof TuiAltScreen) tui.setLayoutRoot(original);
  const handlers = new Map<string, Handler>();
  const commands = new Map<string, Command>();
  const listeners = new Set<TerminalInputHandler>();
  const notify = vi.fn<(message: string, level?: string) => void>();
  const ctx = {
    mode,
    hasUI: mode === "tui",
    sessionManager: { getBranch: () => [] },
    ui: {
      theme: plainTheme,
      notify,
      onTerminalInput: (handler: TerminalInputHandler) => {
        listeners.add(handler);
        return () => {
          listeners.delete(handler);
        };
      },
      custom: async (factory: Parameters<ExtensionUIContext["custom"]>[0]) => {
        let completed = false;
        factory(
          tui,
          plainTheme as unknown as ExtensionUIContext["theme"],
          {
            matches: (data: string, action: string) =>
              data === "configured-expand" && action === "app.tools.expand",
          } as Parameters<typeof factory>[2],
          () => {
            completed = true;
          },
        );
        expect(completed).toBe(true);
      },
    },
  } as unknown as ExtensionContext;
  extension({
    on: (name: string, handler: Handler) => {
      handlers.set(name, handler);
      return () => {};
    },
    registerCommand: (name: string, command: Command) => {
      commands.set(name, command);
    },
  } as unknown as ExtensionAPI);
  const emit = async (name: string) => {
    await handlers.get(name)?.({}, ctx);
  };
  const command = async (text: string) => {
    await commands.get("sticky")?.handler(text, ctx as ExtensionCommandContext);
  };
  const root = (): Component => getFullscreenHost(tui)?.layout.layoutRoot ?? original;
  const frame = (width = 80, height = 30) => {
    const rendered = renderLayoutFrame(root(), width, height, () => {});
    Reflect.set(tui, "currentLayout", rendered);
    Reflect.set(tui, "previousScreen", rendered.lines);
    return rendered;
  };
  const input = (data: string) => [...listeners][0]?.(data);
  const terminalInput = (data: string) => {
    const handler = Reflect.get(tui, "handleViewportInput") as (data: string) => unknown;
    return handler.call(tui, data);
  };
  return {
    tui,
    original,
    doc,
    scroll,
    notify,
    requestRender,
    listeners,
    emit,
    command,
    frame,
    root,
    input,
    terminalInput,
  };
}

describe("extension lifecycle with native layout", () => {
  test("sets up one header and cleans it up after repeated session starts", async () => {
    const h = harness();
    await h.emit("session_start");
    expect(h.root()).not.toBe(h.original);
    expect(h.listeners.size).toBe(1);
    const frame = h.frame();
    expect(frame.lines.slice(0, 4).join("\n")).toContain("newest prompt");
    expect(frame.primaryScrollView).toBe(h.scroll);
    expect(h.scroll.viewportHeight).toBe(23); // 30 - header 4 - editor 3
    await h.emit("session_start");
    expect(h.listeners.size).toBe(1);
    expect(h.frame().lines.slice(0, 4).join("\n")).toContain("newest prompt");
    expect(h.scroll.viewportHeight).toBe(23);
    await h.emit("session_shutdown");
    expect(h.root()).toBe(h.original);
    expect(h.listeners.size).toBe(0);
    await h.emit("session_shutdown");
    expect(h.root()).toBe(h.original);
  });

  test.each([0, 3])(
    "SGR mouse release button=%i expands the header exactly once",
    async (releaseButton) => {
      const h = harness();
      await h.emit("session_start");
      h.frame();
      h.terminalInput("\x1b[<0;3;2M");
      expect(h.frame().lines[2]).not.toContain("second line");
      h.terminalInput(`\x1b[<${releaseButton};3;2m`);
      expect(h.frame().lines[2]).toContain("second line");
      // The second click collapses the prompt. Release must not change it again.
      h.terminalInput("\x1b[<0;3;2M");
      h.terminalInput(`\x1b[<${releaseButton};3;2m`);
      expect(h.frame().lines[2]).not.toContain("second line");
      await h.emit("session_shutdown");
    },
  );

  test("mouse drags and right-button clicks do not expand the header", async () => {
    const h = harness();
    await h.emit("session_start");
    h.frame();
    h.terminalInput("\x1b[<0;3;2M");
    h.terminalInput("\x1b[<32;4;2M");
    h.terminalInput("\x1b[<0;4;2m");
    expect(h.frame().lines[2]).not.toContain("second line");
    h.terminalInput("\x1b[<2;3;2M");
    h.terminalInput("\x1b[<2;3;2m");
    expect(h.frame().lines[2]).not.toContain("second line");
    await h.emit("session_shutdown");
  });

  test("a single long prompt line expands into wrapped visual rows on a real mouse click", async () => {
    const h = harness();
    h.doc.children.splice(
      2,
      1,
      new UserMessageComponent("long prompt ".repeat(12) + "VISIBLE-END"),
    );
    await h.emit("session_start");
    expect(h.frame().lines[1]).not.toContain("VISIBLE-END");
    h.terminalInput("\x1b[<0;3;2M");
    h.terminalInput("\x1b[<0;3;2m");
    const expanded = h.frame();
    expect(expanded.lines.slice(0, 7).join("\n")).toContain("VISIBLE-END");
    expect(h.scroll.viewportHeight).toBeLessThan(23);
    await h.emit("session_shutdown");
  });

  test("uses the configured shortcut only when the header is enabled", async () => {
    const h = harness();
    await h.emit("session_start");
    h.frame();
    expect(h.input("unrelated")).toBeUndefined();
    expect(h.input("configured-expand")).toEqual({ consume: true });
    expect(h.frame().lines[2]).toContain("second line");
    await h.command("toggle");
    expect(h.input("configured-expand")).toBeUndefined();
    expect(h.frame().lines.slice(0, 4).join("\n")).not.toContain("newest prompt");
    await h.command("");
    h.frame();
    await h.command("expand");
    expect(h.frame().lines.slice(0, 4).join("\n")).not.toContain("\n second line");
  });

  test("commands and session events update rendering and clear expansion", async () => {
    const h = harness();
    await h.emit("session_start");
    h.frame();
    await h.command("open");
    expect(h.frame().lines[2]).toContain("second line");
    await h.emit("session_tree");
    expect(h.frame().lines[2]).not.toContain("second line");
    for (const event of [
      "message_start",
      "message_update",
      "message_end",
      "agent_end",
      "session_compact",
    ]) {
      h.requestRender.mockClear();
      await h.emit(event);
      expect(h.requestRender).toHaveBeenCalled();
    }
    await h.command("buttons");
    expect(h.frame().lines[1]).not.toContain("↑");
    await h.command("nav");
    expect(h.frame().lines[1]).toContain("↑");
    for (const command of ["time", "timestamp", "always", "auto", "status", "unknown"])
      await h.command(command);
    expect(h.notify).toHaveBeenCalledWith(expect.stringContaining("Usage:"), "info");
    await h.command("prev");
    expect(h.frame().lines[1]).toContain("previous prompt");
    await h.command("down");
    expect(h.frame().lines[1]).toContain("newest prompt");
    await h.command("next");
    expect(h.scroll.isFollowingEnd).toBe(true);
    await h.command("up");
    expect(h.frame().lines[1]).toContain("previous prompt");
    await h.emit("session_shutdown");
  });

  test("keeps another extension's layout during cleanup", async () => {
    const h = harness();
    await h.emit("session_start");
    const replacement = new VStack([{ component: h.root(), basis: 0, grow: 1, minSize: 1 }]);
    if (h.tui instanceof TuiAltScreen) h.tui.setLayoutRoot(replacement);
    await h.emit("session_shutdown");
    expect(Reflect.get(h.tui, "layoutRoot")).toBe(replacement);
    expect(h.listeners.size).toBe(0);
    h.frame();
    expect(h.scroll.viewportHeight).toBe(27); // the retained header shows no output
  });

  test("does not set up a header in print, JSON, RPC, or regular TUI mode", async () => {
    for (const mode of ["print", "json", "rpc"] as const) {
      const h = harness(mode);
      await h.emit("session_start");
      expect(h.root()).toBe(h.original);
      expect(h.listeners.size).toBe(0);
      await h.command("status");
      expect(h.notify).toHaveBeenCalledWith(expect.stringContaining("fullscreen"), "info");
    }
    const regular = harness("tui", true);
    await regular.emit("session_start");
    expect(regular.listeners.size).toBe(0);
    await regular.command("status");
    expect(regular.notify).toHaveBeenCalled();
  });

  test("keeps a stable layout after a resize or manual scrolling", async () => {
    const h = harness();
    await h.emit("session_start");
    for (const [width, height] of [
      [80, 30],
      [14, 25],
      [80, 35],
    ] as const) {
      const frame = h.frame(width, height);
      expect(frame.lines).toHaveLength(height);
      expect(frame.lines.join("\n")).toContain(width === 14 ? "newest" : "newest prompt");
      expect(h.frame(width, height).lines).toEqual(frame.lines);
    }
    h.scroll.scrollToStart();
    h.frame();
    expect(h.frame().lines[1]).toContain("previous prompt"); // the native prompt, not the header
    expect(h.scroll.viewportHeight).toBe(27);
    await h.emit("session_shutdown");
  });
});
