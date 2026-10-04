import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { VStack } from "@earendil-works/pi-tui";
import { getFullscreenHost } from "./src/fullscreen.ts";
import { StickyHeader, type StickyConfig } from "./src/header.ts";

const usage = "/sticky [toggle | prev | next | expand | nav | time | auto | always | status]";

export default function stickyHeaderExtension(pi: ExtensionAPI): void {
  const config: StickyConfig = {
    enabled: true,
    showTimestamp: true,
    showNavigation: true,
    mode: "auto",
  };
  let header: StickyHeader | undefined;
  let dispose: (() => void) | undefined;
  let requestRender = (): void => {};

  pi.on("session_start", async (_event, ctx) => {
    dispose?.();
    dispose = undefined;
    header = undefined;
    if (ctx.mode !== "tui") return;
    await ctx.ui.custom<void>(
      (tui, _theme, keybindings, done) => {
        const host = getFullscreenHost(tui);
        if (host) {
          const { layout, scroll } = host;
          const original = layout.layoutRoot;
          requestRender = () => tui.requestRender();
          header = new StickyHeader(
            {
              scroll,
              theme: () => ctx.ui.theme,
              requestRender,
              branch: () => ctx.sessionManager.getBranch(),
            },
            config,
          );
          const root = new VStack([
            { component: header, basis: "auto", grow: 0, shrink: 0 },
            { component: original, basis: 0, grow: 1, shrink: 1, minSize: 1 },
          ]);
          layout.setLayoutRoot(root);
          const unsubscribe = ctx.ui.onTerminalInput((data) => {
            if (
              config.enabled &&
              header?.getActivePrompt() &&
              keybindings.matches(data, "app.tools.expand")
            ) {
              header.toggleExpanded();
              return { consume: true };
            }
            return undefined;
          });
          dispose = () => {
            unsubscribe();
            // Do not replace a layout that another extension installed later.
            if (layout.layoutRoot === root) layout.setLayoutRoot(original);
            header?.dispose();
            header = undefined;
            requestRender = () => {};
          };
        }
        done();
        return { render: () => [], invalidate() {} };
      },
      { overlay: true },
    );
  });

  const refresh = (): void => requestRender();
  const reset = (): void => {
    header?.reset();
    refresh();
  };
  pi.on("message_start", refresh);
  pi.on("message_update", refresh);
  pi.on("message_end", refresh);
  pi.on("agent_end", refresh);
  pi.on("session_tree", reset);
  pi.on("session_compact", reset);
  pi.on("session_shutdown", () => {
    dispose?.();
    dispose = undefined;
  });

  pi.registerCommand("sticky", {
    description: `Control the sticky header: ${usage}`,
    handler: async (args, ctx) => {
      if (!header) {
        ctx.ui.notify("Sticky header requires Pi's fullscreen TUI.", "info");
        return;
      }
      const command = args.trim().toLowerCase();
      switch (command) {
        case "":
        case "toggle":
          config.enabled = !config.enabled;
          ctx.ui.notify(`Sticky header ${config.enabled ? "enabled" : "disabled"}`, "info");
          break;
        case "prev":
        case "up":
          header.navigate("prev");
          break;
        case "next":
        case "down":
          header.navigate("next");
          break;
        case "expand":
        case "open":
          header.toggleExpanded();
          break;
        case "nav":
        case "buttons":
          config.showNavigation = !config.showNavigation;
          break;
        case "time":
        case "timestamp":
          config.showTimestamp = !config.showTimestamp;
          break;
        case "auto":
        case "always":
          config.mode = command;
          break;
        case "status":
          ctx.ui.notify(
            `Sticky: ${config.enabled ? "on" : "off"} | ${config.mode} | nav: ${config.showNavigation} | time: ${config.showTimestamp} | active: ${header.getActivePrompt()?.index ?? "none"}`,
            "info",
          );
          break;
        default:
          ctx.ui.notify(`Usage: ${usage}`, "info");
      }
      requestRender();
    },
  });
}
