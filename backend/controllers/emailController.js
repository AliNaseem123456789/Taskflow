import nodemailer from "nodemailer";
import { supabase } from "../config/supabase.js";
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
const sendReminderToUser = async (user, subject, message) => {
  try {
    await transporter.sendMail({
      from: `"MyDones Reminder" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject,
      text: `Hi ${user.name || "there"}!\n\n${message}\n\n– MyDones Team`,
    });
    console.log(`Reminder sent to ${user.email}`);
  } catch (err) {
    console.error(`Failed to send to ${user.email}:`, err.message);
  }
};
export const sendReminder = async (req, res) => {
  const { subject = "Daily Reminder", message = "Don’t forget to complete your tasks!" } = req.body;

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("email, name")
      .eq("id", req.user.id)
      .single();

    if (error || !user) throw new Error("User not found");

    await sendReminderToUser(user, subject, message);
    res.status(200).json({ success: true, message: "Reminder sent successfully" });
  } catch (err) {
    console.error("Email error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
export const createOrUpdateReminder = async (req, res) => {
  const { type, time, days, delivery_method, is_active = true } = req.body;

  if (!type || !time || !days || !delivery_method)
    return res.status(400).json({ error: "Missing required fields" });

  try {
    const { data: existing } = await supabase
      .from("user_reminders")
      .select("*")
      .eq("user_id", req.user.id)
      .eq("type", type)
      .single();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from("user_reminders")
        .update({ time, days, delivery_method, is_active })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from("user_reminders")
        .insert([{ user_id: req.user.id, type, time, days, delivery_method, is_active }])
        .select("*")
        .single();
      if (error) throw error;
      result = data;
    }

    res.status(200).json({ success: true, reminder: result });
  } catch (err) {
    console.error("Reminder create/update error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
export const getUserReminders = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_reminders")
      .select("*")
      .eq("user_id", req.user.id);
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const toggleReminderActive = async (req, res) => {
  try {
    const { is_active } = req.body;
    const { data, error } = await supabase
      .from("user_reminders")
      .update({ is_active })
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .select("*")
      .single();
    if (error) throw error;
    res.status(200).json({ success: true, reminder: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export { sendReminderToUser };