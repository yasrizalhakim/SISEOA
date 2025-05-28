# mqtt_firebase_bridge.py

import paho.mqtt.client as mqtt
import firebase_admin
from firebase_admin import credentials, db, firestore
import time
from datetime import datetime

# Initialize Firebase Admin SDK
cred = credentials.Certificate('serviceAccountKey.json')  # Path to your Firebase service account key
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://siseoa1-default-rtdb.asia-southeast1.firebasedatabase.app/'
})

firestore_db = firestore.client()

# MQTT Setup
MQTT_BROKER = "localhost"  # or Pi IP if remote
MQTT_PORT = 1883
MQTT_STATUS_TOPIC = "device1/status"
MQTT_CONTROL_TOPIC = "device1/control"

# Firebase RTDB reference for device state
rtdb_ref = db.reference('Devices/device1/status')

# Globals to prevent loopbacks
last_rtdb_state = None
last_mqtt_state = None

# MQTT callbacks
def on_connect(client, userdata, flags, rc):
    print("Connected to MQTT Broker with code "+str(rc))
    client.subscribe(MQTT_STATUS_TOPIC)

def on_message(client, userdata, msg):
    global last_mqtt_state
    payload = msg.payload.decode()
    print(f"MQTT message received on {msg.topic}: {payload}")
    last_mqtt_state = payload

    # Update Firebase RTDB with new state from ESP32
    rtdb_ref.set(payload)

    # Save wattage usage in Firestore (simulate wattage, replace with real data if available)
    wattage = 50 if payload == "ON" else 0
    timestamp = datetime.utcnow().isoformat()

    doc_ref = firestore_db.collection("ENERGYUSAGE").document("device1").collection("USAGE").document(timestamp)
    doc_ref.set({"wattage": wattage, "timestamp": timestamp})

# Watch Firebase RTDB for control commands (changes made remotely)
def rtdb_listener(event):
    global last_rtdb_state, last_mqtt_state
    new_state = event.data
    if new_state != last_mqtt_state:
        print(f"RTDB change detected: {new_state} -> publishing to MQTT control topic")
        mqtt_client.publish(MQTT_CONTROL_TOPIC, new_state)
        last_rtdb_state = new_state

# Setup MQTT client
mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)

# Start listening to RTDB changes
rtdb_ref.listen(rtdb_listener)

# Start MQTT loop
mqtt_client.loop_start()

try:
    while True:
        time.sleep(1)

except KeyboardInterrupt:
    print("Exiting...")
    mqtt_client.loop_stop()
