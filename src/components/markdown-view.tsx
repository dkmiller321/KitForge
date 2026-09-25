import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function splitFrontmatter(content: string): { meta: [string, string][]; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!m) return { meta: [], body: content };
  const meta = m[1]
    .split(/\r?\n/)
    .map((line) => /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line))
    .filter((x): x is RegExpExecArray => x !== null)
    .map((x) => [x[1], x[2]] as [string, string]);
  return { meta, body: content.slice(m[0].length) };
}

export function MarkdownView({ path, content }: { path: string; content: string }) {
  if (!/\.(md|markdown)$/i.test(path)) {
    return <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs">{content}</pre>;
  }
  const { meta, body } = splitFrontmatter(content);
  return (
    <div>
      {meta.length > 0 && (
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-muted/60 px-4 py-3 font-mono text-xs">
          {meta.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    </div>
  );
}
