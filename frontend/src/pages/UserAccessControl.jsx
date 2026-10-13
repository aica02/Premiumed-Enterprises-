import React, { useState, useEffect } from "react";
import {
  FaSearch,
  FaPlusCircle,
  FaTimes,
  FaKey,
  FaUserCheck,
  FaUserTimes,
} from "react-icons/fa";
import { IoPersonCircle } from "react-icons/io5";
import axios from "axios";
import "../styles/UserAccessControl.css";
import "../styles/Modals.css";
import "../styles/ConfirmModal.css";
import "../styles/capsules.css";
import "../styles/formValidation.css";
import { Toaster, toast } from "react-hot-toast";
import EmptyState from "../components/EmptyState";
import {
  COUNTRY_CODES,
  FIELD_MAX_LENGTHS,
  formatFieldInput,
  formatInternationalPhone,
} from "../utils/fieldFormatting";
import { validateField, validateFields } from "../utils/formValidation";

const API_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");
const EMPLOYEE_VALIDATION_FIELDS = [
  "fullName",
  "address",
  "phoneNumber",
  "email",
  "role",
];
const EMPLOYEE_VALIDATION_OPTIONS = {
  address: { required: true, label: "Address" },
};

const UsersAccessControl = () => {
  const [activeModal, setActiveModal] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [roleFilter, setRoleFilter] = useState("All");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touchedFields, setTouchedFields] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);

  const initialForm = {
    fullName: "",
    address: "",
    phoneNumber: "",
    phoneCountryCode: "+63",
    email: "",
    role: "",
    username: "",
    password: "",
    profileImage: "",
    profileImageFile: null,
    _id: null,
    employeeId: null,
    status: "Active",
  };
  const [formData, setFormData] = useState(initialForm);

  const validateEmployeeForm = () => {
    const nextErrors = validateFields(
      formData,
      EMPLOYEE_VALIDATION_FIELDS,
      EMPLOYEE_VALIDATION_OPTIONS,
    );
    setTouchedFields(
      EMPLOYEE_VALIDATION_FIELDS.reduce((touched, field) => {
        touched[field] = true;
        return touched;
      }, {}),
    );
    setFieldErrors(nextErrors);
    return Object.values(nextErrors).every((fieldError) => !fieldError);
  };

  const handleEmployeeFieldChange = (name, inputValue) => {
    const formatName =
      name === "phoneNumber"
        ? "mobile"
        : name === "fullName"
          ? "ownerName"
          : name;
    const value = formatFieldInput(formatName, inputValue);
    setFormData((prev) => ({ ...prev, [name]: value }));
    setTouchedFields((prev) => ({ ...prev, [name]: true }));
    setFieldErrors((prev) => ({
      ...prev,
      [name]: validateField(name, value, EMPLOYEE_VALIDATION_OPTIONS[name]),
    }));
  };

  const handleEmployeeFieldBlur = (name, value) => {
    setTouchedFields((prev) => ({ ...prev, [name]: true }));
    setFieldErrors((prev) => ({
      ...prev,
      [name]: validateField(name, value, EMPLOYEE_VALIDATION_OPTIONS[name]),
    }));
  };

  const handleGeneratePassword = () => {
    const charset =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!";
    let generated = "";
    for (let i = 0; i < 10; i++) {
      generated += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setFormData({ ...formData, password: generated });
    toast.success("Password generated!");
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size should be less than 5MB");
        return;
      }
      setFormData({
        ...formData,
        profileImage: URL.createObjectURL(file),
        profileImageFile: file,
      });
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/usersAccessControlPage`);
      setEmployees(res.data);
    } catch (err) {
      console.error("Fetch error", err);
      toast.error("Failed to fetch employees");
    }
  };

  const uploadImageToCloudinary = async (file, username) => {
    try {
      const formData = new FormData();
      formData.append("profileImage", file);

      const response = await axios.post(
        `${API_URL}/api/usersAccessControlPage/upload-image/${username}`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Image upload error:", error);
      throw error;
    }
  };

  const handleSaveEmployee = async () => {
    if (!validateEmployeeForm()) return;
    const email = formatFieldInput("email", formData.email).trim();
    const phoneNumber = formData.phoneNumber.trim();
    const phoneNumberWithCountryCode = phoneNumber
      ? formatInternationalPhone(
          formData.phoneCountryCode || "+63",
          phoneNumber,
        )
      : "";

    setIsSaving(true);
    setError(null);

    try {
      const roleMap = {
        admin: "Admin",
        staff: "Staff",
        driver: "Driver",
        user: "User",
      };

      const fd = new FormData();
      fd.append("fullName", formData.fullName.trim());
      fd.append("email", email);
      fd.append("role", roleMap[formData.role?.toLowerCase()] || formData.role);
      fd.append("phoneNumber", phoneNumberWithCountryCode);
      fd.append("address", formData.address || "");
      fd.append("status", formData.status || "Active");

      if (formData.profileImageFile) {
        fd.append("profileImage", formData.profileImageFile);
      }

      const response = await axios.post(
        `${API_URL}/api/usersAccessControlPage`,
        fd,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );

      const { user: createdUser, emailSent } = response.data;

      setFormData({ ...initialForm });
      setActiveModal(null);

      toast.success(
        emailSent
          ? "Employee created! Credentials sent to email."
          : "Employee created, but the email could not be sent.",
      );

      fetchEmployees();
    } catch (error) {
      const errorMsg =
        error.response?.data?.error ||
        error.message ||
        "Failed to save employee";
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };
  const handleUpdateProfile = async () => {
    if (!validateEmployeeForm()) return;
    setIsSaving(true);
    try {
      const phoneDigits = (formData.phoneNumber || "").replace(/\D/g, "");
      const countryDigits = (formData.phoneCountryCode || "+63").replace(
        /\D/g,
        "",
      );
      const localPhoneDigits = phoneDigits.startsWith(countryDigits)
        ? phoneDigits.slice(countryDigits.length)
        : phoneDigits;
      const formattedPhone = formatFieldInput("mobile", localPhoneDigits);
      const formattedEmail = formatFieldInput("email", formData.email || "");
      const formattedFullName = (formData.fullName || "")
        .replace(/\s{2,}/g, " ")
        .trim();
      const formattedAddress = (formData.address || "")
        .replace(/\s{2,}/g, " ")
        .trim();

      const formDataToSend = new FormData();

      formDataToSend.append("fullName", formattedFullName);
      formDataToSend.append("email", formattedEmail);
      formDataToSend.append(
        "phoneNumber",
        formattedPhone
          ? formatInternationalPhone(
              formData.phoneCountryCode || "+63",
              formattedPhone,
            )
          : "",
      );
      formDataToSend.append("address", formattedAddress);
      formDataToSend.append("role", formData.role || "");

      if (formData.profileImageFile) {
        formDataToSend.append("profileImage", formData.profileImageFile);
      }

      const response = await axios.put(
        `${API_URL}/api/usersAccessControlPage/${formData._id}`,
        formDataToSend,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );
      await fetchEmployees();

      const updatedUser = response.data;
      setFormData({
        ...updatedUser,
        phoneCountryCode:
          updatedUser.phoneCountryCode || formData.phoneCountryCode || "+63",
        phoneNumber: updatedUser.phoneNumber || "",
        profileImage: updatedUser.profileImage || formData.profileImage,
        profileImageFile: null,
      });

      setIsEditing(false);
      toast.success("Employee profile updated successfully!");
    } catch (error) {
      console.error("Update error:", error);
      const errorMsg =
        error.response?.data?.error ||
        error.message ||
        "Failed to update employee profile";
      toast.error(errorMsg);
      setError(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async (id, currentStatus) => {
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
    try {
      await axios.patch(
        `${API_URL}/api/usersAccessControlPage/${id}`,
        { status: newStatus },
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );
      fetchEmployees();
      toast.success(
        `Employee ${newStatus === "Active" ? "activated" : "deactivated"} successfully!`,
      );
    } catch (err) {
      toast.error("Failed to change status");
    }
  };

  const openStatusConfirmation = (employee) => {
    const action = employee.status === "Active" ? "deactivate" : "activate";

    setConfirmModal({ employee, action });
  };

  const closeStatusConfirmation = () => {
    setConfirmModal(null);
  };

  const handleConfirmedStatusChange = async () => {
    if (!confirmModal?.employee) return;

    const { employee } = confirmModal;
    closeStatusConfirmation();

    await handleDeactivate(employee._id, employee.status);
  };

  const openViewProfile = (emp) => {
    setFormData({
      ...emp,
      phoneCountryCode: emp.phoneCountryCode || "+63",
      phoneNumber: emp.phoneNumber || "",
      profileImage: emp.profileImage || "",
      profileImageFile: null,
    });
    setFieldErrors({});
    setTouchedFields({});
    setError(null);
    setIsEditing(false);
    setActiveModal("viewProfile");
  };

  const closeModal = () => {
    setActiveModal(null);
    setFormData(initialForm);
    setError(null);
    setFieldErrors({});
    setTouchedFields({});
    setIsEditing(false);
  };

  const toggleEditMode = () => {
    if (isEditing) {
      handleUpdateProfile();
    } else {
      if (activeModal === "viewProfile") {
        const storedPhone = (formData.phoneNumber || "").trim();
        const country = [...COUNTRY_CODES]
          .sort(
            (a, b) =>
              b.code.replace(/\D/g, "").length -
              a.code.replace(/\D/g, "").length,
          )
          .find((item) => storedPhone.startsWith(item.code));
        const countryCode = country?.code || formData.phoneCountryCode || "+63";
        const phoneDigits = storedPhone.replace(/\D/g, "");
        const countryDigits = countryCode.replace(/\D/g, "");
        const localPhoneDigits =
          country && phoneDigits.startsWith(countryDigits)
            ? phoneDigits.slice(countryDigits.length)
            : phoneDigits;

        setFormData({
          ...formData,
          phoneCountryCode: countryCode,
          phoneNumber: formatFieldInput("mobile", localPhoneDigits),
        });
      }
      setFieldErrors({});
      setTouchedFields({});
      setIsEditing(true);
    }
  };

  const filteredEmployees = employees
    .filter((emp) => {
      const matchesSearch = emp.fullName
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "All" || emp.status === statusFilter;
      const matchesRole = roleFilter === "All" || emp.role === roleFilter;
      const notUserRole = emp.role !== "User";

      return matchesSearch && matchesStatus && matchesRole && notUserRole;
    })
    .sort(
      (a, b) =>
        Number((b.status || "Active") === "Active") -
        Number((a.status || "Active") === "Active"),
    );

  const uniqueRoles = [
    "All",
    ...new Set(
      employees
        .map((emp) => emp.role)
        .filter((role) => role && role !== "User"),
    ),
  ];

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <div className="users-container">
        <div className="users-header">
          <div className="search-wrapper-large">
            <FaSearch className="search-icon-gold" />
            <input
              type="text"
              placeholder="Search Employee by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            className="add-employee-btn"
            onClick={() => {
              setFormData(initialForm);
              setFieldErrors({});
              setTouchedFields({});
              setError(null);
              setIsEditing(false);
              setActiveModal("addEmployee");
            }}
          >
            <FaPlusCircle className="plus-icon" /> ADD NEW EMPLOYEE
          </button>
        </div>

        <div className="info-card employee-table">
          <div className="filters-select-container UAC">
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>

            <select
              className="filter-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="All">All Roles</option>
              {uniqueRoles
                .filter((role) => role !== "All" && role !== "all")
                .map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
            </select>
          </div>

          <div className="employee-table-wrapper">
            <table className="info-table">
              <thead className="fixed-table-row">
                <tr>
                  <th className="employee-id">Employee ID</th>
                  <th className="employee-name">Employee Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className="employee-actions">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map((emp) => (
                    <tr key={emp._id}>
                      <td className="employee-id">{emp.employeeId || "N/A"}</td>
                      <td className="employee-name">{emp.fullName}</td>
                      <td>
                        <span className="status-capsule employee-role">
                          {emp.role}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-capsule status-${emp.status?.toLowerCase() || "active"}`}
                        >
                          {emp.status || "Active"}
                        </span>
                      </td>
                      <td className="action-column">
                        <button
                          className="view-profile-btn"
                          onClick={() => openViewProfile(emp)}
                        >
                          VIEW
                        </button>
                        <button
                          className={`deact-btn ${emp.status !== "Active" ? "activate-mode" : ""}`}
                          onClick={() => openStatusConfirmation(emp)}
                        >
                          {emp.status === "Active" ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-order-cell">
                      <EmptyState
                        title={
                          searchTerm ||
                          statusFilter !== "All" ||
                          roleFilter !== "All"
                            ? "No matching employees"
                            : "No employees yet"
                        }
                        message={
                          searchTerm ||
                          statusFilter !== "All" ||
                          roleFilter !== "All"
                            ? "We couldn't find any employee records that match your current search or filters."
                            : "Employee accounts will appear here once they are added to the system."
                        }
                        buttonText={
                          searchTerm ||
                          statusFilter !== "All" ||
                          roleFilter !== "All"
                            ? "Clear Search & Filters"
                            : undefined
                        }
                        onButtonClick={
                          searchTerm ||
                          statusFilter !== "All" ||
                          roleFilter !== "All"
                            ? () => {
                                setSearchTerm("");
                                setStatusFilter("All");
                                setRoleFilter("All");
                              }
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {confirmModal && (
          <div className="confirm-modal-overlay">
            <div className="confirm-modal-card">
              <div
                className="confirm-modal-icon"
                style={{
                  color:
                    confirmModal.action === "deactivate"
                      ? "#ff3131"
                      : "#22a06b",
                }}
              >
                {confirmModal.action === "deactivate" ? (
                  <FaUserTimes />
                ) : (
                  <FaUserCheck />
                )}
              </div>

              <h3 className="confirm-modal-title">
                {confirmModal.action === "deactivate"
                  ? "Deactivate Employee?"
                  : "Activate Employee?"}
              </h3>

              <p className="confirm-modal-message">
                {confirmModal.action === "deactivate" ? (
                  <>
                    The account of{" "}
                    <strong>{confirmModal.employee.fullName}</strong> will be
                    deactivated and they will no longer be able to access the
                    system.
                  </>
                ) : (
                  <>
                    The account of{" "}
                    <strong>{confirmModal.employee.fullName}</strong> will be
                    activated and they will regain access to the system.
                  </>
                )}
              </p>

              <div className="confirm-modal-footer">
                <button
                  className="confirm-modal-btn confirm-modal-btn-cancel"
                  onClick={closeStatusConfirmation}
                >
                  Cancel
                </button>

                <button
                  className="confirm-modal-btn confirm-modal-btn-confirm"
                  onClick={handleConfirmedStatusChange}
                  style={{
                    background:
                      confirmModal.action === "activate"
                        ? "#22a06b"
                        : "#ff3131",
                    borderColor:
                      confirmModal.action === "activate"
                        ? "#22a06b"
                        : "#ff3131",
                  }}
                >
                  {confirmModal.action === "deactivate"
                    ? "Deactivate"
                    : "Activate"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL SECTION */}
        {(activeModal === "addEmployee" || activeModal === "viewProfile") && (
          <div className="employee-modal-overlay">
            <div className="employee-modal-container">
              <div className="employee-modal-header">
                <h3>
                  {activeModal === "addEmployee"
                    ? "ADD NEW EMPLOYEE"
                    : isEditing
                      ? "EDIT EMPLOYEE"
                      : "VIEW EMPLOYEE"}
                </h3>
                <FaTimes className="employee-close-icon" onClick={closeModal} />
              </div>

              <div className="employee-modal-body">
                <div className="employee-image-placeholder">
                  <input
                    type="file"
                    id="fileInput"
                    style={{ display: "none" }}
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={!isEditing && activeModal === "viewProfile"}
                  />
                  <label
                    htmlFor="fileInput"
                    style={{
                      cursor:
                        isEditing || activeModal === "addEmployee"
                          ? "pointer"
                          : "default",
                    }}
                  >
                    {formData.profileImage ? (
                      <img
                        src={
                          formData.profileImage.startsWith("/uploads") ||
                          formData.profileImage.startsWith("http")
                            ? formData.profileImage
                            : formData.profileImage
                        }
                        alt="Profile"
                        className="uploaded-img"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = "";
                        }}
                      />
                    ) : (
                      <IoPersonCircle
                        style={{ fontSize: "150px", color: "gray" }}
                      />
                    )}
                  </label>
                  {(isEditing || activeModal === "addEmployee") && (
                    <button
                      className="profile-btn"
                      onClick={() =>
                        document.getElementById("fileInput").click()
                      }
                    >
                      {formData.profileImage ? "CHANGE PHOTO" : "ADD PHOTO"}
                    </button>
                  )}
                </div>

                <div className="employee-form">
                  {error && (
                    <div
                      className="error-message"
                      style={{
                        color: "red",
                        marginBottom: "10px",
                        padding: "10px",
                        backgroundColor: "#ffebee",
                        borderRadius: "4px",
                        border: "1px solid #ffcdd2",
                      }}
                    >
                      <strong>Error:</strong> {error}
                    </div>
                  )}

                  <div className="form-title">
                    <p className="label">Personal Information</p>
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="employee-full-name">
                      Full Name
                    </label>
                    <input
                      id="employee-full-name"
                      type="text"
                      placeholder="Full name"
                      value={formData.fullName || ""}
                      className={fieldErrors.fullName ? "input-error" : ""}
                      onChange={(e) =>
                        handleEmployeeFieldChange("fullName", e.target.value)
                      }
                      onBlur={(e) =>
                        handleEmployeeFieldBlur("fullName", e.target.value)
                      }
                      disabled={!isEditing && activeModal === "viewProfile"}
                    />
                    {touchedFields.fullName && fieldErrors.fullName && (
                      <div className="inline-error-message">
                        {fieldErrors.fullName}
                      </div>
                    )}
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="employee-address">
                      Address
                    </label>
                    <input
                      id="employee-address"
                      type="text"
                      placeholder="City, Province"
                      value={formData.address || ""}
                      className={fieldErrors.address ? "input-error" : ""}
                      onChange={(e) =>
                        handleEmployeeFieldChange("address", e.target.value)
                      }
                      onBlur={(e) =>
                        handleEmployeeFieldBlur("address", e.target.value)
                      }
                      disabled={!isEditing && activeModal === "viewProfile"}
                    />
                    {touchedFields.address && fieldErrors.address && (
                      <div className="inline-error-message">
                        {fieldErrors.address}
                      </div>
                    )}
                  </div>
                  <div className="field-group">
                    <label
                      className="field-label"
                      htmlFor="employee-phone-number"
                    >
                      Phone
                    </label>
                    {activeModal === "addEmployee" || isEditing ? (
                      <div className="employee-phone-input">
                        <select
                          aria-label="Mobile country code"
                          className="employee-phone-country-code"
                          value={formData.phoneCountryCode || "+63"}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              phoneCountryCode: e.target.value,
                            })
                          }
                        >
                          {COUNTRY_CODES.map((country) => (
                            <option key={country.code} value={country.code}>
                              {country.flag} {country.code}
                            </option>
                          ))}
                        </select>
                        <input
                          id="employee-phone-number"
                          className={`employee-phone-input ${fieldErrors.phoneNumber ? "input-error" : ""}`}
                          type="tel"
                          placeholder="xxx xxx xxxx"
                          value={formData.phoneNumber || ""}
                          onChange={(e) =>
                            handleEmployeeFieldChange(
                              "phoneNumber",
                              e.target.value,
                            )
                          }
                          onBlur={(e) =>
                            handleEmployeeFieldBlur(
                              "phoneNumber",
                              e.target.value,
                            )
                          }
                          inputMode="numeric"
                          autoComplete="tel-national"
                          maxLength={FIELD_MAX_LENGTHS.mobile}
                          required={activeModal === "addEmployee"}
                        />
                      </div>
                    ) : (
                      <input
                        id="employee-phone-number"
                        type="text"
                        placeholder="Phone Number"
                        value={formData.phoneNumber || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            phoneNumber: formatFieldInput(
                              "mobile",
                              e.target.value,
                            ),
                          })
                        }
                        disabled={!isEditing && activeModal === "viewProfile"}
                      />
                    )}
                    {touchedFields.phoneNumber && fieldErrors.phoneNumber && (
                      <div className="inline-error-message">
                        {fieldErrors.phoneNumber}
                      </div>
                    )}
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="employee-email">
                      Email
                    </label>
                    <input
                      id="employee-email"
                      type="email"
                      placeholder="example@gmail.com"
                      value={formData.email || ""}
                      className={fieldErrors.email ? "input-error" : ""}
                      onChange={(e) =>
                        handleEmployeeFieldChange("email", e.target.value)
                      }
                      onBlur={(e) =>
                        handleEmployeeFieldBlur("email", e.target.value)
                      }
                      autoComplete={
                        activeModal === "addEmployee" ? "email" : undefined
                      }
                      maxLength={
                        activeModal === "addEmployee"
                          ? FIELD_MAX_LENGTHS.email
                          : undefined
                      }
                      disabled={!isEditing && activeModal === "viewProfile"}
                    />
                    {touchedFields.email && fieldErrors.email && (
                      <div className="inline-error-message">
                        {fieldErrors.email}
                      </div>
                    )}
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="employee-role">
                      Role
                    </label>
                    <select
                      id="employee-role"
                      className={`role-selection ${fieldErrors.role ? "input-error" : ""}`}
                      value={formData.role || ""}
                      onChange={(e) =>
                        handleEmployeeFieldChange("role", e.target.value)
                      }
                      onBlur={(e) =>
                        handleEmployeeFieldBlur("role", e.target.value)
                      }
                      disabled={!isEditing && activeModal === "viewProfile"}
                    >
                      <option value="">Select Role *</option>
                      <option value="Admin">Admin</option>
                      <option value="Staff">Staff</option>
                      <option value="Driver">Driver</option>
                    </select>
                    {touchedFields.role && fieldErrors.role && (
                      <div className="inline-error-message">
                        {fieldErrors.role}
                      </div>
                    )}
                  </div>

                  {formData._id && formData.employeeId && (
                    <div className="field-group">
                      <label className="field-label" htmlFor="employee-id">
                        Employee ID
                      </label>
                      <input
                        id="employee-id"
                        type="text"
                        value={formData.employeeId}
                        disabled
                      />
                    </div>
                  )}

                  {/* <div className="form-title">
                    <p className="label">Account Registration</p>
                  </div> */}

                  {/* <input 
                    type="text" 
                    placeholder="Username *" 
                    value={formData.username || ''} 
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    disabled={activeModal === "viewProfile" || (activeModal === "addEmployee" && isEditing)}
                  />
                  
                  {!formData._id && (
                    <div className="password-field">
                      <input 
                        className="password-input"
                        type="text" 
                        placeholder="Password * (or generate one)" 
                        value={formData.password || ''} 
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                      />
                      <button type="button" className="generate-pw-link" onClick={handleGeneratePassword}>
                        <FaKey className="passKey-icon"/> Generate Password
                      </button>
                    </div>
                  )} */}

                  <div className="employee-modal-buttons">
                    <button className="cancel-btn" onClick={closeModal}>
                      CANCEL
                    </button>
                    {activeModal === "addEmployee" ? (
                      <button
                        className="save-employee-btn"
                        onClick={handleSaveEmployee}
                        disabled={isSaving}
                      >
                        {isSaving ? "SAVING..." : "SAVE PROFILE"}
                      </button>
                    ) : (
                      <button
                        className="save-employee-btn"
                        onClick={toggleEditMode}
                        disabled={isSaving}
                      >
                        {isSaving
                          ? "SAVING..."
                          : isEditing
                            ? "SAVE PROFILE"
                            : "EDIT PROFILE"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default UsersAccessControl;
