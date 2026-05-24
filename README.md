# Google AI Studio KaTeX/Markdown Display Fix Mobile

Mobile Firefox + Violentmonkey userscript for Google AI Studio.

## Install

Open this link on the phone with Violentmonkey installed:

https://raw.githubusercontent.com/ad2das/userscript-name-google-ai-studio-katex/main/google-ai-studio-katex-markdown-mobile.user.js

Violentmonkey should detect the `.user.js` file and show an install screen.

## What It Fixes

- KaTeX display math horizontal scrolling on mobile
- Markdown tables overflowing the screen
- Native vertical page scrolling
- Split `**bold**` / `__bold__` Markdown text in model responses
- Mobile readable Google/Samsung-like font stack
- Code/pre blocks with horizontal scrolling

## Target

- `https://aistudio.google.com/*`
- `https://*.aistudio.google.com/*`

## Notes

The script is intended for mobile Firefox with Violentmonkey, but it can also be installed in other userscript managers that support `GM_addStyle`.
