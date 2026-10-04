import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

// Remove terminal escape sequences and cursor controls from prompt text.
export function plainText(text: string): string {
  // oxlint-disable-next-line no-control-regex -- remove control characters from untrusted text.
  const controls = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
  return stripTerminalSequences(text.replace(/\r\n?/g, "\n")).replace(controls, "");
}

export function formatTime(timestamp: number | string | undefined): string {
  if (timestamp === undefined) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const hours = date.getHours();
  return `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

export interface HeaderLayout {
  lines: string[];
  previousColumn?: number;
  nextColumn?: number;
}

interface RenderOptions {
  text: string;
  time: string;
  navigation: boolean;
  previous: boolean;
  next: boolean;
  expanded: boolean;
}

export function renderHeader(
  width: number,
  theme: Pick<Theme, "style">,
  options: RenderOptions,
): HeaderLayout {
  width = Math.max(0, Math.floor(width));
  if (width === 0) return { lines: [] };
  const style = (text: string, dim = false) =>
    theme.style(text, { fg: dim ? "dim" : "userMessageText", bg: "userMessageBg" });
  const pad = style(" ".repeat(width));
  const nav = options.navigation && width >= 6 ? "↑ ↓ " : "";
  // Hide the time first on narrow terminals. Keep room for text and arrows.
  const time =
    options.time && width >= visibleWidth(options.time) + visibleWidth(nav) + 6
      ? options.time + (nav ? "  " : " ")
      : "";
  const right = time + nav;
  // Keep two blank columns before the time and navigation arrows.
  // Reduce this gap on narrow screens to keep one column for text.
  const metadataGap = right ? Math.min(2, Math.max(0, width - visibleWidth(right) - 2)) : 0;
  const navStart = width - visibleWidth(nav);
  const result: HeaderLayout = { lines: [pad] };
  if (nav) {
    result.previousColumn = navStart;
    result.nextColumn = navStart + 2;
  }
  const raw = plainText(options.text).replace(/\t/g, "    ");
  // Wrap long paragraphs when expanded, including text with no line breaks.
  const textWidth = Math.max(1, width - 1 - visibleWidth(right) - metadataGap);
  const rows = options.expanded
    ? raw.split("\n").flatMap((line) => wrapTextWithAnsi(line, textWidth))
    : [raw.replace(/\s+/g, " ").trim()];
  const clipped = rows.slice(0, 8);
  if (rows.length > clipped.length) clipped.push(`… (${rows.length - clipped.length} more lines)`);

  for (const [index, row] of clipped.entries()) {
    const suffix = index === 0 ? right : "";
    const leftPad = width > visibleWidth(suffix) ? " " : "";
    const reservedGap = index === 0 ? metadataGap : 0;
    // Pi's text truncation function adds SGR resets.
    // Remove these resets before you apply the theme.
    // A reset before the ellipsis would remove its background color.
    const text = stripTerminalSequences(
      truncateToWidth(
        row,
        Math.max(0, width - leftPad.length - visibleWidth(suffix) - reservedGap),
        "…",
      ),
    );
    const gap = " ".repeat(
      Math.max(0, width - leftPad.length - visibleWidth(text) - visibleWidth(suffix)),
    );
    let rightStyled = style(time, true);
    if (nav)
      rightStyled +=
        style("↑", !options.previous) + style(" ") + style("↓", !options.next) + style(" ");
    result.lines.push(style(leftPad + text + gap) + (index === 0 ? rightStyled : ""));
  }
  result.lines.push(pad, "");
  return result;
}
