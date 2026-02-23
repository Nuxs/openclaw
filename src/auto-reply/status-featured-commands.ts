/**
 * Featured command keys — overlay for status.ts
 *
 * Commands listed here get a [featured] badge in /commands output.
 * Keeping this in a separate file avoids inline edits to the
 * upstream formatCommandEntry() function.
 */

export const FEATURED_COMMAND_KEYS = new Set<string>(["web3-market"]);
