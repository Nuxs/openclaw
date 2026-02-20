import type { Command } from "commander";
import { setVerbose } from "../../globals.js";
import { defaultRuntime } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { formatHelpExamples } from "../help-format.js";

export function registerShareCommands(program: Command) {
  const share = program
    .command("share")
    .description("Share local resources to the Web3 market")
    .showHelpAfterError();

  share
    .command("start")
    .description("Enable resource sharing and report to the index")
    .option("--provider-id <id>", "Override provider id (default: generated)")
    .option("--ttl <ms>", "Index TTL in milliseconds", "600000")
    .option("--no-report", "Skip index report call", false)
    .option("--verbose", "Verbose logging", false)
    .option("--debug", "Alias for --verbose", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["openclaw share start", "Enable resource sharing + report to index."],
          ["openclaw share start --no-report", "Enable sharing without reporting."],
          ["openclaw share start --provider-id provider-demo", "Use a fixed provider id."],
        ])}`,
    )
    .action(async (opts) => {
      setVerbose(Boolean(opts.verbose || opts.debug));
      const ttlMs = Number.isFinite(Number(opts.ttl)) ? Number(opts.ttl) : undefined;
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { shareStartCommand } = await import("../../commands/share.js");
        await shareStartCommand({
          providerId: typeof opts.providerId === "string" ? opts.providerId : undefined,
          report: Boolean(opts.report),
          ttlMs,
          runtime: defaultRuntime,
        });
      });
    });
}
