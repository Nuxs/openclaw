import type { SessionEntry } from "../../config/sessions/types.js";
import {
  deriveStewardHeartbeatBacklog,
  deriveStewardResearchBacklog,
  resolveStewardAutonomyPosture,
  resolveStewardCadence,
} from "./growth-loop.js";

export function buildStewardHeartbeatContext(sessionEntry?: SessionEntry): string | undefined {
  if (!sessionEntry?.steward) {
    return undefined;
  }

  const heartbeatBacklog = deriveStewardHeartbeatBacklog(sessionEntry);
  const researchBacklog = deriveStewardResearchBacklog(sessionEntry);
  const cadence = resolveStewardCadence(sessionEntry);
  const posture = resolveStewardAutonomyPosture(sessionEntry);

  const lines = [
    "## Steward Heartbeat Lane",
    "This run is a bounded steward follow-up. Stay paste-safe, exception-first, and avoid reopening already-settled work.",
    `Autonomy posture: ${posture}`,
    `Cadence: ${cadence.label}`,
    "Only work these heartbeat queues this cycle:",
    ...heartbeatBacklog.slice(0, 5).map((entry) => `- ${entry}`),
    researchBacklog[0]
      ? "If the operational queues are quiet, advance at most one research item using `web3.market.steward.research`:"
      : undefined,
    ...researchBacklog.slice(0, 2).map((entry) => `- ${entry}`),
    "If every listed queue is already clear, reply HEARTBEAT_OK.",
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}
