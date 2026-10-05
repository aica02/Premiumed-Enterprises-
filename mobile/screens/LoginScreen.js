import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Eye, EyeOff, XCircle } from "lucide-react-native";
import { loginStyles } from "../styles/LoginStyles";

const API_URL = process.env.EXPO_PUBLIC_LOCAL_URL;

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot Password States
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  const clearStoredData = async () => {
    try {
      const keysToRemove = [
        "userToken",
        "userRole",
        "username",
        "userId",
        "userName",
        "status",
      ];

      await AsyncStorage.multiRemove(keysToRemove);
      console.log("Cleared all stored data");
    } catch (error) {
      console.error("Error clearing data:", error);
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      await clearStoredData();

      if (!API_URL) {
        console.error("API_URL is undefined!");

        Alert.alert(
          "Configuration Error",
          "API_URL is not set. Please check your environment variables.",
        );

        setLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        await AsyncStorage.setItem("userToken", data.token);
        await AsyncStorage.setItem("userRole", data.role);
        await AsyncStorage.setItem("username", data.username);
        await AsyncStorage.setItem("userId", data.userId);
        await AsyncStorage.setItem("userName", data.name);

        if (data.status) {
          await AsyncStorage.setItem("status", data.status);
        }

        if (data.role === "Staff" && data.status === "Active") {
          navigation.replace("Picking");
        } else if (data.role === "Driver" && data.status === "Active") {
          navigation.replace("DeliveryList");
        } else {
          console.error(
            "Unknown role or inactive status:",
            data.role,
            data.status,
          );

          Alert.alert(
            "Error",
            "Invalid user role or Deactivated account. Please contact admin for support.",
          );
        }
      } else {
        Alert.alert("Login Failed", data.message || "Invalid credentials");
      }
    } catch (error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Full error:", error);

      if (error.message.includes("Network request failed")) {
        Alert.alert(
          "Network Error",
          `Cannot connect to server at ${API_URL}\n\n` +
            "Make sure:\n" +
            "1. Backend is running\n" +
            "2. Your phone and laptop are on the same WiFi\n" +
            "3. No firewall is blocking port 5000",
        );
      } else if (error.message.includes("JSON")) {
        Alert.alert(
          "Parse Error",
          "Server returned an invalid response. Check backend logs.",
        );
      } else {
        Alert.alert("Error", `Login failed: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password
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
      // Verify if email exists
      const verifyResponse = await fetch(
        `${API_URL}/api/usersAccessControlPage/verify-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: resetEmail.trim(),
          }),
        },
      );

      const verifyData = await verifyResponse.json();

      if (!verifyData.exists) {
        setResetMessage("Email address not found in our system.");
        setSendingReset(false);
        return;
      }

      // Send new password
      const response = await fetch(
        `${API_URL}/api/usersAccessControlPage/forgot-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: resetEmail.trim(),
          }),
        },
      );

      const data = await response.json();

      if (response.ok) {
        setResetMessage(
          data.message || "A new password has been sent to your email!",
        );

        setTimeout(() => {
          closeForgotPasswordModal();
        }, 3000);
      } else {
        setResetMessage(
          data.error || "Failed to reset password. Please try again.",
        );
      }
    } catch (error) {
      console.error("Forgot Password Error:", error);

      setResetMessage(
        "Failed to process your request. Please try again later.",
      );
    } finally {
      setSendingReset(false);
    }
  };

  const closeForgotPasswordModal = () => {
    setShowForgotPasswordModal(false);
    setResetEmail("");
    setResetMessage("");
    setSendingReset(false);
  };

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={loginStyles.container}
      >
        <View style={loginStyles.logoContainer}>
          <Image
            source={require("../assets/Premiumed logo.png")}
            style={loginStyles.crownImage}
          />

          <Text style={loginStyles.brandName}>Premiumed Enterprises</Text>
        </View>

        <View style={loginStyles.loginCard}>
          <View style={loginStyles.goldBar} />

          <Text style={loginStyles.loginHeader}>LOG IN</Text>

          <TextInput
            style={loginStyles.input}
            placeholder="Username"
            placeholderTextColor="#999"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          {/* Password Input */}
          <View style={loginStyles.passwordContainer}>
            <TextInput
              style={loginStyles.passwordInput}
              placeholder="Password"
              placeholderTextColor="#999"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />

            <TouchableOpacity
              style={loginStyles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff size={24} color="#999" />
              ) : (
                <Eye size={24} color="#999" />
              )}
            </TouchableOpacity>
          </View>

          {/* Forgot Password */}
          <TouchableOpacity
            style={loginStyles.forgotPasswordWrapper}
            onPress={() => setShowForgotPasswordModal(true)}
            disabled={loading}
          >
            <Text style={loginStyles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <TouchableOpacity
            style={loginStyles.loginButton}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={loginStyles.loginButtonText}>LOG IN</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showForgotPasswordModal}
        onRequestClose={closeForgotPasswordModal}
      >
        <View style={loginStyles.resetModalOverlay}>
          <View style={loginStyles.resetModalContainer}>
            <View style={loginStyles.resetModalHeader}>
              <Text style={loginStyles.resetModalTitle}>Reset Password</Text>

              <TouchableOpacity
                onPress={closeForgotPasswordModal}
                disabled={sendingReset}
              >
                <XCircle size={25} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={loginStyles.resetModalBody}>
              <Text style={loginStyles.resetDescription}>
                Enter your email address and we'll send you a new password.
              </Text>

              <Text style={loginStyles.resetLabel}>Email Address</Text>

              <TextInput
                style={loginStyles.resetInput}
                value={resetEmail}
                onChangeText={setResetEmail}
                placeholder="Enter your email"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!sendingReset && !resetMessage}
              />

              {resetMessage ? (
                <View
                  style={[
                    loginStyles.resetMessageContainer,
                    resetMessage.toLowerCase().includes("sent")
                      ? loginStyles.successMessage
                      : loginStyles.errorMessage,
                  ]}
                >
                  <Text style={loginStyles.resetMessageText}>
                    {resetMessage}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={loginStyles.resetModalFooter}>
              <TouchableOpacity
                style={[loginStyles.resetButton, loginStyles.resetCancelButton]}
                onPress={closeForgotPasswordModal}
                disabled={sendingReset}
              >
                <Text style={loginStyles.resetCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  loginStyles.resetButton,
                  loginStyles.resetConfirmButton,
                  (!!resetMessage || sendingReset) &&
                    loginStyles.resetDisabledButton,
                ]}
                onPress={handleForgotPassword}
                disabled={sendingReset || !!resetMessage}
              >
                {sendingReset ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={loginStyles.resetConfirmButtonText}>
                    Reset Password
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
