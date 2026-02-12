# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zupfnoter is a web-based editor for creating tablature (harp note) sheets for table harps (Veeh-Harfe, Zauberharfe, etc.) based on ABC notation. It runs in the browser, written primarily in Ruby using the **Opal** transpiler (Ruby-to-JavaScript). License: dual GPL and Commercial.

## Build & Development Commands

All build commands run from `30_sources/SRC_Zupfnoter/src/`:

```bash
# Development server (http://localhost:9292)
cd 30_sources/SRC_Zupfnoter/src
rake server

# Build application (compiles Ruby→JS via Opal, SCSS→CSS)
rake build

# Build web worker
rake build_worker

# Build CLI variant
rake build_cli

# Full deployment build (build + worker + user manual → deploy_files/webserver/)
rake deploy

# Update locale files
rake updateLocales

# Build configuration docs
rake buildConfigDoc

# Compile soundfonts from sf2 sources
rake buildSoundfonts
```

Initial setup:
```bash
cd 30_sources/SRC_Zupfnoter
bundle install
# Also need Node.js with: npm install (for uglify-js, browserify, blob, encoding, ajv, jspdf)
```

Docker alternative:
```bash
cd 30_sources/SRC_Zupfnoter
docker-compose up    # serves on port 9292
```

## Running Tests

Tests use RSpec, located in `30_sources/SRC_Zupfnoter/testcases/`:

```bash
cd 30_sources/SRC_Zupfnoter/testcases
rspec confstack_spec.rb      # Configuration stack tests
rspec commandStack_spec.rb   # Command/undo stack tests
```

## Architecture

### Model Transformation Pipeline

The core architecture follows a linear transformation pipeline:

```
ABC Text (user input)
  → ABC Model (parsed by abc2svg)
    → Music Model / Harpnotes (Playable, Note, Rest, Goto, Flowline, Jumpline, Synchline)
      → Drawing Model (format-independent: Ellipse, Path, etc.)
        → SVG (SvgEngine) or PDF (PdfEngine)
```

### Key Source Files (`30_sources/SRC_Zupfnoter/src/`)

- **`application.rb`** — Main Opal application entry point
- **`controller.rb`** — Main UI controller, event handling, layout orchestration
- **`controller_command_definitions.rb`** — All command definitions and handlers
- **`harpnotes.rb`** — Core music model: Harpnote representation classes (largest source file)
- **`abc2svg_to_harpnotes.rb`** — Transforms abc2svg parser output into Harpnote model
- **`svg_engine.rb`** / **`pdf_engine.rb`** — Rendering engines for Drawing Model output
- **`confstack.rb`** / **`confstack2.rb`** — Layered configuration stack (key abstraction)
- **`init_conf.rb`** — Default configuration setup
- **`config-form.rb`** — Configuration UI form generation
- **`i18n.rb`** — Internationalization (German primary, English fallback)
- **`harpnote_player.rb`** — MIDI playback control
- **`command-controller.rb`** — Command/undo stack management

### Opal-JavaScript Bridge

Files prefixed with `opal-` are Ruby wrappers around JavaScript libraries:
- `opal-abc2svg.rb`, `opal-jspdf.rb`, `opal-jszip.rb`, `opal-svg.rb`, `opal-w2ui.rb`, `opal-ajv.rb`, `opal-dropboxjs.rb`, etc.

Inline JavaScript is embedded in Ruby via `%x{ ... }` blocks.

### UI Stack

- **w2ui** — Layout, forms, dialogs
- **Ace Editor** — ABC notation editing with custom syntax highlighting (`vendor/ace/mode-abc.js`)
- **jQuery 3.0** — DOM manipulation
- **SVG.js** — SVG rendering and drag-and-drop interaction

### Directory Layout

- `30_sources/SRC_Zupfnoter/src/` — Ruby/Opal application source (37 files)
- `30_sources/SRC_Zupfnoter/public/` — Static assets (CSS, demos, locales, soundfonts, icons)
- `30_sources/SRC_Zupfnoter/vendor/` — Third-party JS libraries (abc2svg, ace, w2ui, jspdf, jQuery, etc.)
- `30_sources/SRC_Zupfnoter/testcases/` — RSpec tests
- `30_sources/DD_Zupfnoter/` — Design documentation
- `30_sources/UD_Zupfnoter-Handbuch/` — User manual (German, markdown)

### Build Output

- `src/build.js` — Compiled main application JavaScript
- `public/znworker.js` — Web worker script
- `public/index.css` — Compiled from SCSS
- `deploy_files/webserver/` — Production-ready distribution

## Key Concepts

- **Opal 0.11** transpiles all Ruby source to JavaScript; the server (`config.ru`) uses `Opal::Sprockets::Server` for development with source maps
- **Confstack** is the layered configuration system — configs are pushed/popped as layers, with deep key access via dotted paths
- **Extracts** are selectable subsets of a tune for printing (e.g., different parts on A3 vs A4)
- **Flowlines** connect sequential notes visually; **Jumplines** indicate musical jumps; **Synchlines** show simultaneously played notes across voices
- Version is derived from `git describe` at build time (see `git_describe` in Rakefile)

## Branching Model

Uses Git Flow: feature branches from `develop`, releases merged to `master`. Release naming: `V_1.x.0_RCn`.
