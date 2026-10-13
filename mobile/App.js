import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import * as Updates from 'expo-updates';
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
import OfflineBanner from './components/offlineBanner';

const Stack = createStackNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState(null);
  
  const isOnline = useNetworkStatus();

useEffect(() => {
  const initialize = async () => {
    try {
      await initDB();
      await checkLoginStatus();
    } catch (err) {
      console.error('Failed to initialize offline storage:', err);
      setInitialRoute('Login');
      setIsLoading(false);
    }
  };

  const checkForUpdates = async () => {
    // Skip in development — expo-updates doesn't work in dev builds
    if (__DEV__) return;

    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();

        Alert.alert(
          'Update Ready',
          'A new version has been downloaded. Restart now to apply it?',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Restart',
              onPress: async () => {
                try {
                  await Updates.reloadAsync();
                } catch (e) {
                  console.error('Reload failed:', e);
                }
              },
            },
          ],
          { cancelable: true }
        );
      }
    } catch (error) {
      console.error('Update check failed:', error);
    }
  };

  initialize();
  checkForUpdates();
}, []);

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