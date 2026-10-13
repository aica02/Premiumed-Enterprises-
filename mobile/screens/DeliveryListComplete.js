import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { deliveryStyles } from '../styles/DeliveryStyles';
import { detailStyles } from '../styles/DeliveryDetailStyles';
import { Search, MapPin, Truck, X, Menu, UserCircle, User, ArrowLeft, PackageX } from 'lucide-react-native';
import Header from './Header';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { offlineFetch as fetch } from '../shared/offlineApi';

export default function DeliveryListComplete({ navigation }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [staffName, setStaffName] = useState('');
  const [staffPosition, setStaffPosition] = useState('');
  const [userId, setUserId] = useState(null);

  const API_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/orders`;
  const USER_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/login/profile`;

  useEffect(() => { 
    fetchCompletedOrders(); 
    loadUserData(); 
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredOrders(orders);
    } else {
      const query = searchQuery.toLowerCase().trim();
      const filtered = orders.filter(order => {
        if (order.orderId?.toLowerCase().includes(query)) return true;
        if (order.name?.toLowerCase().includes(query)) return true;
        if (order.shippingAddress?.toLowerCase().includes(query)) return true;
        if (order.items?.some(item => item.name?.toLowerCase().includes(query))) return true;
        if (order.updatedAt && new Date(order.updatedAt).toLocaleDateString().includes(query)) return true;
        return false;
      });
      setFilteredOrders(filtered);
    }
  }, [searchQuery, orders]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      
      const token = await AsyncStorage.getItem('userToken');
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedUserName = await AsyncStorage.getItem('userName');
  
      if (storedUserId) {
        setUserId(storedUserId);
        
        if (storedUserName) {
          setStaffName(storedUserName);
          setStaffPosition('Warehouse Staff');
        }
        
        await fetchUserProfile(storedUserId, token);
      } else {
        console.log('No userId found in storage');
        setStaffName('Staff');
        setStaffPosition('Warehouse Staff');
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      setStaffName('Staff');
      setStaffPosition('Warehouse Staff');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async (userId, token) => {
    try {
      console.log('Fetching user profile for ID:', userId);

      const response = await fetch(`${USER_URL}/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      console.log('Profile response:', data);
      
      if (data.success && data.user) {
        const fullName = data.user.fullName || data.user.username || 'Staff';
        setStaffName(fullName);
        setStaffPosition(data.user.position || 'Warehouse Staff');
        
        await AsyncStorage.setItem('userName', fullName);
      } else {
        console.log('Could not fetch profile, using stored name');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchCompletedOrders = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_URL);
      const data = await response.json();
      const deliveredOrders = data.filter(o => o.status === 'DELIVERED');
      setOrders(deliveredOrders);
      setFilteredOrders(deliveredOrders);
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getBackorders = (order) => {
    if (!order) return [];
    return (
      order.backorders ||
      order.backorderItems ||
      order.partialOrderItems ||
      order.partialItems ||
      order.pendingItems ||
      order.items?.filter(item => item.status === 'BACKORDER' || item.isBackordered) ||
      []
    );
  };

  const isPartialOrder = (order) => {
    if (!order) return false;
    if (order.isPartial === true || order.status === 'PARTIAL') return true;
    return getBackorders(order).length > 0;
  };

  return (
    <>
    <Header
      navigation={navigation}
      staffName={staffName}
      staffPosition={staffPosition}
      onMenuPress={() => setMenuVisible(true)}
    />
    <View style={deliveryStyles.container}>
      <View style={deliveryStyles.headerRow}>
        <Truck color="#059669" size={30} />
        <Text style={deliveryStyles.headerTitle}>COMPLETED DELIVERIES</Text>
      </View>

      <View style={deliveryStyles.searchSection}>
        <Search size={20} color="#666" />
        <TextInput 
          style={deliveryStyles.searchInput} 
          placeholder="Search history by ID, client, address, or item..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={clearSearch}>
            <X size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

    

      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color="#059669" style={{ marginTop: 20 }} />
        ) : filteredOrders.length === 0 ? (
          <View style={deliveryStyles.emptyContainer}>
            <Text style={deliveryStyles.emptyText}>
              {searchQuery.trim() !== '' 
                ? 'No completed deliveries match your search' 
                : 'No completed deliveries yet'}
            </Text>
            {searchQuery.trim() !== '' && (
              <TouchableOpacity onPress={clearSearch} style={[deliveryStyles.clearSearchBtn, { backgroundColor: '#059669' }]}>
                <Text style={deliveryStyles.clearSearchText}>Clear Search</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredOrders.map((item) => (
            <View key={item._id} style={deliveryStyles.card}>
              <View style={deliveryStyles.cardHeader}>
                <Text style={deliveryStyles.orderID}>{item.orderId}</Text>
                <View style={[deliveryStyles.pendingBadge, { backgroundColor: '#DCFCE7' }]}>
                  <Text style={[deliveryStyles.pendingText, { color: '#059669' }]}>DELIVERED</Text>
                </View>
              </View>
              <Text style={deliveryStyles.clientName}>{item.name}</Text>
              <View style={deliveryStyles.addressContainer}>
                <MapPin size={16} color="#6B7280" />
                <Text style={deliveryStyles.addressText}>{item.shippingAddress}</Text>
              </View>
              
              {/* Optional: Show delivery date */}
              {item.updatedAt && (
                <View style={deliveryStyles.dateContainer}>
                  <Text style={deliveryStyles.dateText}>
                    Delivered: {formatDate(item.updatedAt)}
                  </Text>
                </View>
              )}
              
              <TouchableOpacity 
                style={[deliveryStyles.viewDetailsBtn, { backgroundColor: '#1F2937' }]} 
                onPress={() => { setSelectedOrder(item); setModalVisible(true); }}
              >
                <Text style={deliveryStyles.btnText}>VIEW RECEIPT</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* DETAIL MODAL (Read-Only) */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={[detailStyles.container, { height: '85%', borderTopLeftRadius: 25, borderTopRightRadius: 25 }]}>
            <View style={detailStyles.header}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <ArrowLeft color="#000" size={24} />
              </TouchableOpacity>
              <Text style={detailStyles.headerTitle}>DELIVERY LOG: {selectedOrder?.orderId}</Text>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
              <View style={detailStyles.card}>
                <Text style={detailStyles.cardTitle}>Client Information</Text>
                <View style={detailStyles.goldDivider} />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 5 }}>
                  <User size={16} color="#000" />
                  <Text style={[detailStyles.value, { marginLeft: 8 }]}>{selectedOrder?.name}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 5 }}>
                  <MapPin size={16} color="#000" />
                  <Text style={[detailStyles.value, { marginLeft: 8 }]}>{selectedOrder?.shippingAddress}</Text>
                </View>
                {selectedOrder?.updatedAt && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 5 }}>
                    <Text style={[detailStyles.value, { marginLeft: 8, fontSize: 12, color: '#666' }]}>
                      Delivered on: {formatDate(selectedOrder.updatedAt)}
                    </Text>
                  </View>
                )}
              </View>

              <View style={detailStyles.card}>
                <Text style={detailStyles.cardTitle}>Delivered Items</Text>
                <View style={detailStyles.goldDivider} />
                {selectedOrder?.items?.map((item, index) => (
                  <View key={index} style={detailStyles.supplyRow}>
                    <View style={{ flex: 2 }}>
                      <Text style={detailStyles.supplyName}>{item.name}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={detailStyles.qtyText}>{item.quantity}</Text>
                      <Text style={detailStyles.qtySubText}>Pcs</Text>
                    </View>
                  </View>
                ))}
              </View>

              {isPartialOrder(selectedOrder) && (
                <View style={detailStyles.card}>
                  <View style={localStyles.backorderHeader}>
                    <PackageX size={18} color="#92400E" />
                    <Text style={[detailStyles.cardTitle, { marginLeft: 8, color: '#92400E' }]}>
                      Backorders from partial orders
                    </Text>
                  </View>
                  <View style={localStyles.backorderDivider} />

                  {getBackorders(selectedOrder).length === 0 ? (
                    <Text style={localStyles.noBackorderText}>
                      No backorder items — this order is fully shipped.
                    </Text>
                  ) : (
                    getBackorders(selectedOrder).map((item, index) => (
                      <View key={index} style={detailStyles.supplyRow}>
                        <View style={{ flex: 2 }}>
                          <Text style={detailStyles.supplyName}>{item.name}</Text>
                          {item.backorderOrderId ? (
                            <Text style={localStyles.backorderNote}>
                              Partial order #{item.backorderOrderId}
                            </Text>
                          ) : null}
                          {item.note ? (
                            <Text style={localStyles.backorderNote}>{item.note}</Text>
                          ) : null}
                        </View>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={[detailStyles.qtyText, { color: '#92400E' }]}>
                            {item.quantity}
                          </Text>
                          <Text style={detailStyles.qtySubText}>Pcs</Text>
                        </View>
                      </View>
                    ))
                  )}

                  <Text style={localStyles.backorderFootnote}>
                    These items are pending and will be delivered separately.
                  </Text>
                </View>
              )}

              <View style={{ padding: 20, alignItems: 'center', backgroundColor: '#F0FDF4', margin: 20, borderRadius: 10 }}>
                 <Text style={{ color: '#059669', fontWeight: 'bold' }}>TRANSACTION COMPLETED</Text>
                 {selectedOrder?.updatedAt && (
                   <Text style={{ color: '#059669', fontSize: 12, marginTop: 4 }}>
                     {formatDate(selectedOrder.updatedAt)}
                   </Text>
                 )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
    </>
  );
}

const localStyles = StyleSheet.create({
  backorderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backorderDivider: {
    height: 2,
    backgroundColor: '#F59E0B',
    marginVertical: 8,
    borderRadius: 2,
  },
  noBackorderText: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    marginVertical: 6,
  },
  backorderNote: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 2,
    fontStyle: 'italic',
  },
  backorderFootnote: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 10,
    fontStyle: 'italic',
  },
});