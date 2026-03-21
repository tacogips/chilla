const ELLIPSIS = "\u2026";

let measureCanvas: HTMLCanvasElement | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCanvas === null && typeof document !== "undefined") {
    measureCanvas = document.createElement("canvas");
  }
  return measureCanvas?.getContext("2d") ?? null;
}

export function measureTextWidth(text: string, font: string): number {
  const ctx = getMeasureContext();
  if (ctx === null) {
    return text.length * 8;
  }
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * Fits `text` into `maxWidth` (px) using middle ellipsis when needed.
 */
export function middleEllipsisForWidth(
  text: string,
  maxWidth: number,
  font: string,
): string {
  const measure = (value: string) => measureTextWidth(value, font);
  const budget = Math.max(0, maxWidth - 1);

  if (text.length === 0) {
    return "";
  }

  if (measure(text) <= budget) {
    return text;
  }

  const minHead = 2;
  const minTail = 2;
  const ellipsisWidth = measure(ELLIPSIS);

  if (ellipsisWidth > budget) {
    return "";
  }

  for (let inner = text.length - 1; inner >= minHead + minTail; inner -= 1) {
    const head = Math.ceil(inner / 2);
    const tail = inner - head;
    if (head + tail >= text.length) {
      continue;
    }
    const candidate =
      text.slice(0, head) + ELLIPSIS + text.slice(text.length - tail);
    if (measure(candidate) <= budget) {
      return candidate;
    }
  }

  for (let n = text.length; n >= 1; n -= 1) {
    const candidate = text.slice(0, n) + ELLIPSIS;
    if (measure(candidate) <= budget) {
      return candidate;
    }
  }

  return ELLIPSIS;
}
