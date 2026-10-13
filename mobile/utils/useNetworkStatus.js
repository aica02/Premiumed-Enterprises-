import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { processOfflineRequests } from '../shared/offlineApi';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const online = Boolean(
        state.isConnected && state.isInternetReachable !== false
      );

      setIsOnline(online);

      if (online) {
        try {
          await processOfflineRequests();
        } catch (e) {
          console.warn('Resync on reconnect failed:', e);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return isOnline;
}