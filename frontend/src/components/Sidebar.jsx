import "../styles/Sidebar.css";
import { useNavigate, useLocation } from "react-router-dom";
import {
  MdDashboard,
  MdInventory,
  MdReceiptLong,
  MdPeople,
  MdManageAccounts,
  MdSettings,
  MdMenu,
  MdWarehouse,
  MdHistory,
} from "react-icons/md";
import { FaCrown, FaDollyFlatbed } from "react-icons/fa";
import { useState } from "react";
import logo from "../assets/Premiumed logo.png";

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { name: "DASHBOARD", path: "/admin", icon: <MdDashboard /> },
    {
      name: "ORDERS (P.0.)",
      path: "/admin/clientsOrderPage",
      icon: <FaDollyFlatbed />,
    },
    {
      name: "INVENTORY MANAGEMENT",
      path: "/admin/inventory",
      icon: <MdInventory />,
    },
    {
      name: "WAREHOUSE MAP",
      path: "/admin/warehouseMapPage",
      icon: <MdWarehouse />,
    },
    {
      name: "CLIENTS INFORMATION",
      path: "/admin/clientsInformationPage",
      icon: <MdReceiptLong />,
    },
    {
      name: "SUPPLIERS INFORMATION",
      path: "/admin/suppliersInformationPage",
      icon: <MdPeople />,
    },
    {
      name: "USERS ACCESS CONTROL",
      path: "/admin/usersAccessControlPage",
      icon: <MdManageAccounts />,
    },
    { name: "ACTIVITY LOGS", path: "/admin/activityLogs", icon: <MdHistory /> },
    { name: "SETTINGS", path: "/admin/settingsPage", icon: <MdSettings /> },
  ];

  const handleNavigation = (path) => {
    navigate(path);
    setIsOpen(false);
  };

  return (
    <>
      <button className="hamburger" onClick={() => setIsOpen(!isOpen)}>
        <MdMenu />
      </button>

      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="logo">
          <img src={logo} alt="logo" className="logo-img" />
        </div>
        <nav className="menu">
          {menuItems.map((item) => (
            <div key={item.name} className="menu-group">
              <button
                className={`menu-item ${location.pathname === item.path ? "active" : ""}`}
                onClick={() => handleNavigation(item.path)}
              >
                <span
                  className={`icon ${
                    location.pathname === item.path ? "active-icon" : ""
                  }`}
                >
                  {item.icon}
                </span>
                <span className="label">{item.name}</span>
              </button>
            </div>
          ))}
        </nav>
      </aside>

      {isOpen && (
        <div className="backdrop" onClick={() => setIsOpen(false)}></div>
      )}
    </>
  );
};

export default Sidebar;
