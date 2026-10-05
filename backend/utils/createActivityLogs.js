import ActivityLog from "../models/ActivityLog.js";

const createActivityLog = async ({
 userId, username, role, action, module, description = "",
}) => {
try {
    await ActivityLog.create({
      userId, username, role, action, module, description,
    });
  } catch (error) {
    console.error("Failed to create activity log:", error);
  }
};

export default createActivityLog;