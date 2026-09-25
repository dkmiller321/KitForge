import fs from "node:fs";
import path from "node:path";
import { CliError } from "./api";
import { settingsPath } from "./paths";

export const HOOK_COMMAND = "kit report";

interface HookCommand {
  type: string;
  command?: string;
}

interface HookEntry {
  matcher?: string;
  hooks?: HookCommand[];
}

type Settings = Record<string, unknown> & { hooks?: Record<string, unknown> };

/** Returns settings with exactly one SessionEnd `kit report` command, leaving everything else untouched. */
export function mergeHookSettings(existing: unknown, command = HOOK_COMMAND): Settings {
  const settings: Settings =
    existing && typeof existing === "object" && !Array.isArray(existing) ? { ...(existing as Settings) } : {};
  const hooks = settings.hooks && typeof settings.hooks === "object" ? { ...settings.hooks } : {};
  const sessionEnd = Array.isArray(hooks.SessionEnd) ? (hooks.SessionEnd as HookEntry[]) : [];
  const present = sessionEnd.some((entry) => entry.hooks?.some((h) => h.type === "command" && h.command === command));
  hooks.SessionEnd = present ? sessionEnd : [...sessionEnd, { hooks: [{ type: "command", command }] }];
  settings.hooks = hooks;
  return settings;
}

export function installHook(): string {
  const file = settingsPath();
  let existing: unknown = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, "utf8");
    if (raw.trim()) {
      try {
        existing = JSON.parse(raw);
      } catch {
        throw new CliError(`${file} is not valid JSON; fix it and run kit hook install again.`);
      }
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(mergeHookSettings(existing), null, 2)}\n`, "utf8");
  return `SessionEnd hook installed in ${file}`;
}
