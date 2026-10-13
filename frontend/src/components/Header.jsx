import React, { useState, useEffect, useRef } from "react";
import "../styles/Header.css";
import "../styles/Modals.css";
import "../styles/ConfirmModal.css";
import { FaCircleUser, FaKey, FaRightFromBracket } from "react-icons/fa6";
import {
  FaEye,
  FaEyeSlash,
  FaArrowLeft,
  FaCheck,
  FaExclamationCircle,
} from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-hot-toast";
import {
  validatePassword,
  getPasswordStrength,
  getPasswordStrengthColor,
  getPasswordStrengthLabel,
  PASSWORD_REQUIREMENTS,
} from "./passwordValidator.js";
import NotificationBell from "./NotificationBell";

const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const notificationRef = useRef(null);
  const accountRef = useRef(null);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [showCheckEmailModal, setShowCheckEmailModal] = useState(false);

  const [activeMenu, setActiveMenu] = useState(null);
  const [previousLocationKey, setPreviousLocationKey] = useState(location.key);

  if (previousLocationKey !== location.key) {
    setPreviousLocationKey(location.key);
    setActiveMenu(null);
  }

  const visibleMenu = activeMenu;

  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const username = localStorage.getItem("username");
  const userEmail = localStorage.getItem("email");

  const [showPasswords, setShowPasswords] = useState({
    oldPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  const [passwordValidation, setPasswordValidation] = useState({
    newPasswordErrors: [],
    confirmPasswordErrors: [],
    newPasswordStrength: "WEAK",
    confirmPasswordStrength: "WEAK",
  });

  const [passwords, setPasswords] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [oldPasswordError, setOldPasswordError] = useState("");
  const [passwordChangeError, setPasswordChangeError] = useState("");

  const toggleMenu = (menu) => {
    setActiveMenu(visibleMenu === menu ? null : menu);
  };

  useEffect(() => {
    if (!visibleMenu) return;

    const menuRef = visibleMenu === "notif" ? notificationRef : accountRef;
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setActiveMenu(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [visibleMenu]);

  const toggleVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  useEffect(() => {
    if (passwords.newPassword) {
      const validation = validatePassword(passwords.newPassword);

      setPasswordValidation((prev) => ({
        ...prev,
        newPasswordErrors: validation.errors,
        newPasswordStrength: validation.strength,
      }));
    } else {
      setPasswordValidation((prev) => ({
        ...prev,
        newPasswordErrors: [],
        newPasswordStrength: "WEAK",
      }));
    }

    if (passwords.confirmPassword && passwords.newPassword) {
      const errors = [];

      if (passwords.newPassword !== passwords.confirmPassword) {
        errors.push("Passwords do not match");
      }

      setPasswordValidation((prev) => ({
        ...prev,
        confirmPasswordErrors: errors,
      }));
    } else if (passwords.confirmPassword) {
      setPasswordValidation((prev) => ({
        ...prev,
        confirmPasswordErrors: ["Please enter the new password first"],
      }));
    } else {
      setPasswordValidation((prev) => ({
        ...prev,
        confirmPasswordErrors: [],
      }));
    }
  }, [passwords.newPassword, passwords.confirmPassword]);

  const confirmLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    localStorage.removeItem("email");

    navigate("/auth");
  };

  const handlePasswordChange = async () => {
    if (
      !passwords.oldPassword ||
      !passwords.newPassword ||
      !passwords.confirmPassword
    ) {
      setPasswordChangeError("Please fill in all fields.");
      return;
    }

    if (passwords.newPassword !== passwords.confirmPassword) {
      return;
    }

    const validation = validatePassword(passwords.newPassword);

    if (!validation.isValid) {
      setPasswordChangeError(validation.errors.join(" "));
      return;
    }

    setOldPasswordError("");
    setPasswordChangeError("");

    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/usersAccessControlPage/change-password`,
        {
          username: username,
          oldPassword: passwords.oldPassword,
          newPassword: passwords.newPassword,
        },
      );

      toast.success(response.data.message || "Password changed successfully!");

      setShowPasswordModal(false);

      setPasswords({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setOldPasswordError("");
      setPasswordChangeError("");

      setPasswordValidation({
        newPasswordErrors: [],
        confirmPasswordErrors: [],
        newPasswordStrength: "WEAK",
        confirmPasswordStrength: "WEAK",
      });
    } catch (err) {
      console.error("Change Password Error:", err);
      const errorMessage =
        err.response?.data?.error || err.response?.data?.message || "";

      if (
        /current password.*incorrect|incorrect.*current password/i.test(
          errorMessage,
        )
      ) {
        setOldPasswordError("Current password is incorrect.");
      } else if (err.response?.data?.details) {
        setPasswordChangeError(err.response.data.details.join(" "));
      } else if (errorMessage) {
        setPasswordChangeError(errorMessage);
      } else {
        setPasswordChangeError("Failed to change password. Please try again.");
      }
    }
  };

  const handleForgotPassword = async () => {
    if (isLoading) return;

    const email = resetEmail.trim().toLowerCase();

    if (!email) {
      setResetMessage("Please enter your email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      setResetMessage("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);
    setResetMessage("");

    try {
      const verifyResponse = await axios.post(
        `${BACKEND_URL}/api/usersAccessControlPage/verify-email`,
        {
          email,
        },
      );

      if (!verifyResponse.data.exists) {
        setResetMessage("No account found with this email address.");
        setIsLoading(false);
        return;
      }

      await axios.post(
        `${BACKEND_URL}/api/usersAccessControlPage/forgot-password`,
        {
          email,
        },
      );

      setIsLoading(false);
      setShowForgotPasswordModal(false);
      setResetEmail("");
      setResetMessage("");
      setShowCheckEmailModal(true);
    } catch (err) {
      console.error("Forgot Password Error:", err);

      if (err.response?.status === 404) {
        setResetMessage("No account found with this email address.");
      } else if (err.response?.status === 429) {
        setResetMessage(
          "Too many attempts. Please try again after 15 minutes.",
        );
      } else if (err.response?.data?.error) {
        setResetMessage(err.response.data.error);
      } else {
        setResetMessage("Failed to send reset email. Please try again later.");
      }

      setIsLoading(false);
    }
  };

  const renderPasswordRequirements = (password) => {
    const requirements = [
      {
        label: `At least ${PASSWORD_REQUIREMENTS.minLength} characters`,
        valid: password.length >= PASSWORD_REQUIREMENTS.minLength,
      },
      {
        label: `Less than ${PASSWORD_REQUIREMENTS.maxLength} characters`,
        valid: password.length <= PASSWORD_REQUIREMENTS.maxLength,
      },
      {
        label: "Contains uppercase letter",
        valid: /[A-Z]/.test(password),
      },
      {
        label: "Contains lowercase letter",
        valid: /[a-z]/.test(password),
      },
      {
        label: "Contains a number",
        valid: /[0-9]/.test(password),
      },
      {
        label: "Contains a special character",
        valid: new RegExp(
          `[${PASSWORD_REQUIREMENTS.specialChars.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          )}]`,
        ).test(password),
      },
    ];

    return (
      <div className="password-requirements">
        <div className="requirements-list">
          {requirements.map((req, index) => (
            <label
              key={index}
              className={`requirement-item ${
                req.valid ? "requirement-met" : ""
              }`}
            >
              <input type="checkbox" checked={req.valid} readOnly />
              <span>{req.label}</span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <header className="header">
        <div className="left"></div>

        <div className="right">
          <NotificationBell
            containerRef={notificationRef}
            userName={username}
            isOpen={visibleMenu === "notif"}
            onToggle={() => toggleMenu("notif")}
            fetchUrl={`${BACKEND_URL}/api/notifications`}
            markReadUrl={`${BACKEND_URL}/api/notifications`}
            markAllReadUrl={`${BACKEND_URL}/api/notifications/read-all`}
          />

          <div
            ref={accountRef}
            className="admin-nav-icon-wrapper"
            title="Profile"
          >
            <span className="role-tag">{username?.toUpperCase()}</span>

            <div className="account-wrapper">
              <FaCircleUser
                className="account-icon"
                onClick={() => toggleMenu("account")}
              />

              {visibleMenu === "account" && (
                <div className="account-dropdown">
                  <div
                    className="dropdown-item"
                    onClick={() => {
                      setOldPasswordError("");
                      setPasswordChangeError("");
                      setShowPasswordModal(true);
                      setActiveMenu(null);
                    }}
                  >
                    <FaKey /> Change Password
                  </div>

                  <div
                    className="dropdown-item logout"
                    onClick={() => {
                      setShowLogoutModal(true);
                      setActiveMenu(null);
                    }}
                  >
                    <FaRightFromBracket /> Logout
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {showPasswordModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Change Password</h3>
            </div>

            <div className="password-input-wrapper">
              <input
                type={showPasswords.oldPassword ? "text" : "password"}
                className={`password-input${
                  oldPasswordError ? " input-error" : ""
                }`}
                placeholder="Old Password"
                value={passwords.oldPassword}
                onChange={(e) => {
                  setOldPasswordError("");
                  setPasswordChangeError("");
                  setPasswords({
                    ...passwords,
                    oldPassword: e.target.value,
                  });
                }}
                aria-invalid={Boolean(oldPasswordError)}
                aria-describedby={
                  oldPasswordError ? "old-password-error" : undefined
                }
              />

              {showPasswords.oldPassword ? (
                <FaEyeSlash
                  className="password-icon"
                  onClick={() => toggleVisibility("oldPassword")}
                />
              ) : (
                <FaEye
                  className="password-icon"
                  onClick={() => toggleVisibility("oldPassword")}
                />
              )}
            </div>
            {oldPasswordError && (
              <div
                id="old-password-error"
                className="inline-error-message"
                role="alert"
              >
                {oldPasswordError}
              </div>
            )}

            <div className="password-input-wrapper">
              <input
                type={showPasswords.newPassword ? "text" : "password"}
                className="password-input"
                placeholder="New Password"
                value={passwords.newPassword}
                onChange={(e) => {
                  setPasswordChangeError("");
                  setPasswords({
                    ...passwords,
                    newPassword: e.target.value,
                  });
                }}
              />

              {showPasswords.newPassword ? (
                <FaEyeSlash
                  className="password-icon"
                  onClick={() => toggleVisibility("newPassword")}
                />
              ) : (
                <FaEye
                  className="password-icon"
                  onClick={() => toggleVisibility("newPassword")}
                />
              )}
            </div>

            {/* Password Strength */}
            {passwords.newPassword && (
              <div className="password-strength-container">
                <div className="strength-bar">
                  <div
                    className={`strength-fill ${passwordValidation.newPasswordStrength.toLowerCase()}`}
                    style={{
                      width: `${
                        passwordValidation.newPasswordStrength === "WEAK"
                          ? 25
                          : passwordValidation.newPasswordStrength === "MEDIUM"
                            ? 50
                            : passwordValidation.newPasswordStrength ===
                                "STRONG"
                              ? 75
                              : 100
                      }%`,
                      backgroundColor: getPasswordStrengthColor(
                        passwordValidation.newPasswordStrength,
                      ),
                    }}
                  ></div>
                </div>

                <div
                  className="strength-label"
                  style={{
                    color: getPasswordStrengthColor(
                      passwordValidation.newPasswordStrength,
                    ),
                  }}
                >
                  {getPasswordStrengthLabel(
                    passwordValidation.newPasswordStrength,
                  )}
                </div>
              </div>
            )}

            {/* Password Requirements */}
            {passwords.newPassword &&
              renderPasswordRequirements(passwords.newPassword)}

            <div className="password-input-wrapper">
              <input
                type={showPasswords.confirmPassword ? "text" : "password"}
                className="password-input"
                placeholder="Confirm New Password"
                value={passwords.confirmPassword}
                onChange={(e) => {
                  setPasswordChangeError("");
                  setPasswords({
                    ...passwords,
                    confirmPassword: e.target.value,
                  });
                }}
              />

              {showPasswords.confirmPassword ? (
                <FaEyeSlash
                  className="password-icon"
                  onClick={() => toggleVisibility("confirmPassword")}
                />
              ) : (
                <FaEye
                  className="password-icon"
                  onClick={() => toggleVisibility("confirmPassword")}
                />
              )}
            </div>

            {/* Confirm Password Errors */}
            {passwordValidation.confirmPasswordErrors.length > 0 && (
              <div className="validation-errors">
                {passwordValidation.confirmPasswordErrors.map(
                  (error, index) => (
                    <div key={index} className="error-message">
                      {error}
                    </div>
                  ),
                )}
              </div>
            )}
            {passwordChangeError && (
              <div className="inline-error-message" role="alert">
                {passwordChangeError}
              </div>
            )}

            {/* Forgot Password */}
            <div className="forgot-password-link">
              <button
                className="link-btn"
                type="button"
                onClick={() => {
                  setShowPasswordModal(false);
                  setOldPasswordError("");
                  setPasswordChangeError("");
                  setShowForgotPasswordModal(true);
                  setResetMessage("");

                  // Automatically use logged-in user's email
                  if (userEmail) {
                    setResetEmail(userEmail);
                  } else {
                    setResetEmail("");
                  }
                }}
              >
                Forgot Password?
              </button>
            </div>

            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowPasswordModal(false);
                  setOldPasswordError("");
                  setPasswordChangeError("");

                  setPasswords({
                    oldPassword: "",
                    newPassword: "",
                    confirmPassword: "",
                  });

                  setPasswordValidation({
                    newPasswordErrors: [],
                    confirmPasswordErrors: [],
                    newPasswordStrength: "WEAK",
                    confirmPasswordStrength: "WEAK",
                  });
                }}
              >
                Cancel
              </button>

              <button
                className="btn-confirm"
                onClick={handlePasswordChange}
                disabled={
                  !passwords.oldPassword ||
                  !passwords.newPassword ||
                  !passwords.confirmPassword ||
                  passwordValidation.newPasswordErrors.length > 0 ||
                  passwordValidation.confirmPasswordErrors.length > 0
                }
              >
                Change Password
              </button>
            </div>
          </div>
        </div>
      )}

      {showForgotPasswordModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!isLoading) {
              setShowForgotPasswordModal(false);
              setResetEmail("");
              setResetMessage("");
            }
          }}
        >
          <div
            className="modal-card forgot-password-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <FaArrowLeft
                className="back-icon"
                onClick={() => {
                  if (!isLoading) {
                    setShowForgotPasswordModal(false);
                    setShowPasswordModal(true);
                    setOldPasswordError("");
                    setResetMessage("");
                    setResetEmail("");
                  }
                }}
              />

              <h3>Reset Password</h3>
            </div>

            <div className="forgot-password-content">
              <p>
                Enter your email address and we'll send you instructions to
                reset your password.
              </p>

              <input
                type="email"
                className="email-input"
                placeholder="Email Address"
                value={resetEmail}
                onChange={(e) => {
                  setResetEmail(e.target.value);
                  setResetMessage("");
                }}
                disabled={isLoading}
                autoFocus
              />

              {resetMessage && (
                <div
                  className={`reset-message ${
                    resetMessage.toLowerCase().includes("sent")
                      ? "success"
                      : "error"
                  }`}
                >
                  {resetMessage}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => {
                  if (!isLoading) {
                    setShowForgotPasswordModal(false);
                    setResetEmail("");
                    setResetMessage("");
                  }
                }}
                disabled={isLoading}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn-confirm"
                onClick={handleForgotPassword}
                disabled={isLoading || !resetEmail.trim()}
              >
                {" "}
                {isLoading ? "Sending..." : "Reset Password"}{" "}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCheckEmailModal && (
        <div className="modal-overlay">
          <div className="modal-card check-email-card">
            <div className="check-email-icon">
              <FaCheck />
            </div>

            <h3>Check Your Email</h3>

            <p>
              If an account exists with this email, we've sent a new temporary
              password to use.
            </p>

            <button
              type="button"
              className="finish-btn"
              onClick={() => {
                setShowCheckEmailModal(false);
              }}
            >
              Finish
            </button>
          </div>
        </div>
      )}

      {showLogoutModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal-card">
            <div className="confirm-modal-icon">
              <FaExclamationCircle />
            </div>

            <h3 className="confirm-modal-title">Confirm Logout</h3>

            <p className="confirm-modal-message">
              Are you sure you want to end your session?
            </p>

            <div className="confirm-modal-footer">
              <button
                className="confirm-modal-btn confirm-modal-btn-cancel"
                onClick={() => setShowLogoutModal(false)}
              >
                Stay
              </button>

              <button
                className="confirm-modal-btn confirm-modal-btn-confirm"
                onClick={confirmLogout}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
