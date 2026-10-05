
import React from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedAdminRoute({ children }) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token || role.toLowerCase() !== "admin") {
    return <Navigate to="/auth" replace />;
  }

  return children;
}