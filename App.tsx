import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initDatabase } from './src/database/schema';
import { TomicaCollectorApp } from './src/TomicaCollectorApp';

export default function App() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="tomicacollector.db" onInit={initDatabase}>
        <TomicaCollectorApp />
        <StatusBar style="dark" />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
