import { Container, ScrollView, type Component, type TUI } from "@earendil-works/pi-tui";

// Pi has no public API for a fixed region above the transcript.
// Keep private layoutRoot access here. Find the transcript through public children.
interface LayoutHost {
  layoutRoot: Component;
  setLayoutRoot(root: Component): void;
}

function findPrimary(component: Component): ScrollView | undefined {
  if (component instanceof ScrollView) return component.primary ? component : undefined;
  if (component instanceof Container) {
    for (const child of component.children) {
      const scroll = findPrimary(child);
      if (scroll) return scroll;
    }
  }
  return undefined;
}

export function getFullscreenHost(
  tui: TUI,
): { layout: LayoutHost; scroll: ScrollView } | undefined {
  const root: unknown = Reflect.get(tui, "layoutRoot");
  if (
    !root ||
    typeof root !== "object" ||
    typeof Reflect.get(root, "render") !== "function" ||
    typeof Reflect.get(tui, "setLayoutRoot") !== "function"
  )
    return undefined;
  const layout = tui as unknown as LayoutHost;
  const scroll = findPrimary(layout.layoutRoot);
  return scroll ? { layout, scroll } : undefined;
}
