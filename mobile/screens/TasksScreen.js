// screens/TasksScreen.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, Alert,
} from 'react-native';
import { useNetworkStatus } from '../utils/useNetworkStatus';
import OfflineBanner from '../components/offlineBanner';
import {
  getLocalItems,
  saveItem,
  deleteItem,
  processSyncQueue,
} from '../shared/syncService';

export default function TasksScreen() {
  const isOnline = useNetworkStatus();
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');

  const loadTasks = useCallback(async () => {
    const rows = await getLocalItems();
    setTasks(rows);
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Re-load when connection state flips (post-sync the local rows may change)
  useEffect(() => {
    loadTasks();
  }, [isOnline, loadTasks]);

  const handleAdd = async () => {
    if (!title.trim()) return;

    const newTask = {
      title: title.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };

    await saveItem(newTask, isOnline);
    setTitle('');
    await loadTasks();
  };

  const handleToggle = async (task) => {
    const updated = { ...task, completed: !task.completed };
    await saveItem(updated, isOnline);
    await loadTasks();
  };

  const handleDelete = async (task) => {
    await deleteItem(task._id, isOnline);
    await loadTasks();
  };

  const handleManualSync = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'You are offline. Changes will sync automatically.');
      return;
    }
    const result = await processSyncQueue();
    await loadTasks();
    Alert.alert('Sync', `Synced: ${result.synced}, Failed: ${result.failed}`);
  };

  return (
    <View style={styles.container}>
      <OfflineBanner isOnline={isOnline} />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="New task..."
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.syncButton} onPress={handleManualSync}>
        <Text style={styles.syncButtonText}>
          {isOnline ? 'Sync Now' : 'Offline — queued'}
        </Text>
      </TouchableOpacity>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <View style={styles.taskRow}>
            <TouchableOpacity
              style={styles.taskMain}
              onPress={() => handleToggle(item)}
            >
              <Text style={[styles.taskTitle, item.completed && styles.done]}>
                {item.completed ? '✓ ' : '○ '}
                {item.title}
              </Text>
              {item._id.startsWith('temp_') && (
                <Text style={styles.pendingTag}>pending sync</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleDelete(item)}>
              <Text style={styles.delete}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No tasks yet. Add one above.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  addButton: {
    backgroundColor: '#f5b700', paddingHorizontal: 16,
    justifyContent: 'center', borderRadius: 6,
  },
  addButtonText: { fontWeight: 'bold' },
  syncButton: {
    backgroundColor: '#01203F', padding: 10, borderRadius: 6,
    alignItems: 'center', marginBottom: 12,
  },
  syncButtonText: { color: '#fff', fontWeight: 'bold' },
  taskRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  taskMain: { flex: 1 },
  taskTitle: { fontSize: 15 },
  done: { textDecorationLine: 'line-through', color: '#888' },
  pendingTag: { fontSize: 11, color: '#e67e22', marginTop: 2 },
  delete: { color: '#e74c3c', fontSize: 18, paddingHorizontal: 8 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
});