import React, { useState } from "react";
import { headerStyles } from "../styles/HeaderStyles";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  UserCircle,
  ChevronDown,
  ChevronUp,
  KeyRound,
  LogOut,
  Eye,
  EyeOff,
  ArrowLeft,
  Pen,
  XCircle,
  Menu,
  Check,
  X,
} from "lucide-react-native";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import Sidebar from "./Sidebar";
import { offlineFetch as fetch } from "../shared/offlineApi";
import {
  validatePassword,
  getPasswordStrength,
  getPasswordStrengthColor,
  getPasswordStrengthLabel,
  getPasswordRequirements,
  PASSWORD_REQUIREMENTS,
} from "../utils/passwordValidator";

export default function Header({
  navigation,
  staffName,
  staffPosition,
  onMenuPress,
  onChangePassword,
  onLogout,
}) {
  const API_URL = process.env.EXPO_PUBLIC_LOCAL_URL;

  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [changingPassword, setChangingPassword] = useState(false);

  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const [menuVisible, setMenuVisible] = useState(false);

  const [passwordValidation, setPasswordValidation] = useState({
    newPasswordErrors: [],
    confirmPasswordErrors: [],
    newPasswordStrength: "WEAK",
    confirmPasswordStrength: "WEAK",
  });

  React.useEffect(() => {
    if (newPassword) {
      const validation = validatePassword(newPassword);
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

    if (confirmPassword && newPassword) {
      const errors = [];
      if (newPassword !== confirmPassword) {
        errors.push("Passwords do not match");
      }
      setPasswordValidation((prev) => ({
        ...prev,
        confirmPasswordErrors: errors,
      }));
    } else if (confirmPassword) {
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
  }, [newPassword, confirmPassword]);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);

    await AsyncStorage.multiRemove([
      "userToken",
      "userRole",
      "username",
      "userId",
      "userName",
    ]);

    navigation.replace("Login");
  };

  const handleChangePassword = async () => {
    // Prevent multiple submissions
    if (changingPassword) return;

    // Get username from AsyncStorage
    const username = await AsyncStorage.getItem("username");

    if (!username) {
      Alert.alert("Error", "User not logged in. Please log in again.");
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New passwords do not match.");
      return;
    }

    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      Alert.alert("Password Validation Failed", validation.errors.join("\n"));
      return;
    }

    setChangingPassword(true);

    try {
      const token = await AsyncStorage.getItem("userToken");
      const userId = await AsyncStorage.getItem("userId");
      const role = await AsyncStorage.getItem("userRole");

      const response = await fetch(
        `${API_URL}/api/usersAccessControlPage/change-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Username": username || "",
            "X-User-Id": userId || "",
            "X-Role": role || "Admin",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            username: username,
            oldPassword: currentPassword,
            newPassword: newPassword,
          }),
        },
      );

      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          "Success",
          data.message || "Password changed successfully!",
        );

        setShowPasswordModal(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        setPasswordValidation({
          newPasswordErrors: [],
          confirmPasswordErrors: [],
          newPasswordStrength: "WEAK",
          confirmPasswordStrength: "WEAK",
        });
      } else {
        if (data.details) {
          Alert.alert("Password Validation Failed", data.details.join("\n"));
        } else {
          Alert.alert("Error", data.error || "Failed to change password.");
        }
      }
    } catch (err) {
      console.error("Change Password Error:", err);
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail) {
      Alert.alert("Error", "Please enter your email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail)) {
      Alert.alert("Error", "Please enter a valid email address.");
      return;
    }

    setSendingReset(true);
    setResetMessage("");

    try {
      // Verify email exists
      const verifyResponse = await fetch(
        `${API_URL}/api/usersAccessControlPage/verify-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: resetEmail,
          }),
        },
      );

      const verifyData = await verifyResponse.json();

      if (!verifyData.exists) {
        setResetMessage("Email address not found in our system.");
        setSendingReset(false);
        return;
      }

      // Send reset password
      const response = await fetch(
        `${API_URL}/api/usersAccessControlPage/forgot-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: resetEmail,
          }),
        },
      );

      const data = await response.json();

      setResetMessage(
        data.message || "A new password has been sent to your email!",
      );

      setTimeout(() => {
        setShowForgotPasswordModal(false);
        setResetEmail("");
        setResetMessage("");
        setSendingReset(false);
      }, 3000);
    } catch (error) {
      console.error("Forgot Password Error:", error);
      setResetMessage("Failed to process request. Please try again later.");

      setTimeout(() => {
        setResetMessage("");
        setSendingReset(false);
      }, 3000);
    }
  };

  const closeForgotPasswordModal = () => {
    setShowForgotPasswordModal(false);
    setResetEmail("");
    setResetMessage("");
    setSendingReset(false);
  };

  const renderPasswordRequirements = (password) => {
    const requirements = getPasswordRequirements(password);

    return (
      <View style={headerStyles.passwordRequirementsContainer}>
        <Text style={headerStyles.requirementsLabel}>
          Password Requirements:
        </Text>
        {requirements.map((req, index) => (
          <View key={index} style={headerStyles.requirementItem}>
            {req.valid ? (
              <Check size={16} color="#10B981" />
            ) : (
              <X size={16} color="#EF4444" />
            )}
            <Text
              style={[
                headerStyles.requirementText,
                req.valid
                  ? headerStyles.requirementMet
                  : headerStyles.requirementUnmet,
              ]}
            >
              {req.label}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderPasswordStrength = (strength) => {
    const strengthColor = getPasswordStrengthColor(strength);
    const strengthLabel = getPasswordStrengthLabel(strength);
    const percentage =
      strength === "WEAK"
        ? 25
        : strength === "MEDIUM"
          ? 50
          : strength === "STRONG"
            ? 75
            : 100;

    return (
      <View style={headerStyles.strengthContainer}>
        <View style={headerStyles.strengthBar}>
          <View
            style={[
              headerStyles.strengthFill,
              {
                width: `${percentage}%`,
                backgroundColor: strengthColor,
              },
            ]}
          />
        </View>
        <Text style={[headerStyles.strengthLabel, { color: strengthColor }]}>
          {strengthLabel}
        </Text>
      </View>
    );
  };

  return (
    <>
      <Sidebar
        isVisible={menuVisible}
        onClose={() => setMenuVisible(false)}
        navigation={navigation}
      />
      <View style={headerStyles.headerContainer}>
        {/* Menu Button */}
        <TouchableOpacity
          onPress={() => {
            setDropdownVisible(false);
            setMenuVisible(true);
          }}
        >
          <Menu size={32} color="#1F2937" />
        </TouchableOpacity>

        {/* Profile */}
        <View style={headerStyles.profileWrapper}>
          <TouchableOpacity
            style={headerStyles.profilePill}
            activeOpacity={0.8}
            onPress={() => setDropdownVisible(!dropdownVisible)}
          >
            <View style={headerStyles.textContainer}>
              <Text style={headerStyles.staffName}>{staffName}</Text>
              <Text style={headerStyles.staffPosition}>{staffPosition}</Text>
            </View>

            <UserCircle size={32} color="#D4AF37" />

            {dropdownVisible ? (
              <ChevronUp marginLeft={5} size={14} color="#1F2937" />
            ) : (
              <ChevronDown marginLeft={5} size={14} color="#1F2937" />
            )}
          </TouchableOpacity>

          {dropdownVisible && (
            <View style={headerStyles.dropdown}>
              <TouchableOpacity
                style={headerStyles.dropdownItem}
                onPress={() => {
                  setDropdownVisible(false);
                  setShowPasswordModal(true);
                }}
              >
                <Pen size={18} color="#374151" />
                <Text style={headerStyles.dropdownText}>Change Password</Text>
              </TouchableOpacity>

              <View style={headerStyles.divider} />

              <TouchableOpacity
                style={headerStyles.dropdownItem}
                onPress={() => {
                  setDropdownVisible(false);
                  handleLogout();
                }}
              >
                <LogOut size={18} color="#DC2626" />
                <Text style={headerStyles.logoutText}>Logout</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Change Password Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showPasswordModal}
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={headerStyles.passwordModalOverlay}>
          <View style={headerStyles.passwordModalContainer}>
            <View style={headerStyles.passwordModalHeader}>
              <Text style={headerStyles.passwordModalTitle}>
                Change Password
              </Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)}>
                <XCircle size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={headerStyles.passwordModalBody}>
              {/* Current Password Input */}
              <View style={headerStyles.inputGroup}>
                <Text style={headerStyles.label}>Current Password</Text>
                <View style={headerStyles.passwordInputContainer}>
                  <TextInput
                    style={headerStyles.passwordInput}
                    secureTextEntry={!showCurrentPassword}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Enter current password"
                    placeholderTextColor="#9CA3AF"
                    editable={!changingPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                    style={headerStyles.eyeIcon}
                  >
                    {showCurrentPassword ? (
                      <EyeOff size={20} color="#6B7280" />
                    ) : (
                      <Eye size={20} color="#6B7280" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* New Password Input */}
              <View style={headerStyles.inputGroup}>
                <Text style={headerStyles.label}>New Password</Text>
                <View style={headerStyles.passwordInputContainer}>
                  <TextInput
                    style={headerStyles.passwordInput}
                    secureTextEntry={!showNewPassword}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new password"
                    placeholderTextColor="#9CA3AF"
                    editable={!changingPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    style={headerStyles.eyeIcon}
                  >
                    {showNewPassword ? (
                      <EyeOff size={20} color="#6B7280" />
                    ) : (
                      <Eye size={20} color="#6B7280" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Password Strength Indicator */}
              {newPassword &&
                renderPasswordStrength(passwordValidation.newPasswordStrength)}

              {/* Password Requirements */}
              {newPassword && renderPasswordRequirements(newPassword)}

              {/* Confirm Password Input */}
              <View style={headerStyles.inputGroup}>
                <Text style={headerStyles.label}>Confirm New Password</Text>
                <View style={headerStyles.passwordInputContainer}>
                  <TextInput
                    style={headerStyles.passwordInput}
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm new password"
                    placeholderTextColor="#9CA3AF"
                    editable={!changingPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={headerStyles.eyeIcon}
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={20} color="#6B7280" />
                    ) : (
                      <Eye size={20} color="#6B7280" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password Validation Errors */}
              {passwordValidation.confirmPasswordErrors.length > 0 && (
                <View style={headerStyles.validationErrorsContainer}>
                  {passwordValidation.confirmPasswordErrors.map(
                    (error, index) => (
                      <View key={index} style={headerStyles.errorItem}>
                        <Text style={headerStyles.errorText}> {error}</Text>
                      </View>
                    ),
                  )}
                </View>
              )}

              <TouchableOpacity
                onPress={() => {
                  setShowPasswordModal(false);
                  setShowForgotPasswordModal(true);
                }}
                style={headerStyles.forgotPassWrapper}
                disabled={changingPassword}
              >
                <Text style={headerStyles.forgotPasswordText}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>
            </View>

            <View style={headerStyles.passwordModalFooter}>
              <TouchableOpacity
                style={[headerStyles.passwordButton, headerStyles.cancelButton]}
                onPress={() => {
                  setShowPasswordModal(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setShowCurrentPassword(false);
                  setShowNewPassword(false);
                  setShowConfirmPassword(false);
                  setPasswordValidation({
                    newPasswordErrors: [],
                    confirmPasswordErrors: [],
                    newPasswordStrength: "WEAK",
                    confirmPasswordStrength: "WEAK",
                  });
                }}
                disabled={changingPassword}
              >
                <Text style={headerStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  headerStyles.passwordButton,
                  headerStyles.confirmButton,
                  (!currentPassword ||
                    !newPassword ||
                    !confirmPassword ||
                    passwordValidation.newPasswordErrors.length > 0 ||
                    passwordValidation.confirmPasswordErrors.length > 0) &&
                    headerStyles.disabledButton,
                ]}
                onPress={handleChangePassword}
                disabled={
                  changingPassword ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword ||
                  passwordValidation.newPasswordErrors.length > 0 ||
                  passwordValidation.confirmPasswordErrors.length > 0
                }
              >
                {changingPassword ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={headerStyles.confirmButtonText}>
                    Change Password
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Forgot Password Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showForgotPasswordModal}
        onRequestClose={closeForgotPasswordModal}
      >
        <View style={headerStyles.passwordModalOverlay}>
          <View style={headerStyles.passwordModalContainer}>
            <View style={headerStyles.passwordModalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowForgotPasswordModal(false);
                  setShowPasswordModal(true);
                  setResetEmail("");
                  setResetMessage("");
                  setSendingReset(false);
                }}
                disabled={sendingReset}
              >
                <ArrowLeft size={24} color="#6B7280" />
              </TouchableOpacity>
              <Text style={headerStyles.passwordModalTitle}>
                Reset Password
              </Text>
              <View style={{ width: 24 }} />
            </View>

            <View style={headerStyles.passwordModalBody}>
              <Text style={headerStyles.resetDescription}>
                Enter your email address and we'll send you a new password.
              </Text>

              <View style={headerStyles.inputGroup}>
                <Text style={headerStyles.label}>Email Address</Text>
                <View style={headerStyles.passwordInputContainer}>
                  <TextInput
                    style={headerStyles.passwordInput}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    placeholder="Enter your email"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!sendingReset && !resetMessage}
                  />
                </View>
              </View>

              {resetMessage ? (
                <View
                  style={[
                    headerStyles.resetMessageContainer,
                    resetMessage.includes("sent")
                      ? headerStyles.successMessage
                      : headerStyles.errorMessage,
                  ]}
                >
                  <Text style={headerStyles.resetMessageText}>
                    {resetMessage}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={headerStyles.passwordModalFooter}>
              <TouchableOpacity
                style={[headerStyles.passwordButton, headerStyles.cancelButton]}
                onPress={closeForgotPasswordModal}
                disabled={sendingReset}
              >
                <Text style={headerStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  headerStyles.passwordButton,
                  headerStyles.confirmButton,
                ]}
                onPress={handleForgotPassword}
                disabled={sendingReset || !!resetMessage}
              >
                {sendingReset ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={headerStyles.confirmButtonText}>
                    Reset Password
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showLogoutModal}
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={headerStyles.logoutModalOverlay}>
          <View style={headerStyles.logoutModalContainer}>
            {/* Icon */}
            <View style={headerStyles.logoutIconContainer}>
              <LogOut size={30} color="#D4AF37" />
            </View>

            {/* Title */}
            <Text style={headerStyles.logoutModalTitle}>Logout</Text>

            {/* Message */}
            <Text style={headerStyles.logoutModalMessage}>
              Are you sure you want to logout?
            </Text>

            {/* Buttons */}
            <View style={headerStyles.logoutModalButtons}>
              <TouchableOpacity
                style={[
                  headerStyles.logoutModalButton,
                  headerStyles.logoutCancelButton,
                ]}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={headerStyles.logoutCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  headerStyles.logoutModalButton,
                  headerStyles.logoutConfirmButton,
                ]}
                onPress={confirmLogout}
              >
                <LogOut size={17} color="#FFFFFF" />

                <Text style={headerStyles.logoutConfirmButtonText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
