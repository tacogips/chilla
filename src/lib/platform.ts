/** True when the UI likely runs WebKitGTK (Linux), where HTML &lt;video&gt; uses a flaky GStreamer stack. */
export function isLinuxWebKitDesktop(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  if (
    typeof navigator.platform === "string" &&
    navigator.platform.startsWith("Linux")
  ) {
    return true;
  }

  return /\bLinux\b/i.test(navigator.userAgent);
}
