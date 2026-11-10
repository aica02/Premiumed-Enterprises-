import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, Modal, StyleSheet, RefreshControl, Image } from 'react-native';
import { deliveryStyles } from '../styles/DeliveryStyles';
import { detailStyles } from '../styles/DeliveryDetailStyles';
import { XCircle, Menu, Truck, Search, X, ArrowLeft, User, MapPin, PackageX, TriangleAlert, CheckCircle, Camera, RotateCcw } from 'lucide-react-native';
import Header from './Header';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { offlineFetch as fetch } from '../shared/offlineApi';
import { readJsonResponse } from '../shared/readJsonResponse';
import { unitLabel } from '../utils/units';
import { styles as inventoryStyles } from '../styles/InventoryStyles';

const isOnline = (state) =>
  Boolean(state?.isConnected && state?.isInternetReachable !== false);

// Sends the DR (delivery receipt) photo to the backend, which stores it on
// Cloudinary so admins can open it later (the server's /uploads folder is
// wiped on redeploy). The app needs no Cloudinary keys of its own.
const uploadReceiptPhoto = async (imageUri, orderId) => {
  const compressed = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: 1200 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );

  const safeOrderId = String(orderId || 'order').replace(/[^a-zA-Z0-9-]/g, '-');
  const formData = new FormData();
  formData.append('receipt', {
    uri: compressed.uri,
    type: 'image/jpeg',
    name: `dr-${safeOrderId}-${Date.now()}.jpg`,
  });

  const token = await AsyncStorage.getItem('userToken');
  // globalThis.fetch: the photo must upload now, never be queued offline.
  const response = await globalThis.fetch(
    `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/orders/${encodeURIComponent(orderId)}/delivery-receipt`,
    {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  const result = await readJsonResponse(response, 'DR photo upload');
  if (!response.ok) {
    throw new Error(result?.message || `Upload failed (HTTP ${response.status}).`);
  }
  if (!result?.url) {
    throw new Error('The server did not return a photo link.');
  }
  return result.url;
};

export default function DeliveryList({ navigation }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deliveryConfirmationVisible, setDeliveryConfirmationVisible] = useState(false);
  const [updatingOrder, setUpdatingOrder] = useState(false);
  const [deliveryFeedback, setDeliveryFeedback] = useState(null);
  // In-app notice modal (replaces the plain system alerts).
  const [notice, setNotice] = useState(null);
  const showNotice = (type, title, message) => setNotice({ type, title, message });

  // DR photo for the order being delivered: the local preview, the uploaded
  // Cloudinary link, and the upload state.
  const [drPhotoUri, setDrPhotoUri] = useState(null);
  const [drPhotoUrl, setDrPhotoUrl] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUploadFailed, setPhotoUploadFailed] = useState(false);

  const [staffName, setStaffName] = useState('');
  const [staffPosition, setStaffPosition] = useState('');
  const [userId, setUserId] = useState(null);

  const API_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/orders`;
  const USER_URL = `${process.env.EXPO_PUBLIC_LOCAL_URL}/api/login/profile`;

  useEffect(() => {
    fetchConfirmedOrders();
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
      const response = await fetch(`${USER_URL}/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success && data.user) {
        const fullName = data.user.fullName || data.user.username || 'Staff';
        setStaffName(fullName);
        setStaffPosition(data.user.position || 'Warehouse Staff');
        await AsyncStorage.setItem('userName', fullName);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

const fetchConfirmedOrders = async (showLoading = true) => {
  try {
    if (showLoading) setLoading(true);
    const response = await fetch(API_URL);
    const data = await response.json();
    // Pay-after-delivery: every TO SHIP order is delivered, paid or not.
    const toShipOrders = data
      .filter(o => o.status === 'TO SHIP')
      .sort((a, b) => {
        // Prefer createdAt, fall back to orderDate, then _id
        const aTime = new Date(a.createdAt || a.orderDate || 0).getTime();
        const bTime = new Date(b.createdAt || b.orderDate || 0).getTime();
        if (aTime !== bTime) return bTime - aTime; // newest first

        // Fallback: MongoDB ObjectId is time-ordered
        const aId = String(a._id || '');
        const bId = String(b._id || '');
        if (aId.length === 24 && bId.length === 24) {
          return bId.localeCompare(aId);
        }
        return 0;
      });
    setOrders(toShipOrders);
    setFilteredOrders(toShipOrders);
  } catch (error) {
    console.error('Fetch Error:', error);
  } finally {
    if (showLoading) setLoading(false);
  }
};

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchConfirmedOrders(false);
    } finally {
      setRefreshing(false);
    }
  };

  const resetDrPhoto = () => {
    setDrPhotoUri(null);
    setDrPhotoUrl(null);
    setUploadingPhoto(false);
    setPhotoUploadFailed(false);
  };

  const openOrder = (order) => {
    resetDrPhoto();
    setSelectedOrder(order);
    setModalVisible(true);
  };

  const uploadDrPhoto = async (uri) => {
    if (!uri || !selectedOrder) return;

    const network = await NetInfo.fetch();
    if (!isOnline(network)) {
      setPhotoUploadFailed(true);
      showNotice('error', 'No Internet Connection', 'The DR photo could not be uploaded. Connect to the internet, then tap Retry Upload.');
      return;
    }

    try {
      setUploadingPhoto(true);
      setPhotoUploadFailed(false);
      const url = await uploadReceiptPhoto(uri, selectedOrder.orderId);
      setDrPhotoUrl(url);
      showNotice('success', 'DR Photo Uploaded', 'The delivery receipt photo was uploaded. You can now mark the order as delivered.');
    } catch (error) {
      console.error('DR photo upload failed:', error);
      setDrPhotoUrl(null);
      setPhotoUploadFailed(true);
      showNotice('error', 'DR Photo Upload Failed', `${error?.message || 'The photo could not be uploaded.'} Tap Retry Upload or retake the photo.`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const takeDrPhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showNotice('warning', 'Permission Required', 'Please allow camera access to take the DR photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      const asset = result.assets?.[0];
      if (result.canceled || !asset?.uri) return;

      setDrPhotoUri(asset.uri);
      setDrPhotoUrl(null);
      await uploadDrPhoto(asset.uri);
    } catch (error) {
      console.error('DR photo capture failed:', error);
      showNotice('error', 'Unable to Take Photo', error?.message || 'Failed to take photo.');
    }
  };

  const handleMarkDeliveredPress = async () => {
    if (!drPhotoUrl) {
      showNotice('warning', 'DR Photo Required', 'Take a photo of the signed delivery receipt before marking this order as delivered.');
      return;
    }
    const network = await NetInfo.fetch();
    if (!isOnline(network)) {
      showNotice('error', 'No Internet Connection', 'Connect to the internet to mark this order as delivered.');
      return;
    }
    setDeliveryConfirmationVisible(true);
  };

  const handleUpdateStatus = async (orderId) => {
    if (!orderId) return;
    if (!drPhotoUrl) {
      showNotice('warning', 'DR Photo Required', 'Take a photo of the signed delivery receipt first.');
      return;
    }

    try {
      setUpdatingOrder(true);
      const token = await AsyncStorage.getItem('userToken');
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedUsername = await AsyncStorage.getItem('username');
      const storedRole = await AsyncStorage.getItem('userRole');

      const response = await fetch(`${API_URL}/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(storedUserId ? { 'x-user-id': storedUserId } : {}),
          ...(storedUsername ? { 'x-username': storedUsername } : {}),
          ...(storedRole ? { 'x-role': storedRole } : {}),
        },
        body: JSON.stringify({ status: 'DELIVERED', deliveryReceipt: drPhotoUrl, userId: storedUserId, username: storedUsername, role: storedRole }),
      });

      if (response.ok) {
        const result = await response.json();
        setDeliveryFeedback({
          queued: Boolean(result.queued),
          orderId,
        });
        setDeliveryConfirmationVisible(false);
        setModalVisible(false);
        resetDrPhoto();
        setSearchQuery('');
        await fetchConfirmedOrders();
      } else {
        const errorData = await response.json();
        showNotice('error', 'Delivery Not Saved', errorData.message || 'Failed to update order');
      }
    } catch (error) {
      console.error('Update error:', error);
      showNotice('error', 'Delivery Not Saved', 'Server update failed. Please try again.');
    } finally {
      setUpdatingOrder(false);
    }
  };

  const clearSearch = () => setSearchQuery('');

  // ─── Helper: partial = orderId ends with "-P" OR backend flagged it ───
  const isPartialOrder = (order) => {
    if (!order) return false;
    if (order.isPartial === true) return true;
    if (order.status === 'PARTIAL') return true;
    if (String(order.orderId || '').endsWith('-P')) return true;
    return getBackorders(order).length > 0;
  };

  const getBackorders = (order) => {
    if (!order) return [];
    // Backend attaches `backorders` — use it first
    if (Array.isArray(order.backorders) && order.backorders.length > 0) {
      return order.backorders;
    }
    // Fallback field names
    for (const key of ['backorderItems', 'partialOrderItems', 'partialItems', 'pendingItems']) {
      if (Array.isArray(order[key]) && order[key].length > 0) return order[key];
    }
    // Last resort: items flagged as backordered
    if (Array.isArray(order.items)) {
      const flagged = order.items.filter(
        (i) => i.status === 'BACKORDER' || i.isBackordered,
      );
      if (flagged.length > 0) return flagged;
    }
    return [];
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
          <Truck color="#D4AF37" size={30} />
          <Text style={deliveryStyles.headerTitle}>DELIVERY LIST</Text>
        </View>

        {/* SEARCH SECTION */}
        <View style={deliveryStyles.searchSection}>
          <Search size={20} color="#666" />
          <TextInput
            style={deliveryStyles.searchInput}
            placeholder="Search by Order ID, Client, Address, or Item..."
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

        {/* LIST SECTION */}
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#D4AF37']}
              tintColor="#D4AF37"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator color="#D4AF37" style={{ marginTop: 20 }} />
          ) : filteredOrders.length === 0 ? (
            <View style={deliveryStyles.emptyContainer}>
              <Text style={deliveryStyles.emptyText}>
                {searchQuery.trim() !== ''
                  ? 'No orders match your search'
                  : 'No orders to deliver'}
              </Text>
              {searchQuery.trim() !== '' && (
                <TouchableOpacity onPress={clearSearch} style={deliveryStyles.clearSearchBtn}>
                  <Text style={deliveryStyles.clearSearchText}>Clear Search</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredOrders.map((item) => (
              <View key={item._id} style={deliveryStyles.card}>
                <View style={deliveryStyles.cardHeader}>
                  <Text style={deliveryStyles.orderID}>{item.orderId}</Text>
                  <View style={deliveryStyles.pendingBadge}>
                    <Text style={deliveryStyles.pendingText}>TO SHIP</Text>
                  </View>
                </View>

                {/* PARTIAL badge if applicable */}
                {isPartialOrder(item) && (
                  <View style={localStyles.partialBadge}>
                    <PackageX size={14} color="#92400E" />
                    <Text style={localStyles.partialBadgeText}>PARTIAL DELIVERY</Text>
                  </View>
                )}

                {/* Backorder count badge */}
                {/* {getBackorders(item).length > 0 && (
                  <View style={localStyles.backorderCountBadge}>
                    <Text style={localStyles.backorderCountText}>
                      {getBackorders(item).length} backorder item
                      {getBackorders(item).length > 1 ? 's' : ''}
                    </Text>
                  </View>
                )} */}

                <Text style={deliveryStyles.clientName}>{item.name}</Text>
                <View style={deliveryStyles.addressContainer}>
                  <MapPin size={16} color="#6B7280" />
                  <Text style={deliveryStyles.addressText}>{item.shippingAddress}</Text>
                </View>
                <TouchableOpacity
                  style={deliveryStyles.viewDetailsBtn}
                  onPress={() => openOrder(item)}
                >
                  <Text style={deliveryStyles.btnText}>VIEW DETAILS</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>

        {/* DETAIL MODAL */}
        <Modal visible={modalVisible} animationType="slide" transparent={true}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={[detailStyles.container, { height: '85%', borderTopLeftRadius: 25, borderTopRightRadius: 25 }]}>
              <View style={detailStyles.header}>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <ArrowLeft color="#000" size={24} />
                </TouchableOpacity>
                <Text style={detailStyles.headerTitle}>DETAILS: {selectedOrder?.orderId}</Text>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
                {/* CLIENT INFO */}
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
                </View>

                {/* ITEMS ORDERED */}
                <View style={detailStyles.card}>
                  <Text style={detailStyles.cardTitle}>Items Ordered</Text>
                  <View style={detailStyles.goldDivider} />
                  {selectedOrder?.items?.map((item, index) => (
                    <View key={index} style={detailStyles.supplyRow}>
                      <View style={{ flex: 2 }}>
                        <Text style={detailStyles.supplyName}>{item.name}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={detailStyles.qtyText}>{item.quantity}</Text>
                        <Text style={detailStyles.qtySubText}>{unitLabel(item.quantity, item.unitType)}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* ─── BACKORDERS / PARTIAL DELIVERY SECTION ─── */}
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
                            <Text style={detailStyles.qtySubText}>{unitLabel(item.quantity, item.unitType)}</Text>
                          </View>
                        </View>
                      ))
                    )}

                    <Text style={localStyles.backorderFootnote}>
                      These items are pending and will be delivered separately.
                    </Text>
                  </View>
                )}

                {/* DR PHOTO (required before delivery) */}
                <View style={detailStyles.card}>
                  <Text style={detailStyles.cardTitle}>Delivery Receipt (DR) Photo</Text>
                  <View style={detailStyles.goldDivider} />

                  {drPhotoUri ? (
                    <Image source={{ uri: drPhotoUri }} style={localStyles.drPreview} resizeMode="cover" />
                  ) : (
                    <Text style={localStyles.drHint}>
                      Take a photo of the signed delivery receipt. It is required before marking this order as delivered.
                    </Text>
                  )}

                  {uploadingPhoto ? (
                    <View style={localStyles.drStatusRow}>
                      <ActivityIndicator color="#D4AF37" />
                      <Text style={[localStyles.drStatusText, { marginLeft: 8 }]}>Uploading photo...</Text>
                    </View>
                  ) : drPhotoUrl ? (
                    <View style={localStyles.drStatusRow}>
                      <CheckCircle size={16} color="#059669" />
                      <Text style={[localStyles.drStatusText, { color: '#059669', marginLeft: 6 }]}>Photo uploaded</Text>
                    </View>
                  ) : photoUploadFailed ? (
                    <View style={localStyles.drStatusRow}>
                      <TriangleAlert size={16} color="#B91C1C" />
                      <Text style={[localStyles.drStatusText, { color: '#B91C1C', marginLeft: 6 }]}>Upload failed</Text>
                    </View>
                  ) : null}

                  <View style={localStyles.drActions}>
                    <TouchableOpacity
                      style={[localStyles.drButton, uploadingPhoto && localStyles.drButtonDisabled]}
                      onPress={takeDrPhoto}
                      disabled={uploadingPhoto}
                    >
                      {drPhotoUri ? <RotateCcw size={16} color="#000" /> : <Camera size={16} color="#000" />}
                      <Text style={localStyles.drButtonText}>{drPhotoUri ? 'RETAKE PHOTO' : 'TAKE DR PHOTO'}</Text>
                    </TouchableOpacity>

                    {photoUploadFailed && drPhotoUri && !uploadingPhoto && (
                      <TouchableOpacity
                        style={[localStyles.drButton, { marginLeft: 10 }]}
                        onPress={() => uploadDrPhoto(drPhotoUri)}
                      >
                        <Text style={localStyles.drButtonText}>RETRY UPLOAD</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* MARK DELIVERED (disabled until the DR photo is uploaded) */}
                <TouchableOpacity
                  style={[
                    detailStyles.updateBtn,
                    { marginHorizontal: 20, marginTop: 10 },
                    !drPhotoUrl && localStyles.updateBtnDisabled,
                  ]}
                  onPress={handleMarkDeliveredPress}
                  disabled={!drPhotoUrl || uploadingPhoto}
                >
                  <Text style={detailStyles.updateBtnText}>MARK AS DELIVERED</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={deliveryConfirmationVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDeliveryConfirmationVisible(false)}
        >
          <View style={inventoryStyles.confirmOverlay}>
            <View style={inventoryStyles.confirmModal}>
              <View style={inventoryStyles.confirmHeader}>
                <View
                  style={[
                    inventoryStyles.supplyIcon,
                    { backgroundColor: '#ECFDF5' },
                  ]}
                >
                  <Truck size={25} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={inventoryStyles.confirmTitle}>
                    Confirm Delivery
                  </Text>
                  <Text style={inventoryStyles.confirmSubtitle}>
                    Please review the order before continuing.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setDeliveryConfirmationVisible(false)}
                  style={inventoryStyles.confirmClose}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel delivery confirmation"
                >
                  <XCircle size={28} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <View style={inventoryStyles.supplyPreview}>
                <View style={{ flex: 1 }}>
                  <Text style={inventoryStyles.supplyName}>
                    {selectedOrder?.name || 'Customer'}
                  </Text>
                  <Text style={[inventoryStyles.itemCode, { color: '#059669' }]}>
                    {selectedOrder?.orderId}
                  </Text>
                  <Text style={inventoryStyles.categoryText}>
                    {selectedOrder?.shippingAddress || 'No delivery address'}
                  </Text>
                </View>
              </View>

              <ScrollView
                style={inventoryStyles.confirmDetails}
                showsVerticalScrollIndicator={false}
              >
                {/* ─── Supply list ─── */}
                <Text style={inventoryStyles.detailLabel}>Supplies</Text>
                {selectedOrder?.items?.length > 0 ? (
                  selectedOrder.items.map((item, index) => (
                    <View
                      key={index}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: 6,
                        borderBottomWidth: 1,
                        borderBottomColor: '#F3F4F6',
                      }}
                    >
                      <Text style={{ flex: 1, fontSize: 13, color: '#111827' }} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#059669', marginLeft: 12 }}>
                        {item.quantity} {unitLabel(item.quantity, item.unitType)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ fontSize: 13, color: '#6B7280', fontStyle: 'italic', paddingVertical: 6 }}>
                    No items
                  </Text>
                )}

                {/* ─── Total supplies ─── */}
                <View style={[inventoryStyles.detailRow, { marginTop: 10 }]}>
                  <Text style={inventoryStyles.detailLabel}>Total Supplies</Text>
                  <Text style={inventoryStyles.detailValue}>
                    {Object.entries(
                      (selectedOrder?.items || []).reduce((acc, i) => {
                        const unit = i.unitType || 'Piece';
                        acc[unit] = (acc[unit] || 0) + (Number(i.quantity) || 0);
                        return acc;
                      }, {})
                    )
                      .map(([unit, total]) => `${total} ${unitLabel(total, unit)}`)
                      .join(' + ')}
                     </Text>
                </View>
              </ScrollView>

              <View
                style={[
                  inventoryStyles.confirmErrorBox,
                  { backgroundColor: '#f5edd5', borderColor: '#b89c41' },
                ]}
              >
                <TriangleAlert size={16} color="#D4AF37" />
                <Text
                  style={[
                    inventoryStyles.confirmErrorText,
                    { color: '#D4AF37' },
                  ]}
                >
                  Confirm only after the order has been delivered.
                </Text>
              </View>

              <View style={inventoryStyles.confirmActions}>
                <TouchableOpacity
                  style={inventoryStyles.cancelButton}
                  onPress={() => setDeliveryConfirmationVisible(false)}
                  disabled={updatingOrder}
                >
                  <Text style={inventoryStyles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    inventoryStyles.confirmButton,
                    { backgroundColor: '#059669' },
                  ]}
                  onPress={() => handleUpdateStatus(selectedOrder?.orderId)}
                  disabled={updatingOrder}
                >
                  {updatingOrder ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Truck size={18} color="#FFFFFF" />
                      <Text style={inventoryStyles.confirmButtonText}>
                        Confirm Delivery
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {deliveryFeedback && (
          <Modal
            visible={Boolean(deliveryFeedback)}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => setDeliveryFeedback(null)}
          >
            <View style={inventoryStyles.modalOverlay}>
              <View style={inventoryStyles.successModalContainer}>
                <View style={inventoryStyles.successIconContainer}>
                  <CheckCircle size={38} color="#059669" />
                </View>
                <Text style={inventoryStyles.successEyebrow}>
                  {deliveryFeedback.queued ? 'SAVED OFFLINE' : 'DELIVERY COMPLETE'}
                </Text>
                <Text style={inventoryStyles.successTitle}>
                  {deliveryFeedback.queued ? 'Saved Offline' : 'Delivered Successfully'}
                </Text>
                <Text style={inventoryStyles.successMessage}>
                  {deliveryFeedback.queued
                    ? `Delivery of order ${deliveryFeedback.orderId} is saved on this device and will sync when you reconnect.`
                    : `${deliveryFeedback.orderId} has been marked as delivered.`}
                </Text>
                <TouchableOpacity
                  style={inventoryStyles.successButton}
                  onPress={() => setDeliveryFeedback(null)}
                >
                  <Text style={inventoryStyles.successButtonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

        {notice && (
          <Modal
            visible
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => setNotice(null)}
          >
            <View style={inventoryStyles.modalOverlay}>
              <View
                style={[
                  inventoryStyles.successModalContainer,
                  { borderTopColor: NOTICE_THEME[notice.type].accent },
                ]}
              >
                <View
                  style={[
                    inventoryStyles.successIconContainer,
                    { backgroundColor: NOTICE_THEME[notice.type].tint },
                  ]}
                >
                  {notice.type === 'success' ? (
                    <CheckCircle size={38} color={NOTICE_THEME.success.accent} />
                  ) : notice.type === 'error' ? (
                    <XCircle size={38} color={NOTICE_THEME.error.accent} />
                  ) : (
                    <TriangleAlert size={38} color={NOTICE_THEME.warning.accent} />
                  )}
                </View>
                <Text
                  style={[
                    inventoryStyles.successEyebrow,
                    { color: NOTICE_THEME[notice.type].eyebrowColor },
                  ]}
                >
                  {NOTICE_THEME[notice.type].eyebrow}
                </Text>
                <Text style={inventoryStyles.successTitle}>{notice.title}</Text>
                <Text style={inventoryStyles.successMessage}>{notice.message}</Text>
                <TouchableOpacity
                  style={[
                    inventoryStyles.successButton,
                    { backgroundColor: NOTICE_THEME[notice.type].button },
                  ]}
                  onPress={() => setNotice(null)}
                  accessibilityRole="button"
                >
                  <Text style={inventoryStyles.successButtonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </>
  );
}

const NOTICE_THEME = {
  success: { accent: '#059669', tint: '#D1FAE5', eyebrow: 'SUCCESS', eyebrowColor: '#047857', button: '#059669' },
  error: { accent: '#DC2626', tint: '#FEE2E2', eyebrow: 'ACTION NEEDED', eyebrowColor: '#B91C1C', button: '#DC2626' },
  warning: { accent: '#D4AF37', tint: '#FEF3C7', eyebrow: 'HEADS UP', eyebrowColor: '#92400E', button: '#B8962E' },
};

/* ─── Local styles for the partial / backorder UI ─── */
const localStyles = StyleSheet.create({
  partialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
    marginBottom: 4,
  },
  partialBadgeText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  backorderCountBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  backorderCountText: {
    color: '#92400E',
    fontSize: 10,
    fontWeight: '600',
  },
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
  drPreview: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    marginVertical: 6,
  },
  drHint: {
    fontSize: 13,
    color: '#6B7280',
    marginVertical: 6,
  },
  drStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  drStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  drActions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  drButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4AF37',
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  drButtonDisabled: {
    opacity: 0.5,
  },
  drButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginLeft: 6,
  },
  updateBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
});