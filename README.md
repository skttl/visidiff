# visidiff

Visual regression testing tool for comparing screenshots between two environments.

## Features

- **URL Discovery**: Automatically discovers URLs from sitemaps, robots.txt, and web crawling
- **Smart Sampling**: Deterministic URL sampling with pattern grouping
- **Screenshot Capture**: Playwright-based screenshot capture with masking support
- **Diff Computation**: Pixel-level diff computation using odiff
- **CLI**: Easy-to-use command-line interface

## Installation

```bash
pnpm install
```

## Usage

### Initialize config

```bash
pnpm --filter @visidiff/cli exec visidiff init
```

This creates a `visidiff.config.js` file in the current directory.

### Run comparison

```bash
pnpm --filter @visidiff/cli exec visidiff compare
```

### Re-screenshot (clear cache)

```bash
pnpm --filter @visidiff/cli exec visidiff rescreenshot
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build core package
pnpm --filter @visidiff/core build

# Typecheck
pnpm --filter @visidiff/core typecheck
pnpm --filter @visidiff/cli typecheck
```

## License

MIT
