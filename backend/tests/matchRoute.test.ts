import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";

vi.mock("../src/services/llm.js", () => ({
  chatCompletion: vi.fn(),
}));

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

  it("returns a 500 (not a fake 0% success) when Stage 1 parsing fails on both attempts", async () => {
    const { chatCompletion } = await import("../src/services/llm.js");
    vi.mocked(chatCompletion).mockResolvedValue("not json");

    const res = await request(app)
      .post("/api/job/match")
      .send({
        candidate_profile: {
          name: "Jane Doe",
          location: "Toronto",
          phone: "555-0199",
          email: "jane@example.com",
          skills: ["Python"],
          experiences: [],
        },
        job_posting: "Backend Engineer role requiring Python and Docker experience.",
      });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("error");
    expect(res.body.overall_score).toBeUndefined();
  });
});
