/**
 * Zod schemas for send_message tool parameters.
 */

import { z } from "zod";

export const sendMessageSchema = {
  protocol: z
    .enum(["osc", "fudi"])
    .default("osc")
    .describe(
      'Protocol: "osc" (UDP, binary) or "fudi" (TCP, text). Default: "osc".',
    ),
  host: z
    .string()
    .default("127.0.0.1")
    .describe("Target host. Default: 127.0.0.1 (localhost)."),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .describe("Target port. Default: 9000 (OSC) or 3000 (FUDI)."),
  address: z
    .string()
    .min(1)
    .describe(
      'Message address/selector. OSC: "/pd/tempo". FUDI: "tempo". ' +
        "Common: /pd/tempo, /pd/note, /pd/cc, /pd/bang, /pd/param/<name>.",
    ),
  args: z
    .array(z.union([z.string(), z.number()]))
    .default([])
    .describe("Message arguments (integers, floats, or strings)."),
};
