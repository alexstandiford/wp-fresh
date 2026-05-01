#!/usr/bin/env node
import("../dist/cli/index.js").catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
