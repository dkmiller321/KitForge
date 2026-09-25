import { CliError, errorCode, request } from "./api";

export async function note(text: string, opts: { rating?: string; kit?: string }): Promise<string> {
  let rating: number | undefined;
  if (opts.rating !== undefined) {
    rating = Number(opts.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new CliError("--rating must be a whole number from 1 to 5");
  }

  const query = opts.kit ? `?kit=${encodeURIComponent(opts.kit)}` : "";
  const runsRes = await request(`/api/runs${query}`);
  if (!runsRes.ok) throw new CliError(`KitForge returned ${runsRes.status}`);
  const runs = (await runsRes.json()) as { id: number }[];
  if (runs.length === 0) throw new CliError("No runs yet");

  const runId = runs[0].id;
  const res = await request(`/api/runs/${runId}/notes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, rating }),
  });
  if (!res.ok) {
    const code = await errorCode(res);
    throw new CliError(`KitForge returned ${res.status}${code ? ` (${code})` : ""}`);
  }
  return `Added note to run #${runId}`;
}
