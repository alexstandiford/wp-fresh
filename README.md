# wp-fresh

A fleet manager for ephemeral WordPress test environments built on
[WordPress Playground](https://wordpress.github.io/wordpress-playground/).
Declare environments and runnable strategies as JSON, execute them locally
or via an MCP server. Designed primarily for AI agents that need to spin up
configured WordPress installs, smoke-test plugin builds, and capture
screenshots without the overhead of Docker.

> **Status:** alpha. APIs and on-disk formats may change.

## Concepts

- **Environment** — a declarative WordPress install (Blueprint + WP/PHP
  versions + tags). File-backed, reusable across runs.
- **Strategy** — a pluggable operation that runs against a provisioned
  instance. Built-ins: `smoke`, `capture`, `composite`.
- **Run** — selects environments (by id or tag set) and a sequence of
  strategy invocations. Emits a manifest.

Strategies don't share state within a run; sequencing via `runIf` is the
only coordination. Composites bundle other strategies into a reusable unit.

## Install

Requires Node.js >= 20.18.

```bash
git clone https://github.com/alexstandiford/wp-fresh
cd wp-fresh
npm install
npm run build
npm link
```

`playwright` is a peer dependency required by the `capture` strategy:

```bash
npm install -g playwright
npx playwright install chromium
```

## CLI usage

### `wpfresh run` — execute a run, capture a manifest

```bash
# Run the bundled wp-bare smoke check
wpfresh run --run wpfresh/runs/wp-smoke.json

# Disable snapshot caching (always run blueprint cold)
wpfresh run --run wpfresh/runs/wp-smoke.json --no-snapshot

# Use a custom environment directory
wpfresh run --env-dir ./my-envs --run ./my-runs/smoke.json

# Single-environment mode
wpfresh run --env ./envs/siren-woo.json --run ./runs/quick.json
```

Manifests land in `wpfresh-runs/<run_id>.json`. Capture artifacts land in
`wpfresh-screenshots/<run_id>/<env_id>/<strategy_id>/`.

### `wpfresh up` — spin up a live instance you can poke at

Holds an instance open in the foreground. Prints URL + admin credentials,
tears down on Ctrl+C (or after `--ttl <seconds>` elapses).

```bash
# Vanilla WP, latest/8.3, no plugin — quick scratch instance
wpfresh up

# Vanilla WP + an ad-hoc blueprint (file or bundle directory)
wpfresh up --blueprint /path/to/blueprint.json
wpfresh up --blueprint /path/to/blueprint-bundle/

# Pin versions (works with or without --blueprint)
wpfresh up --wp 6.7 --php 8.2

# Use a configured environment from <project_dir>/wpfresh/environments/
wpfresh up siren-essentials-woo

# Auto-destroy after 10 minutes
wpfresh up siren-essentials-woo --ttl 600
```

Snapshot cache is shared across modes: an ad-hoc `--blueprint` invocation
that resolves to the same blueprint contents + WP/PHP versions as a
configured environment will hit the same on-disk snapshot.

## MCP usage (Claude Code)

Add wp-fresh as a stdio MCP server. In `~/.claude.json`:

```json
{
  "mcpServers": {
    "wpfresh": {
      "command": "wpfresh",
      "args": ["mcp"]
    }
  }
}
```

Restart Claude Code. The agent now has eight tools:

**Run-style (one-shot, returns a manifest):**

- `list_environments(project_dir, tags?)` — list environments in a project.
- `list_strategies()` — list built-in strategies with their config schemas.
- `run(project_dir, run, use_snapshots?)` — execute a run, return the manifest.
- `inspect_manifest(project_dir, run_id)` — read a previously-written manifest.
- `clear_snapshot(project_dir, env_id)` — delete a cached snapshot.

**Persistent instances (for live troubleshooting):**

- `provision_persistent(project_dir, env_id, ttl_seconds?)` — provision an
  instance and keep it running. Returns URL + admin credentials. Default TTL
  is 30 min; pass `0` for no TTL.
- `list_instances()` — enumerate live instances tracked by this server.
- `destroy(instance_id)` — dispose an instance and release its snapshot lock.

The persistent-instance tools are the agent's recovery loop: when a smoke
fails, the agent can `provision_persistent` against the failing env, fetch
or browse the live admin to investigate, then `destroy`.

Tool descriptions tell the agent when to reach for which tool. Configs are
typed by JSON Schema returned from `list_strategies`.

The MCP server tracks persistent instances in-process: when the server
exits (SIGINT/SIGTERM), all tracked instances are torn down and their
snapshot locks released.

## Project layout

```
your-project/
├── wpfresh/
│   ├── environments/
│   │   ├── siren-bare.json
│   │   └── siren-woo.json
│   ├── blueprints/
│   │   ├── siren-bare.blueprint.json
│   │   └── siren-woo.blueprint.json
│   └── runs/
│       └── pr-smoke.json
├── wpfresh-runs/                  # manifests (gitignored)
└── wpfresh-screenshots/           # capture artifacts (gitignored)
```

Snapshots are cached at `~/.wpfresh/snapshots/<key>/` keyed off
`sha256(blueprint + wp_version + php_version + playground_cli_major)`. The
first run for a key populates the directory; subsequent runs restore from it
in seconds via Playground's `mount-before-install` mechanism.

## Schema reference

JSON Schemas (Draft 2020-12) are emitted to `dist/schemas/generated/` after
`npm run build`:

- `environment.schema.json`
- `run.schema.json`
- `tag-selector.schema.json`
- `strategy-invocation.schema.json`
- `composite-strategy.schema.json`
- `manifest.schema.json`

Reference them via `$schema` in your env/run files for IDE autocomplete.

## Built-in strategies

### `smoke`

Probe URLs and check status + body for PHP errors. Default failure
conditions: PHP fatal in body, 5xx status, white screen on a 200.

```json
{
  "ref": "smoke",
  "config": {
    "urls": [
      { "path": "/", "expect_status": 200 },
      { "path": "/wp-admin/", "auth": true, "expect_status": 200 }
    ],
    "fail_on": ["php_fatal", "5xx", "white_screen"]
  }
}
```

### `capture`

Take screenshots via Playwright. Per-URL viewport, optional auth, optional
selector wait. Smoke-resolution defaults are tuned for cheap AI consumption
(~1500 tokens per screenshot).

```json
{
  "ref": "capture",
  "config": {
    "resolution": "1280x800",
    "urls": [
      { "path": "/wp-admin/admin.php?page=siren", "name": "siren-overview", "auth": true }
    ]
  }
}
```

### `composite`

Run a sequence of inner strategies, each with its own `runIf`.

```json
{
  "ref": "composite",
  "config": {
    "strategies": [
      { "ref": "smoke", "config": { ... } },
      { "ref": "capture", "runIf": "previous-passed", "config": { ... } }
    ]
  }
}
```

## Development

```bash
npm test              # unit tests (vitest)
npm run test:slow     # integration tests against a real Playground
npm run test:all      # both
npm run typecheck     # tsc against src/test/scripts
npm run build         # compile + emit JSON Schema files
```

## License

GPL-2.0-or-later. See [LICENSE](./LICENSE).
