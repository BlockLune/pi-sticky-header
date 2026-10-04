import { UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Container, type Component } from "@earendil-works/pi-tui";

export interface Prompt {
  component: UserMessageComponent;
  text: string;
  index: number;
  start: number;
  end: number;
}

export type StickyMode = "auto" | "always";

/**
 * Measure prompt positions from the rendered transcript.
 * Tool boxes, padding, and streamed output can move prompts with no change to child count.
 * Use native render caches. Do not cache positions between frames.
 */
export function collectPrompts(doc: Component, width: number): Prompt[] {
  const users: UserMessageComponent[] = [];
  const visit = (component: Component): void => {
    if (component instanceof UserMessageComponent) users.push(component);
    else if (component instanceof Container) component.children.forEach(visit);
  };
  visit(doc);

  const lines = doc.render(width);
  const prompts: Prompt[] = [];
  let cursor = 0;
  for (const component of users) {
    const block = component.render(width);
    if (block.length === 0) continue;
    // Use the native prompt's OSC markers and background to identify its block.
    // Search forward to keep messages with the same text in their original order.
    while (cursor < lines.length && !block.every((line, offset) => lines[cursor + offset] === line))
      cursor++;
    if (cursor >= lines.length) break;
    // Pi has no public text accessor. Keep access to its private field here.
    const text: unknown = Reflect.get(component, "text");
    prompts.push({
      component,
      text: typeof text === "string" ? text : "",
      index: prompts.length,
      start: cursor,
      end: cursor + block.length,
    });
    cursor += block.length;
  }
  return prompts;
}

export function selectPrompt(
  prompts: readonly Prompt[],
  scrollTop: number,
  followingEnd: boolean,
  mode: StickyMode,
): Prompt | undefined {
  // Use the follow-end state, not the viewport top, to select the latest prompt.
  // This state stays valid before ScrollView.updateLayout measures new output.
  if (followingEnd) return prompts.at(-1);
  const prompt = prompts.findLast((item) => item.start <= scrollTop);
  if (!prompt) return mode === "always" ? prompts[0] : undefined;
  return mode === "always" || scrollTop >= prompt.end - 1 ? prompt : undefined;
}
