import { Router, Request, Response } from "express";
import { ResumeOptimizeRequestSchema } from "../types/index.js";
import { optimizeResume } from "../services/resumeOptimizer.js";

const router = Router();

// POST /api/resume/optimize
router.post("/optimize", async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = ResumeOptimizeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const optimized_profile = await optimizeResume(
      parsed.data.candidate_profile,
      parsed.data.job_analysis
    );
    res.json({ optimized_profile });
  } catch (err) {
    console.error("Resume optimize route failed:", err);
    const message = err instanceof Error ? err.message : "Resume optimization failed";
    res.status(500).json({ error: message });
  }
});

export default router;
