# Samuel's Code Lab

A Python practice app: random coding tasks, a code-word library that unlocks as you go,
a level test, and **My Game**, where each task builds part of a text battle game.

## How to open it

Double-click `index.html` to open it in your browser. Nothing needs installing.

## What works where

| Feature | In Claude | Opened from this folder or GitHub Pages |
|---|---|---|
| Tasks, hints, library, level test | Yes | Yes |
| Code editor with VS Code colours | Yes | Yes |
| My Game and your game code | Yes | Yes |
| **Check my code** (the AI checker) | Yes | No, use **I did it** instead |
| **Ask** helper | Yes | No |
| Saving progress | Your Claude account | This browser only |

## Files

- `index.html` is the whole app.
- `editor-source/` is the source of the code editor. The built editor is already pasted
  inside `index.html`, so you only need this folder to change the editor.
  To rebuild it, run `npm install` then `npm run build`, and replace the bundle in `index.html` with `cm.js`.

## Credits

The code editor is built with [CodeMirror 6](https://codemirror.net) (MIT licence)
and [codemirror-indentation-markers](https://github.com/replit/codemirror-indentation-markers) (MIT licence).
