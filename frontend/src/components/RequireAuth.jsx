import { Navigate, useLocation } from "react-router-dom";
import { isLoggedIn } from "../api/api";

// Wrap app pages with this: sends logged-out visitors to /login
// and brings them back to the page they wanted afterwards.
export default function RequireAuth({ children }) {
  const location = useLocation();
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}
