// routes/emailRoutes.js
import express from "express";
import {
  sendReminder,
  createOrUpdateReminder,
  getUserReminders,
  toggleReminderActive,
} from "../controllers/emailController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Send reminder manually
router.post("/send-reminder", authenticate, sendReminder);

// Create or update user’s reminder settings
router.post("/set-reminder", authenticate, createOrUpdateReminder);

// Get all reminders for logged-in user
router.get("/my-reminders", authenticate, getUserReminders);

// Enable/disable a reminder
router.put("/toggle-reminder/:id", authenticate, toggleReminderActive);

export default router;


// // routes/emailRoutes.js
// import express from "express";
// import { sendReminder } from "../controllers/emailController.js";
// import { authenticate } from "../middleware/auth.js";

// const router = express.Router();

// // Test sending email
// // router.post("/send-email", sendTestEmail);

// // Send reminder to logged-in user
// router.post("/send-reminder", authenticate, sendReminder);

// export default router;
