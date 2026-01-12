/**
 * foundry-spellcheck
 * Copyright (c) 2026 Chef Tonberry
 * Licensed under the GNU AGPL v3.0
 */


const MOD_ID = "foundry-spellcheck";

/* Settings                                     */

Hooks.once("init", () => {
  game.settings.register(MOD_ID, "language", {
    name: "Spellcheck language",
    hint: "BCP-47 language tag (e.g. en-US, en-GB).",
    scope: "client",
    config: true,
    type: String,
    default: game.i18n.lang || "en-US"
  });

  game.settings.register(MOD_ID, "allowNativeContextMenu", {
    name: "Allow native right-click menu in editors",
    hint: "Allows Chrome spelling suggestions inside Journal / Actor / Item editors.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
});

/* Spellcheck attributes (mostly redundant but safe) */

function applySpellcheckAttributes(root) {
  const lang = game.settings.get(MOD_ID, "language") || "en-US";

  const editors = root.querySelectorAll(".ProseMirror");
  for (const el of editors) {
    el.setAttribute("spellcheck", "true");
    el.spellcheck = true;

    el.setAttribute("lang", lang);
    el.lang = lang;
  }
}

/* Native context menu escape hatch (KEY FIX)   */

Hooks.once("ready", () => {
  // Prevent double-install on hot reload
  if (window.__foundrySpellcheckContextMenuInstalled) return;
  window.__foundrySpellcheckContextMenuInstalled = true;

  document.addEventListener(
    "contextmenu",
    (ev) => {
      if (!game.settings.get(MOD_ID, "allowNativeContextMenu")) return;

      const target = ev.target;
      if (!(target instanceof Element)) return;

      // Only allow native menu inside ProseMirror editors
      if (!target.closest(".ProseMirror")) return;


      ev.stopPropagation();
      ev.stopImmediatePropagation();
    },
    true // capture phase so we beat Foundry's handlers
  );
});

/* Sheet hooks                                  */

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
