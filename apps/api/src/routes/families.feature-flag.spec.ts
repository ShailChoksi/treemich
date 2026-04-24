import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/env.js")>();
  return {
    ...actual,
    isFamilyModelEnabled: () => false
  };
});

describe("family routes when TREEMICH_FAMILY_MODEL_ENABLED is off", () => {
  it("does not register /families or /people/:id/families when the flag is disabled", async () => {
    const { registerFamilyRoutes } = await import("./families.js");
    const app = Fastify();
    await app.register(registerFamilyRoutes);
    await app.ready();

    const list = await app.inject({ method: "GET", url: "/families" });
    expect(list.statusCode).toBe(404);

    const forPerson = await app.inject({ method: "GET", url: "/people/p1/families" });
    expect(forPerson.statusCode).toBe(404);

    await app.close();
  });

  it("does not register family life-event routes when the flag is disabled", async () => {
    const { registerFamiliesLifeEventsRoutes } = await import("./families-life-events.js");
    const app = Fastify();
    await app.register(registerFamiliesLifeEventsRoutes);
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/families/f1/life-events" });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
