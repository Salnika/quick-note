# Quick Note

[![CI](https://github.com/Salnika/quick-note/actions/workflows/ci.yml/badge.svg)](https://github.com/Salnika/quick-note/actions/workflows/ci.yml)
[![Release](https://github.com/Salnika/quick-note/actions/workflows/release.yml/badge.svg)](https://github.com/Salnika/quick-note/actions/workflows/release.yml)
[![Deploy](https://github.com/Salnika/quick-note/actions/workflows/deploy.yml/badge.svg)](https://github.com/Salnika/quick-note/actions/workflows/deploy.yml)

Minimal markdown notes with live preview and sharable URLs.

## Features
- Split editor + preview with inline formatting toolbar.
- Content stored in the URL hash (no backend).
- Export to `.md` and copy link from the header.
- Single-file build for offline use.

## Development
```bash
bun install
bun run dev
```

## Build
```bash
bun run build
bun run preview
```

## Release
Tags trigger:
- GitHub Pages deploy
- Changelog generation
- Release artifact with `dist/index.html`
