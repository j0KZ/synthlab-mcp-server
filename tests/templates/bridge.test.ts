import { describe, it, expect } from "vitest";
import { buildTemplateWithPorts } from "../../src/templates/index.js";
import { buildPatch } from "../../src/core/serializer.js";

describe("bridge template", () => {
  it("OSC bridge has netreceive -u -b 9000, oscparse, route /pd", () => {
    const r = buildTemplateWithPorts("bridge", {});
    const pd = buildPatch(r.spec);

    expect(pd).toContain("netreceive -u -b 9000");
    expect(pd).toContain("oscparse");
    expect(pd).toContain("route /pd");
    // Default routes: tempo, note, cc, bang, param
    expect(pd).toContain("route tempo note cc bang param");
    // Send buses
    expect(pd).toContain("send pd-tempo");
    expect(pd).toContain("send pd-note");
    expect(pd).toContain("send pd-cc");
    expect(pd).toContain("send pd-bang");
    expect(pd).toContain("send pd-param");
  });

  it("FUDI bridge has netreceive 3000, no oscparse", () => {
    const r = buildTemplateWithPorts("bridge", { protocol: "fudi" });
    const pd = buildPatch(r.spec);

    expect(pd).toContain("netreceive 3000");
    expect(pd).not.toContain("oscparse");
    expect(pd).not.toContain("route /pd");
    // Routes dispatch directly
    expect(pd).toContain("route tempo note cc bang param");
    expect(pd).toContain("send pd-tempo");
  });

  it("custom routes produce correct number of send nodes", () => {
    const r = buildTemplateWithPorts("bridge", {
      protocol: "osc",
      port: 8000,
      routes: ["tempo", "note"],
    });
    const pd = buildPatch(r.spec);

    expect(pd).toContain("netreceive -u -b 8000");
    expect(pd).toContain("route tempo note");
    expect(pd).toContain("send pd-tempo");
    expect(pd).toContain("send pd-note");
    // Should NOT have default routes we didn't specify
    expect(pd).not.toContain("send pd-cc");
    expect(pd).not.toContain("send pd-bang");

    // Ports should match routes
    expect(r.ports).toHaveLength(2);
    expect(r.ports[0].name).toBe("pd-tempo");
    expect(r.ports[1].name).toBe("pd-note");
  });
});
