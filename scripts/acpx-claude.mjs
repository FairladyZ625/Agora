#!/usr/bin/env node

import { main } from "./acpx-delegate.mjs";

main(["--agent", "claude", ...process.argv.slice(2)]).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
