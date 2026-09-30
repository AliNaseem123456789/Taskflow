import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
