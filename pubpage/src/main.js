import appIconUrl from "../../src-tauri/icons/icon.png";

document.documentElement.classList.add("js");

for (const image of document.querySelectorAll("[data-app-icon]")) {
  image.src = appIconUrl;
}

for (const year of document.querySelectorAll("[data-year]")) {
  year.textContent = new Date().getFullYear();
}

const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isOpen));
    nav.toggleAttribute("data-open", !isOpen);
  });

  for (const link of nav.querySelectorAll("a")) {
    link.addEventListener("click", () => {
      navToggle.setAttribute("aria-expanded", "false");
      nav.removeAttribute("data-open");
    });
  }
}

for (const copyButton of document.querySelectorAll("[data-copy-command]")) {
  copyButton.addEventListener("click", async () => {
    const command = copyButton.getAttribute("data-copy-command");
    if (!command) return;

    try {
      await navigator.clipboard.writeText(command);
      const originalLabel = copyButton.textContent;
      copyButton.textContent = document.documentElement.lang === "ja" ? "コピー済み" : "Copied";
      window.setTimeout(() => {
        copyButton.textContent = originalLabel;
      }, 1600);
    } catch {
      copyButton.focus();
    }
  });
}
