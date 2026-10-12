import React, { useState, useEffect, useCallback } from "react";
import { RiImageEditLine } from "react-icons/ri";
import { IoPersonCircle } from "react-icons/io5";
import "../stylesClient/profile.css";
import "../styles/formValidation.css";
import axios from "axios";
import { Toaster, toast } from "react-hot-toast";
import {
  COUNTRY_CODES,
  FIELD_MAX_LENGTHS,
  formatFieldInput,
  formatInternationalPhone,
} from "../utils/fieldFormatting";
import { validateField, validateFields } from "../utils/formValidation";

const PROFILE_VALIDATION_FIELDS = [
  "dialysisCenterName",
  "facilityType",
  "yearEstablished",
  "registrationNumber",
  "machines",
  "address",
  "mobile",
  "landline",
  "email",
  "ownership",
  "ownerName",
  "medicalDirector",
  "nephrologist",
  "unitManager",
  "purchasingContact",
  "designation",
  "procurementMobile",
  "procurementEmail",
];
const PROFILE_FIELD_FORMATS = {
  dialysisCenterName: "dialysisCenterName",
  yearEstablished: "yearEstablished",
  registrationNumber: "registrationNumber",
  machines: "machines",
  address: "address",
  mobile: "mobile",
  landline: "landline",
  email: "email",
  ownerName: "ownerName",
  medicalDirector: "medicalDirector",
  nephrologist: "nephrologist",
  unitManager: "unitManager",
  purchasingContact: "purchasingContact",
  designation: "designation",
  procurementMobile: "procurementMobile",
  procurementEmail: "procurementEmail",
};

const getPhoneParts = (value = "") => {
  const phone = String(value).trim();
  let localDigits = phone.replace(/\D/g, "");
  const country = [...COUNTRY_CODES]
    .sort(
      (a, b) =>
        b.code.replace(/\D/g, "").length - a.code.replace(/\D/g, "").length,
    )
    .find((item) => {
      const countryDigits = item.code.replace(/\D/g, "");
      return (
        phone.startsWith(item.code) ||
        (localDigits.length > 10 && localDigits.startsWith(countryDigits))
      );
    });
  const countryCode = country?.code || "+63";

  if (country) {
    localDigits = localDigits.slice(countryCode.replace(/\D/g, "").length);
  } else if (localDigits.startsWith("0") && localDigits.length === 11) {
    localDigits = localDigits.slice(1);
  }

  return {
    countryCode,
    phone: formatFieldInput("mobile", localDigits),
  };
};

const API_BASE_URL =
  (import.meta.env.VITE_API_URL ||
    (window.location.hostname === "localhost" ? "http://localhost:5000" : "")) +
  "/api/profile";

