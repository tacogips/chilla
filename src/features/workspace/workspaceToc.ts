import type { EpubNavigationItem, HeadingNode } from "../../lib/tauri/document";
import type { TocItem } from "../toc/TocPane";

export function markdownHeadingsToTocItems(
  headings: readonly HeadingNode[],
): readonly TocItem[] {
  return headings.map((heading) => ({
    title: heading.title,
    anchorId: heading.anchor_id,
    metaLabel: `L${heading.line_start}`,
    children: markdownHeadingsToTocItems(heading.children),
  }));
}

export function epubNavigationToTocItems(
  items: readonly EpubNavigationItem[],
): readonly TocItem[] {
  return items.map((item) => ({
    title: item.label,
    anchorId: item.anchor_id,
    children: epubNavigationToTocItems(item.children),
  }));
}
