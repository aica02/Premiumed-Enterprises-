import React from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedAdminRoute({ children }) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  // A token saved without a role used to crash here (role.toLowerCase on null).
  if (!token || String(role || "").toLowerCase() !== "admin") {
    return <Navigate to="/auth" replace />;
  }

  return children;
}
