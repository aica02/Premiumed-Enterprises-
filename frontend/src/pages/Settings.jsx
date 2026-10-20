import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { BACKEND_URL } from "../config";
import "../styles/Settings.css";
import "../styles/ConfirmModal.css";
import { toast, Toaster } from "react-hot-toast";
import {
  FaTimes,
  FaExclamationTriangle,
  FaExclamationCircle,
} from "react-icons/fa";

const Settings = () => {
  const [autoPrioritize, setAutoPrioritize] = useState(true);
  const [urgencyThreshold, setUrgencyThreshold] = useState(0);
  const [notifySupervisor, setNotifySupervisor] = useState(true);
  const [stockAlertsEnabled, setStockAlertsEnabled] = useState(true);
  const [notifyOwner, setNotifyOwner] = useState(true);
  const [notifyStockSupervisor, setNotifyStockSupervisor] = useState(true);
  const [notifyStockStaff, setNotifyStockStaff] = useState(true);
  const [ownerNumber, setOwnerNumber] = useState("");
  const [stockAlertSaving, setStockAlertSaving] = useState(false);
  const [accountantEmail, setAccountantEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const fileInputRef = useRef(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/settings`);
        if (res.data) {
          setAutoPrioritize(res.data.autoPrioritize ?? true);
          setUrgencyThreshold(res.data.urgencyThreshold ?? 0);
          setNotifySupervisor(res.data.notifySupervisor ?? true);
          setAccountantEmail(res.data.accountantEmail ?? "");
          setAttachmentUrl(res.data.profileImage || "");
          setStockAlertsEnabled(res.data.stockAlertsEnabled ?? true);
          setNotifyOwner(res.data.reorderNotifyOwner ?? true);
          setNotifyStockSupervisor(res.data.reorderNotifySupervisor ?? true);
          setNotifyStockStaff(
            res.data.notifyStaffStock ?? res.data.reorderNotifyStaff ?? true,
          );
          setOwnerNumber(res.data.ownerNumber ?? "");
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    };
    fetchSettings();
  }, []);

  const openConfirmModal = (action, data) => {
    setConfirmAction(action);
    setConfirmData(data);
    setShowConfirmModal(true);
  };

  const closeConfirmModal = () => {
    setShowConfirmModal(false);
    setConfirmAction(null);
    setConfirmData(null);
    setIsProcessing(false);
  };

  const handleConfirmedAction = async () => {
    setIsProcessing(true);

    try {
      if (confirmAction === "saveEmail") {
        await handleSaveAccountantEmail(confirmData);
      } else if (confirmAction === "uploadDocument") {
        await handleFileUploadConfirm(confirmData);
      }
      closeConfirmModal();
    } catch (error) {
      console.error("Action failed:", error);
      setIsProcessing(false);
    }
  };

  const handleAutoSave = async (updatedFields) => {
    const payload = {
      autoPrioritize: updatedFields.hasOwnProperty("autoPrioritize")
        ? updatedFields.autoPrioritize
        : autoPrioritize,
      urgencyThreshold: Number(urgencyThreshold),
      notifySupervisor: updatedFields.hasOwnProperty("notifySupervisor")
        ? updatedFields.notifySupervisor
        : notifySupervisor,
    };

    try {
      await axios.patch(`${BACKEND_URL}/api/settings/all`, payload, {
        headers: {
          "X-Username": localStorage.getItem("username") || "",
          "X-User-Id": localStorage.getItem("userId") || "",
          "X-Role": localStorage.getItem("role") || "Admin",
        },
      });
      toast.success("Settings updated automatically!");
    } catch (err) {
      toast.error("Failed to auto-save changes");
    }
  };

  const handleSaveUrgency = async () => {
    try {
      await axios.patch(
        `${BACKEND_URL}/api/settings/urgency`,
        {
          autoPrioritize,
          threshold: Number(urgencyThreshold),
          notifySupervisor,
        },
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );
      toast.success("Urgency settings updated!");
    } catch (err) {
      toast.error("Failed to save urgency settings");
    }
  };

  const handleStockAlertChange = async (updatedFields) => {
    const payload = {
      stockAlertsEnabled:
        updatedFields.stockAlertsEnabled ?? stockAlertsEnabled,
      reorderNotifyOwner: updatedFields.reorderNotifyOwner ?? notifyOwner,
      reorderNotifySupervisor:
        updatedFields.reorderNotifySupervisor ?? notifyStockSupervisor,
      reorderNotifyStaff: updatedFields.reorderNotifyStaff ?? notifyStockStaff,
      ownerNumber: updatedFields.ownerNumber ?? ownerNumber,
    };

    setStockAlertSaving(true);
    try {
      const response = await axios.patch(
        `${BACKEND_URL}/api/settings/stock-alerts`,
        payload,
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );
      setStockAlertsEnabled(response.data.stockAlertsEnabled);
      setNotifyOwner(response.data.reorderNotifyOwner);
      setNotifyStockSupervisor(response.data.reorderNotifySupervisor);
      setNotifyStockStaff(response.data.reorderNotifyStaff);
      setOwnerNumber(response.data.ownerNumber || "");
      toast.success("Stock alert settings updated!");
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to save stock alert settings",
      );
    } finally {
      setStockAlertSaving(false);
    }
  };

  const handleSaveAccountantEmail = async (emailData) => {
    const email = emailData || accountantEmail;

    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setEmailSaving(true);
    try {
      await axios.patch(
        `${BACKEND_URL}/api/settings/accountant-email`,
        { accountantEmail: email },
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );
      toast.success("Accountant email saved successfully!");
    } catch (err) {
      toast.error("Failed to save accountant email");
    } finally {
      setEmailSaving(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const validTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/jpg",
    ];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a PDF, JPG, or PNG file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }

    openConfirmModal("uploadDocument", { file });
  };

  const handleFileUploadConfirm = async (data) => {
    const file = data.file;
    const formData = new FormData();
    formData.append("attachment", file);

    setUploading(true);
    try {
      const response = await axios.patch(
        `${BACKEND_URL}/api/settings/upload-attachment`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );

      if (response.data.success) {
        setAttachmentUrl(response.data.settings.profileImage);
        toast.success("Document uploaded successfully!");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error.response?.data?.error || "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const [isEmailFocused, setIsEmailFocused] = useState(false);

  const formatEmail = (email) => {
    if (!email) return "";

    const [username, domain] = email.split("@");

    if (!domain || username.length <= 8) {
      return email;
    }

    return `${username.slice(0, 3)}.....${username.slice(-1)}@${domain}`;
  };

  const getFileName = (url) => {
    if (!url) return "";
    const parts = url.split("/");
    const filename = parts[parts.length - 1];
    return filename.split("?")[0];
  };

  const attachmentFileName = getFileName(attachmentUrl);
  const extensionIndex = attachmentFileName.lastIndexOf(".");
  const attachmentFileStem =
    extensionIndex > 0
      ? attachmentFileName.slice(0, extensionIndex)
      : attachmentFileName;
  const attachmentFileExtension =
    extensionIndex > 0 ? attachmentFileName.slice(extensionIndex) : "";
  const newUploadFileName = confirmData?.file?.name || "";
  const newUploadExtensionIndex = newUploadFileName.lastIndexOf(".");
  const newUploadFileStem =
    newUploadExtensionIndex > 0
      ? newUploadFileName.slice(0, newUploadExtensionIndex)
      : newUploadFileName;
  const newUploadFileExtension =
    newUploadExtensionIndex > 0
      ? newUploadFileName.slice(newUploadExtensionIndex)
      : "";

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} autoClose={3000} />
      <div className="settings-container">
        <div className="settings-section">
          <div className="settings-group">
            <h3>Invoice & Billing</h3>
            <div className="setting-input">
              <p className="setting-label">Accountant Email</p>
              <div className="flex-row">
                <input
                  type="email"
                  placeholder="@gmail.com"
                  value={
                    isEmailFocused
                      ? accountantEmail
                      : formatEmail(accountantEmail)
                  }
                  onFocus={() => setIsEmailFocused(true)}
                  onBlur={() => setIsEmailFocused(false)}
                  onChange={(e) => setAccountantEmail(e.target.value)}
                />
                <button
                  className="save-btn"
                  onClick={() => openConfirmModal("saveEmail", accountantEmail)}
                  disabled={emailSaving}
                >
                  {emailSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-group">
            <h3>Document & Attachment</h3>
            <div className="setting-input">
              <p className="setting-label">Pricing & Policy Document</p>
              <div className="flex-row">
                <div
                  className={`attachment-file-name${attachmentUrl ? " upload-success" : ""}`}
                  title={attachmentFileName || undefined}
                  aria-label={
                    attachmentFileName ||
                    "No pricing and policy document uploaded"
                  }
                >
                  {attachmentUrl ? (
                    <>
                      <span className="attachment-file-stem">
                        {attachmentFileStem}
                      </span>
                      <span className="attachment-file-extension">
                        {attachmentFileExtension}
                      </span>
                    </>
                  ) : (
                    <span className="attachment-file-placeholder">
                      Upload documents containing pricing, policies, procedures,
                      rules, and regulations.
                    </span>
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,.jpg,.jpeg,.png"
                  style={{ display: "none" }}
                />
                <button
                  className="save-btn"
                  onClick={handleUploadClick}
                  disabled={uploading}
                >
                  {uploading
                    ? "Uploading..."
                    : attachmentUrl
                      ? "Update"
                      : "Upload"}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-group">
            <h3>Reordering & Stocks Alert</h3>
            <div className="toggle-item">
              <div className="toggle-text">
                <p className="setting-label">Notify Owner</p>
                <span className="setting-desc">
                  Owner will be notified when stocks level is reached.
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={notifyOwner}
                  disabled={stockAlertSaving}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setNotifyOwner(value);
                    handleStockAlertChange({ reorderNotifyOwner: value });
                  }}
                />
                <span className="slider round"></span>
              </label>
            </div>
            {notifyOwner && (
              <div className="setting-input">
                <label className="setting-label" htmlFor="owner-number">
                  Owner phone number
                </label>
                <div className="flex-row">
                  <input
                    id="owner-number"
                    type="tel"
                    value={ownerNumber}
                    onChange={(e) => setOwnerNumber(e.target.value)}
                    placeholder="+63 9XX XXX XXXX"
                    autoComplete="tel"
                    maxLength={30}
                  />
                  <button
                    className="save-btn"
                    disabled={stockAlertSaving}
                    onClick={() => handleStockAlertChange({ ownerNumber })}
                  >
                    {stockAlertSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
            <div className="toggle-item">
              <div className="toggle-text">
                <p className="setting-label">Notify Supervisor</p>
                <span className="setting-desc">
                  Supervisor will be notified when stocks level is reached.
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={notifyStockSupervisor}
                  disabled={stockAlertSaving}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setNotifyStockSupervisor(value);
                    handleStockAlertChange({ reorderNotifySupervisor: value });
                  }}
                />
                <span className="slider round"></span>
              </label>
            </div>
            <div className="toggle-item">
              <div className="toggle-text">
                <p className="setting-label">Notify Staff</p>
                <span className="setting-desc">
                  Staff will receive stock alerts for supplies.
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={notifyStockStaff}
                  disabled={stockAlertSaving}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setNotifyStockStaff(value);
                    handleStockAlertChange({ reorderNotifyStaff: value });
                  }}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>

          <div className="settings-group">
            <h3>Urgent Requests</h3>
            <div className="toggle-item">
              <div className="toggle-text">
                <p className="setting-label">Auto Prioritize Requests</p>
                <span className="setting-desc">
                  Urgent requests will automatically be prioritized.
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={autoPrioritize}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setAutoPrioritize(val);
                    handleAutoSave({ autoPrioritize: val });
                  }}
                />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="setting-input">
              <p className="setting-label">Urgency Threshold (days)</p>
              <div className="flex-row">
                <input
                  type="number"
                  value={urgencyThreshold}
                  onChange={(e) => setUrgencyThreshold(e.target.value)}
                  placeholder=""
                />
                <button className="save-btn" onClick={handleSaveUrgency}>
                  Save
                </button>
              </div>
            </div>

            <div className="toggle-item">
              <div className="toggle-text">
                <p className="setting-label">Notify Supervisor</p>
                <span className="setting-desc">
                  Supervisor will be alerted for urgent requests.
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={notifySupervisor}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setNotifySupervisor(val);
                    handleAutoSave({ notifySupervisor: val });
                  }}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>

          {/* <div className="settings-group">
            <h3>Backup & Recovery</h3>
            <div className="checked-group">
              <input type="checkbox" checked readOnly />
              <p className="status-text">Last Backup: 2026-03-09 (Cloud)</p>
            </div>
            <button className="backup-btn">Manual Backup</button>
            <div className="checked-group">
              <input type="checkbox" checked readOnly />
              <p className="status-text">Last Restored: 2026-03-09 (Cloud)</p>
            </div>
            <button className="restore-btn">Restore from Cloud</button>
          </div> */}
        </div>

        {/* Confirmation Modal - Updated for Settings */}
        {showConfirmModal && (
          <div className="confirm-modal-overlay">
            <div className="confirm-modal-card">
              <div className="confirm-modal-icon">
                <FaExclamationCircle />
              </div>

              <h3 className="confirm-modal-title">
                {confirmAction === "saveEmail" && "Save New Email?"}
                {confirmAction === "uploadDocument" && " Upload New file?"}
              </h3>

              <p className="confirm-modal-message">
                {confirmAction === "saveEmail" &&
                  "Your accountant email will be updated. This action will save the new email address."}

                {confirmAction === "uploadDocument" && (
                  <>
                    <span>
                      The current document will be replaced with this file. This
                      action cannot be undone.
                    </span>
                    <strong
                      className="confirm-file-name settings-confirm-file-name"
                      title={newUploadFileName || undefined}
                    >
                      <span className="confirm-file-stem">
                        {newUploadFileStem}
                      </span>
                      <span className="confirm-file-extension">
                        {newUploadFileExtension}
                      </span>
                    </strong>
                  </>
                )}
              </p>

              <div className="confirm-modal-footer">
                <button
                  className="confirm-modal-btn confirm-modal-btn-cancel"
                  onClick={closeConfirmModal}
                  disabled={isProcessing}
                >
                  Cancel
                </button>

                <button
                  className="confirm-modal-btn confirm-modal-btn-confirm"
                  onClick={handleConfirmedAction}
                  disabled={isProcessing}
                >
                  {isProcessing ? "Processing..." : "Yes, Proceed"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Settings;
