import Link from "next/link";

/** One `changelog-entry` per `- ` line; `#12` references become feedback links. */
export function Changelog({ markdown }: { markdown: string }) {
  const lines = markdown
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);
  return (
    <ul className="space-y-1 text-sm">
      {lines.map((line, i) => (
        <li key={i} data-testid="changelog-entry" className="flex gap-2 before:text-muted-foreground before:content-['–']">
          <span>
            {line.split(/(#\d+)/).map((part, j) => {
              const id = /^#(\d+)$/.exec(part)?.[1];
              return id ? (
                <Link
                  key={j}
                  href={`/inbox?tab=resolved#feedback-${id}`}
                  data-testid="changelog-feedback-link"
                  data-feedback-id={id}
                  className="font-mono text-forge hover:underline"
                >
                  {part}
                </Link>
              ) : (
                <span key={j}>{part}</span>
              );
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}
