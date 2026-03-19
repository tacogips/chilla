import type { HeadingNode } from "../../lib/tauri/document";

export function flattenHeadingTitles(
  headings: readonly HeadingNode[],
): readonly string[] {
  const titles: string[] = [];

  const walk = (nodes: readonly HeadingNode[]) => {
    for (const node of nodes) {
      titles.push(node.title);
      walk(node.children);
    }
  };

  walk(headings);

  return titles;
}
