#!/usr/bin/env node
// Entry for `npm link`: runs the TypeScript CLI through tsx from any working directory.
import { register } from "tsx/esm/api";

register();
await import(new URL("../src/cli/index.ts", import.meta.url).href);
