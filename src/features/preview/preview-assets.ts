export interface PreviewPathApi {
  readonly dirname: (path: string) => Promise<string>;
  readonly join: (...paths: string[]) => Promise<string>;
  readonly normalize: (path: string) => Promise<string>;
  readonly convertFileSrc: (path: string) => string;
}

const DEFAULT_BROWSER_URL_PATTERN = /^(https?|mailto|tel):/i;
const GENERIC_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\/;

export function isDefaultBrowserUrl(value: string): boolean {
  return DEFAULT_BROWSER_URL_PATTERN.test(value.trim());
}

export function isVideoResource(value: string): boolean {
  const pathname = value.split(/[?#]/, 1)[0] ?? "";
  return /\.(mp4|m4v|mov|webm|ogv)$/i.test(pathname);
}

export function shouldResolveLocalResource(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//")) {
    return false;
  }

  if (isAbsoluteLocalPath(trimmed)) {
    return true;
  }

  return !GENERIC_SCHEME_PATTERN.test(trimmed);
}

function isAbsoluteLocalPath(value: string): boolean {
  return (
    value.startsWith("/") ||
    WINDOWS_ABSOLUTE_PATH_PATTERN.test(value) ||
    WINDOWS_UNC_PATH_PATTERN.test(value)
  );
}

export async function resolveDocumentResourceUrl(
  resourcePath: string,
  documentPath: string | null,
  pathApi: PreviewPathApi,
): Promise<string | null> {
  const trimmedResourcePath = resourcePath.trim();

  if (
    documentPath === null ||
    documentPath.trim() === "" ||
    !shouldResolveLocalResource(trimmedResourcePath)
  ) {
    return null;
  }

  const { pathname, suffix } = splitResourcePath(trimmedResourcePath);

  const absolutePath = isAbsoluteLocalPath(pathname)
    ? await pathApi.normalize(pathname)
    : await pathApi.normalize(
        await pathApi.join(await pathApi.dirname(documentPath), pathname),
      );

  return `${pathApi.convertFileSrc(absolutePath)}${suffix}`;
}

function splitResourcePath(resourcePath: string): {
  readonly pathname: string;
  readonly suffix: string;
} {
  const suffixIndex = resourcePath.search(/[?#]/);

  if (suffixIndex === -1) {
    return {
      pathname: resourcePath,
      suffix: "",
    };
  }

  return {
    pathname: resourcePath.slice(0, suffixIndex),
    suffix: resourcePath.slice(suffixIndex),
  };
}
