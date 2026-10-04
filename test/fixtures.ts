import {
  initTheme,
  UserMessageComponent,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Container, ScrollView, type Component, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { StickyHeader, type StickyConfig } from "../src/header.ts";

initTheme("dark", false);
export const plainTheme = { style: (text: string) => text };

export class Response implements Component {
  constructor(public rows: number) {}
  render(): string[] {
    return Array<string>(this.rows).fill("response");
  }
  invalidate(): void {}
}

export function fixture(options: Partial<StickyConfig> = {}, scrollbar = false) {
  const doc = new Container();
  const first = new UserMessageComponent("previous prompt");
  const response = new Response(40);
  const latest = new UserMessageComponent("newest prompt\nsecond line");
  doc.addChild(first);
  doc.addChild(response);
  doc.addChild(latest);
  doc.addChild(new Response(5));
  const scroll = new ScrollView(doc, {
    follow: "end",
    primary: true,
    scrollbar: scrollbar ? "always" : "hidden",
  });
  const config: StickyConfig = {
    enabled: true,
    showTimestamp: false,
    showNavigation: true,
    mode: "auto",
    ...options,
  };
  let branch: SessionEntry[] = [];
  const header = new StickyHeader(
    {
      scroll,
      theme: () => plainTheme,
      requestRender: () => {},
      branch: () => branch,
    },
    config,
  );
  const update = (width = 80, height = 20) =>
    scroll.updateLayout(doc.render(scroll.getContentWidth(width)).length, height, () => {});
  update();
  return {
    header,
    doc,
    scroll,
    config,
    first,
    latest,
    response,
    update,
    setBranch: (entries: SessionEntry[]) => {
      branch = entries;
    },
  };
}

export function mouse(x: number, y = 1, type: TuiMouseEvent["type"] = "click"): TuiMouseEvent {
  return {
    type,
    button: "left",
    x,
    y,
    screenX: x,
    screenY: y,
    width: 80,
    height: 4,
    shift: false,
    alt: false,
    ctrl: false,
  };
}
