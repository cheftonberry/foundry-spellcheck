# Chef's Spellchecker 2

<img width="490" height="298" alt="spellchecker2" src="https://github.com/user-attachments/assets/48cd6670-32d9-4335-b09f-62e691e0a4a2" />

---

Chef's Spellchecker 2 provides offline spellchecking for Foundry VTT v13 and v14.

Version 2.0.1 is a complete rework of the module's interface and behavior. It introduces a custom spellchecking interface that supports both the Foundry VTT desktop application and web browsers, including detached windows. The dictionary is bundled locally for offline use, so a browser-provided dictionary is no longer required.

Use **Add “word” to dictionary** to accept a campaign name or custom term. Personal dictionary entries are stored locally for the current browser or Foundry desktop client and persist across sessions.

To remove all added words, open **Configure Settings**, find **Chef's Spellchecker 2**, and select **Reset Personal Dictionary**.

The internal module ID remains `foundry-spellcheck` so existing installations can upgrade normally.

## Third-party software

The suggestion engine uses [nspell](https://github.com/wooorm/nspell) and [dictionary-en](https://github.com/wooorm/dictionaries). Copies of their respective licenses are included in `third-party/`.
