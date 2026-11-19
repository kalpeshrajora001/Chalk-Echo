import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { GameScreen } from './src/screens/GameScreen';

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GameScreen />
    </SafeAreaProvider>
  );
}
