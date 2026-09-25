// Regenerates the static transcript fixtures in e2e/fixtures from e2e/helpers/transcript.ts.
import { TRANSCRIPTS, writeTranscript } from "../e2e/helpers/transcript";

for (const [name, lines] of Object.entries(TRANSCRIPTS)) writeTranscript("e2e/fixtures", name, [...lines]);
