// InventoryList.js
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  RefreshControl,
  Text,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Layers, Package } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import Sidebar from "./Sidebar";
import Header from "./Header";
import InventorySupply from "./InventorySupply";
import InventoryKit from "./InventoryKit";
import { styles } from "../styles/InventoryStyles";

const BACKEND_URL = process.env.EXPO_PUBLIC_LOCAL_URL;
const USER_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/login/profile`;

export default function InventoryList({ navigation }) {
  const [items, setItems] = useState([]);
  const [batches, setBatches] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("inventory");
  const [menuVisible, setMenuVisible] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [staffPosition, setStaffPosition] = useState("");
  const [userId, setUserId] = useState(null);

  useFocusEffect(
    useCallback(() => {
      setMenuVisible(false);
      return () => {
        setMenuVisible(false);
      };
    }, []),
  );

  useEffect(() => {
    fetchItems();
    fetchBatches();
    fetchSuppliers();
    loadUserData();

    setMenuVisible(false);
    return () => {
      setMenuVisible(false);
      setItems([]);
      setBatches([]);
      setSuppliers([]);
    };
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("userToken");
      const storedUserId = await AsyncStorage.getItem("userId");
      const storedUserName = await AsyncStorage.getItem("userName");

      if (storedUserId) {
        setUserId(storedUserId);
        if (storedUserName) {
          setStaffName(storedUserName);
          setStaffPosition("Warehouse Staff");
        }
        await fetchUserProfile(storedUserId, token);
      } else {
        setStaffName("Staff");
        setStaffPosition("Warehouse Staff");
      }
    } catch (error) {
      setStaffName("Staff");
      setStaffPosition("Warehouse Staff");
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async (userId, token) => {
    try {
      const response = await fetch(`${USER_URL}/${userId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success && data.user) {
        const fullName = data.user.fullName || data.user.username || "Staff";
        setStaffName(fullName);
        setStaffPosition(data.user.position || "Warehouse Staff");
        await AsyncStorage.setItem("userName", fullName);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/inventoryPage`);
      const data = await response.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch Error:", err);
      Alert.alert("Error", "Failed to fetch inventory items");
    } finally {
      setLoading(false);
    }
  };

  const fetchBatches = async () => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/inventoryPage/batches/all`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      setBatches(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Batch Fetch Error:", err);
      setBatches([]);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/suppliers/all`);
      const data = await response.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Supplier Fetch Error:", err);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchItems();
    await fetchBatches();
    setRefreshing(false);
  };

  const toggleSidebar = () => {
    setMenuVisible((prev) => !prev);
  };

  return (
    <>
      <Header
        navigation={navigation}
        staffName={staffName}
        staffPosition={staffPosition}
        onMenuPress={toggleSidebar}
      />
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#D4AF37"]}
              tintColor="#D4AF37"
            />
          }
        >
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === "inventory" && styles.activeTab,
              ]}
              onPress={() => setActiveTab("inventory")}
            >
              <Layers
                size={18}
                color={activeTab === "inventory" ? "#D4AF37" : "#6B7280"}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === "inventory" && styles.activeTabText,
                ]}
              >
                Supply List
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "kits" && styles.activeTab]}
              onPress={() => setActiveTab("kits")}
            >
              <Package
                size={18}
                color={activeTab === "kits" ? "#D4AF37" : "#6B7280"}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === "kits" && styles.activeTabText,
                ]}
              >
                Medical Kits
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === "inventory" ? (
            <InventorySupply
              navigation={navigation}
              staffName={staffName}
              staffPosition={staffPosition}
              items={items}
              setItems={setItems}
              batches={batches}
              setBatches={setBatches}
              suppliers={suppliers}
              setSuppliers={setSuppliers}
              fetchItems={fetchItems}
              fetchBatches={fetchBatches}
              fetchSuppliers={fetchSuppliers}
              onRefresh={onRefresh}
              refreshing={refreshing}
              styles={styles}
            />
          ) : (
            <InventoryKit
              navigation={navigation}
              staffName={staffName}
              staffPosition={staffPosition}
              items={items}
              setItems={setItems}
              batches={batches}
              setBatches={setBatches}
              fetchItems={fetchItems}
              fetchBatches={fetchBatches}
              onRefresh={onRefresh}
              refreshing={refreshing}
              styles={styles}
            />
          )}
        </ScrollView>
      </View>

      <Sidebar
        isVisible={menuVisible}
        onClose={() => setMenuVisible(false)}
        navigation={navigation}
      />
    </>
  );
}