const Profile = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [userRole, setUserRole] = useState("");
  const [error, setError] = useState(null);
  const [mobileCountryCode, setMobileCountryCode] = useState("+63");
  const [procurementCountryCode, setProcurementCountryCode] = useState("+63");
  const [fieldErrors, setFieldErrors] = useState({});
  const [touchedFields, setTouchedFields] = useState({});

  const [formData, setFormData] = useState({
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    const formatName = PROFILE_FIELD_FORMATS[name] || name;
    const formattedValue = formatFieldInput(formatName, value);
    setFormData((prev) => ({ ...prev, [name]: formattedValue }));
    setTouchedFields((prev) => ({ ...prev, [name]: true }));
    setFieldErrors((prev) => ({
      ...prev,
      [name]: validateField(name, formattedValue),
    }));
    if (error) setError(null);
  };

  const handleFieldBlur = (name, value) => {
    setTouchedFields((prev) => ({ ...prev, [name]: true }));
    setFieldErrors((prev) => ({
      ...prev,
      [name]: validateField(name, value),
    }));
  };

  const validateProfileForm = () => {
    const nextErrors = validateFields(formData, PROFILE_VALIDATION_FIELDS);
    setTouchedFields(
      PROFILE_VALIDATION_FIELDS.reduce((touched, field) => {
        touched[field] = true;
        return touched;
      }, {}),
    );
    setFieldErrors(nextErrors);
    return Object.values(nextErrors).every((fieldError) => !fieldError);
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

      setProfileImageFile(file);
      const previewUrl = URL.createObjectURL(file);
      setFormData({
        ...formData,
        profileImage: previewUrl,
      });
      if (profileImage && profileImage.startsWith("blob:")) {
        URL.revokeObjectURL(profileImage);
      }
    }
  };

  const saveProfile = async () => {
    if (!validateProfileForm()) return;
    setLoading(true);
    setError(null);
    const savedUsername = localStorage.getItem("username");

    if (!savedUsername) {
      toast.error("No user logged in");
      setLoading(false);
      return;
    }

    try {
      const formDataToSend = new FormData();
      const formattedMobile = formatFieldInput("mobile", formData.mobile || "");
      const formattedProcurementMobile = formatFieldInput(
        "procurementMobile",
        formData.procurementMobile || "",
      );
      const formattedProfile = {
        ...formData,
        mobile: formattedMobile
          ? formatInternationalPhone(mobileCountryCode, formattedMobile)
          : "",
        procurementMobile: formattedProcurementMobile
          ? formatInternationalPhone(
              procurementCountryCode,
              formattedProcurementMobile,
            )
          : "",
      };

      const fieldMappings = {
        dialysisCenterName: "fullName",
        facilityType: "facilityType",
        yearEstablished: "yearEstablished",
        registrationNumber: "registrationNumber",
        machines: "machines",
        address: "address",
        mobile: "phoneNumber",
        landline: "landline",
        email: "email",
        ownership: "ownership",
        ownerName: "ownerName",
        medicalDirector: "medicalDirector",
        nephrologist: "nephrologist",
        unitManager: "unitManager",
        purchasingContact: "purchasingContact",
        designation: "designation",
        procurementMobile: "procurementMobile",
        procurementEmail: "procurementEmail",
      };

      Object.keys(fieldMappings).forEach((frontendField) => {
        const formatName = PROFILE_FIELD_FORMATS[frontendField];
        const value =
          frontendField === "mobile" || frontendField === "procurementMobile"
            ? formattedProfile[frontendField] || ""
            : formatName
              ? formatFieldInput(
                  formatName,
                  formattedProfile[frontendField] || "",
                )
              : formattedProfile[frontendField] || "";
        formDataToSend.append(fieldMappings[frontendField], value);
      });

      if (profileImageFile) {
        formDataToSend.append("profileImage", profileImageFile);
      }

      const response = await axios.put(
        `${API_BASE_URL}/update/${savedUsername}`,
        formDataToSend,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          timeout: 60000,
        },
      );

      if (
        response.data.message === "Profile updated successfully" ||
        response.data.message === "No changes detected"
      ) {
        if (response.data.message === "Profile updated successfully") {
          toast.success("Profile saved successfully!");
        } else {
          toast.success("No changes detected");
        }

        const updatedData = response.data.user;
        setFormData({
          dialysisCenterName: updatedData.fullName || "",
          facilityType: updatedData.facilityType || "",
          yearEstablished: updatedData.yearEstablished || "",
          registrationNumber: updatedData.registrationNumber || "",
          machines: updatedData.machines || "",
          address: updatedData.address || "",
          mobile: updatedData.phoneNumber || "",
          landline: updatedData.landline || "",
          email: updatedData.email || "",
          ownership: updatedData.ownership || "",
          ownerName: updatedData.ownerName || "",
          medicalDirector: updatedData.medicalDirector || "",
          nephrologist: updatedData.nephrologist || "",
          unitManager: updatedData.unitManager || "",
          purchasingContact: updatedData.purchasingContact || "",
          designation: updatedData.designation || "",
          procurementMobile: updatedData.procurementMobile || "",
          procurementEmail: updatedData.procurementEmail || "",
        });
        setMobileCountryCode(
          getPhoneParts(updatedData.phoneNumber || "").countryCode,
        );
        setProcurementCountryCode(
          getPhoneParts(updatedData.procurementMobile || "").countryCode,
        );

        setProfileImageFile(null);
        setFieldErrors({});
        setTouchedFields({});
        if (updatedData.profileImage) {
          setProfileImage(updatedData.profileImage);
          setFormData((prev) => ({
            ...prev,
            profileImage: updatedData.profileImage,
          }));
        }
        setIsEditing(false);
      }
    } catch (err) {
      console.error("=== ERROR IN SAVE PROFILE ===", err);

      let errorMsg = "Failed to save profile";

      if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
        errorMsg =
          "The request took too long. Please try again with a smaller image file or check your connection.";
      } else if (err.response) {
        errorMsg =
          err.response.data?.message ||
          err.response.data?.error ||
          "Failed to save profile";
      } else if (err.request) {
        errorMsg = "No response from server. Please check your connection.";
      } else {
        errorMsg = err.message;
      }

      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const toggleEdit = () => {
    if (isEditing) {
      saveProfile();
    } else {
      setFieldErrors({});
      setTouchedFields({});
      const mobileParts = getPhoneParts(formData.mobile);
      const procurementParts = getPhoneParts(formData.procurementMobile);
      setMobileCountryCode(mobileParts.countryCode);
      setProcurementCountryCode(procurementParts.countryCode);
      setFormData((prev) => ({
        ...prev,
        mobile: mobileParts.phone,
        procurementMobile: procurementParts.phone,
      }));
      setIsEditing(true);
    }
  };

  const fetchUserData = useCallback(async () => {
    const savedUsername = localStorage.getItem("username");
    if (!savedUsername) return;

    try {
      const response = await axios.get(`${API_BASE_URL}/get/${savedUsername}`, {
        timeout: 10000,
      });
      const data = response.data;

      setUserRole(data.role || "User");
      setMobileCountryCode(getPhoneParts(data.phoneNumber || "").countryCode);
      setProcurementCountryCode(
        getPhoneParts(data.procurementMobile || "").countryCode,
      );

      if (
        data.profileImage &&
        data.profileImage !== "null" &&
        data.profileImage !== ""
      ) {
        setProfileImage(data.profileImage);
        setFormData((prev) => ({
          ...prev,
          profileImage: data.profileImage,
        }));
      } else {
        setProfileImage(null);
        setFormData((prev) => ({
          ...prev,
          profileImage: null,
        }));
      }

      setFormData((prev) => ({
        ...prev,
        dialysisCenterName: data.fullName || "",
        facilityType: data.facilityType || "",
        yearEstablished: data.yearEstablished || "",
        registrationNumber: data.registrationNumber || "",
        machines: data.machines || "",
        address: data.address || "",
        mobile: data.phoneNumber || "",
        landline: data.landline || "",
        email: data.email || "",
        ownership: data.ownership || "",
        ownerName: data.ownerName || "",
        medicalDirector: data.medicalDirector || "",
        nephrologist: data.nephrologist || "",
        unitManager: data.unitManager || "",
        purchasingContact: data.purchasingContact || "",
        designation: data.designation || "",
        procurementMobile: data.procurementMobile || "",
        procurementEmail: data.procurementEmail || "",
      }));

      setInitialLoad(false);
    } catch (err) {
      console.error("Failed to load profile:", err);
      toast.error("Failed to load profile data");
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const handleImageError = () => {
    console.log("Image failed to load, URL was:", profileImage);
    setImageError(true);
    setProfileImage(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFieldErrors({});
    setTouchedFields({});
    if (profileImageFile) {
      setProfileImageFile(null);
      if (formData.profileImage && formData.profileImage.startsWith("blob:")) {
        URL.revokeObjectURL(formData.profileImage);
      }
    }
    fetchUserData();
    setError(null);
  };

  if (initialLoad) {
    return <div className="Profile-Client-container">Loading...</div>;
  }

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <div className="Profile-Client-container">
        <h2 className="Profile-Client-title">PROFILE</h2>

        <div className="Profile-Client-wrapper">
          <div className="Profile-Client-imageCard">
            <input
              type="file"
              id="fileInput"
              style={{ display: "none" }}
              accept="image/*"
              onChange={handleImageUpload}
              disabled={!isEditing}
            />
            <div className="Profile-Client-imageOverlay">
              <label
                htmlFor="fileInput"
                className="Profile-Client-imageLabel"
                style={{ cursor: isEditing ? "pointer" : "default" }}
              >
                {formData.profileImage ? (
                  <img
                    src={formData.profileImage}
                    alt="Profile"
                    className="uploaded-img"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = "";
                    }}
                  />
                ) : (
                  <div className="placeholder-icon-wrapper">
                    <IoPersonCircle
                      style={{ fontSize: "150px", color: "gray" }}
                    />
                  </div>
                )}
              </label>
            </div>
            {isEditing && (
              <button
                className="profile-btn"
                onClick={() => document.getElementById("fileInput").click()}
              >
                {formData.profileImage ? "CHANGE PHOTO" : "ADD PHOTO"}
              </button>
            )}
          </div>

          <div className="Profile-Client-card">
            <div className="Profile-Client-cardHeader">
              <h3 className="Information-Header">Customer Information</h3>
              <div className="Profile-Client-buttonGroup">
                {isEditing && (
                  <button
                    className="Profile-Client-cancelBtn"
                    onClick={handleCancel}
                    disabled={loading || uploadingImage}
                  >
                    Cancel
                  </button>
                )}
                <button
                  className="Profile-Client-editBtn"
                  onClick={toggleEdit}
                  disabled={loading || uploadingImage}
                >
                  {loading
                    ? "Saving..."
                    : isEditing
                      ? "Save Profile"
                      : "Edit Profile"}
                </button>
              </div>
            </div>

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

            <Section title="FACILITY INFORMATION">
              <Input
                label="Dialysis Center Name"
                name="dialysisCenterName"
                value={formData.dialysisCenterName}
                onChange={handleChange}
                onBlur={(e) =>
                  handleFieldBlur("dialysisCenterName", e.target.value)
                }
                error={
                  touchedFields.dialysisCenterName &&
                  fieldErrors.dialysisCenterName
                }
                disabled={!isEditing}
              />

              <Select
                label="Type of Facility"
                name="facilityType"
                value={formData.facilityType}
                onChange={handleChange}
                onBlur={(e) => handleFieldBlur("facilityType", e.target.value)}
                error={touchedFields.facilityType && fieldErrors.facilityType}
                disabled={!isEditing}
                options={[
                  "Standalone Dialysis Center",
                  "Hospital Based",
                  "Government Facility",
                ]}
              />

              <Input
                label="Year Established"
                name="yearEstablished"
                value={formData.yearEstablished}
                onChange={handleChange}
                onBlur={(e) =>
                  handleFieldBlur("yearEstablished", e.target.value)
                }
                error={
                  touchedFields.yearEstablished && fieldErrors.yearEstablished
                }
                disabled={!isEditing}
              />

              <Input
                label="TIN Number"
                placeholder="xxx-xxx-xxx-xxxxx"
                name="registrationNumber"
                value={formData.registrationNumber}
                onChange={handleChange}
                onBlur={(e) =>
                  handleFieldBlur("registrationNumber", e.target.value)
                }
                error={
                  touchedFields.registrationNumber &&
                  fieldErrors.registrationNumber
                }
                disabled={!isEditing}
              />

              <Input
                label="Number of Dialysis Machine / Units"
                name="machines"
                value={formData.machines}
                onChange={handleChange}
                onBlur={(e) => handleFieldBlur("machines", e.target.value)}
                error={touchedFields.machines && fieldErrors.machines}
                disabled={!isEditing}
              />

              <Input
                label="Registered Address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                onBlur={(e) => handleFieldBlur("address", e.target.value)}
                error={touchedFields.address && fieldErrors.address}
                disabled={!isEditing}
                full
              />

              <PhoneField
                label="Mobile Number"
                name="profile-mobile"
                value={formData.mobile}
                countryCode={mobileCountryCode}
                onCountryCodeChange={setMobileCountryCode}
                onChange={(value) =>
                  handleChange({ target: { name: "mobile", value } })
                }
                onBlur={(value) => handleFieldBlur("mobile", value)}
                error={touchedFields.mobile && fieldErrors.mobile}
                isEditing={isEditing}
              />

              <Input
                label="Landline Number"
                name="landline"
                value={formData.landline}
                onChange={handleChange}
                onBlur={(e) => handleFieldBlur("landline", e.target.value)}
                error={touchedFields.landline && fieldErrors.landline}
                disabled={!isEditing}
              />

              <Input
                label="Email Address"
                name="email"
                value={formData.email}
                onChange={handleChange}
                onBlur={(e) => handleFieldBlur("email", e.target.value)}
                error={touchedFields.email && fieldErrors.email}
                disabled={!isEditing}
                full
              />
            </Section>

            <Section title="OWNERSHIP">
              <div className="Profile-Client-ownershipOptions">
                {["Private", "Partnership", "Government"].map((type) => (
                  <label key={type}>
                    <input
                      type="radio"
                      name="ownership"
                      value={type}
                      checked={formData.ownership === type}
                      onChange={handleChange}
                      onBlur={(e) =>
                        handleFieldBlur("ownership", e.target.value)
                      }
                      disabled={!isEditing}
                    />
                    {type}
                  </label>
                ))}
                {touchedFields.ownership && fieldErrors.ownership && (
                  <div className="inline-error-message">
                    {fieldErrors.ownership}
                  </div>
                )}
              </div>

              <Input
                label="Owner's Name"
                name="ownerName"
                value={formData.ownerName}
                onChange={handleChange}
                onBlur={(e) => handleFieldBlur("ownerName", e.target.value)}
                error={touchedFields.ownerName && fieldErrors.ownerName}
                disabled={!isEditing}
              />

              <Input
                label="Medical Director's Name"
                name="medicalDirector"
                value={formData.medicalDirector}
                onChange={handleChange}
                onBlur={(e) =>
                  handleFieldBlur("medicalDirector", e.target.value)
                }
                error={
                  touchedFields.medicalDirector && fieldErrors.medicalDirector
                }
                disabled={!isEditing}
              />

              <Input
                label="Nephrologist Name"
                name="nephrologist"
                value={formData.nephrologist}
                onChange={handleChange}
                onBlur={(e) => handleFieldBlur("nephrologist", e.target.value)}
                error={touchedFields.nephrologist && fieldErrors.nephrologist}
                disabled={!isEditing}
              />

              <Input
                label="Unit Manager / Administrator"
                name="unitManager"
                value={formData.unitManager}
                onChange={handleChange}
                onBlur={(e) => handleFieldBlur("unitManager", e.target.value)}
                error={touchedFields.unitManager && fieldErrors.unitManager}
                disabled={!isEditing}
              />
            </Section>

            <Section title="PROCUREMENT & ACCOUNTS INFORMATION">
              <Input
                label="Purchasing Contact Person"
                name="purchasingContact"
                value={formData.purchasingContact}
                onChange={handleChange}
                onBlur={(e) =>
                  handleFieldBlur("purchasingContact", e.target.value)
                }
                error={
                  touchedFields.purchasingContact &&
                  fieldErrors.purchasingContact
                }
                disabled={!isEditing}
              />

              <Input
                label="Designation"
                name="designation"
                value={formData.designation}
                onChange={handleChange}
                onBlur={(e) => handleFieldBlur("designation", e.target.value)}
                error={touchedFields.designation && fieldErrors.designation}
                disabled={!isEditing}
              />

              <PhoneField
                label="Mobile Number"
                name="procurement-mobile"
                value={formData.procurementMobile}
                countryCode={procurementCountryCode}
                onCountryCodeChange={setProcurementCountryCode}
                onChange={(value) =>
                  handleChange({ target: { name: "procurementMobile", value } })
                }
                onBlur={(value) => handleFieldBlur("procurementMobile", value)}
                error={
                  touchedFields.procurementMobile &&
                  fieldErrors.procurementMobile
                }
                isEditing={isEditing}
              />

              <Input
                label="Email Address"
                name="procurementEmail"
                value={formData.procurementEmail}
                onChange={handleChange}
                onBlur={(e) =>
                  handleFieldBlur("procurementEmail", e.target.value)
                }
                error={
                  touchedFields.procurementEmail && fieldErrors.procurementEmail
                }
                disabled={!isEditing}
              />
            </Section>
          </div>
        </div>
      </div>
    </>
  );
};

