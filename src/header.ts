import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type {
  Component,
  ScrollView,
  TuiMouseEvent,
  TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { collectPrompts, selectPrompt, type Prompt, type StickyMode } from "./prompts.ts";
import { formatTime, renderHeader, type HeaderLayout } from "./render.ts";

export interface StickyConfig {
  enabled: boolean;
  showTimestamp: boolean;
  showNavigation: boolean;
  mode: StickyMode;
}

interface HeaderHost {
  scroll: ScrollView;
  theme: () => Pick<Theme, "style">;
  requestRender: () => void;
  branch: ExtensionContext["sessionManager"]["getBranch"];
}

export class StickyHeader implements Component {
  private prompts: Prompt[] = [];
  private active: Prompt | undefined;
  private navigated: { component: Component; scrollTop: number } | undefined;
  private expanded = new Set<Component>();
  private layout: HeaderLayout = { lines: [] };
  private disposed = false;

  constructor(
    private host: HeaderHost,
    readonly config: StickyConfig,
  ) {}

  // Measure positions on each frame. Do not store colors between frames.
  invalidate(): void {}
  reset(): void {
    this.prompts = [];
    this.active = undefined;
    this.navigated = undefined;
    this.expanded.clear();
    this.layout = { lines: [] };
  }

  dispose(): void {
    this.disposed = true;
    this.reset();
  }

  getActivePrompt(): Prompt | undefined {
    return this.active;
  }

  toggleExpanded(): void {
    if (!this.active) return;
    const key = this.active.component;
    if (this.expanded.has(key)) this.expanded.delete(key);
    else this.expanded.add(key);
    this.host.requestRender();
  }

  navigate(direction: "prev" | "next"): void {
    if (!this.active) return;
    const target = this.prompts[this.active.index + (direction === "prev" ? -1 : 1)];
    if (target) {
      this.host.scroll.scrollTo(Math.max(0, target.end - 1), { disableFollow: true });
      // A short final turn might not reach the viewport top.
      // Keep the selected prompt until the user scrolls again.
      this.navigated = { component: target.component, scrollTop: this.host.scroll.scrollTop };
    } else if (direction === "next") {
      this.navigated = undefined;
      this.host.scroll.scrollToEnd();
    }
    this.host.requestRender();
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (!this.active || event.y < 0 || event.y >= this.layout.lines.length - 1) return undefined;
    // Handle the press so Pi sends a component click instead of a text selection.
    // Change expansion state only on click, not on press and release.
    if (event.type === "press" && event.button === "left") return { handled: true, render: false };
    // Some terminals send SGR code 3 for a release with no button number.
    // Pi reports this as a click after the left-button press.
    if (event.type !== "click" || (event.button !== "left" && event.button !== "none"))
      return undefined;
    // The arrows are on the first text row, not on the padding rows.
    const { previousColumn: prev, nextColumn: next } = this.layout;
    if (
      event.y === 1 &&
      prev !== undefined &&
      next !== undefined &&
      event.x >= prev &&
      event.x < next + 2
    ) {
      this.navigate(event.x < next ? "prev" : "next");
    } else this.toggleExpanded();
    return { handled: true };
  }

  render(width: number): string[] {
    this.active = undefined;
    this.layout = { lines: [] };
    if (this.disposed || !this.config.enabled || width <= 0) return [];
    const { scroll } = this.host;
    // Read the document from ScrollView's public children array.
    const doc = scroll.children[0];
    if (!doc) return [];
    this.prompts = collectPrompts(doc, scroll.getContentWidth(width));
    // Remove state for messages that a branch change or compaction removed.
    const mounted = new Set<Component>(this.prompts.map((prompt) => prompt.component));
    for (const key of this.expanded) if (!mounted.has(key)) this.expanded.delete(key);
    if (
      this.navigated &&
      (scroll.isFollowingEnd ||
        scroll.scrollTop !== this.navigated.scrollTop ||
        !mounted.has(this.navigated.component))
    )
      this.navigated = undefined;
    this.active = this.navigated
      ? this.prompts.find((prompt) => prompt.component === this.navigated?.component)
      : selectPrompt(this.prompts, scroll.scrollTop, scroll.isFollowingEnd, this.config.mode);
    if (!this.active) return [];

    const users = this.config.showTimestamp
      ? this.host
          .branch()
          .filter((entry) => entry.type === "message" && entry.message.role === "user")
      : [];
    // Compaction can remove older prompts from the display.
    // Their entries remain on the active branch.
    const branchOffset = Math.max(0, users.length - this.prompts.length);
    const entry = users[branchOffset + this.active.index];
    const timestamp = entry?.type === "message" ? entry.message.timestamp : undefined;
    this.layout = renderHeader(width, this.host.theme(), {
      text: this.active.text,
      time: formatTime(timestamp),
      navigation: this.config.showNavigation,
      previous: this.active.index > 0,
      next: this.active.index < this.prompts.length - 1,
      expanded: this.expanded.has(this.active.component),
    });
    return this.layout.lines;
  }
}
