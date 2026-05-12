import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.killerfy.app',        // ← cambia esto (era io.ionic.starter)
  appName: 'Killerfy',              // ← nombre que aparece en el móvil
  webDir: 'www',
  server: {
    androidScheme: 'http'
  },
  plugins: {
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1e1e1e'
    }
  }
};

export default config;