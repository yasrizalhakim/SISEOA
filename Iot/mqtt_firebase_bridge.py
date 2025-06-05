# mqtt_firebase_bridge.py

import paho.mqtt.client as mqtt
import firebase_admin
from firebase_admin import credentials, db, firestore
import time
from datetime import datetime
import threading

# Initialize Firebase Admin SDK
cred = credentials.Certificate('serviceAccountKey.json')  # Path to your Firebase service account key
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://siseoa1-default-rtdb.asia-southeast1.firebasedatabase.app/'
})

firestore_db = firestore.client()

# MQTT Setup
MQTT_BROKER = "localhost"  # or Pi IP if remote
MQTT_PORT = 1883

# Device configurations
DEVICES = ["device1", "device2"]
DEVICE_WATTAGE = {
    "device1": 10,  # 10W LED light
    "device2": 15,  # 15W LED light
    # Add more devices here as needed:
    # "device3": 25,  # 25W fan
    # "device4": 100, # 100W heater
}

MQTT_STATUS_TOPICS = {device: f"{device}/status" for device in DEVICES}
MQTT_CONTROL_TOPICS = {device: f"{device}/control" for device in DEVICES}

# Firebase RTDB references for device states
rtdb_refs = {device: db.reference(f'Devices/{device}/status') for device in DEVICES}

# Globals to prevent loopbacks and track device states
last_rtdb_states = {device: None for device in DEVICES}
last_mqtt_states = {device: None for device in DEVICES}
device_on_timestamps = {device: None for device in DEVICES}  # Track when devices turn ON

def get_today_date_str():
    """Get today's date as a string in YYYY-MM-DD format"""
    return datetime.now().strftime("%Y-%m-%d")

def get_current_timestamp_str():
    """Get current timestamp as a string in YYYY-MM-DD_HH:MM:SS format"""
    return datetime.now().strftime("%Y-%m-%d_%H:%M:%S")

