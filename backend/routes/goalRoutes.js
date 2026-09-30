import express from "express";
import { getGoals, createGoal, updateGoal, deleteGoal } from "../controllers/goalController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getGoals);
router.post("/", authenticate, createGoal);
router.put("/:id", authenticate, updateGoal);
router.delete("/:id", authenticate, deleteGoal);

export default router;
