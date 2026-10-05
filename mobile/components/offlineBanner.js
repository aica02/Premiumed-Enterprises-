import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function OfflineBanner({ isOnline }) {
  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Offline Mode - Changes will sync when online</Text>
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
  text: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});