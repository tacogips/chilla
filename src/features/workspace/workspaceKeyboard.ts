function hasExactModifiers(
  event: KeyboardEvent,
  modifiers: {
    readonly ctrl?: boolean;
    readonly meta?: boolean;
    readonly alt?: boolean;
    readonly shift?: boolean;
  },
) {
  return (
    event.ctrlKey === (modifiers.ctrl ?? false) &&
    event.metaKey === (modifiers.meta ?? false) &&
    event.altKey === (modifiers.alt ?? false) &&
    event.shiftKey === (modifiers.shift ?? false)
  );
}

export function matchesShortcut(
  event: KeyboardEvent,
  key: string,
  modifiers: {
    readonly ctrl?: boolean;
    readonly meta?: boolean;
    readonly alt?: boolean;
    readonly shift?: boolean;
  } = {},
) {
  const shortcutCode =
    key.length === 1 && key >= "a" && key <= "z"
      ? `Key${key.toUpperCase()}`
      : null;

  return (
    (event.key.toLowerCase() === key || event.code === shortcutCode) &&
    hasExactModifiers(event, modifiers)
  );
}
