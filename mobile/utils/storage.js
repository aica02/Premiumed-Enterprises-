import * as SecureStore from 'expo-secure-store';

export const setItem = async (key, value) => {
  try {
    await SecureStore.setItemAsync(key, value);
    console.log('Saved:', key);
    return true;
  } catch (error) {
    console.error('Error saving:', error);
    return false;
  }
};

export const getItem = async (key) => {
  try {
    const value = await SecureStore.getItemAsync(key);
    return value;
  } catch (error) {
    console.error('Error getting:', error);
    return null;
  }
};

export const removeItem = async (key) => {
  try {
    await SecureStore.deleteItemAsync(key);
    return true;
  } catch (error) {
    console.error('Error deleting:', error);
    return false;
  }
};

export const clearAll = async () => {
  const keys = ['userToken', 'userRole', 'username', 'userId', 'userName'];
  for (const key of keys) {
    await removeItem(key);
  }
};