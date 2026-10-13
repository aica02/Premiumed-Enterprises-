import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  getPendingRequestCount,
  offlineQueueChangedEvent,
} from '../shared/offlineApi';
import { DeviceEventEmitter } from 'react-native';

export default function OfflineBanner({ isOnline }) {
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCount = useCallback(async () => {
    try {
      setPendingCount(await getPendingRequestCount());
    } catch (error) {
      console.error('Failed to read pending offline changes:', error);
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const subscription = DeviceEventEmitter.addListener(
      offlineQueueChangedEvent,
      refreshCount,
    );
    return () => subscription.remove();
  }, [refreshCount]);

  if (isOnline && pendingCount === 0) return null;

  return (
    <View style={[styles.banner, isOnline && styles.pendingBanner]}>
      <Text style={styles.text}>
        {isOnline
          ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync`
          : pendingCount
            ? `Offline - ${pendingCount} change${pendingCount === 1 ? '' : 's'} queued to sync`
            : 'Offline Mode - Changes will sync when online'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#e74c3c',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBanner: {
    backgroundColor: '#b7791f',
  },
  text: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});