const Section = ({ title, children }) => (
  <div className="Profile-Client-section">
    <h4 className="Profile-Client-sectionTitle">{title}</h4>
    <div className="Profile-Client-grid">{children}</div>
  </div>
);

const Input = ({ label, full, error, ...props }) => {
  const formatName = PROFILE_FIELD_FORMATS[props.name] || props.name;

  return (
    <div
      className={`Profile-Client-group ${full ? "Profile-Client-full" : ""}`}
    >
      <label>{label}</label>
      <input
        {...props}
        className={`${props.className || ""} ${error ? "input-error" : ""}`.trim()}
        maxLength={props.maxLength || FIELD_MAX_LENGTHS[formatName]}
      />
      {error && <div className="inline-error-message">{error}</div>}
    </div>
  );
};

const PhoneField = ({
  label,
  name,
  value,
  countryCode,
  onCountryCodeChange,
  onChange,
  onBlur,
  error,
  isEditing,
}) => (
  <div className="Profile-Client-group">
    <label htmlFor={`${name}-number`}>{label}</label>
    {isEditing ? (
      <>
        <div className="Profile-Client-phoneInput">
          <select
            aria-label={`${label} country code`}
            value={countryCode}
            onChange={(e) => onCountryCodeChange(e.target.value)}
          >
            {COUNTRY_CODES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.flag} {country.code}
              </option>
            ))}
          </select>
          <input
            id={`${name}-number`}
            type="tel"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onBlur(e.target.value)}
            className={error ? "input-error" : ""}
            placeholder="xxx xxx xxxx"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={FIELD_MAX_LENGTHS.mobile}
          />
        </div>
        {error && <div className="inline-error-message">{error}</div>}
      </>
    ) : (
      <input id={`${name}-number`} type="tel" value={value || ""} disabled />
    )}
  </div>
);

const Select = ({ label, options, error, ...props }) => (
  <div className="Profile-Client-group">
    <label>{label}</label>
    <select
      {...props}
      className={`${props.className || ""} ${error ? "input-error" : ""}`.trim()}
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
    {error && <div className="inline-error-message">{error}</div>}
  </div>
);

export default Profile;
