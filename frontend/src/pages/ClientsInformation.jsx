import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  FaSearch,
  FaTimes,
  FaUserCheck,
  FaEye,
  FaUserAlt,
  FaPrint,
  FaKey,
  FaUserTimes,
} from "react-icons/fa";
import { FaFileCirclePlus } from "react-icons/fa6";
import { BACKEND_URL } from "../config";
import "../styles/InformationLayout.css";
import "../styles/Modals.css";
import "../styles/capsules.css";
import "../styles/ConfirmModal.css";
import { Toaster, toast } from "react-hot-toast";
import logo from "../assets/Premiumed logo.png";
import EmptyState from "../components/EmptyState";
import {
  generateClientProfilePDF,
  generateClientDirectoryReport,
} from "../utils/pdf/clientProfileReports";

const ClientsInformation = () => {
  const [activeTab, setActiveTab] = useState("information");
  const [activeModal, setActiveModal] = useState(null);
  const [clients, setClients] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [confirmModal, setConfirmModal] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const clientsRes = await axios.get(
        `${BACKEND_URL}/api/usersAccessControlPage`,
      );
      setClients(
        clientsRes.data.filter((u) => u.role?.toLowerCase() !== "admin"),
      );
      const reqRes = await axios.get(`${BACKEND_URL}/api/auth/requests`);
      setRequests(reqRes.data.filter((r) => r.status === "PENDING"));
    } catch (err) {
      console.error("Error fetching data:", err);
      toast.error("Failed to load dashboard data.", {
        id: "dashboard-fetch-error",
      });
    }
  };

  const filteredClients = clients.filter(
    (c) =>
      c.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const visibleClients = filteredClients.filter(
    (client) =>
      client.role === "User" &&
      (statusFilter === "All" || client.status === statusFilter),
  ).sort(
    (a, b) =>
      Number((b.status || "Active") === "Active") -
      Number((a.status || "Active") === "Active"),
  );

  const filteredRequests = requests.filter(
    (r) =>
      r.dialysisCenterName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleDeactivate = async (id, currentStatus) => {
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
    const toastId = toast.loading(`Updating status...`);
    try {
      await axios.patch(
        `${BACKEND_URL}/api/usersAccessControlPage/${id}`,
        { status: newStatus },
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );
      setClients((prevClients) =>
        prevClients.map((client) =>
          client._id === id ? { ...client, status: newStatus } : client,
        ),
      );
      toast.success(
        `Client ${newStatus === "Active" ? "activated" : "deactivated"} successfully!`,
        { id: toastId },
      );
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update status", {
        id: toastId,
      });
    }
  };

  const openStatusConfirmation = (client) => {
    const action = client.status === "Active" ? "deactivate" : "activate";

    setConfirmModal({
      client,
      action,
    });
  };

  const openApprovalConfirmation = (request) => {
    setConfirmModal({
      action: "approve",
      request,
    });
  };

  const closeConfirmation = () => {
    setConfirmModal(null);
  };

  const handleConfirmedStatusChange = async () => {
    if (!confirmModal?.client) return;

    const { client } = confirmModal;

    closeConfirmation();

    await handleDeactivate(client._id, client.status);
  };

  const handleConfirmedApproval = async () => {
    if (!confirmModal?.request) return;

    const request = confirmModal.request;

    setConfirmModal(null);

    await approveClientRequest(request);
  };

  const approveClientRequest = async (request) => {
    if (!request?._id) {
      toast.error("Critical Error: Request ID is missing.");
      return;
    }

    const toastId = toast.loading("Processing approval...");

    try {
      const charset = "0123456789!_";
      let generated = "";

      for (let i = 0; i < 3; i++) {
        generated += charset.charAt(Math.floor(Math.random() * charset.length));
      }

      const namePart = request.dialysisCenterName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 5);

      const username = namePart + generated;

      const passwordCharset =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!";

      let password = "";

      for (let i = 0; i < 10; i++) {
        password += passwordCharset.charAt(
          Math.floor(Math.random() * passwordCharset.length),
        );
      }

      const settingsRes = await axios.get(`${BACKEND_URL}/api/settings`);

      const settings = settingsRes.data;

      let fileBlob = null;
      let fileName = "profile-image.jpg";
      let fileType = "image/jpeg";

      if (settings?.profileImage) {
        try {
          const fileResponse = await axios.get(settings.profileImage, {
            responseType: "blob",
          });

          fileBlob = fileResponse.data;

          if (settings.profileImage.toLowerCase().includes(".pdf")) {
            fileName = "profile-document.pdf";
            fileType = "application/pdf";
          } else if (settings.profileImage.toLowerCase().includes(".png")) {
            fileName = "profile-image.png";
            fileType = "image/png";
          } else if (settings.profileImage.toLowerCase().includes(".gif")) {
            fileName = "profile-image.gif";
            fileType = "image/gif";
          } else if (settings.profileImage.toLowerCase().includes(".webp")) {
            fileName = "profile-image.webp";
            fileType = "image/webp";
          }
        } catch (imgErr) {
          console.error("Failed to download file:", imgErr);
        }
      }

      const formData = new FormData();

      formData.append("requestId", request._id);
      formData.append("username", username);
      formData.append("password", password);
      formData.append(
        "profileImagePublicId",
        settings?.profileImagePublicId || "",
      );

      if (fileBlob) {
        const file = new File([fileBlob], fileName, { type: fileType });

        formData.append("attachment", file);
      }

      const response = await axios.post(
        `${BACKEND_URL}/api/auth/approve-client`,
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
        toast.success(
          `Account approved! Email ${
            response.data.emailSent ? "sent" : "not sent"
          } successfully!`,
          { id: toastId },
        );

        await fetchData();

        setActiveModal(null);
      } else {
        toast.error(response.data.error || "Failed to approve request", {
          id: toastId,
        });
      }
    } catch (err) {
      console.error("Approval error:", err);

      toast.error(
        err.response?.data?.error ||
          err.message ||
          "An error occurred during approval",
        { id: toastId },
      );
    }
  };

  const handlePrintClients = () => {
    const columns = ["Client Name", "Email Address", "Phone", "Status"];
    const data = clients
      .filter((client) => client.role === "User")
      .map((client) => [
        client.fullName || "N/A",
        client.email || "N/A",
        client.phoneNumber || "N/A",
        client.status || "N/A",
      ]);
    generateClientDirectoryReport({
      title: `Clients Information Report`,
      sectionTitle: "Clients Information Report ",
      companyName: "PREMIUMED ENTERPRISES",
      companyAddress:
        "52 Purok 1 Taal 3000 City of Malolos (Capital), Bulacan Philippines",
      ceo: "ROSE ANN P. ORTIZ - Prop",
      vatReg: "VAT REG. TIN: 275-357-338-00000",
      landlineNum: "(044) 812-2280",
      columns: columns,
      data: data,
      logo,
      filename: `Clients Information Report.pdf`,
    });

    toast.success(
      `Client Information Report generated successfully with ${data.length} record${
        data.length !== 1 ? "s" : ""
      }.`,
    );
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} autoClose={3000} />
      <div className="info-container">
        <div className="info-tabs">
          <button
            className={`tab-btn ${activeTab === "information" ? "active" : ""}`}
            onClick={() => setActiveTab("information")}
          >
            CLIENT'S DIRECTORY
          </button>
          <div className="tab-separator">|</div>
          <button
            className={`tab-btn ${activeTab === "requests" ? "active" : ""}`}
            onClick={() => setActiveTab("requests")}
          >
            PENDING REQUESTS
          </button>
        </div>

        <div className="info-search-wrapper">
          <div className="search-input-container clients">
            <FaSearch className="search-icon-gold" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${activeTab === "information" ? "by Client Name or Email" : "by Client Name or Email"}...`}
              className="info-search-input"
            />
          </div>
          {activeTab === "information" && (
            <button
              className="client-directory-btn"
              onClick={handlePrintClients}
            >
              <FaPrint className="print-supplier-icon" /> PRINT CLIENTS
            </button>
          )}
        </div>

        <div className="info-card clients-table">
          {activeTab === "information" && (
            <div className="filters-select-container">
              <select
                className="filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          )}
          <div className="clients-table-wrapper">
            <table className="info-table">
              <thead className="fixed-table-row">
                <tr>
                  <th>CLIENT NAME</th>
                  <th>EMAIL ADDRESS</th>
                  <th>PHONE</th>
                  <th>STATUS</th>
                  <th className="action-header client-info pending-request">
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeTab === "information" ? (
                  visibleClients.length > 0 ? (
                    visibleClients.map((client) => (
                      <tr key={client._id}>
                        <td className="font-bold">{client.fullName}</td>
                        <td>{client.email.toLowerCase()}</td>
                        <td>{client.phoneNumber || "N/A"}</td>
                        <td>
                          <span
                            className={`status-capsule status-${client.status.toLowerCase()}`}
                          >
                            {client.status}
                          </span>
                        </td>
                        <td className="action-buttons clients-info">
                          <button
                            className="view-profile-btn"
                            onClick={() =>
                              setActiveModal({
                                type: "viewClient",
                                data: client,
                              })
                            }
                          >
                            VIEW
                          </button>
                          <button
                            className={`deact-btn ${
                              client.status !== "Active" ? "activate-mode" : ""
                            }`}
                            onClick={() => openStatusConfirmation(client)}
                          >
                            {client.status === "Active"
                              ? "Deactivate"
                              : "Activate"}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="empty-order-cell">
                        <EmptyState
                          title={
                            searchTerm || statusFilter !== "All"
                              ? "No matching clients"
                              : "No clients yet"
                          }
                          message={
                            searchTerm || statusFilter !== "All"
                              ? "We couldn't find any client accounts that match your current search or filters."
                              : "Client accounts will appear here once they are added to the system."
                          }
                          buttonText={
                            searchTerm || statusFilter !== "All"
                              ? "Clear Search & Filters"
                              : undefined
                          }
                          onButtonClick={
                            searchTerm || statusFilter !== "All"
                              ? () => {
                                  setSearchTerm("");
                                  setStatusFilter("All");
                                }
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  )
                ) : filteredRequests.length > 0 ? (
                  filteredRequests.map((req) => (
                    <tr key={req._id}>
                      <td className="font-bold">{req.dialysisCenterName}</td>
                      <td>{req.email}</td>
                      <td>{req.mobile}</td>
                      <td>
                        <span
                          className={`status-capsule status-${req.status.toLowerCase()}`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="action-buttons pending-request">
                        <button
                          className="view-profile-btn"
                          onClick={() =>
                            setActiveModal({ type: "viewRequest", data: req })
                          }
                        >
                          VIEW
                        </button>
                        {/* <button
                            className="approve-client-btn"
                            onClick={() =>
                              setActiveModal({ type: "approve", data: req })
                            }
                          >
                            APPROVE
                          </button> */}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-order-cell">
                      <EmptyState
                        title={
                          searchTerm
                            ? "No matching requests"
                            : "No pending requests"
                        }
                        message={
                          searchTerm
                            ? "We couldn't find any pending requests that match your current search."
                            : "Pending client registration requests will appear here."
                        }
                        buttonText={searchTerm ? "Clear Search" : undefined}
                        onButtonClick={
                          searchTerm ? () => setSearchTerm("") : undefined
                        }
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {activeModal?.type === "viewClient" && (
          <ClientProfileModal
            key={activeModal.data?._id}
            client={activeModal.data}
            onClose={() => setActiveModal(null)}
          />
        )}
        {activeModal?.type === "viewRequest" && (
          <RequestDetailsModal
            request={activeModal.data}
            onClose={() => setActiveModal(null)}
            onRequestApproval={openApprovalConfirmation}
          />
        )}

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
                  ? "Deactivate Client?"
                  : confirmModal.action === "activate"
                    ? "Activate Client?"
                    : "Approve Request?"}
              </h3>

              <p className="confirm-modal-message">
                {confirmModal.action === "deactivate" ? (
                  <>
                    The account of{" "}
                    <strong>{confirmModal.client.fullName}</strong> will be
                    deactivated and they will no longer be able to access the
                    system.
                  </>
                ) : confirmModal.action === "activate" ? (
                  <>
                    The account of{" "}
                    <strong>{confirmModal.client.fullName}</strong> will be
                    activated and they will regain access to the system.
                  </>
                ) : (
                  <>
                    Approve the registration request for{" "}
                    <strong>{confirmModal.request.dialysisCenterName}</strong>?
                    This will create and activate their client account.
                  </>
                )}
              </p>

              <div className="confirm-modal-footer">
                <button
                  className="confirm-modal-btn confirm-modal-btn-cancel"
                  onClick={closeConfirmation}
                >
                  Cancel
                </button>

                <button
                  className="confirm-modal-btn confirm-modal-btn-confirm"
                  onClick={
                    confirmModal.action === "approve"
                      ? handleConfirmedApproval
                      : handleConfirmedStatusChange
                  }
                  style={{
                    background:
                      confirmModal.action === "deactivate"
                        ? "#ff3131"
                        : "#22a06b",
                    borderColor:
                      confirmModal.action === "deactivate"
                        ? "#ff3131"
                        : "#22a06b",
                  }}
                >
                  {confirmModal.action === "deactivate"
                    ? "Deactivate"
                    : confirmModal.action === "activate"
                      ? "Activate"
                      : "Approve"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const ClientProfileModal = ({ client, onClose }) => {
  const handlePrintProfile = () => {
    const safeClient = {
      fullName: String(client?.fullName || "N/A"),
      facilityType: String(client?.facilityType || "N/A"),
      yearEstablished: String(client?.yearEstablished || "N/A"),
      registrationNumber: String(client?.registrationNumber || "N/A"),
      machines: String(client?.machines || "N/A"),
      phoneNumber: String(client?.phoneNumber || "N/A"),
      landline: String(client?.landline || "N/A"),
      address: String(client?.address || "N/A"),
      email: String(client?.email || "N/A"),

      ownership: String(client?.ownership || "N/A"),
      ownerName: String(client?.ownerName || "N/A"),
      medicalDirector: String(client?.medicalDirector || "N/A"),
      nephrologist: String(client?.nephrologist || "N/A"),
      unitManager: String(client?.unitManager || "N/A"),

      purchasingContact: String(client?.purchasingContact || "N/A"),
      designation: String(client?.designation || "N/A"),
      procurementMobile: String(client?.procurementMobile || "N/A"),
      procurementEmail: String(client?.procurementEmail || "N/A"),

      username: String(client?.username || "N/A"),
      status: String(client?.status || "N/A"),
    };

    generateClientProfilePDF({
      title: "Client Profile",
      companyName: "PREMIUMED ENTERPRISES",
      companyAddress:
        "52 Purok 1 Taal 3000 City of Malolos (Capital), Bulacan Philippines",
      ceo: "ROSE ANN P. ORTIZ - Prop",
      vatReg: "VAT REG. TIN: 000-000-000",
      landlineNum: "(044) 812-2280",
      logo,
      client: safeClient,
      filename: `Client-${safeClient.fullName}.pdf`,
    });

    toast.success(
      `Client-${safeClient.fullName} Report generated successfully.`,
    );
  };

  return (
    <div className="client-profile-modal-overlay">
      <div className="client-profile-modal-container">
        <div className="client-profile-modal-header">
          <h3>CLIENT PROFILE</h3>
          <FaTimes className="client-profile-close-icon" onClick={onClose} />
        </div>
        <div className="client-profile-modal-body">
          <div className="modal-section-grid">
            <div className="detail-group full title">
              <h4>Facility Information</h4>
            </div>
            <DetailItem label="Center Name" value={client.fullName} />
            <DetailItem label="Facility Type" value={client.facilityType} />
            <DetailItem
              label="Year Established"
              value={client.yearEstablished}
            />
            <DetailItem label="TIN Number" value={client.registrationNumber} />
            <DetailItem label="No. of Machines" value={client.machines} />
            <DetailItem label="Mobile No." value={client.phoneNumber} />
            <DetailItem label="Landline" value={client.landline} />
            <DetailItem label="Email Address" value={client.email} />
            <DetailItem label="Address" value={client.address} fullWidth />
            <div className="detail-group full title">
              <h4>Ownership & Personnel</h4>
            </div>
            <DetailItem label="Ownership" value={client.ownership} />
            <DetailItem label="Owner Name" value={client.ownerName} />
            <DetailItem
              label="Medical Director"
              value={client.medicalDirector}
            />
            <DetailItem label="Nephrologist" value={client.nephrologist} />
            <DetailItem label="Unit Manager" value={client.unitManager} />
            <div className="detail-group full title">
              <h4>Procurement & Accounts</h4>
            </div>
            <DetailItem
              label="Purchasing Contact"
              value={client.purchasingContact}
            />
            <DetailItem label="Designation" value={client.designation} />
            <DetailItem
              label="Procurement Mobile"
              value={client.procurementMobile}
            />
            <DetailItem
              label="Procurement Email"
              value={client.procurementEmail}
            />
            <div className="detail-group full title">
              <h4>System Details</h4>
            </div>
            <DetailItem label="Username" value={client.username} />
            <DetailItem label="Account Status" value={client.status} />
          </div>
        </div>
        <div className="client-profile-modal-footer">
          <button className="client-profile-close-btn" onClick={onClose}>
            CLOSE PROFILE
          </button>
          <button
            className="client-profile-print-btn"
            onClick={() => handlePrintProfile()}
          >
            PRINT RECORD
          </button>
        </div>
      </div>
    </div>
  );
};

const RequestDetailsModal = ({ request, onClose, onRequestApproval }) => {
  const handleDirectApprove = () => {
    if (!request?._id) {
      toast.error("Critical Error: Request ID is missing.");
      return;
    }

    if (onRequestApproval) {
      onRequestApproval(request);
    }
  };

  return (
    <div className="client-profile-modal-overlay">
      <div className="client-profile-modal-container">
        <div className="client-profile-modal-header">
          <h3>REGISTRATION DETAILS</h3>
          <FaTimes className="client-profile-close-icon" onClick={onClose} />
        </div>

        <div className="client-profile-modal-body">
          <div className="modal-section-grid">
            <div className="detail-group full title">
              <h4>Facility Information</h4>
            </div>

            <DetailItem
              label="Center Name"
              value={request.dialysisCenterName}
            />
            <DetailItem label="Facility Type" value={request.facilityType} />
            <DetailItem
              label="Year Established"
              value={request.yearEstablished}
            />
            <DetailItem label="TIN Number" value={request.registrationNumber} />
            <DetailItem label="No. of Machines" value={request.machines} />
            <DetailItem label="Mobile No." value={request.mobile} />
            <DetailItem label="Landline" value={request.landline} />
            <DetailItem label="Address" value={request.address} />
            <DetailItem label="Email Address" value={request.email} />

            <div className="detail-group full title">
              <h4>Ownership & Personnel</h4>
            </div>

            <DetailItem label="Ownership" value={request.ownership} />
            <DetailItem label="Owner Name" value={request.ownerName} />
            <DetailItem
              label="Medical Director"
              value={request.medicalDirector}
            />
            <DetailItem label="Nephrologist" value={request.nephrologist} />
            <DetailItem label="Unit Manager" value={request.unitManager} />

            <div className="detail-group full title">
              <h4>Procurement & Accounts</h4>
            </div>

            <DetailItem
              label="Purchasing Contact"
              value={request.purchasingContact}
            />
            <DetailItem label="Designation" value={request.designation} />
            <DetailItem
              label="Procurement Mobile"
              value={request.procurementMobile}
            />
            <DetailItem
              label="Procurement Email"
              value={request.procurementEmail}
            />
          </div>
        </div>

        <div className="client-profile-modal-footer">
          <button className="approve-client-btn" onClick={handleDirectApprove}>
            APPROVE REQUEST
          </button>
        </div>
      </div>
    </div>
  );
};

const DetailItem = ({ label, value, fullWidth }) => (
  <div className={`field-group ${fullWidth ? "full-width" : ""}`}>
    <label className="field-label">{label}</label>
    <div className="field-box">{value || "N/A"}</div>
  </div>
);

export default ClientsInformation;
