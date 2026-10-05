import React, { useState, useEffect } from "react";
import { FaTimes, FaCheckCircle } from "react-icons/fa"; // Added Check icon
import axios from "axios";
import "../styles/OrdersAndPurchases.css";

const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "");

const PutawayPurchases = () => {
  const [activeRacks, setActiveRacks] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedPutaway, setSelectedPutaway] = useState(null);
  const [putawayList, setPutawayList] = useState([]); 

  const racks = [
    { id: "Rack 1", top: "5%", left: "15%", width: "70%", height: "10%" },
    { id: "Rack 2", top: "22%", left: "15%", width: "70%", height: "10%" },
    { id: "Rack 3", top: "40%", left: "15%", width: "70%", height: "10%" },
    { id: "Rack 4", top: "58%", left: "15%", width: "70%", height: "10%" },
    { id: "Rack 5", top: "76%", left: "15%", width: "70%", height: "10%" }
  ];

  useEffect(() => {
    fetchPendingPutaways();
  }, []);

const fetchPendingPutaways = async () => {
  try {
   const res = await axios.get(`${BACKEND_URL}/api/putaway`);

    const data = Array.isArray(res.data) ? res.data : [];
    setPutawayList(data);
    
    console.log("Items found:", data.length);
  } catch (err) {
    console.error("Fetch error details:", err.response || err);
    setPutawayList([]);
  }
};

  const handlePutawayClick = (batch) => {
    setActiveRacks([batch.storageLocation]);
  };

  const handleCompletePutaway = async (batchId) => {
    try {
      await axios.patch(`${BACKEND_URL}/api/putaway/${batchId}/complete`, {}, {
        headers: {
          'X-Username': localStorage.getItem('username') || '',
          'X-User-Id': localStorage.getItem('userId') || '',
          'X-Role': localStorage.getItem('role') || 'Admin'
        }
      });
      setPutawayList(prev => prev.filter(b => b._id !== batchId));
      closeModal();
      setActiveRacks([]);
      alert("Item verified and stored!");
    } catch (err) {
      alert("Failed to complete putaway.");
    }
  };

  const handleViewClick = (batch, e) => {
    e.stopPropagation();
    setSelectedPutaway(batch);
    setShowModal(true);
    setActiveRacks([batch.storageLocation]);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPutaway(null);
  };

  return (
    <div className="warehouse-container">
      <div className="warehouse-main">
        <div className="warehouse-grid-section">
          <div className="warehouse-floor-plan">
            {racks.map(rack => (
              <div
                key={rack.id}
                className={`rack ${activeRacks.includes(rack.id) ? "putaway-rack-active" : ""}`}
                style={{ top: rack.top, left: rack.left, width: rack.width, height: rack.height }}
              >
                <span style={{fontSize: '10px', color: 'white'}}>{rack.id}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="warehouse-monitoring">
          <div className="purchases-card">
            <h3>PUTAWAY LISTS</h3>
            <p>Total Items Found: {putawayList.length}</p>
            <div className="purchases-content">
              <div className="purchases-list">
                {(Array.isArray(putawayList) ? putawayList : []).map(batch => (
                  <div
                    key={batch._id}
                    className={`purchases-item ${activeRacks.includes(batch.storageLocation) ? "active-item" : ""}`}
                    onClick={() => handlePutawayClick(batch)}
                  >
                    <span>{batch.batchNumber}</span>
                    <button className="purchases-view-btn" onClick={(e) => handleViewClick(batch, e)}>
                      View
                    </button>
                  </div>
                ))}
  
                {(!putawayList || putawayList.length === 0) && (
                  <p style={{textAlign: 'center', padding: '20px'}}>No pending putaways</p>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {showModal && selectedPutaway && (
        <div className="purchases-modal-overlay" onClick={closeModal}>
          <div className="purchases-modal" onClick={(e) => e.stopPropagation()}>
            <div className="purchases-modal-header">
              <h3>Putaway Details</h3>
              <FaTimes className="purchases-close-btn" onClick={closeModal} />
            </div>

            <div className="modal-grid">
              <div><strong>Item Name:</strong> {selectedPutaway.product?.name}</div>
              <div><strong>Category:</strong> {selectedPutaway.product?.category}</div>
              <div><strong>Quantity:</strong> {selectedPutaway.quantity}</div>
              <div><strong>Location:</strong> {selectedPutaway.storageLocation}</div>
              <div><strong>Batch #:</strong> {selectedPutaway.batchNumber}</div>
              <div><strong>Expiration:</strong> {new Date(selectedPutaway.expirationDate).toLocaleDateString()}</div>
            </div>

            {/* BUTTON TO FINALIZE */}
            <div style={{marginTop: "20px", textAlign: "center"}}>
                <button 
                  className="save-btn" 
                  style={{width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px"}}
                  onClick={() => handleCompletePutaway(selectedPutaway._id)}
                >
                  <FaCheckCircle /> MARK AS STORED
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PutawayPurchases;