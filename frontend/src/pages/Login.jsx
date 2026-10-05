import React, { useState } from "react";
import axios from "axios";
import "../styles/Login.css";
import logo from "../assets/Premiumed logo.png";
import { useNavigate } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";
import { FaArrowLeft, FaCheck, FaEye, FaEyeSlash } from "react-icons/fa";

const API_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");

const COUNTRY_CODES = [
  { code: "+63", country: "Philippines", flag: "🇵🇭" },
  { code: "+1", country: "United States / Canada", flag: "🇺🇸" },
  { code: "+44", country: "United Kingdom", flag: "🇬🇧" },
  { code: "+61", country: "Australia", flag: "🇦🇺" },
  { code: "+81", country: "Japan", flag: "🇯🇵" },
  { code: "+82", country: "South Korea", flag: "🇰🇷" },
  { code: "+86", country: "China", flag: "🇨🇳" },
  { code: "+65", country: "Singapore", flag: "🇸🇬" },
  { code: "+60", country: "Malaysia", flag: "🇲🇾" },
  { code: "+66", country: "Thailand", flag: "🇹🇭" },
  { code: "+84", country: "Vietnam", flag: "🇻🇳" },
  { code: "+91", country: "India", flag: "🇮🇳" },
  { code: "+971", country: "United Arab Emirates", flag: "🇦🇪" },
  { code: "+966", country: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+49", country: "Germany", flag: "🇩🇪" },
  { code: "+33", country: "France", flag: "🇫🇷" },
  { code: "+39", country: "Italy", flag: "🇮🇹" },
  { code: "+34", country: "Spain", flag: "🇪🇸" },
  { code: "+7", country: "Russia / Kazakhstan", flag: "🇷🇺" },
];

const Login = () => {
  const navigate = useNavigate();

  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // login state
  const [errors, setErrors] = useState({
    username: "",
    password: "",
  });

  const [loginData, setLoginData] = useState({
    username: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showCheckEmailModal, setShowCheckEmailModal] = useState(false);

  // success signup
  const [showApplicationSuccessModal, setShowApplicationSuccessModal] =
    useState(false);

  // Forgot Password Modal
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // signup state
  const [currentStep, setCurrentStep] = useState(1);
  const [registerLoading, setRegisterLoading] = useState(false);

  const [formData, setFormData] = useState({
    dialysisCenterName: "",
    facilityType: "Standalone Dialysis Center",
    yearEstablished: "",
    registrationNumber: "",
    machines: "",
    address: "",
    mobileCountryCode: "+63",
    mobile: "",
    landlineCountryCode: "+63",
    landline: "",
    email: "",
    ownership: "Private",
    ownerName: "",
    medicalDirector: "",
    nephrologist: "",
    unitManager: "",
    purchasingContact: "",
    designation: "",
    procurementMobileCountryCode: "+63",
    procurementMobile: "",
    procurementEmail: "",
  });

  const [registerErrors, setRegisterErrors] = useState({
    dialysisCenterName: "",
    facilityType: "",
    yearEstablished: "",
    registrationNumber: "",
    machines: "",
    address: "",
    mobile: "",
    landline: "",
    email: "",
    ownership: "",
    ownerName: "",
    medicalDirector: "",
    nephrologist: "",
    unitManager: "",
    purchasingContact: "",
    designation: "",
    procurementMobile: "",
    procurementEmail: "",
  });

  const [touchedFields, setTouchedFields] = useState({});

  // fields label
  const formatLabel = (name) => {
    const labels = {
      dialysisCenterName: "Dialysis Center Name",
      facilityType: "Type of Facility",
      yearEstablished: "Year Established",
      registrationNumber: "Registration Number",
      machines: "Number of Machines",
      address: "Registered Address",
      mobile: "Mobile Number",
      landline: "Landline Number",
      email: "Email Address",
      ownership: "Ownership",
      ownerName: "Owner's Name",
      medicalDirector: "Medical Director's Name",
      nephrologist: "Nephrologist Name",
      unitManager: "Unit Manager / Administrator",
      purchasingContact: "Purchasing Contact Person",
      designation: "Designation",
      procurementMobile: "Procurement Mobile Number",
      procurementEmail: "Procurement Email Address",
    };

    return labels[name] || name;
  };

  // autoformatting
  const formatFieldValue = (name, value) => {
    switch (name) {
      // numbers only
      case "machines":
        return value.replace(/\D/g, "");

      // landline
      case "landline": {
        // Remove everything except numbers
        value = value.replace(/\D/g, "");

        // maximum 10 digits: 0XX-XXX-XXXX
        value = value.slice(0, 10);

        // format: 0X-XXXX-XXXX
        if (value.length > 2) {
          value = value.slice(0, 2) + "-" + value.slice(2);
        }

        if (value.length > 7) {
          value = value.slice(0, 7) + "-" + value.slice(7);
        }

        return value;
      }

      // phone number
      case "mobile":
      case "procurementMobile": {
        // remove non-numeric characters
        value = value.replace(/\D/g, "");

        // limit to 10 digits
        value = value.slice(0, 10);

        // format: 917 123 4567
        if (value.length > 3) {
          value = value.slice(0, 3) + " " + value.slice(3);
        }

        if (value.length > 7) {
          value = value.slice(0, 7) + " " + value.slice(7);
        }

        return value;
      }

      // email
      case "email":
      case "procurementEmail":
        return value.toLowerCase().replace(/\s/g, "");

      // registration / LTO number
      case "registrationNumber": {
        // convert to uppercase
        value = value.toUpperCase();

        // remove everything except letters and numbers
        value = value.replace(/[^A-Z0-9]/g, "");

        // maximum: 6 letters + 10 digits
        value = value.slice(0, 16);

        // format: DOH-LTO-2024-009842
        if (value.length > 3) {
          value = value.slice(0, 3) + "-" + value.slice(3);
        }

        if (value.length > 7) {
          value = value.slice(0, 7) + "-" + value.slice(7);
        }

        if (value.length > 12) {
          value = value.slice(0, 12) + "-" + value.slice(12);
        }

        return value;
      }

      // text fields
      case "dialysisCenterName":
      case "address":
      case "ownerName":
      case "medicalDirector":
      case "nephrologist":
      case "unitManager":
      case "purchasingContact":
      case "designation":
        // replace multiple spaces with one space
        return value.replace(/\s{2,}/g, " ");

      default:
        return value;
    }
  };

  // field validation
  const validateField = (name, value) => {
    const trimmedValue = value.trim();

    switch (name) {
      // facility info
      case "dialysisCenterName":
        if (!trimmedValue) {
          return "Dialysis Center Name is required.";
        }

        if (trimmedValue.length > 100) {
          return "Dialysis Center Name cannot exceed 100 characters.";
        }

        if (!/^[a-zA-Z0-9\s&.,'-]+$/.test(trimmedValue)) {
          return "Invalid input. Letters, numbers, spaces, (.), (') (,) and (-) only.";
        }

        return "";

      case "facilityType":
        if (!trimmedValue) {
          return "Type of Facility is required.";
        }

        return "";

      case "yearEstablished": {
        if (!trimmedValue) {
          return "Year Established is required.";
        }

        if (!/^\d{4}$/.test(trimmedValue)) {
          return "Year Established must contain exactly 4 digits.";
        }

        const year = Number(trimmedValue);
        const currentYear = new Date().getFullYear();

        if (year < 1900 || year > currentYear) {
          return `Year Established must be between 1900 and ${currentYear}.`;
        }

        return "";
      }

      case "registrationNumber":
        if (!trimmedValue) {
          return "Registration Number is required.";
        }

        if (!/^DOH-LTO-\d{4}-\d{6}$/.test(trimmedValue)) {
          return "Enter a valid registration number (DOH-LTO-YYYY-000000).";
        }

        return "";

      case "machines":
        if (!trimmedValue) {
          return "Number of Machines is required.";
        }

        if (!/^\d+$/.test(trimmedValue)) {
          return "Number of Machines must contain numbers only.";
        }

        const machineCount = Number(trimmedValue);

        if (machineCount < 1) {
          return "Number of Machines must be at least 1.";
        }

        if (machineCount > 500) {
          return "Number of Machines cannot exceed 500.";
        }

        return "";

      case "address":
        if (!trimmedValue) {
          return "Registered Address is required.";
        }

        if (trimmedValue.length > 250) {
          return "Registered Address cannot exceed 250 characters.";
        }

        return "";

      case "mobile":
      case "procurementMobile":
        if (!trimmedValue) {
          return "Mobile Number is required.";
        }

        if (!/^\d{3} \d{3} \d{4}$/.test(trimmedValue)) {
          return "Enter a valid mobile number.";
        }

        return "";

      case "landline":
        if (!trimmedValue) {
          return "Landline Number is required.";
        }

        if (!/^\d{2}-\d{4}-\d{4}$/.test(trimmedValue)) {
          return "Enter a valid landline number (XX-XXXX-XXXX).";
        }

        return "";

      case "email":
      case "procurementEmail":
        if (!trimmedValue) {
          return "Email Address is required.";
        }

        if (!trimmedValue.toLowerCase().endsWith("@gmail.com")) {
          return "Email must include @gmail.com";
        }

        return "";

      // ownership info
      case "ownership":
        if (!trimmedValue) {
          return "Ownership is required.";
        }

        return "";

      case "ownerName":
      case "medicalDirector":
      case "nephrologist":
      case "unitManager":
      case "purchasingContact":
        if (!trimmedValue) {
          return `${formatLabel(name)} is required.`;
        }

        if (trimmedValue.length > 100) {
          return `${formatLabel(name)} cannot exceed 100 characters.`;
        }

        if (!/^[a-zA-Z\s.,'-]+$/.test(trimmedValue)) {
          return `Invalid input. Letters, spaces, (.), (') (,) and (-) only.`;
        }

        return "";

      // procurement info
      case "designation":
        if (!trimmedValue) {
          return "Designation is required.";
        }

        if (trimmedValue.length > 100) {
          return "Designation cannot exceed 100 characters.";
        }

        return "";

      default:
        return "";
    }
  };

  // max length
  const maxLengths = {
    dialysisCenterName: 100,
    yearEstablished: 4,
    registrationNumber: 19,
    machines: 3,
    address: 250,
    mobile: 12,
    landline: 12,
    email: 150,
    ownerName: 100,
    medicalDirector: 100,
    nephrologist: 100,
    unitManager: 100,
    purchasingContact: 100,
    designation: 100,
    procurementMobile: 12,
    procurementEmail: 150,
  };

  // signup field change
  const handleRegisterChange = (e) => {
    const { name } = e.target;

    let value = e.target.value;

    // country code
    if (
      name === "mobileCountryCode" ||
      name === "landlineCountryCode" ||
      name === "procurementMobileCountryCode"
    ) {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));

      return;
    }

    // apply auto-formatting
    value = formatFieldValue(name, value);

    // apply maximum length
    if (maxLengths[name]) {
      value = value.slice(0, maxLengths[name]);
    }

    // update form data
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // mark field as touched
    setTouchedFields((prev) => ({
      ...prev,
      [name]: true,
    }));

    // validate immediately
    const fieldError = validateField(name, value);

    setRegisterErrors((prev) => ({
      ...prev,
      [name]: fieldError,
    }));
  };

  // signup field blur
  const handleRegisterBlur = (e) => {
    const { name, value } = e.target;

    setTouchedFields((prev) => ({
      ...prev,
      [name]: true,
    }));

    const fieldError = validateField(name, value);

    setRegisterErrors((prev) => ({
      ...prev,
      [name]: fieldError,
    }));
  };

  // fields per step
  const stepFields = {
    1: [
      "dialysisCenterName",
      "facilityType",
      "yearEstablished",
      "registrationNumber",
      "machines",
      "address",
      "mobile",
      "landline",
      "email",
    ],

    2: [
      "ownership",
      "ownerName",
      "medicalDirector",
      "nephrologist",
      "unitManager",
    ],

    3: [
      "purchasingContact",
      "designation",
      "procurementMobile",
      "procurementEmail",
    ],
  };

  // validate entire step
  const validateStep = (step) => {
    const fields = stepFields[step];

    const newErrors = {};
    const newTouched = {};

    fields.forEach((field) => {
      const error = validateField(field, formData[field]);

      newTouched[field] = true;

      if (error) {
        newErrors[field] = error;
      } else {
        newErrors[field] = "";
      }
    });

    setTouchedFields((prev) => ({
      ...prev,
      ...newTouched,
    }));

    setRegisterErrors((prev) => ({
      ...prev,
      ...newErrors,
    }));

    return Object.values(newErrors).every((error) => !error);
  };

  // next step
  const nextStep = () => {
    if (!validateStep(currentStep)) {
      return;
    }

    if (currentStep < 3) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  //preview step
  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // password visibility
  const toggleVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  // login change
  const handleLoginChange = (e) => {
    const { name, value } = e.target;

    setLoginData((prev) => ({
      ...prev,
      [name]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: "",
    }));

    setError("");
  };

  // login submit
  const handleLoginSubmit = async (e) => {
    e.preventDefault();

    if (loading) return;

    setLoading(true);

    setErrors({
      username: "",
      password: "",
    });

    setError("");

    // frontend login validation
    const localErrors = {};

    if (!loginData.username.trim()) {
      localErrors.username = "Username is required.";
    }

    if (!loginData.password) {
      localErrors.password = "Password is required.";
    }

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, loginData);

      const { token, role, username } = response.data;

      localStorage.setItem("token", token);
      localStorage.setItem("role", role);
      localStorage.setItem("username", username || loginData.username);

      toast.success("Login successful!");

      navigate(role.toLowerCase() === "admin" ? "/admin" : "/");
    } catch (err) {
      setLoading(false);

      const errorMsg = err.response?.data?.error || "Login failed";

      const lowerError = errorMsg.toLowerCase();

      if (lowerError.includes("username")) {
        setErrors({
          username: "Incorrect username.",
          password: "",
        });
      } else if (lowerError.includes("password")) {
        setErrors({
          username: "",
          password: "Incorrect password.",
        });
      } else if (
        lowerError.includes("not found") ||
        lowerError.includes("no credentials")
      ) {
        setErrors({
          username: "No credentials found. Please register.",
          password: "",
        });
      } else {
        setErrors({
          username: errorMsg,
          password: "",
        });
      }
    }
  };

  // Forgot Password
  const handleForgotPassword = async (e) => {
    e.preventDefault();

    if (resetLoading) return;

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

    setResetLoading(true);
    setResetMessage("");

    try {
      const verifyResponse = await axios.post(
        `${API_URL}/api/usersAccessControlPage/verify-email`,
        {
          email,
        },
      );

      if (!verifyResponse.data.exists) {
        setResetMessage("No account found with this email address.");
        setResetLoading(false);
        return;
      }

      await axios.post(
        `${API_URL}/api/usersAccessControlPage/forgot-password`,
        {
          email,
        },
      );

      setResetLoading(false);
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

      setResetLoading(false);
    }
  };

  // signup submit
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();

    if (registerLoading) return;

    const isValid = validateStep(3);

    if (!isValid) {
      return;
    }

    setRegisterLoading(true);

    const submissionData = {
      dialysisCenterName: formData.dialysisCenterName,
      facilityType: formData.facilityType,
      yearEstablished: formData.yearEstablished,
      registrationNumber: formData.registrationNumber,
      machines: formData.machines,
      address: formData.address,

      mobile: `${formData.mobileCountryCode}${formData.mobile.replace(/\s/g, "")}`,
      landline: formData.landline,

      email: formData.email,

      ownership: formData.ownership,
      ownerName: formData.ownerName,
      medicalDirector: formData.medicalDirector,
      nephrologist: formData.nephrologist,
      unitManager: formData.unitManager,

      purchasingContact: formData.purchasingContact,
      designation: formData.designation,

      procurementMobile: `${formData.procurementMobileCountryCode}${formData.procurementMobile.replace(/\s/g, "")}`,
      procurementEmail: formData.procurementEmail,
    };

    try {
      const response = await axios.post(
        `${API_URL}/api/auth/register-request`,
        submissionData,
      );

      setShowApplicationSuccessModal(true);

      // reset form
      // setCurrentStep(1);

      setFormData({
        dialysisCenterName: "",
        facilityType: "Standalone Dialysis Center",
        yearEstablished: "",
        registrationNumber: "",
        machines: "",
        address: "",
        mobileCountryCode: "+63",
        mobile: "",
        landlineCountryCode: "+63",
        landline: "",
        email: "",
        ownership: "Private",
        ownerName: "",
        medicalDirector: "",
        nephrologist: "",
        unitManager: "",
        purchasingContact: "",
        designation: "",
        procurementMobileCountryCode: "+63",
        procurementMobile: "",
        procurementEmail: "",
      });

      setRegisterErrors({
        dialysisCenterName: "",
        facilityType: "",
        yearEstablished: "",
        registrationNumber: "",
        machines: "",
        address: "",
        mobile: "",
        landline: "",
        email: "",
        ownership: "",
        ownerName: "",
        medicalDirector: "",
        nephrologist: "",
        unitManager: "",
        purchasingContact: "",
        designation: "",
        procurementMobile: "",
        procurementEmail: "",
      });

      setTouchedFields({});
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Submission failed.";

      const lowerError = errorMsg.toLowerCase();

      // backend validation error
      if (lowerError.includes("email")) {
        setRegisterErrors((prev) => ({
          ...prev,
          email: errorMsg,
        }));
      } else if (lowerError.includes("registration")) {
        setRegisterErrors((prev) => ({
          ...prev,
          registrationNumber: errorMsg,
        }));
      } else if (lowerError.includes("mobile")) {
        setRegisterErrors((prev) => ({
          ...prev,
          mobile: errorMsg,
        }));
      } else if (lowerError.includes("procurement")) {
        setRegisterErrors((prev) => ({
          ...prev,
          procurementEmail: lowerError.includes("email")
            ? errorMsg
            : prev.procurementEmail,
          procurementMobile: lowerError.includes("mobile")
            ? errorMsg
            : prev.procurementMobile,
        }));
      } else {
        setError(errorMsg);
      }

      toast.error(errorMsg);
    } finally {
      setRegisterLoading(false);
    }
  };

  // reset signup state when switching to signup
  const switchToSignup = () => {
    setIsLogin(false);
    setError("");
    setErrors({
      username: "",
      password: "",
    });
    setTouchedFields({});
  };

  // switch back to login
  const switchToLogin = () => {
    setIsLogin(true);
    setCurrentStep(1);
    setError("");
    setErrors({
      username: "",
      password: "",
    });
    setTouchedFields({});
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <div className="login-container">
        <div className={`login-card ${!isLogin ? "signup-mode" : ""}`}>
          {/* login brad section */}
          {isLogin && (
            <div className="login-brand-section">
              <img src={logo} alt="PremiuMed Logo" className="brand-logo" />

              <h1 className="brand-name">Premiumed Enterprises</h1>
            </div>
          )}

          <div className="login-form-section">
            <div className="form-wrapper">
              <h2 className="form-title">
                {isLogin ? "LOG IN" : "FACILITY REGISTRATION"}
              </h2>

              {/* login form */}
              {isLogin ? (
                <form onSubmit={handleLoginSubmit}>
                  <div className="input-group">
                    <input
                      type="text"
                      name="username"
                      placeholder="Username"
                      value={loginData.username}
                      onChange={handleLoginChange}
                      autoComplete="username"
                    />

                    {errors.username && (
                      <div className="inline-error-message">
                        {errors.username}
                      </div>
                    )}
                  </div>

                  <div className="input-group password-group">
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      placeholder="Password"
                      value={loginData.password}
                      onChange={handleLoginChange}
                      autoComplete="current-password"
                    />

                    {showPassword ? (
                      <FaEyeSlash
                        className="password-icon"
                        onClick={toggleVisibility}
                      />
                    ) : (
                      <FaEye
                        className="password-icon"
                        onClick={toggleVisibility}
                      />
                    )}

                    {errors.password && (
                      <div className="inline-error-message">
                        {errors.password}
                      </div>
                    )}
                  </div>

                  {error && <div className="inline-error-message">{error}</div>}

                  <div className="forgot-password-link login">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setShowForgotPasswordModal(true);
                      }}
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="login-btn"
                    disabled={loading}
                  >
                    {loading ? "LOGGING IN..." : "LOG IN"}
                  </button>
                </form>
              ) : (
                // signup form
                <form
                  onSubmit={handleRegisterSubmit}
                  className="signup-form-grid"
                >
                  {/* progress */}
                  <div className="signup-progress">
                    <div className="progress-top">
                      <div
                        className={`circle ${currentStep >= 1 ? "active" : ""}`}
                      >
                        1
                      </div>

                      <div
                        className={`progress-line ${
                          currentStep >= 2 ? "active" : ""
                        }`}
                      ></div>

                      <div
                        className={`circle ${currentStep >= 2 ? "active" : ""}`}
                      >
                        2
                      </div>

                      <div
                        className={`progress-line ${
                          currentStep >= 3 ? "active" : ""
                        }`}
                      ></div>

                      <div
                        className={`circle ${currentStep >= 3 ? "active" : ""}`}
                      >
                        3
                      </div>
                    </div>

                    <div className="progress-labels">
                      <span>Facility</span>
                      <span>Ownership</span>
                      <span>Procurement</span>
                    </div>
                  </div>

                  {/* step 1 */}
                  {currentStep === 1 && (
                    <>
                      <SectionTitle title="FACILITY INFORMATION" />

                      <div className="form-row">
                        <InputBox
                          label="Dialysis Center Name"
                          name="dialysisCenterName"
                          placeholder="Full name"
                          value={formData.dialysisCenterName}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          maxLength={100}
                          error={
                            touchedFields.dialysisCenterName
                              ? registerErrors.dialysisCenterName
                              : ""
                          }
                        />

                        <SelectBox
                          label="Type of Facility"
                          name="facilityType"
                          value={formData.facilityType}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          error={
                            touchedFields.facilityType
                              ? registerErrors.facilityType
                              : ""
                          }
                          options={[
                            "Standalone Dialysis Center",
                            "Hospital Based",
                            "Government Facility",
                          ]}
                        />
                      </div>

                      <div className="form-row">
                        <YearSelect
                          label="Year Established"
                          name="yearEstablished"
                          value={formData.yearEstablished}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          error={
                            touchedFields.yearEstablished
                              ? registerErrors.yearEstablished
                              : ""
                          }
                        />

                        <InputBox
                          label="Registration Number / LTO Number"
                          name="registrationNumber"
                          placeholder="DOH-LTO-YYYY-000000"
                          value={formData.registrationNumber}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          maxLength={19}
                          error={
                            touchedFields.registrationNumber
                              ? registerErrors.registrationNumber
                              : ""
                          }
                        />
                      </div>

                      <div className="form-row">
                        <InputBox
                          label="Number of Dialysis Machine / Units"
                          name="machines"
                          placeholder="No. of machine"
                          value={formData.machines}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          inputMode="numeric"
                          maxLength={3}
                          error={
                            touchedFields.machines
                              ? registerErrors.machines
                              : ""
                          }
                        />

                        <InputBox
                          label="Registered Address"
                          name="address"
                          placeholder="City, Province"
                          value={formData.address}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          maxLength={250}
                          error={
                            touchedFields.address ? registerErrors.address : ""
                          }
                        />
                      </div>

                      <div className="form-row mobilePhone">
                        <PhoneInput
                          label="Mobile Number"
                          countryCodeName="mobileCountryCode"
                          phoneName="mobile"
                          countryCode={formData.mobileCountryCode}
                          value={formData.mobile}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          error={
                            touchedFields.mobile ? registerErrors.mobile : ""
                          }
                        />

                        <InputBox
                          label="Landline Number"
                          name="landline"
                          placeholder="X0-0000-0000"
                          value={formData.landline}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          inputMode="numeric"
                          maxLength={12}
                          error={
                            touchedFields.landline
                              ? registerErrors.landline
                              : ""
                          }
                        />
                      </div>

                      <InputBox
                        label="Email Address"
                        name="email"
                        type="email"
                        placeholder="example@gmail.com"
                        value={formData.email}
                        onChange={handleRegisterChange}
                        onBlur={handleRegisterBlur}
                        autoComplete="email"
                        maxLength={150}
                        error={touchedFields.email ? registerErrors.email : ""}
                        full
                      />

                      <div className="step-buttons">
                        <button
                          type="button"
                          className="next-btn"
                          onClick={nextStep}
                        >
                          Next
                        </button>
                      </div>
                    </>
                  )}

                  {/* step 2 */}
                  {currentStep === 2 && (
                    <>
                      <SectionTitle title="OWNERSHIP" />

                      <div className="form-row ownership-container">
                        <div className="radio-group">
                          {["Private", "Partnership", "Government"].map(
                            (type) => (
                              <label key={type}>
                                <input
                                  type="radio"
                                  name="ownership"
                                  value={type}
                                  checked={formData.ownership === type}
                                  onChange={handleRegisterChange}
                                />

                                {type}
                              </label>
                            ),
                          )}

                          {touchedFields.ownership &&
                            registerErrors.ownership && (
                              <div className="inline-error-message">
                                {registerErrors.ownership}
                              </div>
                            )}
                        </div>

                        <InputBox
                          label="Owner's Name"
                          name="ownerName"
                          placeholder="Full name"
                          value={formData.ownerName}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          maxLength={100}
                          error={
                            touchedFields.ownerName
                              ? registerErrors.ownerName
                              : ""
                          }
                        />
                      </div>

                      <div className="form-row">
                        <InputBox
                          label="Medical Director's Name"
                          name="medicalDirector"
                          placeholder="ex: MD, FPCP, FPSN"
                          value={formData.medicalDirector}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          maxLength={100}
                          error={
                            touchedFields.medicalDirector
                              ? registerErrors.medicalDirector
                              : ""
                          }
                        />

                        <InputBox
                          label="Nephrologist Name"
                          name="nephrologist"
                          placeholder="ex. MD, FPSN"
                          value={formData.nephrologist}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          maxLength={100}
                          error={
                            touchedFields.nephrologist
                              ? registerErrors.nephrologist
                              : ""
                          }
                        />
                      </div>

                      <InputBox
                        label="Unit Manager / Administrator"
                        name="unitManager"
                        placeholder="ex: RN, MAN"
                        value={formData.unitManager}
                        onChange={handleRegisterChange}
                        onBlur={handleRegisterBlur}
                        maxLength={100}
                        error={
                          touchedFields.unitManager
                            ? registerErrors.unitManager
                            : ""
                        }
                        full
                      />

                      <div className="step-buttons">
                        <button
                          type="button"
                          className="prev-btn"
                          onClick={prevStep}
                        >
                          Previous
                        </button>

                        <button
                          type="button"
                          className="next-btn"
                          onClick={nextStep}
                        >
                          Next
                        </button>
                      </div>
                    </>
                  )}

                  {/* step 3 */}
                  {currentStep === 3 && (
                    <>
                      <SectionTitle title="PROCUREMENT & ACCOUNTS INFORMATION" />

                      <div className="form-row">
                        <InputBox
                          label="Purchasing Contact Person"
                          name="purchasingContact"
                          placeholder="Full name"
                          value={formData.purchasingContact}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          maxLength={100}
                          error={
                            touchedFields.purchasingContact
                              ? registerErrors.purchasingContact
                              : ""
                          }
                        />

                        <InputBox
                          label="Designation"
                          name="designation"
                          placeholder="ex: Procurement Manager"
                          value={formData.designation}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          maxLength={100}
                          error={
                            touchedFields.designation
                              ? registerErrors.designation
                              : ""
                          }
                        />
                      </div>

                      <div className="form-row">
                        <PhoneInput
                          label="Mobile Number"
                          countryCodeName="procurementMobileCountryCode"
                          phoneName="procurementMobile"
                          countryCode={formData.procurementMobileCountryCode}
                          value={formData.procurementMobile}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          error={
                            touchedFields.procurementMobile
                              ? registerErrors.procurementMobile
                              : ""
                          }
                        />

                        <InputBox
                          label="Email Address"
                          name="procurementEmail"
                          type="email"
                          placeholder="example@gmail.com"
                          value={formData.procurementEmail}
                          onChange={handleRegisterChange}
                          onBlur={handleRegisterBlur}
                          autoComplete="email"
                          maxLength={150}
                          error={
                            touchedFields.procurementEmail
                              ? registerErrors.procurementEmail
                              : ""
                          }
                        />
                      </div>

                      <div className="step-buttons">
                        <button
                          type="button"
                          className="prev-btn"
                          onClick={prevStep}
                        >
                          Previous
                        </button>

                        <button
                          type="submit"
                          className="signup-submit"
                          disabled={registerLoading}
                        >
                          {registerLoading
                            ? "Submitting..."
                            : "Submit Application"}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              )}
              {/* auth switch */}
              <p className="toggle-auth">
                {isLogin ? "New Client?" : "Already have a request?"}

                <span onClick={isLogin ? switchToSignup : switchToLogin}>
                  {isLogin ? " Sign Up" : " Back to Login"}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPasswordModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!resetLoading) {
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
                disabled={resetLoading}
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
                  if (!resetLoading) {
                    setShowForgotPasswordModal(false);
                    setResetEmail("");
                    setResetMessage("");
                  }
                }}
                disabled={resetLoading}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn-confirm"
                onClick={handleForgotPassword}
                disabled={resetLoading || !resetEmail.trim()}
              >
                {" "}
                {resetLoading ? "Sending..." : "Send Reset Link"}{" "}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Succes Email Modal */}
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

      {/* Application Success Modal */}
      {showApplicationSuccessModal && (
        <div className="modal-overlay">
          <div className="modal-card application-success-card">
            <div className="check-email-icon">
              <FaCheck />
            </div>

            <h3>Application Submitted</h3>

            <p>
              Your application has been successfully submitted and is now
              waiting for review. You will be notified once your application has
              been processed.
            </p>

            <button
              type="button"
              className="finish-btn"
              onClick={() => {
                setShowApplicationSuccessModal(false);
                setIsLogin(true);
                setCurrentStep(1);
              }}
            >
              Continue to Login
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// section title
const SectionTitle = ({ title }) => (
  <div className="signup-section-header">
    <span className="gold-bar">|</span> {title}
  </div>
);

// input box
const InputBox = ({ label, error, full, ...props }) => (
  <div className={`signup-input-group ${full ? "full-width" : ""}`}>
    <label>{label}</label>

    <input {...props} className={error ? "input-error" : ""} />

    {error && <div className="inline-error-message">{error}</div>}
  </div>
);

// select box
const SelectBox = ({ label, error, options, ...props }) => (
  <div className="signup-input-group">
    <label>{label}</label>

    <select
      {...props}
      className={`custom-select ${error ? "input-error" : ""}`}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>

    {error && <div className="inline-error-message">{error}</div>}
  </div>
);

// year select
const YearSelect = ({ label, name, value, onChange, onBlur, error }) => {
  const currentYear = new Date().getFullYear();

  const years = [];

  for (let year = currentYear; year >= 1970; year--) {
    years.push(year);
  }

  return (
    <div className="signup-input-group">
      <label>{label}</label>

      <select
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        className={`custom-select ${error ? "input-error" : ""}`}
      >
        <option value="">Select Year</option>

        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>

      {error && <div className="inline-error-message">{error}</div>}
    </div>
  );
};

// phone input
const PhoneInput = ({
  label,
  countryCodeName,
  phoneName,
  countryCode,
  value,
  onChange,
  onBlur,
  error,
  placeholder = "xxx xxx xxxx",
  required = true,
}) => {
  return (
    <div className="signup-input-group">
      <label>
        {label}
        {required && <span className="required-mark">*</span>}
      </label>

      <div
        className={`phone-input-wrapper ${error ? "phone-input-error" : ""}`}
      >
        <select
          name={countryCodeName}
          value={countryCode}
          onChange={onChange}
          className="custom-select country-code"
        >
          {COUNTRY_CODES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.flag} {country.code}
            </option>
          ))}
        </select>

        <input
          type="tel"
          name={phoneName}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          inputMode="numeric"
          autoComplete="tel"
          className="phone-number-input"
        />
      </div>

      {error && <div className="inline-error-message">{error}</div>}
    </div>
  );
};

export default Login;
