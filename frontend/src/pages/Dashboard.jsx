import React, { useState, useEffect } from "react";
import axios from "axios";
import InventoryChart from "../components/InventoryChart";
import "../styles/Dashboard.css";
import { FaTruckFast } from "react-icons/fa6";
import { BsFillCartCheckFill } from "react-icons/bs";
import { PiWarningOctagonFill } from "react-icons/pi";
import { IoIosWarning } from "react-icons/io";
import { FaRunning } from "react-icons/fa";

const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");

const Dashboard = () => {
  // FILTER STATE
  const [timeFilter, setTimeFilter] = useState("today");

  const [stats, setStats] = useState({
    totalOrders: 0,
    urgentRequests: 0,
    criticalCount: 0,
    expiredCount: 0,
    lowStockSupplies: [],
    outgoingToday: 0,
    pendingOrders: 0,
    pendingClientRequests: 0,
  });

  const fetchStats = async () => {
    try {
      const res = await axios.get(
        `${BACKEND_URL}/api/dashboard/stats?range=${timeFilter}`,
      );

      setStats(res.data);
    } catch (err) {
      console.error("Error fetching dashboard stats", err);
    }
  };

  useEffect(() => {
    fetchStats();

    const interval = setInterval(() => {
      fetchStats();
    }, 5000); // refresh every 5 seconds instead of 1

    return () => clearInterval(interval);
  }, [timeFilter]);

  return (
    <>
      {/* CARDS */}
      <div className="cards">
        <div className="card orders">
          <BsFillCartCheckFill className="icon orders" />
          <div className="title-value">
            <p className="title">Total Orders</p>
            <p className="values">{stats.totalOrders}</p>
          </div>
        </div>

        <div className="card urgent">
          <FaRunning className="icon urgent" />
          <div className="title-value">
            <p className="title">Urgent Requests</p>
            <p className="values">{stats.urgentRequests}</p>
          </div>
        </div>

        <div className="card outgoing">
          <FaTruckFast className="icon outgoing" />
          <div className="title-value">
            <p className="title">Outgoing Supplies</p>
            <p className="values">{stats.outgoingToday}</p>
          </div>
        </div>

        <div className="card critical">
          <PiWarningOctagonFill className="icon critical" />
          <div className="title-value">
            <p className="title">Critical Supplies</p>
            <p className="values">{stats.criticalCount}</p>
          </div>
        </div>

        <div className="card expired">
          <IoIosWarning className="icon expired" />
          <div className="title-value">
            <p className="title">Expired Supplies</p>
            <p className="values">{stats.expiredCount}</p>
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION */}
      <div className="dashboard-bottom">
        <div className="approvals-restock container">
          {/* RESTOCK */}
          <div className="panel urgent-restock">
            <h4 className="panel-title">Urgent Restock Needed</h4>

            <div className="panel-scroll-content">
              {stats.lowStockSupplies?.length > 0 ? (
                stats.lowStockSupplies.map((item, index) => (
                  <div key={index} className="restock-item">
                    <p className="restock-item-name">{item.name}</p>
                    <p className="restock-item-quantity">
                      Qty: {item.quantity}
                    </p>
                  </div>
                ))
              ) : (
                <p className="no-data-text">All stock levels are sufficient.</p>
              )}
            </div>
          </div>

          {/* APPROVALS */}
          <div className="panel approvals">
            <h4 className="panel-title">Pending Approvals</h4>

            <div className="panel-scroll-content">
              {stats.pendingOrders > 0 || stats.pendingClientRequests > 0 ? (
                <>
                  {stats.pendingOrders > 0 && (
                    <div className="approval-item">
                      <p className="approval-item-name">
                        Pending Order Approvals
                      </p>
                      <p className="approval-item-quantity">
                        ({stats.pendingOrders})
                      </p>
                    </div>
                  )}

                  {stats.pendingClientRequests > 0 && (
                    <div className="approval-item">
                      <p className="approval-item-name">
                        Pending Client Registrations
                      </p>
                      <p className="approval-item-quantity">
                        ({stats.pendingClientRequests})
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="no-data-text">No pending approvals.</p>
              )}
            </div>
          </div>
        </div>

        {/* GRAPH */}
        <div className="panel graph">
          <div className="chart-placeholder">
            <InventoryChart />
          </div>
        </div>
      </div>
    </>
  );
};

export default Dashboard;
