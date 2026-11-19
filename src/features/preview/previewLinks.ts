import {
  isDefaultBrowserUrl,
  resolveDocumentPathname,
  type PreviewPathApi,
} from "./preview-assets";

export interface PreviewLinkNavigation {
  readonly path: string;
  readonly fragment: string | null;
}

export type PreviewLinkTarget =
  | { readonly kind: "ignore" }
  | { readonly kind: "external"; readonly url: string }
  | { readonly kind: "anchor"; readonly fragment: string }
  | {
      readonly kind: "file";
      readonly path: string;
      readonly fragment: string | null;
    };

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function classifyPreviewLink(
  href: string,
  documentPath: string | null,
  pathApi: Pick<PreviewPathApi, "dirname" | "join" | "normalize">,
): Promise<PreviewLinkTarget> {
  const value = href.trim();
  if (value === "" || value === "#") return { kind: "ignore" };
  if (isDefaultBrowserUrl(value)) return { kind: "external", url: value };
  if (value.startsWith("//") || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
    return { kind: "ignore" };
  }
  if (value.startsWith("#")) {
    return { kind: "anchor", fragment: decodeOnce(value.slice(1)) };
  }
  if (documentPath === null || documentPath.trim() === "")
    return { kind: "ignore" };
  const hashIndex = value.indexOf("#");
  const beforeFragment = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const rawFragment = hashIndex === -1 ? "" : value.slice(hashIndex + 1);
  const fragment = rawFragment === "" ? null : decodeOnce(rawFragment);
  const queryIndex = beforeFragment.indexOf("?");
  const pathname =
    queryIndex === -1 ? beforeFragment : beforeFragment.slice(0, queryIndex);
  if (pathname === "") {
    return fragment === null
      ? { kind: "ignore" }
      : { kind: "anchor", fragment };
  }
  const path = await resolveDocumentPathname(
    decodeOnce(pathname),
    documentPath,
    pathApi,
  );
  return { kind: "file", path, fragment };
}

export function slugifyHeading(title: string): string {
  let slug = "";
  for (const character of title) {
    if (/[\p{L}\p{N}]/u.test(character)) {
      slug += character.toLowerCase();
    } else if (!slug.endsWith("-")) {
      slug += "-";
    }
  }
  return slug.replace(/^-+|-+$/g, "") || "section";
}
