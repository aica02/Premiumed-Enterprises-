import React, { useState } from "react";
import {FaTimes} from "react-icons/fa";
import "../styles/OrdersAndPurchases.css";
import BarcodeScanner from "../components/BarcodeScanner";


const PickingOrders = () => {

  const [showScanner, setShowScanner] = useState(false);
  const [scannedCode, setScannedCode] = useState("");
  const [activeRacks, setActiveRacks] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const racks = [
    { id: "R1", top: "5%", left: "15%", width: "70%", height: "10%" },
    { id: "R2", top: "22%", left: "15%", width: "70%", height: "10%" },
    { id: "R3", top: "40%", left: "15%", width: "70%", height: "10%" },
    { id: "R4", top: "58%", left: "15%", width: "70%", height: "10%" },
    { id: "R5", top: "76%", left: "15%", width: "70%", height: "10%" },
    { id: "R6", top: "5%", left: ".5%", width: "10%", height: "50%" },
    { id: "R7", top: "5%", left: "90%", width: "10%", height: "80%" }
  ];

  const orders = [
    {
      id: 1,
      orderNo: "ORD-001",
      rackIds: ["R1"],
      itemName: "Paracetamol 500mg",
      category: "Medicine",
      quantity: 120,
      location: "Rack R1",
      batchNumber: "B-1001",
      expirationDate: "2026-05-01",
      fefoStatus: "safe",
      stockStatus: "available"
    },
    {
      id: 2,
      orderNo: "ORD-002",
      rackIds: ["R2"],
      itemName: "Syringe 5ml",
      category: "Medical Supply",
      quantity: 40,
      location: "Rack R2",
      batchNumber: "B-2002",
      expirationDate: "2025-12-01",
      fefoStatus: "near",
      stockStatus: "low"
    }
  ];

  const handleScanSuccess = (code) => {
    setScannedCode(code);
    setShowScanner(false);
  };

  const handleOrderClick = (order) => {
    setActiveRacks(order.rackIds);
  };

  const handleViewClick = (order, e) => {
    e.stopPropagation(); // prevent rack highlight trigger
    setSelectedOrder(order);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedOrder(null);
  };

  return (
    <div className="warehouse-container">
      <div className="warehouse-main">

        {/* FLOOR PLAN */}
        <div className="warehouse-grid-section">
          <div className="warehouse-floor-plan">

            {racks.map(rack => (
              <div
                key={rack.id}
                className={`rack ${activeRacks.includes(rack.id) ? "picking-rack-active" : ""}`}
                style={{
                  top: rack.top,
                  left: rack.left,
                  width: rack.width,
                  height: rack.height
                }}
              />
            ))}

          </div>
        </div>

        {/* SIDE PANEL */}
        <aside className="warehouse-monitoring">
          <div className="orders-card">
            <h3>ORDER LISTS</h3>

            <div className="orders-content">

              <button onClick={() => setShowScanner(true)}>
                Scan Barcode
              </button>

              {scannedCode && <p>Scanned: {scannedCode}</p>}

              {showScanner && (
                <BarcodeScanner onScanSuccess={handleScanSuccess} />
              )}

              {/* ORDER LIST */}
              <div className="orders-list">
                {orders.map(order => (
                  <div
                    key={order.id}
                    className="order-item"
                    onClick={() => handleOrderClick(order)}
                  >
                    <span>{order.orderNo}</span>

                    <button
                      className="order-view-btn"
                      onClick={(e) => handleViewClick(order, e)}
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </aside>

      </div>

      {/* MODAL */}
      {showModal && selectedOrder && (
        <div className="order-modal-overlay" onClick={closeModal}>
          <div className="order-modal" onClick={(e) => e.stopPropagation()}>

            <div className="order-modal-header">
              <h3>Order Details</h3>
              <FaTimes 
                className="order-close-btn" 
                onClick={closeModal}
              />
            </div>

            <div className="modal-grid">
              <div><strong>Item Name:</strong> {selectedOrder.itemName}</div>
              <div><strong>Category:</strong> {selectedOrder.category}</div>
              <div><strong>Quantity:</strong> {selectedOrder.quantity}</div>
              <div><strong>Location:</strong> {selectedOrder.location}</div>
              <div><strong>Batch #:</strong> {selectedOrder.batchNumber}</div>
              <div><strong>Expiration:</strong> {selectedOrder.expirationDate}</div>

              <div>
                <strong>FEFO Status:</strong>
                <span className={`badge ${selectedOrder.fefoStatus}`}>
                  {selectedOrder.fefoStatus}
                </span>
              </div>

              <div>
                <strong>Stock Status:</strong>
                <span className={`badge ${selectedOrder.stockStatus}`}>
                  {selectedOrder.stockStatus}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PickingOrders;