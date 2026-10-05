import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { ArrowLeft, RefreshCw, Wifi } from "lucide-react-native";
import { settingsStyles } from "../styles/SettingsStyles";

export default function Settings({ navigation }) {
  const handleSync = () => {
    console.log("Syncing...");
  };

  return (
    <View style={settingsStyles.container}>

        <View style={settingsStyles.header}>
            <TouchableOpacity style={settingsStyles.backButton}
            onPress={() => navigation.goBack()}
            >
                <ArrowLeft size={24} color="#1F2937" />
            </TouchableOpacity>
            <Text style={settingsStyles.headerTitle}>
            Settings
            </Text>
        </View>

      <View style={settingsStyles.card}>
        <Text style={settingsStyles.title}>
          Data Synchronization
        </Text>

        <View style={settingsStyles.divider} />

        <View style={settingsStyles.infoRow}>
          <Text style={settingsStyles.label}>Status</Text>

          <View style={settingsStyles.statusContainer}>
            <Wifi size={16} color="#16A34A" />
            <Text style={settingsStyles.statusOnline}>
              Online
            </Text>
          </View>
        </View>

        <View style={settingsStyles.infoRow}>
          <Text style={settingsStyles.label}>Last Sync</Text>
          <Text style={settingsStyles.value}>
            2026-03-09 14:25
          </Text>
        </View>

        <View style={settingsStyles.infoRow}>
          <Text style={settingsStyles.label}>Unsynced Records</Text>
          <Text style={settingsStyles.value}>
            0
          </Text>
        </View>

        <TouchableOpacity
          style={settingsStyles.syncButton}
          onPress={handleSync}
        >
          <RefreshCw size={18} color="#FFFFFF" />
          <Text style={settingsStyles.syncButtonText}>
            Sync Now
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}