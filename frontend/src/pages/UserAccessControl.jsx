import React, { useState, useEffect } from "react";
import { FaSearch, FaPlusCircle, FaTimes, FaKey } from "react-icons/fa";
import { IoPersonCircle } from "react-icons/io5";
import axios from "axios";
import "../styles/UserAccessControl.css";
import "../styles/Modals.css";
import "../styles/capsules.css";
import { Toaster, toast } from "react-hot-toast";
import EmptyState from "../components/EmptyState";

const API_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");

const UsersAccessControl = () => {
  const [activeModal, setActiveModal] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [roleFilter, setRoleFilter] = useState("All");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const initialForm = {
    fullName: "",
    address: "",
    phoneNumber: "",
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
  const requiredFields = ["fullName", "role", "email"];
  const missingFields = requiredFields.filter(
    (field) => !formData[field]?.trim(),
  );

  if (missingFields.length > 0) {
    const errorMsg = `Missing required fields: ${missingFields.join(", ")}`;
    setError(errorMsg);
    toast.error(errorMsg);
    return;
  }

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
    fd.append("email", formData.email.trim());
    fd.append("role", roleMap[formData.role?.toLowerCase()] || formData.role);
    fd.append("phoneNumber", formData.phoneNumber || "");
    fd.append("address", formData.address || "");
    fd.append("status", formData.status || "Active");

    if (formData.profileImageFile) {
      fd.append("profileImage", formData.profileImageFile); 
    }

    const response = await axios.post(
      `${API_URL}/api/usersAccessControlPage`,
      fd,
      { headers: { "Content-Type": "multipart/form-data" } },
    );

    const { user: createdUser, emailSent } = response.data;

    setFormData({ ...initialForm });
    setActiveModal(null);

    toast.success(
      emailSent
        ? "Employee created! Credentials sent to email."
        : "Employee created, but the email could not be sent."
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
    setIsSaving(true);
    try {
      const formDataToSend = new FormData();

      formDataToSend.append("fullName", formData.fullName || "");
      formDataToSend.append("email", formData.email || "");
      formDataToSend.append("phoneNumber", formData.phoneNumber || "");
      formDataToSend.append("address", formData.address || "");
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
          },
        },
      );
      await fetchEmployees();

      const updatedUser = response.data;
      setFormData({
        ...updatedUser,
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

  const openViewProfile = (emp) => {
    setFormData({
      ...emp,
      profileImage: emp.profileImage || "",
      profileImageFile: null,
    });
    setIsEditing(false);
    setActiveModal("viewProfile");
  };

  const closeModal = () => {
    setActiveModal(null);
    setFormData(initialForm);
    setError(null);
    setIsEditing(false);
  };

  const toggleEditMode = () => {
    if (isEditing) {
      handleUpdateProfile();
    } else {
      setIsEditing(true);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch = emp.fullName
      ?.toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || emp.status === statusFilter;
    const matchesRole = roleFilter === "All" || emp.role === roleFilter;
    const notUserRole = emp.role !== "User";

    return matchesSearch && matchesStatus && matchesRole && notUserRole;
  });

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
                          onClick={() => {
                            const action =
                              emp.status === "Active"
                                ? "deactivate"
                                : "activate";
                            const confirmMessage = `Are you sure you want to ${action} this employee?`;
                            if (window.confirm(confirmMessage)) {
                              handleDeactivate(emp._id, emp.status);
                            }
                          }}
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
                  <input
                    type="text"
                    placeholder="Full Name *"
                    value={formData.fullName || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, fullName: e.target.value })
                    }
                    disabled={!isEditing && activeModal === "viewProfile"}
                  />
                  <input
                    type="text"
                    placeholder="Address"
                    value={formData.address || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    disabled={!isEditing && activeModal === "viewProfile"}
                  />
                  <input
                    type="text"
                    placeholder="Phone Number"
                    value={formData.phoneNumber || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, phoneNumber: e.target.value })
                    }
                    disabled={!isEditing && activeModal === "viewProfile"}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={formData.email || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    disabled={!isEditing && activeModal === "viewProfile"}
                  />

                  <select
                    className="role-selection"
                    value={formData.role || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value })
                    }
                    disabled={!isEditing && activeModal === "viewProfile"}
                  >
                    <option value="">Select Role *</option>
                    <option value="Admin">Admin</option>
                    <option value="Staff">Staff</option>
                    <option value="Driver">Driver</option>
                  </select>

                  {formData._id && formData.employeeId && (
                    <div className="employee-form">
                      <div className="form-title">
                        <p className="label">Employee ID</p>
                      </div>
                      <input type="text" value={formData.employeeId} disabled />
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
