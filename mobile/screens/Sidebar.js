import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Modal, Image } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  XCircle,
  LayoutDashboard,
  ClipboardList,
  Package,
  Settings,
  PackageX,
} from "lucide-react-native";
import { pickingStyles } from "../styles/SidebarStyles";
import { useNavigation } from "@react-navigation/native";
import { offlineFetch } from "../shared/offlineApi";

const API_URL = process.env.EXPO_PUBLIC_LOCAL_URL;

export default function Sidebar({ isVisible, onClose, navigation }) {
  const [menuItems, setMenuItems] = useState([]);
  const [unstoredCount, setUnstoredCount] = useState(0);
  const [disposeCount, setDisposeCount] = useState(0);

  const MENUS = {
    Staff: [
      {
        name: "Picking List",
        icon: <LayoutDashboard size={22} color="#D4AF37" />,
        screen: "Picking",
      },
      {
        name: "Putaway List",
        icon: <ClipboardList size={22} color="#D4AF37" />,
        screen: "Putaway",
      },
      {
        name: "Inventory",
        icon: <Package size={22} color="#D4AF37" />,
        screen: "Inventory",
      },
      {
        name: "To Dispose",
        icon: <PackageX size={22} color="#D4AF37" />,
        screen: "To Dispose",
      },
    ],

    Driver: [
      {
        name: "Pending Delivery List",
        icon: <LayoutDashboard size={22} color="#D4AF37" />,
        screen: "DeliveryList",
      },
      {
        name: "Completed Delivery List",
        icon: <ClipboardList size={22} color="#D4AF37" />,
        screen: "DeliveryListComplete",
      },
    ],
  };

  useEffect(() => {
    if (isVisible) {
      loadMenu();
      fetchUnstoredCount();
      fetchDisposeCount();
    }
  }, [isVisible]);

  const loadMenu = async () => {
    try {
      const role = await AsyncStorage.getItem("userRole");
      // console.log("Role:", role);
      setMenuItems(MENUS[role] || []);
    } catch (error) {
      console.log("Error loading role:", error);
    }
  };

  const handleNavigation = (screen) => {
    onClose();
    navigation.navigate(screen);
  };

  const fetchUnstoredCount = async () => {
    try {
      const token = await AsyncStorage.getItem("userToken");

      const res = await offlineFetch(`${API_URL}/api/putaway/count`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setUnstoredCount((await res.json()).count);
    } catch (error) {
      console.log("Error fetching unstored supplies:", error);
    }
  };

  const fetchDisposeCount = async () => {
    try {
      const token = await AsyncStorage.getItem("userToken");

      const res = await offlineFetch(`${API_URL}/api/putaway/disposeCount`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setDisposeCount((await res.json()).count);
    } catch (error) {
      console.log("Error fetching disposal count:", error);
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={isVisible}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={pickingStyles.menuOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={pickingStyles.menuContainer}>
          <View style={pickingStyles.menuHeader}>
            <Text style={pickingStyles.menuTitle}>Premiumed Enterprises</Text>

            <TouchableOpacity
              onPress={onClose}
              style={pickingStyles.closeButton}
            >
              <XCircle size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, justifyContent: "space-between" }}>
            {/* Main Menus */}
            <View>
              {menuItems.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={pickingStyles.menuItem}
                  onPress={() => handleNavigation(item.screen)}
                >
                  {item.icon}
                  <View style={pickingStyles.menuContent}>
                    <Text style={pickingStyles.menuItemText}>{item.name}</Text>

                    {item.name === "Putaway List" && unstoredCount > 0 && (
                      <View style={pickingStyles.notificationBadge}>
                        <Text style={pickingStyles.notificationBadgeText}>
                          {unstoredCount > 99 ? "99+" : unstoredCount}
                        </Text>
                      </View>
                    )}

                    {item.name === "To Dispose" && disposeCount > 0 && (
                      <View style={pickingStyles.notificationBadge}>
                        <Text style={pickingStyles.notificationBadgeText}>
                          {disposeCount > 99 ? "99+" : disposeCount}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Bottom Menu */}
            <View>
              <View style={{ height: 1, backgroundColor: "#E5E7EB" }} />

              <TouchableOpacity
                style={pickingStyles.menuItem}
                onPress={() => handleNavigation("Settings")}
              >
                <Settings size={22} color="#D4AF37" />
                <Text style={pickingStyles.menuItemText}>Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
