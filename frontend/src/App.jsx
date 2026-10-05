import { Outlet, useLocation } from "react-router-dom"; 
import "./App.css";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import ClientNavbar from "./components/HeaderClient";
import { Toaster } from "react-hot-toast";

const App = () => {
  const location = useLocation();
  const role = localStorage.getItem("role");

  const isClient = role?.toLowerCase() === "user";

  const hideLayout = location.pathname.startsWith("/login") ||
                     location.pathname.startsWith("/profile") ||
                     location.pathname.startsWith("/order-transaction") ||
                     location.pathname.startsWith("/Landingpage") ||
                     location.pathname.startsWith("/cart");

  return (
    <div className="layout">
      <Toaster position="top-center" reverseOrder={false} />
      
      {!hideLayout && <Sidebar />}
      
      <div className={`main-area ${hideLayout ? "full-width" : ""}`}>
        {!hideLayout && !isClient && <Header />}
        {!hideLayout && isClient && <ClientNavbar />}

        <div className="content">
          <Outlet key={location.key} />
        </div>
      </div>
    </div>
  );
};

export default App;