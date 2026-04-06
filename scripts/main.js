/**
 * foundry-spellcheck
 * Copyright (c) 2026 Chef Tonberry
 * Licensed under the GNU AGPL v3.0
 */

const MOD_ID = "foundry-spellcheck";

function getSpellcheckLanguage() {
  return document.documentElement?.lang
    || navigator.language
    || "en-US";
}

function applySpellcheckAttributes(root) {
  const lang = getSpellcheckLanguage();

  const editors = root.querySelectorAll(".ProseMirror");
  for (const el of editors) {
    el.setAttribute("spellcheck", "true");
    el.spellcheck = true;

    el.setAttribute("lang", lang);
    el.lang = lang;
  }
}

Hooks.once("ready", () => {
  if (window.__foundrySpellcheckContextMenuInstalled) return;
  window.__foundrySpellcheckContextMenuInstalled = true;

  document.addEventListener(
    "contextmenu",
    (ev) => {
      const target = ev.target;
      if (!(target instanceof Element)) return;

      if (!target.closest(".ProseMirror")) return;

      // Allow browser native spellcheck menu
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    },
    true
  );
});

Hooks.on("renderJournalPageSheet", (_app, html) => {
  applySpellcheckAttributes(html[0]);
});

Hooks.on("renderJournalSheet", (_app, html) => {
  applySpellcheckAttributes(html[0]);
});

Hooks.on("renderActorSheet", (_app, html) => {
  applySpellcheckAttributes(html[0]);
});

Hooks.on("renderItemSheet", (_app, html) => {
  applySpellcheckAttributes(html[0]);
});