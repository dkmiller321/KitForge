import os from "node:os";
import path from "node:path";

// Every path derives from os.homedir() so tests can point HOME at a temp directory.
export const claudeDir = () => path.join(os.homedir(), ".claude");
export const skillsDir = () => path.join(claudeDir(), "skills");
export const skillDir = (name: string) => path.join(skillsDir(), name);
export const manifestPath = (name: string) => path.join(skillDir(name), ".kitforge.json");
export const settingsPath = () => path.join(claudeDir(), "settings.json");
export const outboxDir = () => path.join(os.homedir(), ".kitforge", "outbox");
