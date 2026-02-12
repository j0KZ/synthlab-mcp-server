/**
 * MCP Bridge template — Pd-side receiver for OSC/FUDI messages.
 *
 * Generates a patch that receives messages from the send_message tool
 * and routes them to [send] buses for use in other Pd patches.
 *
 * OSC variant: [netreceive -u -b PORT] → [oscparse] → [route /pd] → dispatch
 * FUDI variant: [netreceive PORT] → dispatch
 *
 * Each route creates a [send pd-<route>] bus. User patches subscribe
 * via [receive pd-tempo], [receive pd-note], etc.
 */

import type { PatchNodeSpec, PatchConnectionSpec } from "../core/serializer.js";
import type { RackableSpec, PortInfo } from "./port-info.js";
import { validateBridgeParams } from "./validate-params.js";

export interface BridgeParams {
  protocol?: "osc" | "fudi";
  port?: number;
  routes?: string[];
}

const DEFAULT_ROUTES = ["tempo", "note", "cc", "bang", "param"];
const DEFAULT_OSC_PORT = 9000;
const DEFAULT_FUDI_PORT = 3000;

export function buildBridge(params: BridgeParams = {}): RackableSpec {
  validateBridgeParams(params as Record<string, unknown>);

  const protocol = params.protocol ?? "osc";
  const routes = params.routes && params.routes.length > 0
    ? params.routes
    : DEFAULT_ROUTES;
  const port = params.port ?? (protocol === "osc" ? DEFAULT_OSC_PORT : DEFAULT_FUDI_PORT);

  const nodes: PatchNodeSpec[] = [];
  const connections: PatchConnectionSpec[] = [];

  // Title
  nodes.push({
    type: "text",
    args: [`MCP Bridge (${protocol.toUpperCase()}, port ${port})`],
    x: 50,
    y: 10,
  });

  if (protocol === "osc") {
    // OSC: netreceive → oscparse → route /pd → route <routes> → send per-route

    // [1] netreceive -u -b <port>
    nodes.push({
      type: "obj",
      name: "netreceive",
      args: ["-u", "-b", port],
      x: 50,
      y: 50,
    });

    // [2] oscparse
    nodes.push({ type: "obj", name: "oscparse", x: 50, y: 90 });

    // [3] route /pd
    nodes.push({
      type: "obj",
      name: "route",
      args: ["/pd"],
      x: 50,
      y: 130,
    });

    // [4] route <routes...>
    nodes.push({
      type: "obj",
      name: "route",
      args: routes,
      x: 50,
      y: 170,
    });

    // netreceive → oscparse → route /pd → route <routes>
    connections.push({ from: 1, to: 2 });
    connections.push({ from: 2, to: 3 });
    connections.push({ from: 3, to: 4 });

    // Per-route send nodes: [5..5+N-1]
    const sendStartIdx = 5;
    for (let i = 0; i < routes.length; i++) {
      nodes.push({
        type: "obj",
        name: "send",
        args: [`pd-${routes[i]}`],
        x: 50 + i * 120,
        y: 210,
      });
      connections.push({ from: 4, outlet: i, to: sendStartIdx + i });
    }
  } else {
    // FUDI: netreceive → route <routes> → send per-route

    // [1] netreceive <port>
    nodes.push({
      type: "obj",
      name: "netreceive",
      args: [port],
      x: 50,
      y: 50,
    });

    // [2] route <routes...>
    nodes.push({
      type: "obj",
      name: "route",
      args: routes,
      x: 50,
      y: 90,
    });

    // netreceive → route
    connections.push({ from: 1, to: 2 });

    // Per-route send nodes: [3..3+N-1]
    const sendStartIdx = 3;
    for (let i = 0; i < routes.length; i++) {
      nodes.push({
        type: "obj",
        name: "send",
        args: [`pd-${routes[i]}`],
        x: 50 + i * 120,
        y: 130,
      });
      connections.push({ from: 2, outlet: i, to: sendStartIdx + i });
    }
  }

  // Ports: each route is a control output
  const ports: PortInfo[] = routes.map((route, i) => {
    const sendIdx = protocol === "osc" ? 5 + i : 3 + i;
    return {
      name: `pd-${route}`,
      type: "control" as const,
      direction: "output" as const,
      nodeIndex: sendIdx,
      port: 0,
    };
  });

  return { spec: { title: undefined, nodes, connections }, ports, parameters: [] };
}
