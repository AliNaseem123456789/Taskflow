import { getCompanyMember } from "../utils/permissions.js";

// The frontend sends the chosen workspace in the X-Company-Id header
// (no header = Personal). Sets req.company = { id, member } or null.
// Must run after authenticate.
export async function workspace(req, res, next) {
  const companyId = req.get("x-company-id");
  if (!companyId) {
    req.company = null;
    return next();
  }
  if (!/^[0-9a-f-]{36}$/i.test(companyId))
    return res.status(400).json({ error: "Bad company id" });

  const member = await getCompanyMember(companyId, req.user.id);
  if (!member) return res.status(403).json({ error: "You're not a member of this company" });
  req.company = { id: companyId, member };
  next();
}

// For routes that only make sense inside a company
export function requireCompany(req, res, next) {
  if (!req.company) return res.status(400).json({ error: "Pick a company first" });
  next();
}
