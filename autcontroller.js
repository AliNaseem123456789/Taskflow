import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "../config/supabase.js";
import dotenv from "dotenv";

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

export const signup = async (req, res) => {
  const { email, password, name, role = "user" } = req.body;
  try {
    const { data: existingUser } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (existingUser)
      return res.status(400).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("users")
      .insert([{ email, password: hashedPassword, name, role }])
      .select("*")
      .single();

    if (error) throw error;

    const token = jwt.sign(
      { id: data.id, email: data.email, role: data.role },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Signup successful",
      token,
      user: { id: data.id, email: data.email, role: data.role },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user)
      return res.status(400).json({ error: "Invalid credentials" });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid)
      return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, name, role")
      .eq("id", req.user.id)
      .single();
    if (error) throw error;
    res.status(200).json({ user });
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};


create table public.sessions (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  access_token_jti character varying(100) not null,
  refresh_token_hash character varying(255) not null,
  access_token_expires_at timestamp without time zone not null,
  refresh_token_expires_at timestamp without time zone not null,
  device_fingerprint character varying(255) null,
  ip_address character varying(45) null,
  user_agent text null,
  country character varying(100) null,
  city character varying(100) null,
  is_active boolean null default true,
  revoked_at timestamp without time zone null,
  revocation_reason character varying(50) null,
  last_accessed_at timestamp without time zone null default now(),
  created_at timestamp without time zone null default now(),
  request_count integer null default 0,
  rate_limit_reset_at timestamp without time zone null default (now() + '01:00:00'::interval),
  refresh_token_used boolean null default false,
  constraint sessions_pkey primary key (id),
  constraint sessions_access_token_jti_key unique (access_token_jti),
  constraint sessions_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_sessions_user_active on public.sessions using btree (user_id, is_active) TABLESPACE pg_default;

create index IF not exists idx_sessions_jti on public.sessions using btree (access_token_jti) TABLESPACE pg_default;

create index IF not exists idx_sessions_refresh_hash on public.sessions using btree (refresh_token_hash) TABLESPACE pg_default;

create index IF not exists idx_sessions_refresh_used on public.sessions using btree (refresh_token_used) TABLESPACE pg_default;