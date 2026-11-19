import { slugifyHeading } from "./previewLinks";

export function findFragmentTarget(
  container: ParentNode,
  fragment: string,
): HTMLElement | null {
  for (const element of container.querySelectorAll<HTMLElement>("[id]")) {
    if (element.id === fragment) return element;
  }
  const slug = slugifyHeading(fragment);
  for (const heading of container.querySelectorAll<HTMLElement>(
    "h1,h2,h3,h4,h5,h6",
  )) {
    if (heading.id === slug) return heading;
  }
  return null;
}
