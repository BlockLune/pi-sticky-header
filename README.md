# pi-sticky-header

[![npm](https://img.shields.io/npm/v/pi-sticky-header)](https://www.npmjs.com/package/pi-sticky-header)
[![CI](https://github.com/BlockLune/pi-sticky-header/actions/workflows/ci.yml/badge.svg)](https://github.com/BlockLune/pi-sticky-header/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Keep a user prompt at the top of Pi's fullscreen terminal interface.
The header uses Pi's message colors and shows the message time and navigation arrows.
You can expand the prompt without a change to the original message in the transcript.

## Requirements

- Node.js **22.19 or later**.
- Pi with the **fullscreen** terminal interface.
- **pnpm 11.9.0** for development.

The tests use version **1.0.2** of `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`.

In this document:

- **Prompt** means a user message.
- **Transcript** means the message area in Pi.
- **Viewport** means the visible area of the transcript.
- **Host** means the Pi application that loads this extension.

## Install

Install the extension from npm:

```sh
pi install npm:pi-sticky-header
```

To install the latest version from GitHub, use this command:

```sh
pi install git:github.com/BlockLune/pi-sticky-header
```

Start Pi in fullscreen mode.
The header appears when you send a prompt.

## Use a local copy

Install the development dependencies:

```sh
pnpm install
```

Start Pi with the local extension:

```sh
pnpm dev
```

To load the extension for one run, use this command:

```sh
pi -e ./sticky-header.ts
```

To install the local directory as a Pi package, use this command:

```sh
pi install .
```

Pi uses fullscreen mode by default.
To select this mode explicitly, use this command:

```sh
pi --tui-mode fullscreen -e ./sticky-header.ts
```

The extension does not change the layout in regular, print, JSON, or RPC mode.
If you use `/sticky` in these modes, it reports that fullscreen mode is necessary.

After you change the extension files, use `/reload` in Pi.

## Header behavior

### Select a prompt

When Pi follows the end of the transcript, the header shows the latest prompt.
This also applies when a short reply leaves the viewport top in an earlier turn.

When you scroll to an earlier message, the selected mode controls the header:

- **auto**: Show the header when the prompt's last text row leaves the viewport.
  Hide it while the next prompt is visible at the viewport top.
  This is the default mode.
- **always**: Show the prompt for the turn at the viewport top.

### Expand a prompt

Click the header text to expand or collapse the prompt.
You can also use Pi's `app.tools.expand` shortcut.
Its default key is **Ctrl+O**.
The extension uses your configured shortcut.

An expanded prompt wraps to the terminal width.
This lets you read more of a long paragraph with no line breaks.
The header shows up to eight text rows and a count of the remaining rows.
A collapsed prompt uses one text row.
Long text ends with an ellipsis.

The header keeps two spaces between the text and the time or navigation arrows.
On a narrow terminal, it reduces this gap.
It hides the time first, then the arrows if necessary.

The extension keeps expansion state for each message instance.
It clears this state on a session or branch change.
Message times come from the active branch.

### Go to another prompt

Click **↑** or **↓** to select the previous or next prompt.
You can also use `/sticky prev` or `/sticky next`.

A short message might not reach the viewport top after a scroll request.
The header still shows the prompt that you selected.
Scroll again to return to automatic selection.

If the header shows the latest prompt, use `next` again to follow new output.

## Commands

| Command                       | Action                                      | Alias       |
| ----------------------------- | ------------------------------------------- | ----------- |
| `/sticky` or `/sticky toggle` | Enable or disable the header.               | —           |
| `/sticky prev`                | Go to the previous prompt.                  | `up`        |
| `/sticky next`                | Go to the next prompt.                      | `down`      |
| `/sticky expand`              | Expand or collapse the prompt.              | `open`      |
| `/sticky nav`                 | Show or hide the arrows.                    | `buttons`   |
| `/sticky time`                | Show or hide the message time.              | `timestamp` |
| `/sticky auto`                | Select automatic header mode.               | —           |
| `/sticky always`              | Keep the header visible.                    | —           |
| `/sticky status`              | Show the current settings and prompt index. | —           |

## Development

The `packageManager` field selects **pnpm 11.9.0**.
You can use Corepack to run this version.

| Command              | Action                                             |
| -------------------- | -------------------------------------------------- |
| `pnpm dev`           | Load the local extension in Pi.                    |
| `pnpm lint`          | Check the code with Oxlint.                        |
| `pnpm lint:fix`      | Apply available Oxlint fixes.                      |
| `pnpm format`        | Format the files with Oxfmt.                       |
| `pnpm format:check`  | Check the file format without changes.             |
| `pnpm typecheck`     | Run strict TypeScript checks without output files. |
| `pnpm test`          | Run the Vitest tests once.                         |
| `pnpm test:watch`    | Run tests again when files change.                 |
| `pnpm test:coverage` | Measure V8 test coverage and check the limits.     |
| `pnpm check`         | Run all quality checks.                            |
| `pnpm hooks:install` | Install the Git hooks manually.                    |
| `pnpm pack`          | Create the Pi package archive.                     |

### Git hooks and CI

A local install sets up **simple-git-hooks** when the directory contains a Git repository and development dependencies.

- **pre-commit**: Run lint-staged to check and format staged files only.
- **pre-push**: Run `pnpm check`.

The install script skips Git hooks in CI and directories without Git or development dependencies.

GitHub Actions runs the checks and creates a package archive on Node.js 22 and 24.
CI uses `pnpm install --frozen-lockfile`.
The same `pnpm check` command runs in CI, before a push, and before publication.

The install policy permits the esbuild build script only.
It does not run the optional SDK install scripts from host dependencies.

### Package structure

Pi loads TypeScript directly.
No bundler or `dist/` directory is necessary.

Host packages appear in `peerDependencies` and `devDependencies`, not in `dependencies`.
This prevents a second runtime copy of Pi.

```text
sticky-header.ts     Extension setup, commands, shortcuts, and cleanup
src/fullscreen.ts    Host layout access and transcript ScrollView selection
src/prompts.ts       Prompt position measurements and selection
src/header.ts        Expansion state, navigation, mouse input, and rendering
src/render.ts        Text cleanup, terminal layout, message times, and colors
test/               Unit tests and native layout integration tests
```

### Writing style

Use English for documentation, comments, test descriptions, and interface messages.
Use ASD-STE100 Simplified Technical English principles for about 80% of the wording.

- Write short sentences with one main idea.
- Use the active voice when practical.
- Start procedural steps with an instruction.
- Use the same term for the same item.
- Keep technical names, API identifiers, commands, and Unicode test data unchanged.

This is a writing target, not a claim of full ASD-STE100 compliance.

## Implementation and tests

The extension measures prompt positions from the rendered transcript on each frame.
It does not reuse positions based only on width and direct child count.
Tool boxes, nested messages, and streamed output can move prompts without a change to that count.
Pi's native render caches reduce the cost of these measurements.

The measurements use the ScrollView content width.
This width excludes the column for a permanent scrollbar.

The tests cover:

- Latest prompt selection at the end of the transcript.
- Streamed output and nested messages.
- Header changes during manual scrolling.
- Navigation to short messages.
- Unicode text and narrow terminals.
- Message times after branch changes and compaction.
- Session cleanup and configured shortcuts.
- Native mouse press and release events.
- Long paragraph expansion.
- Ellipsis color and spacing in light and dark themes.
- Pi's native layout engine with a fixed terminal height.

## Compatibility limits

Pi has no public API to add a fixed region above the transcript.
The extension therefore uses the private fullscreen `layoutRoot` field.
It also reads the private `text` field from `UserMessageComponent`.
Other scroll access uses public APIs.
The extension skips setup if it cannot use the host layout.

Each native user message must remain a complete, continuous block in the rendered transcript.
If another extension changes or wraps these blocks, test the two extensions together.
During cleanup, this extension does not replace a root layout that another extension installed later.

Automated tests use Pi's real message components, ScrollView, and layout engine.
Also test mouse input, colors, and scrolling in your terminal.

## License

[MIT](LICENSE)