def get_current_timestamp_firestore():
    """Get current timestamp in firestore-friendly format"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def record_device_status(device_id, status):
    """Record device status change in Firestore"""
    try:
        timestamp_id = get_current_timestamp_str()
        timestamp_readable = get_current_timestamp_firestore()
        
        # Ensure the device document exists
        device_doc_ref = firestore_db.collection("ENERGYUSAGE").document(device_id)
        if not device_doc_ref.get().exists:
            device_doc_ref.set({
                "DeviceID": device_id,
                "CreatedAt": timestamp_readable,
                "Wattage": DEVICE_WATTAGE.get(device_id, 10)  # Default to 10W if not specified
            })
            print(f"Created device document for {device_id}")
        
        # Ensure the DeviceStatusUsage collection exists and record status
        status_doc_ref = device_doc_ref.collection("DeviceStatusUsage").document(timestamp_id)
        status_doc_ref.set({
            "Status": status,
            "Timestamp": timestamp_readable
        })
        print(f"Recorded status change for {device_id}: {status} at {timestamp_readable}")
        
    except Exception as e:
        print(f"Error recording device status for {device_id}: {e}")

def calculate_energy_usage(duration_minutes, device_id):
    """Calculate energy usage in kWh based on duration and device-specific wattage"""
    # Get device-specific wattage
    wattage = DEVICE_WATTAGE.get(device_id, 10)  # Default to 10W if device not found
    
    # Convert watts to kilowatts and minutes to hours
    kw = wattage / 1000
    hours = duration_minutes / 60
    kwh = kw * hours
    return kwh

def update_daily_energy_usage(device_id, energy_kwh):
    """Update the daily energy usage for a device"""
    try:
        today_str = get_today_date_str()
        
        # Ensure the device document exists first
        device_doc_ref = firestore_db.collection("ENERGYUSAGE").document(device_id)
        if not device_doc_ref.get().exists:
            timestamp_readable = get_current_timestamp_firestore()
            device_doc_ref.set({
                "DeviceID": device_id,
                "CreatedAt": timestamp_readable,
                "Wattage": DEVICE_WATTAGE.get(device_id, 10)
            })
            print(f"Created device document for {device_id}")
        
        # Ensure the DailyUsage collection exists and get/create daily document
        daily_doc_ref = device_doc_ref.collection("DailyUsage").document(today_str)
        daily_doc = daily_doc_ref.get()
        
        if daily_doc.exists:
            # Document exists, increment the usage
            current_data = daily_doc.to_dict()
            current_usage = current_data.get('Usage', 0)
            new_usage = current_usage + energy_kwh
        else:
            # Document doesn't exist, create with initial usage
            new_usage = energy_kwh
            print(f"Created daily usage document for {device_id} on {today_str}")
        
        # Update the daily usage document
        daily_doc_ref.set({
            'Usage': round(new_usage, 6),  # Round to 6 decimal places for precision
            'LastUpdated': get_current_timestamp_firestore(),
            'Date': today_str,
            'DeviceWattage': DEVICE_WATTAGE.get(device_id, 10)  # Store device wattage for reference
        })
        
        # Add a separate document for DeviceEnergyStatus to track individual energy events
        timestamp_id = get_current_timestamp_str()
        energy_status_doc_ref = device_doc_ref.collection("DeviceEnergyStatus").document(timestamp_id)
        energy_status_doc_ref.set({
            'EnergyUsed': round(energy_kwh, 6),
            'Timestamp': get_current_timestamp_firestore(),
            'Date': today_str,
            'DeviceWattage': DEVICE_WATTAGE.get(device_id, 10)
        })
        
        print(f"Updated daily energy usage for {device_id}: +{energy_kwh:.6f} kWh (Total: {new_usage:.6f} kWh)")
        print(f"Added energy status record for {device_id}: {energy_kwh:.6f} kWh at {timestamp_id}")
        
    except Exception as e:
        print(f"Error updating daily energy usage for {device_id}: {e}")

def handle_device_on(device_id):
    """Handle when a device turns ON"""
    global device_on_timestamps
    
    # Record the ON status
    record_device_status(device_id, "ON")
    
    # Store the timestamp when device turned ON
    device_on_timestamps[device_id] = datetime.now()
    print(f"{device_id} turned ON at {device_on_timestamps[device_id]}")

def handle_device_off(device_id):
    """Handle when a device turns OFF"""
    global device_on_timestamps
    
    # Record the OFF status
    record_device_status(device_id, "OFF")
    
    # Calculate energy usage if device was previously ON
    if device_on_timestamps[device_id] is not None:
        off_time = datetime.now()
        on_time = device_on_timestamps[device_id]
        duration = off_time - on_time
        duration_minutes = duration.total_seconds() / 60
        
        # Calculate energy usage
        energy_used = calculate_energy_usage(duration_minutes, device_id)
        
        # Update daily usage
        update_daily_energy_usage(device_id, energy_used)
        
        print(f"{device_id} was ON for {duration_minutes:.2f} minutes, used {energy_used:.6f} kWh")
        
        # Reset the ON timestamp
        device_on_timestamps[device_id] = None
    else:
        print(f"{device_id} turned OFF but no ON timestamp found")

# MQTT callbacks
def on_connect(client, userdata, flags, rc):
    print("Connected to MQTT Broker with code "+str(rc))
    # Subscribe to all device status topics
    for device in DEVICES:
        client.subscribe(MQTT_STATUS_TOPICS[device])
        print(f"Subscribed to {MQTT_STATUS_TOPICS[device]}")

def on_message(client, userdata, msg):
    global last_mqtt_states
    
    payload = msg.payload.decode().strip().upper()
    topic = msg.topic
    
    # Determine which device this message is for
    device_id = None
    for device in DEVICES:
        if topic == MQTT_STATUS_TOPICS[device]:
            device_id = device
            break
    
    if device_id is None:
        print(f"Unknown topic: {topic}")
        return
    
    print(f"MQTT message received on {topic}: {payload}")
    
    # Validate payload
    if payload not in ["ON", "OFF"]:
        print(f"Invalid payload received: {payload}")
        return
    
    # Check if this is a duplicate message (ignore if same as last state)
    if last_mqtt_states[device_id] == payload:
        print(f"Ignoring duplicate message for {device_id}: {payload}")
        return
    
    # Update our tracking state
    last_mqtt_states[device_id] = payload
    
    # Update Firebase RTDB with new state from ESP32
    # Use a flag to prevent the RTDB listener from triggering
    try:
        print(f"Updating RTDB for {device_id} to {payload}")
        rtdb_refs[device_id].set(payload)
        print(f"Successfully updated RTDB for {device_id}")
    except Exception as e:
        print(f"Error updating RTDB for {device_id}: {e}")

    # Handle energy usage tracking
    if payload == "ON":
        handle_device_on(device_id)
    elif payload == "OFF":
        handle_device_off(device_id)

# Watch Firebase RTDB for control commands (changes made remotely)
def create_rtdb_listener(device_id):
    def rtdb_listener(event):
        global last_rtdb_states, last_mqtt_states
        new_state = event.data
        
        # Ignore None/null values
        if new_state is None:
            return
            
        # Convert to string to ensure consistent comparison
        new_state_str = str(new_state).upper()
        
        # Only process if this is a valid state and different from current MQTT state
        if new_state_str in ["ON", "OFF"] and new_state_str != last_mqtt_states[device_id]:
            print(f"RTDB change detected for {device_id}: {last_mqtt_states[device_id]} -> {new_state_str}")
            print(f"Publishing to MQTT control topic: {MQTT_CONTROL_TOPICS[device_id]}")
            
            # Update our tracking variable BEFORE publishing to prevent loops
            last_rtdb_states[device_id] = new_state_str
            
            # Publish to MQTT control topic for ESP32
            result = mqtt_client.publish(MQTT_CONTROL_TOPICS[device_id], new_state_str)
            
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                print(f"Successfully published {new_state_str} to {device_id}")
            else:
                print(f"Failed to publish to {device_id}, error code: {result.rc}")
        else:
            print(f"RTDB listener for {device_id}: Ignoring state {new_state_str} (current MQTT: {last_mqtt_states[device_id]})")
    
    return rtdb_listener

# Setup MQTT client (using the newer callback API)
mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

# Enable debug logging for MQTT
mqtt_client.enable_logger()

print("Connecting to MQTT broker...")
try:
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    print(f"Connected to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}")
except Exception as e:
    print(f"Failed to connect to MQTT broker: {e}")
    exit(1)

# Start listening to RTDB changes for all devices
print("Setting up RTDB listeners...")
for device in DEVICES:
    try:
        rtdb_refs[device].listen(create_rtdb_listener(device))
        print(f"RTDB listener set up for {device}")
    except Exception as e:
        print(f"Error setting up RTDB listener for {device}: {e}")

# Start MQTT loop
mqtt_client.loop_start()
print("MQTT loop started")

print("MQTT Firebase Bridge started with energy usage tracking...")
print("Device configurations:")
for device_id, wattage in DEVICE_WATTAGE.items():
    print(f"  - {device_id}: {wattage}W")
print("Firestore structure:")
print("  - Device info: ENERGYUSAGE/{deviceid}")
print("  - Energy usage: ENERGYUSAGE/{deviceid}/DailyUsage/{yyyy-mm-dd}")
print("  - Energy events: ENERGYUSAGE/{deviceid}/DeviceEnergyStatus/{timestamp}")
print("  - Status tracking: ENERGYUSAGE/{deviceid}/DeviceStatusUsage/{timestamp}")

try:
    while True:
        time.sleep(1)

except KeyboardInterrupt:
    print("Exiting...")
    mqtt_client.loop_stop()