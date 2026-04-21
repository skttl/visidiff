# visidiff

Visual regression testing tool for comparing screenshots between two environments.

## Features

- **URL Discovery**: Automatically discovers URLs from sitemaps, robots.txt, and web crawling
- **Smart Sampling**: Deterministic URL sampling with pattern grouping
- **Screenshot Capture**: Playwright-based screenshot capture with masking support
- **Diff Computation**: Pixel-level diff computation using odiff
- **Interactive Report UI**: Built-in web interface for reviewing screenshot differences
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

## Interactive Report UI

When you run `visidiff compare`, the tool automatically starts a local web server and opens your browser to an interactive report UI. The UI provides:

- **Results Table**: Filterable and sortable list of compared URLs with diff percentages
- **Side-by-Side View**: Compare original and updated screenshots side by side with synced scrolling
- **Overlay Slider**: Blend between original and updated images with keyboard controls (←/→ for 10% steps, 0-9 for exact values)
- **Diff Image View**: View pixel-level differences highlighted
- **Viewport Tabs**: Switch between different viewport sizes (desktop, tablet, mobile)

### CI/Non-Interactive Mode

For CI environments or automated workflows, use the `--no-server` flag to skip starting the report server:

```bash
pnpm --filter @visidiff/cli exec visidiff compare --no-server
```

This runs the comparison pipeline and saves results to the output directory without starting the web server.

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
