import { toast } from "react-hot-toast";

const API_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");

const logReportPrinted = async (reportName, module) => {
  try {
    const response = await fetch(`${API_URL}/api/activitylogs/report-printed`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "X-Username": localStorage.getItem("username") || "",
        "X-User-Id": localStorage.getItem("userId") || "",
        "X-Role": localStorage.getItem("role") || "Admin",
      },
      body: JSON.stringify({ reportName, module }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error || "Failed to log report printing.");
    }
  } catch (error) {
    console.error("Failed to log report printing:", error);
    toast.error("Report generated, but its activity log could not be saved.");
  }
};

export default logReportPrinted;
