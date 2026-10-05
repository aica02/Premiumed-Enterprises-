import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Screens
import LoginScreen from './screens/LoginScreen';
import DeliveryList from './screens/DeliveryList';
import DeliveryListComplete from './screens/DeliveryListComplete';
import Inventory from './screens/InventoryScreen';
import Picking from './screens/Picking';
import Putaway from './screens/Putaway';
import DisposeSupplies from './screens/DisposeSupplies';
import Settings from './screens/Settings';

// Offline Utilities & Components
import { initDB } from './utils/db';
import { useNetworkStatus } from './utils/useNetworkStatus';
import { processSyncQueue } from './shared/syncService';
import OfflineBanner from './components/offlineBanner';

const Stack = createStackNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState(null);
  
  const isOnline = useNetworkStatus();

  useEffect(() => {
    initDB().catch((err) => console.error('Failed to init SQLite DB:', err));

    checkLoginStatus();
  }, []);

  useEffect(() => {
    if (isOnline) {
      processSyncQueue();
    }
  }, [isOnline]);

  const checkLoginStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const role = await AsyncStorage.getItem('userRole');

      if (token && role) {
        const normalizedRole = role.toLowerCase();
        if (normalizedRole === 'staff') {
          setInitialRoute('Picking');
        } else if (normalizedRole === 'driver') {
          setInitialRoute('DeliveryList');
        } else {
          console.log('Invalid role, going to Login');
          await AsyncStorage.multiRemove(['userToken', 'userRole', 'username', 'userId', 'userName']);
          setInitialRoute('Login');
        }
      } else {
        setInitialRoute('Login');
      }
    } catch (error) {
      console.error('Error checking login:', error);
      setInitialRoute('Login');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !initialRoute) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  return (
    <View style={styles.appWrapper}>
      <OfflineBanner isOnline={isOnline} />

      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Picking" component={Picking} />
          <Stack.Screen name="Putaway" component={Putaway} />
          <Stack.Screen name="Inventory" component={Inventory} />
          <Stack.Screen name="DeliveryList" component={DeliveryList} />
          <Stack.Screen name="DeliveryListComplete" component={DeliveryListComplete} />
          <Stack.Screen name="Settings" component={Settings} />
          <Stack.Screen name="To Dispose" component={DisposeSupplies} />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  appWrapper: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});