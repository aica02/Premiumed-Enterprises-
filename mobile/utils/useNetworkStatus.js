import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  getRejectedRequests,
  processOfflineRequests,
} from '../shared/offlineApi';

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
          const result = await processOfflineRequests();
          // Changes the server refused for good were set aside so the rest
          // could sync; tell the user which ones did not go through.
          if (result?.rejected > 0) {
            const latest = (await getRejectedRequests()).slice(0, result.rejected);
            const lines = latest
              .map((entry) => `- ${entry.message}`)
              .join('\n');
            Alert.alert(
              'Some offline changes were not saved',
              `${result.rejected} change${result.rejected === 1 ? ' was' : 's were'} refused by the server and removed from the sync queue:\n\n${lines}\n\nPlease check these orders and redo the change if needed.`,
            );
          }
        } catch (e) {
          console.warn('Resync on reconnect failed:', e);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return isOnline;
}