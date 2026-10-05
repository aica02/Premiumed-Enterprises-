import { createBrowserRouter, Navigate } from "react-router-dom";
import ProtectedAdminRoute from "../routers/ProtectedAdminRoute";
import { ProtectedUserRoute } from "../routers/ProtectedUserRoute";

// Admin & Shared Components
import App from "../App";
import Dashboard from "../pages/Dashboard";
import Inventory from "../pages/Inventory";
import ClientsInformation from "../pages/ClientsInformation";
import SuppliersInformation from "../pages/SuppliersInformation";
import UsersAccessControl from "../pages/UserAccessControl";
import ActivityLogs from "../pages/ActivityLogs";
import Settings from "../pages/Settings";

// User Components
import UserLayout from "../user/Landingpage";
import OrderTrans from "../user/OrderTrans";
import Cart from "../user/Cart";
import Profile from "../user/Profile";
import Login from "../pages/Login";
import ClientNavbar from "../components/HeaderClient";
import ClientsOrders from "../pages/ClientsOrder";
import WarehouseMap from "../pages/WarehouseMap";
import OrderSummary from "../user/OrderSummary";


const router = createBrowserRouter([
  { path: "/auth", element: <Login /> },

  {
    path: "/admin" ,
    element: <ProtectedAdminRoute allowedRoles={['Admin', 'Staff']}><App /></ProtectedAdminRoute>,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "clientsOrderPage", element: <ClientsOrders /> },
      { path: "inventory", element: <Inventory /> },
      { path: "warehouseMapPage", element: <WarehouseMap /> },
      { path: "clientsInformationPage", element: <ClientsInformation /> },
      { path: "suppliersInformationPage", element: <SuppliersInformation /> },
      { path: "usersAccessControlPage", element: <UsersAccessControl /> },
      { path: "activityLogs", element: <ActivityLogs /> },
      { path: "settingsPage", element: <Settings /> },
    ],
  },

  {
    path: "/",
    element: <ProtectedUserRoute><UserLayout /></ProtectedUserRoute>,
    children: [
        { index: true, element: <Dashboard /> },
        { path: "/clientNavbar", element: <ClientNavbar /> },
        { path: "/inventoryPage", element: <Inventory /> },
        { path: "/clientsInformationPage", element: <ClientsInformation /> },
        { path: "/suppliersInformationPage", element: <SuppliersInformation /> },
        { path: "/usersAccessControlPage", element: <UsersAccessControl /> },
        { path: "/settingsPage", element: <Settings /> },

        { path: "/loginPage", element: <Login /> },
        
        { path: "profile", element: <Profile /> },
        { path: "/order-transaction", element: <OrderTrans /> },
        { path: "/UserLayout", element: <UserLayout /> },
        { path: "/Cart", element: <Cart /> },
        { path: "/OrderSummary", element: <OrderSummary />},
    ]
  },

  { path: "*", element: <Navigate to="/auth" replace /> },
]);

export default router;