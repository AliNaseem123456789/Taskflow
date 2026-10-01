// utils/audit.js — who did what, per company (audit_logs table). Never throws.
import { supabase } from "../config/supabase.js";

export const audit = async (req, companyId, action, resourceType = null, resourceId = null, details = null) => {
  try {
    await supabase.from("audit_logs").insert([{
      company_id: companyId,
      user_id: req.user?.id || null,
      session_id: req.sessionId || null,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
      ip_address: req.ip || null,
      user_agent: req.get?.("user-agent")?.slice(0, 250) || null,
      status: "ok",
      created_at: new Date().toISOString(),
    }]);
  } catch {
    // auditing must never break the request
  }
};
