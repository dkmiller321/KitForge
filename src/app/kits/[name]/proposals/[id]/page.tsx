import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposalReview } from "@/components/proposal-review";
import { parseId } from "@/lib/http";
import { hunkLines } from "@/lib/kits/render";
import { filesForVersion, getKit } from "@/lib/kits/service";
import { getProposal } from "@/lib/proposals/service";

export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: { params: Promise<{ name: string; id: string }> }) {
  const { name, id } = await params;
  const proposalId = parseId(id);
  const proposal = proposalId === null ? null : getProposal(proposalId);
  const kit = getKit(name);
  if (!proposal || !kit || proposal.kitName !== name) notFound();

  const base = kit.versions.find((v) => v.semver === proposal.baseVersion)!;
  const files = new Map(filesForVersion(base.id).map((f) => [f.path, f.content]));
  const hunks = proposal.hunks.map((h) => {
    const replace = h.editedReplace ?? h.replaceText;
    return { ...h, replace, lines: hunkLines(files.get(h.filePath) ?? "", h.findText, replace) };
  });
  const sizeBefore = [...files.values()].reduce((n, c) => n + c.length, 0);
  const sizeDelta = hunks
    .filter((h) => h.decision !== "rejected")
    .reduce((n, h) => n + h.replace.length - h.findText.length, 0);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href={`/kits/${name}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← {name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Proposal #{proposal.id}</h1>
        <p className="text-sm text-muted-foreground">
          Against <span className="font-mono">{proposal.baseVersion}</span> · from the latest insights, covering feedback{" "}
          {proposal.feedbackIds.map((f) => `#${f}`).join(", ")}
          {proposal.instruction ? ` · “${proposal.instruction}”` : ""} · size {sizeDelta >= 0 ? "+" : ""}
          {sizeDelta} chars on {sizeBefore}
        </p>
      </div>
      <ProposalReview
        kit={name}
        proposalId={proposal.id}
        status={proposal.status}
        droppedCount={proposal.droppedCount}
        hunks={hunks}
      />
    </div>
  );
}
