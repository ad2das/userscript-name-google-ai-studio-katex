# Google AI Studio KaTeX/Markdown Display Fix Mobile

Mobile Firefox + Violentmonkey userscript for Google AI Studio.

## Install

Open this link on the phone with Violentmonkey installed:

https://raw.githubusercontent.com/ad2das/userscript-name-google-ai-studio-katex/main/aaa.user.js

Violentmonkey should detect the `.user.js` file and show an install screen.

## What It Fixes

- KaTeX display math horizontal scrolling on mobile
- Markdown tables overflowing the screen
- Literal `<br>`, `<br/>`, and `<br />` markers shown inside completed table cells,
  including markers split across multiple inline nodes
- Native vertical page scrolling
- Split `**bold**` / `__bold__` Markdown text in model responses
- Mobile readable Google/Samsung-like font stack
- Code/pre blocks with horizontal scrolling
- Long-running AI Studio document sessions kept warm without reloading the tab
- A Google-auth/session preflight before stale Run/`Ctrl+Enter` submissions

## Target

- `https://aistudio.google.com/*`
- `https://*.aistudio.google.com/*`

## Notes

The script is intended for mobile Firefox with Violentmonkey. It uses standard browser
DOM APIs and can also run in other userscript managers.

Version 1.6.2 no longer uses a privileged GM API. Violentmonkey may inject it into
the page context when allowed and safely fall back to the content context. The script
does not retry a failed generation. It refreshes an exposed Google auth token when
needed, warms the authenticated AI Studio document session before generation, and
blocks all answer-DOM repair while AI Studio is streaming.
