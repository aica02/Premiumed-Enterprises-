import React from "react";
import { Navigate } from "react-router-dom";

export function ProtectedUserRoute({ children }) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  console.log("GUARD CHECK - Token:", !!token);
  console.log("GUARD CHECK - Role in Storage:", role);

  if (!token || role?.toLowerCase() !== "user") {
    console.log("GUARD FAIL: Redirecting to /auth");
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}