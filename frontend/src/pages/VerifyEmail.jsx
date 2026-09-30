import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../utils/api";
import { getStoredUser, setStoredUser, isLoggedIn } from "../api/api";
import AuthCard, { authButtonCls } from "../components/AuthCard";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState("working"); // working | done | error
  const [error, setError] = useState("");
  const sent = useRef(false); // StrictMode runs effects twice; the link only works once

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    apiRequest("/auth/verify-email", "POST", { token })
      .then(() => {
        const user = getStoredUser();
        if (user) setStoredUser({ ...user, email_verified: true });
        setStatus("done");
      })
      .catch((err) => {
        setError(err.message);
        setStatus("error");
      });
  }, [token]);

  const next = isLoggedIn() ? "/dashboard" : "/login";

  return (
    <AuthCard
      title={status === "done" ? "Email verified" : status === "error" ? "Couldn't verify" : "Verifying..."}
      subtitle={status === "error" ? error : status === "done" ? "Thanks! You're all set." : ""}
    >
      {status !== "working" && (
        <Link to={next} className={`${authButtonCls} block text-center`}>
          {isLoggedIn() ? "Go to dashboard" : "Sign in"}
        </Link>
      )}
    </AuthCard>
  );
}
