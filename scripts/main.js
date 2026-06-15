/**
 * foundry-spellcheck
 * Copyright (c) 2026 Chef Tonberry
 * Licensed under the GNU AGPL v3.0
 */

const MOD_ID = "foundry-spellcheck";

function getSpellcheckLanguage(doc = document) {
  return doc.documentElement?.lang
    || navigator.language
    || "en-US";
}

function getRootElement(root) {
  if (!root) return document;

  // Foundry v13 commonly passes jQuery objects to render hooks.
  if (root.jquery) return root[0] ?? document;

  // Foundry v14/ApplicationV2 commonly passes HTMLElement roots.
  if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) return root;

  // Some hooks pass an application object instead of an HTML root.
  return root.element ?? root.form ?? document;
}

function applySpellcheckAttributes(root = document) {
  const elRoot = getRootElement(root);
  const doc = elRoot.ownerDocument ?? document;
  const lang = getSpellcheckLanguage(doc);

  const editors = [];
  if (elRoot instanceof Element && elRoot.matches(".ProseMirror")) editors.push(elRoot);
  editors.push(...elRoot.querySelectorAll?.(".ProseMirror") ?? []);

  for (const el of editors) {
    el.setAttribute("spellcheck", "true");
    el.spellcheck = true;

    el.setAttribute("lang", lang);
    el.lang = lang;
  }
}

function installContextMenuBypass(win = window) {
  if (win.__foundrySpellcheckContextMenuInstalled) return;
  win.__foundrySpellcheckContextMenuInstalled = true;

  const handler = (ev) => {
    const target = ev.target;
    if (!(target instanceof win.Element)) return;
    if (!target.closest(".ProseMirror")) return;

    ev.stopPropagation();
    ev.stopImmediatePropagation();
  };

  win.addEventListener("contextmenu", handler, true);
  win.document.addEventListener("contextmenu", handler, true);
}

function installEditorObserver(doc = document) {
  if (doc.__foundrySpellcheckObserverInstalled) return;
  doc.__foundrySpellcheckObserverInstalled = true;

  applySpellcheckAttributes(doc);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(".ProseMirror") || node.querySelector?.(".ProseMirror")) {
          applySpellcheckAttributes(node);
        }
      }
    }
  });

  observer.observe(doc.body ?? doc.documentElement, {
    childList: true,
    subtree: true
  });
}

function initializeSpellcheck() {
  installContextMenuBypass(window);
  installEditorObserver(document);
  applySpellcheckAttributes(document);
}

function installDetachedWindowInjector() {
  if (window.__foundrySpellcheckDetachedInjectorInstalled) return;
  window.__foundrySpellcheckDetachedInjectorInstalled = true;

  const originalOpen = window.open;

  window.open = function (...args) {
    
    
    const child = originalOpen.apply(this, args);

    if (!child) return child;

    const inject = () => {
      try {
        if (child.closed) return;

        const doc = child.document;
        if (!doc?.head) return setTimeout(inject, 100);

        if (!doc.body?.classList.contains("detached")) {
          return setTimeout(inject, 100);
        }

        if (doc.querySelector(`script[data-${MOD_ID}]`)) return;

        const script = doc.createElement("script");
        script.type = "module";
        script.src = `/modules/${MOD_ID}/scripts/main.js`;
        script.setAttribute(`data-${MOD_ID}`, "true");

        doc.head.appendChild(script);

      } catch (err) {
        setTimeout(inject, 100);
      }
    };

    setTimeout(inject, 100);
    return child;
  };
}

installDetachedWindowInjector();

// Install immediately. Detached v14 windows may not replay the normal world-ready lifecycle.
initializeSpellcheck();

if (globalThis.Hooks) {
  Hooks.once("ready", initializeSpellcheck);

  Hooks.on("renderJournalPageSheet", (_app, html) => applySpellcheckAttributes(html));
  Hooks.on("renderJournalSheet", (_app, html) => applySpellcheckAttributes(html));
  Hooks.on("renderActorSheet", (_app, html) => applySpellcheckAttributes(html));
  Hooks.on("renderItemSheet", (_app, html) => applySpellcheckAttributes(html));
  Hooks.on("renderApplication", (_app, html) => applySpellcheckAttributes(html));
}
