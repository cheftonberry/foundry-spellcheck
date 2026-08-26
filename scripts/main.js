/**
 * foundry-spellcheck
 * Copyright (c) 2026 Chef Tonberry
 * Licensed under the GNU AGPL v3.0
 */

import nspell from "./vendor/nspell.js";

const MOD_ID = "foundry-spellcheck";
const MODULE_URL = new URL("../", import.meta.url);
const MENU_CLASS = "foundry-spellcheck-menu";
const HIGHLIGHT_NAME = "foundry-spellcheck-misspelled";
const PERSONAL_DICTIONARY_KEY = `${MOD_ID}.personal-dictionary`;
const RICH_EDITOR_SELECTOR = ".ProseMirror";
const FORM_FIELD_SELECTOR = "textarea, input:not([type]), input[type='text'], input[type='search']";
const SPELLCHECK_TARGET_SELECTOR = `${RICH_EDITOR_SELECTOR}, ${FORM_FIELD_SELECTOR}`;
const WORD_CHARACTER = /[\p{L}\p{M}'’\-]/u;
const WORD_EDGE = /^['’\-]+|['’\-]+$/gu;
const WORD_PATTERN = /\p{L}[\p{L}\p{M}]*(?:['’\-][\p{L}\p{M}]+)*/gu;

let spellchecker;
let spellcheckerPromise;
let bundledDictionary;
const correctnessCache = new Map();
const underlineTimers = new WeakMap();

function getSpellcheckLanguage(doc = document) {
  return doc.documentElement?.lang || doc.defaultView?.navigator.language || "en-US";
}

function getRootElement(root) {
  if (!root) return document;
  if (root.jquery) return root[0] ?? document;

  if ([Node.ELEMENT_NODE, Node.DOCUMENT_NODE, Node.DOCUMENT_FRAGMENT_NODE].includes(root.nodeType)) return root;
  return root.element ?? root.form ?? document;
}

function applySpellcheckAttributes(root = document) {
  const elRoot = getRootElement(root);
  const doc = elRoot.ownerDocument ?? (elRoot.nodeType === Node.DOCUMENT_NODE ? elRoot : document);
  const lang = getSpellcheckLanguage(doc);
  const win = doc.defaultView ?? window;
  const targets = [];

  if (elRoot.nodeType === Node.ELEMENT_NODE && elRoot.matches(SPELLCHECK_TARGET_SELECTOR)) targets.push(elRoot);
  targets.push(...(elRoot.querySelectorAll?.(SPELLCHECK_TARGET_SELECTOR) ?? []));

  for (const el of targets) {
    // Rich editors use module highlights; plain form fields retain Chromium's native spellcheck.
    const useNativeSpellcheck = !el.matches(RICH_EDITOR_SELECTOR) || !supportsCustomHighlights(win);
    el.setAttribute("spellcheck", String(useNativeSpellcheck));
    el.spellcheck = useNativeSpellcheck;
    el.setAttribute("lang", lang);
    el.lang = lang;
  }

  if (spellchecker) scheduleUnderlineRefresh(doc);
}

async function loadSpellchecker() {
  if (spellchecker) return spellchecker;
  if (spellcheckerPromise) return spellcheckerPromise;

  spellcheckerPromise = Promise.all([
    fetch(new URL("scripts/vendor/dictionary-en/index.aff", MODULE_URL)).then(checkResponse).then(response => response.text()),
    fetch(new URL("scripts/vendor/dictionary-en/index.dic", MODULE_URL)).then(checkResponse).then(response => response.text())
  ]).then(([aff, dic]) => {
    bundledDictionary = {aff, dic};
    rebuildSpellchecker();
    return spellchecker;
  }).catch(error => {
    spellcheckerPromise = undefined;
    console.error(`${MOD_ID} | Unable to load the bundled dictionary`, error);
    throw error;
  });

  return spellcheckerPromise;
}

function checkResponse(response) {
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${response.url}`);
  return response;
}

function readPersonalDictionary(win = window) {
  try {
    const stored = JSON.parse(win.localStorage.getItem(PERSONAL_DICTIONARY_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter(word => typeof word === "string" && word.length > 0 && word.length <= 100);
  } catch (error) {
    console.warn(`${MOD_ID} | Unable to read the personal dictionary`, error);
    return [];
  }
}

function addToPersonalDictionary(word, doc = document) {
  if (!spellchecker || !word) return;
  const win = doc.defaultView ?? window;
  const words = new Set(readPersonalDictionary(win));
  words.add(word);

  try {
    win.localStorage.setItem(PERSONAL_DICTIONARY_KEY, JSON.stringify([...words].sort()));
  } catch (error) {
    console.warn(`${MOD_ID} | Unable to save the personal dictionary`, error);
  }

  spellchecker.add(word);
  correctnessCache.set(word, true);
  scheduleUnderlineRefresh(doc, 0);
  globalThis.ui?.notifications?.info?.(`Added “${word}” to your spellcheck dictionary.`);
}

function syncPersonalDictionary(win = window) {
  rebuildSpellchecker(win);
}

function rebuildSpellchecker(win = window) {
  if (!bundledDictionary) return;
  spellchecker = nspell(bundledDictionary.aff, bundledDictionary.dic);
  for (const word of readPersonalDictionary(win)) spellchecker.add(word);
  correctnessCache.clear();
  scheduleUnderlineRefresh(win.document, 0);
}

function resetPersonalDictionary(win = window) {
  try {
    win.localStorage.removeItem(PERSONAL_DICTIONARY_KEY);
  } catch (error) {
    console.warn(`${MOD_ID} | Unable to reset the personal dictionary`, error);
    return false;
  }
  rebuildSpellchecker(win);
  return true;
}

function registerSettingsMenu() {
  // Define this only in the primary window. Detached harnesses do not expose
  // legacy application globals and do not need to register settings menus.
  class PersonalDictionarySettings extends foundry.appv1.api.FormApplication {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: `${MOD_ID}-dictionary-settings`,
        title: "Chef's Spellchecker 2: Personal Dictionary",
        template: `modules/${MOD_ID}/templates/personal-dictionary-settings.hbs`,
        width: 460,
        height: "auto",
        closeOnSubmit: false
      });
    }

    getData() {
      const words = readPersonalDictionary().sort((a, b) => a.localeCompare(b));
      return {
        hasWords: words.length > 0,
        wordCount: words.length,
        wordLabel: words.length === 1 ? "word" : "words",
        words
      };
    }

    async _updateObject() {
      const wordCount = readPersonalDictionary().length;
      if (!wordCount) return;
      const confirmed = await foundry.appv1.api.Dialog.confirm({
        title: "Reset Personal Dictionary?",
        content: `<p>Remove all ${wordCount} added ${wordCount === 1 ? "word" : "words"}? This cannot be undone.</p>`,
        defaultYes: false
      });
      if (!confirmed) return;

      if (resetPersonalDictionary()) {
        ui.notifications.info("Chef's Spellchecker 2 personal dictionary was reset.");
        this.render();
      } else {
        ui.notifications.error("Chef's Spellchecker 2 could not reset the personal dictionary.");
      }
    }
  }

  game.settings.registerMenu(MOD_ID, "personalDictionary", {
    name: "Personal Dictionary",
    label: "Reset Personal Dictionary",
    hint: "Remove every word you have added to Chef's Spellchecker 2 on this client.",
    icon: "fa-solid fa-eraser",
    type: PersonalDictionarySettings,
    restricted: false
  });
}

function getWordAtPoint(doc, clientX, clientY, editor) {
  let node;
  let offset;

  if (typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(clientX, clientY);
    node = position?.offsetNode;
    offset = position?.offset;
  } else if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(clientX, clientY);
    node = range?.startContainer;
    offset = range?.startOffset;
  }

  if (node && Number.isInteger(offset)) {
    const candidate = getWordFromTextPoint(doc, node, offset, editor);
    if (candidate && wordRangeContainsPoint(candidate, clientX, clientY)) return candidate;
  }

  // Detached Chromium windows can return an imprecise caret position for an
  // adopted ProseMirror tree. Resolve the clicked word from rendered ranges.
  return findWordRangeAtPoint(doc, editor, clientX, clientY)
    ?? getWordFromSelection(doc, editor);
}

function getWordFromTextPoint(doc, node, offset, editor) {
  const point = normalizeTextPoint(node, offset);
  if (!point) return null;

  ({node, offset} = point);
  const text = node.nodeValue ?? "";
  if (!text) return null;

  let probe = Math.min(offset, text.length - 1);
  if (!isWordCharacter(text[probe]) && probe > 0 && isWordCharacter(text[probe - 1])) probe--;
  if (!isWordCharacter(text[probe])) return null;

  let from = probe;
  let to = probe + 1;
  while (from > 0 && isWordCharacter(text[from - 1])) from--;
  while (to < text.length && isWordCharacter(text[to])) to++;

  const rawWord = text.slice(from, to);
  const word = rawWord.replace(WORD_EDGE, "");
  if (!word) return null;

  const leading = rawWord.indexOf(word);
  from += leading;
  to = from + word.length;

  editor ??= node.parentElement?.closest(RICH_EDITOR_SELECTOR);
  if (!editor || !editor.contains(node)) return null;
  return {doc, editor, node, from, to, word};
}

function findWordRangeAtPoint(doc, editor, clientX, clientY) {
  if (!editor) return null;
  const win = doc.defaultView ?? window;
  const walker = doc.createTreeWalker(editor, win.NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue?.trim()) return win.NodeFilter.FILTER_REJECT;
      if (parent.closest("code, pre, [contenteditable='false']")) return win.NodeFilter.FILTER_REJECT;
      return win.NodeFilter.FILTER_ACCEPT;
    }
  });

  let node;
  while ((node = walker.nextNode())) {
    for (const match of node.nodeValue.matchAll(WORD_PATTERN)) {
      const candidate = {
        doc,
        editor,
        node,
        from: match.index,
        to: match.index + match[0].length,
        word: match[0]
      };
      if (wordRangeContainsPoint(candidate, clientX, clientY)) return candidate;
    }
  }
  return null;
}

function wordRangeContainsPoint(wordInfo, clientX, clientY) {
  const {doc, node, from, to} = wordInfo;
  const range = doc.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  const tolerance = 4;
  return [...range.getClientRects()].some(rect =>
    clientX >= rect.left - tolerance
    && clientX <= rect.right + tolerance
    && clientY >= rect.top - tolerance
    && clientY <= rect.bottom + tolerance);
}

function getWordFromSelection(doc, editor) {
  const selection = doc.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;

  // Chromium selects an underlined misspelling before firing contextmenu in
  // detached Electron windows. Use either edge so this also handles a caret.
  return getWordFromTextPoint(doc, range.startContainer, range.startOffset, editor)
    ?? getWordFromTextPoint(doc, range.endContainer, range.endOffset, editor);
}

function getWordFromTargetText(doc, editor, target) {
  if (!target || !editor.contains(target)) return null;
  const selectedText = doc.getSelection()?.toString().trim().replace(WORD_EDGE, "") ?? "";
  const win = doc.defaultView ?? window;
  const walker = doc.createTreeWalker(target, win.NodeFilter.SHOW_TEXT);
  const candidates = [];

  let node;
  while ((node = walker.nextNode())) {
    for (const match of node.nodeValue.matchAll(WORD_PATTERN)) {
      const candidate = {
        doc,
        editor,
        node,
        from: match.index,
        to: match.index + match[0].length,
        word: match[0]
      };
      if (selectedText && match[0] === selectedText) return candidate;
      candidates.push(candidate);
    }
  }

  // A paragraph containing only one word is unambiguous even when Electron has
  // not exposed the selection to JavaScript.
  return candidates.length === 1 ? candidates[0] : null;
}

function getWordInFormControl(control) {
  if (control.disabled || control.readOnly) return null;
  const text = control.value ?? "";
  if (!text) return null;

  const selectionStart = control.selectionStart ?? 0;
  const selectionEnd = control.selectionEnd ?? selectionStart;
  let probe = Math.min(selectionStart, text.length - 1);
  if (selectionEnd > selectionStart) probe = selectionStart;
  if (!isWordCharacter(text[probe]) && probe > 0 && isWordCharacter(text[probe - 1])) probe--;
  if (!isWordCharacter(text[probe])) return null;

  let from = probe;
  let to = probe + 1;
  while (from > 0 && isWordCharacter(text[from - 1])) from--;
  while (to < text.length && isWordCharacter(text[to])) to++;

  const rawWord = text.slice(from, to);
  const word = rawWord.replace(WORD_EDGE, "");
  if (!word) return null;
  const leading = rawWord.indexOf(word);
  from += leading;
  to = from + word.length;
  return {doc: control.ownerDocument, editor: control, control, from, to, word};
}

function normalizeTextPoint(node, offset) {
  if (node.nodeType === Node.TEXT_NODE) return {node, offset};
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const children = node.childNodes;
  const forward = children[Math.min(offset, children.length - 1)];
  const backward = children[Math.max(0, offset - 1)];
  const forwardText = firstTextNode(forward);
  const textNode = forwardText ?? lastTextNode(backward);
  if (!textNode) return null;
  return {node: textNode, offset: forwardText ? 0 : textNode.nodeValue.length};
}

function firstTextNode(node) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) return node;
  for (const child of node.childNodes ?? []) {
    const result = firstTextNode(child);
    if (result) return result;
  }
  return null;
}

function lastTextNode(node) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) return node;
  const children = node.childNodes ?? [];
  for (let i = children.length - 1; i >= 0; i--) {
    const result = lastTextNode(children[i]);
    if (result) return result;
  }
  return null;
}

function isWordCharacter(character) {
  return Boolean(character && WORD_CHARACTER.test(character));
}

function isCorrectSpelling(word) {
  if (!spellchecker) return true;
  if (correctnessCache.has(word)) return correctnessCache.get(word);
  const correct = spellchecker.correct(word);
  if (correctnessCache.size >= 5000) correctnessCache.clear();
  correctnessCache.set(word, correct);
  return correct;
}

function supportsCustomHighlights(win) {
  return Boolean(win.CSS?.highlights && win.Highlight);
}

function scheduleUnderlineRefresh(doc = document, delay = 140) {
  const win = doc.defaultView ?? window;
  if (!spellchecker || !supportsCustomHighlights(win)) return;
  const previous = underlineTimers.get(doc);
  if (previous) win.clearTimeout(previous);
  underlineTimers.set(doc, win.setTimeout(() => {
    underlineTimers.delete(doc);
    refreshUnderlines(doc);
  }, delay));
}

function refreshUnderlines(doc = document) {
  const win = doc.defaultView ?? window;
  if (!spellchecker || !supportsCustomHighlights(win)) return;

  const highlight = new win.Highlight();
  for (const editor of doc.querySelectorAll(RICH_EDITOR_SELECTOR)) {
    const walker = doc.createTreeWalker(editor, win.NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || !node.nodeValue?.trim()) return win.NodeFilter.FILTER_REJECT;
        if (parent.closest("code, pre, [contenteditable='false'], [data-spellcheck='false']")) {
          return win.NodeFilter.FILTER_REJECT;
        }
        return win.NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      for (const match of node.nodeValue.matchAll(WORD_PATTERN)) {
        if (isCorrectSpelling(match[0])) continue;
        const range = doc.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        highlight.add(range);
      }
    }
  }
  win.CSS.highlights.set(HIGHLIGHT_NAME, highlight);
}

function preserveCapitalization(suggestion, original) {
  if (original === original.toUpperCase()) return suggestion.toUpperCase();
  if (/^\p{Lu}/u.test(original)) return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
  return suggestion;
}

function replaceWord(wordInfo, replacement) {
  const {doc, editor, node, control, from, to} = wordInfo;
  if (control) {
    if (!control.isConnected) return;
    control.focus();
    control.setSelectionRange(from, to);
    control.setRangeText(replacement, from, to, "end");
    const InputEventClass = doc.defaultView?.InputEvent ?? InputEvent;
    control.dispatchEvent(new InputEventClass("input", {
      bubbles: true,
      data: replacement,
      inputType: "insertReplacementText"
    }));
    return;
  }

  if (!node.isConnected || !editor.isConnected) return;

  const selection = doc.getSelection();
  const range = doc.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  selection.removeAllRanges();
  selection.addRange(range);
  editor.focus();

  // This takes the same editing path as typed text, so ProseMirror retains undo support.
  if (doc.execCommand?.("insertText", false, replacement)) return;

  range.deleteContents();
  const replacementNode = doc.createTextNode(replacement);
  range.insertNode(replacementNode);
  range.setStartAfter(replacementNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  const InputEventClass = doc.defaultView?.InputEvent ?? InputEvent;
  editor.dispatchEvent(new InputEventClass("input", {bubbles: true, data: replacement, inputType: "insertText"}));
}

function showSuggestionMenu(wordInfo, suggestions, clientX, clientY) {
  const {doc, word} = wordInfo;
  closeSuggestionMenu(doc);

  const menu = doc.createElement("div");
  menu.className = MENU_CLASS;
  menu.setAttribute("popover", "manual");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", `Spelling suggestions for ${word}`);

  if (suggestions.length) {
    for (const suggestion of suggestions.slice(0, 8)) {
      const replacement = preserveCapitalization(suggestion, word);
      menu.append(createMenuButton(doc, replacement, () => replaceWord(wordInfo, replacement)));
    }
  } else {
    const empty = doc.createElement("div");
    empty.className = `${MENU_CLASS}__empty`;
    empty.textContent = "No spelling suggestions";
    menu.append(empty);
  }

  const divider = doc.createElement("div");
  divider.className = `${MENU_CLASS}__divider`;
  divider.setAttribute("role", "separator");
  menu.append(divider);
  menu.append(createMenuButton(doc, `Add “${word}” to dictionary`, () => addToPersonalDictionary(word, doc)));

  doc.body.append(menu);
  try {
    menu.showPopover?.();
  } catch (_error) {}
  positionMenu(menu, clientX, clientY);
  menu.querySelector("button")?.focus({preventScroll: true});
}

function showLoadingMenu(doc, clientX, clientY) {
  closeSuggestionMenu(doc);
  const menu = doc.createElement("div");
  menu.className = MENU_CLASS;
  menu.setAttribute("popover", "manual");
  menu.setAttribute("role", "status");
  const loading = doc.createElement("div");
  loading.className = `${MENU_CLASS}__empty`;
  loading.textContent = "Loading dictionary…";
  menu.append(loading);
  doc.body.append(menu);
  try {
    menu.showPopover?.();
  } catch (_error) {}
  positionMenu(menu, clientX, clientY);
}

function createMenuButton(doc, label, onActivate) {
  const button = doc.createElement("button");
  button.type = "button";
  button.setAttribute("role", "menuitem");
  button.textContent = label;
  button.addEventListener("pointerdown", event => event.preventDefault());
  button.addEventListener("click", () => {
    onActivate();
    closeSuggestionMenu(doc);
  });
  return button;
}

function positionMenu(menu, clientX, clientY) {
  const win = menu.ownerDocument.defaultView;
  const margin = 8;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(margin, Math.min(clientX, win.innerWidth - rect.width - margin))}px`;
  menu.style.top = `${Math.max(margin, Math.min(clientY, win.innerHeight - rect.height - margin))}px`;
}

function closeSuggestionMenu(doc = document) {
  const menu = doc.querySelector(`.${MENU_CLASS}`);
  if (!menu) return;
  try {
    menu.hidePopover?.();
  } catch (_error) {}
  menu.remove();
}

function openSuggestionMenuForWord(win, wordInfo, clientX, clientY) {
  if (!(wordInfo.node ?? wordInfo.control)?.isConnected) return;
  if (spellchecker) {
    if (isCorrectSpelling(wordInfo.word)) return closeSuggestionMenu(win.document);
    showSuggestionMenu(wordInfo, spellchecker.suggest(wordInfo.word), clientX, clientY);
    return;
  }

  showLoadingMenu(win.document, clientX, clientY);
  loadSpellchecker().then(checker => {
    if (!(wordInfo.node ?? wordInfo.control)?.isConnected) return closeSuggestionMenu(win.document);
    if (checker.correct(wordInfo.word)) return closeSuggestionMenu(win.document);
    showSuggestionMenu(wordInfo, checker.suggest(wordInfo.word), clientX, clientY);
  }).catch(() => closeSuggestionMenu(win.document));
}

function installContextMenu(win = window) {
  if (win.__foundrySpellcheckContextMenuInstalled) return;
  win.__foundrySpellcheckContextMenuInstalled = true;

  win.addEventListener("contextmenu", event => {
    const target = event.target;
    if (target?.nodeType !== 1) return;
    const eventPath = event.composedPath?.() ?? [];
    const richEditor = eventPath.find(node =>
      node?.nodeType === 1 && node.matches?.(RICH_EDITOR_SELECTOR))
      ?? target.closest(RICH_EDITOR_SELECTOR);
    const formControl = eventPath.find(node =>
      node?.nodeType === 1 && node.matches?.(FORM_FIELD_SELECTOR))
      ?? (target.matches(FORM_FIELD_SELECTOR) ? target : null);
    if (!richEditor && !formControl) return;

    const wordInfo = formControl
      ? getWordInFormControl(formControl)
      : getWordAtPoint(win.document, event.clientX, event.clientY, richEditor);
    if (!wordInfo) {
      if (!richEditor) return;

      // Detached Chromium commits its right-click word selection after the
      // contextmenu listener runs. Consume the event now, then read the updated
      // selection on the next task.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const x = event.clientX;
      const y = event.clientY;
      win.setTimeout(() => {
        const selectedWord = getWordFromTargetText(win.document, richEditor, target)
          ?? getWordFromSelection(win.document, richEditor)
          ?? findWordRangeAtPoint(win.document, richEditor, x, y);
        if (selectedWord) openSuggestionMenuForWord(win, selectedWord, x, y);
      }, 0);
      return;
    }

    // Correct words retain the normal browser menu where one is available.
    if (spellchecker && isCorrectSpelling(wordInfo.word)) {
      closeSuggestionMenu(win.document);
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    openSuggestionMenuForWord(win, wordInfo, event.clientX, event.clientY);
  }, true);

  win.addEventListener("pointerdown", event => {
    if (!event.target.closest?.(`.${MENU_CLASS}`)) closeSuggestionMenu(win.document);
  }, true);
  win.addEventListener("keydown", event => {
    if (event.key === "Escape") closeSuggestionMenu(win.document);
  }, true);
  win.addEventListener("blur", () => closeSuggestionMenu(win.document));
  win.addEventListener("resize", () => closeSuggestionMenu(win.document));
  win.addEventListener("scroll", () => closeSuggestionMenu(win.document), true);
  win.addEventListener("storage", event => {
    if (event.key === PERSONAL_DICTIONARY_KEY) syncPersonalDictionary(win);
  });
}

function installStyles(doc = document) {
  if (doc.querySelector(`link[data-${MOD_ID}]`)) return;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("styles/spellcheck.css", MODULE_URL).href;
  link.setAttribute(`data-${MOD_ID}`, "true");
  doc.head?.append(link);
}

function installEditorObserver(doc = document) {
  if (doc.__foundrySpellcheckObserverInstalled) return;
  doc.__foundrySpellcheckObserverInstalled = true;

  applySpellcheckAttributes(doc);
  const win = doc.defaultView ?? window;
  const observer = new win.MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches(SPELLCHECK_TARGET_SELECTOR) || node.querySelector?.(SPELLCHECK_TARGET_SELECTOR)) {
          applySpellcheckAttributes(node);
        }
      }
    }
    scheduleUnderlineRefresh(doc);
  });

  observer.observe(doc.body ?? doc.documentElement, {characterData: true, childList: true, subtree: true});
  doc.addEventListener("input", event => {
    if (event.target.closest?.(RICH_EDITOR_SELECTOR)) scheduleUnderlineRefresh(doc);
  }, true);
}

