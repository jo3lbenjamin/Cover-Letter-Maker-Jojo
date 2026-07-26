import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

let app: import("express").Express;

beforeAll(async () => {
  process.env.VERCEL = "1";
  const mod = await import("../src/index.js");
  app = mod.default;
});

describe("POST /api/job/match", () => {
  it("rejects a request with missing job_posting", async () => {
    const res = await request(app)
      .post("/api/job/match")
      .send({
        candidate_profile: {
          name: "Jane Doe",
          location: "Toronto",
          phone: "555-0199",
          email: "jane@example.com",
          skills: [],
          experiences: [],
        },
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects a request with an invalid candidate_profile", async () => {
    const res = await request(app)
      .post("/api/job/match")
      .send({ candidate_profile: { name: "" }, job_posting: "Backend Engineer role" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
