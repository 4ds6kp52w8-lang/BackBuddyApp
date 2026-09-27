import React, {useState, useRef} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import {BleManager, Device} from 'react-native-ble-plx';
import {Buffer} from 'buffer';

const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const POSTURE_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const COMMAND_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

type AppState = 'disconnected' | 'connecting' | 'connected' | 'calibrating' | 'running';

function App(): React.JSX.Element {
  const [appState, setAppState] = useState<AppState>('disconnected');
  const [statusText, setStatusText] = useState('Not Connected');
  const [tiltData, setTiltData] = useState('--');
  const [deviationData, setDeviationData] = useState('--');
  const [slouching, setSlouching] = useState(false);
  const managerRef = useRef(new BleManager());
  const deviceRef = useRef<Device | null>(null);

  const handlePostureUpdate = (decoded: string) => {
    if (decoded.startsWith('CALIBRATION_START')) {
      setAppState('calibrating');
      setStatusText('Calibrating... sit upright');
      return;
    }
    if (decoded.startsWith('CALIBRATION_COMPLETE')) {
      setAppState('running');
      setStatusText('Running');
      return;
    }
    // Regular data: tilt,deviation,slouching
    const parts = decoded.split(',');
    if (parts.length === 3) {
      setTiltData(parts[0]);
      setDeviationData(parts[1]);
      setSlouching(parts[2] === '1');
    }
  };

  const handleConnectPress = () => {
    setAppState('connecting');
    setStatusText('Connecting to device...');

    managerRef.current.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setAppState('disconnected');
        setStatusText('Scan error: ' + error.message);
        return;
      }

      if (device?.name === 'BackBuddy') {
        managerRef.current.stopDeviceScan();

        device
          .connect()
          .then(connectedDevice => {
            deviceRef.current = connectedDevice;
            setAppState('connected');
            setStatusText('Connected');
            connectedDevice.onDisconnected((error, disconnectedDevice) => {
              console.log('Device disconnected');
              deviceRef.current = null;
              setAppState('disconnected');
              setStatusText('Disconnected — tap Connect to reconnect');
              setTiltData('--');
              setDeviationData('--');
              setSlouching(false);
            });
            return connectedDevice.discoverAllServicesAndCharacteristics();
          })
          .then(connectedDevice => {
            connectedDevice.monitorCharacteristicForService(
              SERVICE_UUID,
              POSTURE_UUID,
              (err, characteristic) => {
                if (err) {
                  console.log('Monitor error:', err.message);
                  return;
                }
                if (characteristic?.value) {
                  const decoded = Buffer.from(
                    characteristic.value,
                    'base64',
                  ).toString('utf-8');
                  handlePostureUpdate(decoded);
                }
              },
            );
          })
          .catch(err => {
            setAppState('disconnected');
            setStatusText('Connection failed: ' + err.message);
          });
      }
    });
  };

  const handleCalibratePress = () => {
    if (!deviceRef.current) {
      setStatusText('Not connected yet');
      return;
    }
    const encodedCommand = Buffer.from('CALIBRATE', 'utf-8').toString(
      'base64',
    );
    deviceRef.current
      .writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        COMMAND_UUID,
        encodedCommand,
      )
      .catch(err => {
        setStatusText('Calibrate command failed: ' + err.message);
      });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <Text style={styles.title}>BackBuddy</Text>
        <Text style={styles.status}>Status: {statusText}</Text>

        {appState === 'running' && (
          <>
            <Text style={styles.status}>Tilt: {tiltData}°</Text>
            <Text style={styles.status}>Deviation: {deviationData}°</Text>
            <Text style={styles.status}>
              Slouching: {slouching ? 'YES' : 'No'}
            </Text>
          </>
        )}

        {(appState === 'disconnected' || appState === 'connecting') && (
          <TouchableOpacity
            style={styles.button}
            onPress={handleConnectPress}
            disabled={appState === 'connecting'}>
            <Text style={styles.buttonText}>Connect to BackBuddy</Text>
          </TouchableOpacity>
        )}

        {appState === 'connected' && (
          <TouchableOpacity
            style={[styles.button, styles.calibrateButton]}
            onPress={handleCalibratePress}>
            <Text style={styles.buttonText}>Start Calibration</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#ffffff'},
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {fontSize: 32, fontWeight: 'bold', marginBottom: 10},
  status: {fontSize: 16, color: '#555', marginBottom: 10},
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
    marginTop: 20,
  },
  calibrateButton: {backgroundColor: '#16a34a'},
  buttonText: {color: '#ffffff', fontSize: 16, fontWeight: '600'},
});

export default App;