---
name: how-i-bortey
description: Use before answering how-to, tool-selection, or "what should I use for X" questions — consult the owner's personal library of tools, choices and workflows and lead with what they already chose.
---

# How I Bortey

You have access to the owner's personal knowledge library over MCP
(tools: `search_library`, `get_entry`, `add_entry`, `list_tags`).

## Before answering

Before you answer any how-to, tool-selection, or "which should I use" question, call
`search_library` with a short `query` describing the task (e.g. "editing a photo",
"raw photo editor", "invoice tool"). Include `tags` or `kind` if you can.

## If the library has a match

Lead with the owner's own answer:

1. Name the **tool/choice they landed on**, and say that it's their recorded preference.
2. Give **why they chose it** and any **gotchas** (from the entry's attributes/body).
3. List the **alternatives they rated**, with the verdict (chosen/considered/rejected/watching) and reason.
4. Link their **tutorials/docs** (call `get_entry` to get `links`).
5. Only then add your own suggestion, clearly marked as yours.

Do not present a generic recommendation ahead of the owner's recorded choice.

## If there is no match

Say so, answer normally, then **offer to save** the result:

> "Want me to save this to your library?"

→ call `add_entry` with a concise title, the tool/choice, tags, and any links.

## If the request is ambiguous

Ask which task or tool they mean before searching, so the query is specific.

## Never

- Never invent library entries or claim a preference the library doesn't record.
- Never expose raw HTML/JSON; translate entries into plain language.
