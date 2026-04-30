# wp-fresh

Spin up a fresh, throwaway WordPress install with one command.

```bash
$ wp-fresh
WordPress is ready.

  URL:        http://localhost:8900
  Admin:      http://localhost:8900/wp-admin   (admin / password)
  Sandbox:    /tmp/wp-fresh-20260430-133800
```

## Why

If you work on WordPress plugins or themes, you often need a clean install just
to check one thing: does this hook fire on a fresh site, does this migration
work, does this plugin conflict with that one. The official tooling
(`@wordpress/env`) handles the heavy lifting, but in practice you hit some
papercuts:

- `npx @wordpress/env start` hard-codes ports `8888`/`8889`, so the second
  sandbox you try to run collides with the first.
- `npx --yes @wordpress/env` sometimes fails on npm dep resolution depending on
  your Node version.
- Every throwaway directory you create reinstalls the same ~400 packages.
- Cleaning up afterwards means remembering which `/tmp` dir held what.

`wp-fresh` is a small bash wrapper that smooths over all of that. Run one
command, get a fresh WordPress site on a free port, and tear it down by name
when you're done.

## Install

Requires `bash`, `node`/`npm`, and `docker`.

```bash
curl -o ~/.local/bin/wp-fresh https://raw.githubusercontent.com/alexstandiford/wp-fresh/main/wp-fresh
chmod +x ~/.local/bin/wp-fresh
```

Make sure `~/.local/bin` is on your `PATH`.

## Usage

```bash
wp-fresh                    # Create and start an auto-named sandbox
wp-fresh my-test            # Create and start a sandbox named "my-test"
wp-fresh list               # Show all wp-fresh sandboxes
wp-fresh destroy my-test    # Stop and delete a sandbox
wp-fresh destroy --all      # Destroy every wp-fresh sandbox
```

Each sandbox lives at `/tmp/wp-fresh-<name>/` and contains a single
`.wp-env.json` file. The default admin login is `admin` / `password` —
`@wordpress/env` defaults, not anything `wp-fresh` overrides.

To run `wp-cli` against a sandbox, the create command prints the exact
invocation. It looks like:

```bash
(cd /tmp/wp-fresh-my-test && \
  ~/.local/share/wp-fresh/node_modules/.bin/wp-env run cli wp plugin list)
```

## How it works

`wp-fresh` is ~120 lines of bash. The interesting bits:

- **Shared installer.** On first run, it does one `npm install @wordpress/env`
  into `~/.local/share/wp-fresh/`. Every sandbox after that reuses the same
  node_modules, so a new install takes seconds instead of a minute.
- **Free ports.** Before starting, it scans `ss -tlnH` for occupied ports and
  picks the first free port at or above `8900` for the dev site, plus one
  ~100 above that for the tests site. No more port collisions when you have
  five sandboxes running.
- **Sandboxes are just directories.** Each sandbox is a plain directory in
  `/tmp` with a generated `.wp-env.json`. `@wordpress/env` keys its container
  state off the directory hash, so independent sandboxes don't step on each
  other.
- **Cleanup is honest.** `wp-fresh destroy` runs `wp-env destroy` to remove
  containers and volumes, then removes the directory. `--all` does the same
  for every sandbox under the `wp-fresh-` prefix.

That's the whole story. Read [`wp-fresh`](./wp-fresh) — it's short.

## Configuration

One environment variable:

- `WP_FRESH_HOME` — where to install the shared `@wordpress/env`. Defaults to
  `~/.local/share/wp-fresh`.

If you want PHP versions other than 8.2, edit the generated `.wp-env.json`
inside the sandbox and run `wp-env start` again. `wp-fresh` doesn't try to
expose every `@wordpress/env` knob — it's a fast path for the common case.

## License

MIT. See [LICENSE](./LICENSE).