function initializeSpellcheck(win = window) {
  installStyles(win.document);
  installContextMenu(win);
  installEditorObserver(win.document);
  applySpellcheckAttributes(win.document);
  void loadSpellchecker().then(() => scheduleUnderlineRefresh(win.document, 0)).catch(() => {
    // If the bundled dictionary cannot load, leave Chromium's native behavior available.
    for (const editor of win.document.querySelectorAll(SPELLCHECK_TARGET_SELECTOR)) {
      editor.setAttribute("spellcheck", "true");
      editor.spellcheck = true;
    }
  });
}

function initializeDetachedWindow(win) {
  const doc = win?.document;
  if (!doc?.head || doc.querySelector(`script[data-${MOD_ID}]`)) return;

  // Execute in the detached window's own realm. Foundry's harness deliberately
  // exposes only a subset of globals, and realm-local DOM constructors/listeners
  // are required for reliable context-menu handling in Electron.
  const script = doc.createElement("script");
  const scriptUrl = new URL("scripts/main.js", MODULE_URL);
  scriptUrl.searchParams.set("v", game.modules.get(MOD_ID)?.version ?? "2.0.1");
  script.type = "module";
  script.src = scriptUrl.href;
  script.setAttribute(`data-${MOD_ID}`, "true");
  script.addEventListener("error", error => {
    console.error(`${MOD_ID} | Failed to initialize detached-window spellcheck`, error);
  }, {once: true});
  doc.head.append(script);
}

initializeSpellcheck();

if (globalThis.Hooks) {
  Hooks.once("init", registerSettingsMenu);
  Hooks.once("ready", () => initializeSpellcheck());
  Hooks.on("openDetachedWindow", (_id, win) => initializeDetachedWindow(win));
  Hooks.on("renderJournalPageSheet", (_app, html) => applySpellcheckAttributes(html));
  Hooks.on("renderJournalSheet", (_app, html) => applySpellcheckAttributes(html));
  Hooks.on("renderActorSheet", (_app, html) => applySpellcheckAttributes(html));
  Hooks.on("renderItemSheet", (_app, html) => applySpellcheckAttributes(html));
  Hooks.on("renderApplication", (_app, html) => applySpellcheckAttributes(html));
}
