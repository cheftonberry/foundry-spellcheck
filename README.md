# Chef's Spellchecker 2

<img width="636" height="444" alt="spellchecker2" src="https://github.com/user-attachments/assets/45f6696a-eba3-42b6-b919-bf7fd89d1a83" />


Chef's Spellchecker 2 provides offline spellchecking for Foundry VTT v13 and v14 rich-text editors, textareas, and text fields.

Version 2.0.1 is a complete rework of the module's interface and behavior. It adds module-owned red underlines, a custom right-click suggestion menu, support for the Foundry desktop application and v14 detached windows, and safe replacements that retain editor undo support. The US-English dictionary is bundled locally, so journal and character text is never sent to an external spelling service.

Use **Add “word” to dictionary** to accept a campaign name or custom term. Personal dictionary entries are stored locally for the current browser or Foundry desktop client and persist across sessions.

To remove all added words, open **Configure Settings**, find **Chef's Spellchecker 2**, and select **Reset Personal Dictionary**.

The internal module ID remains `foundry-spellcheck` so existing installations can upgrade normally.

## Third-party software

The suggestion engine uses [nspell](https://github.com/wooorm/nspell) and [dictionary-en](https://github.com/wooorm/dictionaries), distributed under their respective licenses in `third-party/`.
