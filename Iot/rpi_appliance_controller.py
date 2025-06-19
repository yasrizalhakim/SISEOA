import threading
import time
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import credentials, firestore, db
import RPi.GPIO as GPIO
from collections import Counter
import schedule

# --- Firebase Initialization ---
cred = credentials.Certificate('serviceAccountKey.json')
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://siseoa1-default-rtdb.asia-southeast1.firebasedatabase.app/'
})
firestore_db = firestore.client()

# --- Device Configuration (GPIO mapping only) ---
DEVICE_GPIO_CONFIG = {
    "device1": {"gpio": 17, "wattage": 10},
    "device2": {"gpio": 27, "wattage": 15},
    "device3": {"gpio": 22, "wattage": 2000},
    "device4": {"gpio": 18, "wattage": 60},
    # "device5": {"gpio": 23, "wattage": 100},
    # Add more devices as needed
}

GPIO.setmode(GPIO.BCM)
for device_id, config in DEVICE_GPIO_CONFIG.items():
    GPIO.setup(config["gpio"], GPIO.OUT)
    GPIO.output(config["gpio"], GPIO.LOW)

# --- Globals ---
device_building_map = {}  # device_id -> building_id
device_location_map = {}  # device_id -> location_id
device_type_map = {}      # device_id -> device_type
building_automation_states = {}  # building_id -> automation_state
device_on_timestamps = {dev: None for dev in DEVICE_GPIO_CONFIG}
device_last_energy_update_time = {dev: None for dev in DEVICE_GPIO_CONFIG}
firebase_connected = True
automation_listeners = {}  # building_id -> listener
periodic_interval_minutes = 3

# --- Utility Functions ---
def get_today_str():
    return datetime.now().strftime("%Y-%m-%d")

def get_readable():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def calculate_energy(duration_min, watt):
    return round((watt / 1000) * (duration_min / 60), 6)

# --- Event Logging Function (SIMPLIFIED) ---
def log_device_event(device_id, status):
    """Log device ON/OFF events to Firestore - SIMPLIFIED for automation only"""
    try:
        if firebase_connected:
            now = datetime.now()
            
            # SIMPLIFIED: Only store what's needed for pattern detection
            event_data = {
                "status": status,        # "ON" or "OFF" - REQUIRED
                "timestamp": now,        # datetime - REQUIRED  
                "hour": now.hour         # hour (0-23) - REQUIRED for pattern detection
            }
            
            # Log to eventHistory subcollection
            event_ref = firestore_db.collection("DEVICE").document(device_id).collection("eventHistory").document()
            event_ref.set(event_data)
            
            print(f"[EVENT] {device_id}: {status} at {now.strftime('%H:%M')} (hour={now.hour})")
            
    except Exception as e:
        print(f"[EVENT] Error logging event for {device_id}: {e}")

# --- Firebase Connection Monitoring ---
def monitor_firebase_connection():
    """Monitor Firebase connection and disable automation if disconnected"""
    global firebase_connected
    
    def connection_check():
        global firebase_connected
        while True:
            try:
                # Simple test to check Firebase connectivity
                test_ref = db.reference('/test_connection')
                test_ref.set('alive')
                
                if not firebase_connected:
                    print("[FIREBASE] Connection restored - reloading automation states")
                    firebase_connected = True
                    reload_all_automation_states()
                    
            except Exception as e:
                if firebase_connected:
                    print(f"[FIREBASE] Connection error: {e} - disabling automation")
                    firebase_connected = False
                    disable_all_automation()
                    
            time.sleep(10)  # Check every 10 seconds
    
    threading.Thread(target=connection_check, daemon=True).start()

def disable_all_automation():
    """Disable all automation and unlock all devices when Firebase connection is lost"""
    global building_automation_states
    
    print("[EMERGENCY] Disabling all automation due to Firebase connection loss")
    
    # Clear all automation states
    building_automation_states = {}
    
    # Unlock all devices in RTDB (if connection allows)
    try:
        for device_id in DEVICE_GPIO_CONFIG.keys():
            if device_id in device_building_map:
                db.reference(f'Devices/{device_id}/locked').set(False)
    except:
        print("[EMERGENCY] Cannot update RTDB - devices remain in current state")

# --- Dynamic Device Discovery ---
def load_device_mappings():
    """Load device-to-building mappings from Firestore"""
    global device_building_map, device_location_map, device_type_map
    
    try:
        print("[DISCOVERY] Loading device mappings from Firestore...")
        
        # Get all devices from Firestore
        devices_ref = firestore_db.collection('DEVICE')
        devices = devices_ref.stream()
        
        device_count = 0
        for device_doc in devices:
            device_id = device_doc.id
            device_data = device_doc.to_dict()
            
            # Only process devices that have GPIO configuration
            if device_id in DEVICE_GPIO_CONFIG:
                location_id = device_data.get('Location')
                device_type = device_data.get('DeviceType', 'Unknown')
                
                if location_id:
                    # Get building from location
                    location_doc = firestore_db.collection('LOCATION').document(location_id).get()
                    if location_doc.exists:
                        location_data = location_doc.to_dict()
                        building_id = location_data.get('Building')
                        if building_id:
                            device_building_map[device_id] = building_id
                            device_location_map[device_id] = location_id
                            device_type_map[device_id] = device_type
                            device_count += 1
                            
                            print(f"[DISCOVERY] {device_id} -> Building: {building_id}, Location: {location_id}, Type: {device_type}")
                        else:
                            print(f"[DISCOVERY] No building found for location {location_id}")
                    else:
                        print(f"[DISCOVERY] Location {location_id} not found for device {device_id}")
                else:
                    print(f"[DISCOVERY] No location specified for device {device_id}")
            else:
                print(f"[DISCOVERY] Device {device_id} not in GPIO config - skipping")
        
        print(f"[DISCOVERY] Loaded {device_count} device mappings")
        
        # Initialize building automation states
        buildings = set(device_building_map.values())
        for building_id in buildings:
            if building_id not in building_automation_states:
                building_automation_states[building_id] = {
                    "mode": "none",
                    "locked_devices": set(),
                    "devices": [dev for dev, bld in device_building_map.items() if bld == building_id]
                }
                print(f"[DISCOVERY] Building {building_id} has devices: {building_automation_states[building_id]['devices']}")
        
        return True
        
    except Exception as e:
        print(f"[DISCOVERY] Error loading device mappings: {e}")
        import traceback
        traceback.print_exc()
        return False

# --- Device Control Functions ---
def switch_device(device_id, state, force=False):
    """Control device with automation override protection"""
    if not firebase_connected and not force:
        print(f"[OFFLINE] Firebase disconnected - ignoring command for {device_id}")
        return False
        
    if device_id not in device_building_map:
        print(f"[ERROR] Device {device_id} not found in building map")
        return False
    
    building_id = device_building_map[device_id]
    automation_state = building_automation_states.get(building_id, {})
    
    # Check if device is locked by automation
    locked_devices = automation_state.get("locked_devices", set())
    if not force and device_id in locked_devices and state == "ON":
        print(f"[AUTOMATION] Device {device_id} is locked by {automation_state.get('mode', 'unknown')} - ignoring ON command")
        return False
    
    if device_id not in DEVICE_GPIO_CONFIG:
        print(f"[ERROR] No GPIO configuration for device {device_id}")
        return False
    
    gpio_pin = DEVICE_GPIO_CONFIG[device_id]["gpio"]
    
    if state == "ON":
        GPIO.output(gpio_pin, GPIO.HIGH)
        device_on_timestamps[device_id] = datetime.now()
        device_last_energy_update_time[device_id] = datetime.now()
        
        # Log the event
        log_device_event(device_id, "ON")
        
        # Update RTDB immediately to reflect actual state
        try:
            db.reference(f'Devices/{device_id}/status').set("ON")
        except:
            print(f"[RTDB] Failed to update status for {device_id}")
            
        print(f"[GPIO] {device_id} turned ON (Building: {building_id})")
        threading.Thread(target=periodic_update, args=(device_id,), daemon=True).start()
        
    elif state == "OFF":
        GPIO.output(gpio_pin, GPIO.LOW)
        on_time = device_on_timestamps[device_id]
        last_time = device_last_energy_update_time[device_id]
        device_on_timestamps[device_id] = None
        device_last_energy_update_time[device_id] = None
        
        # Log the event
        log_device_event(device_id, "OFF")
        
        # Update RTDB immediately to reflect actual state
        try:
            db.reference(f'Devices/{device_id}/status').set("OFF")
        except:
            print(f"[RTDB] Failed to update status for {device_id}")
            
        print(f"[GPIO] {device_id} turned OFF (Building: {building_id})")

        # Calculate final energy usage
        if on_time and last_time:
            duration = (datetime.now() - last_time).total_seconds() / 60
            energy = calculate_energy(duration, DEVICE_GPIO_CONFIG[device_id]["wattage"])
            update_daily_energy(device_id, energy)
            print(f"[FINAL] {device_id}: +{energy:.6f} kWh for last {duration:.2f} min")
    
    return True

# --- Pattern Detection Functions (SIMPLIFIED) ---
# Fixed analyze_device_patterns function that correctly extracts days
def analyze_device_patterns(device_id):
    """Analyze device usage patterns - FIXED to extract actual days from data"""
    try:
        end_time = datetime.now()
        start_time = end_time - timedelta(days=7)
        
        print(f"[PATTERN] Analyzing {device_id} (last 7 days)")
        
        # Get event history from Firestore
        events_ref = firestore_db.collection("DEVICE").document(device_id).collection("eventHistory")
        events_query = events_ref.where("timestamp", ">=", start_time).where("timestamp", "<=", end_time)
        events = list(events_query.stream())
        
        print(f"[PATTERN] Found {len(events)} events for {device_id}")
        
        on_hours = []
        off_hours = []
        active_days = set()  # Track actual days from data
        
        for event_doc in events:
            event_data = event_doc.to_dict()
            status = event_data.get("status")
            hour = event_data.get("hour")  # Direct hour field
            timestamp = event_data.get("timestamp")
            
            # Fallback to timestamp if hour field missing
            if hour is None and timestamp:
                # Handle different timestamp types
                if hasattr(timestamp, 'hour'):
                    hour = timestamp.hour
                elif hasattr(timestamp, 'to_pydatetime'):
                    hour = timestamp.to_pydatetime().hour
                else:
                    continue
            
            # FIXED: Extract actual day from timestamp
            if timestamp:
                if hasattr(timestamp, 'strftime'):
                    day_name = timestamp.strftime("%A")
                elif hasattr(timestamp, 'to_pydatetime'):
                    day_name = timestamp.to_pydatetime().strftime("%A")
                else:
                    continue
                
                active_days.add(day_name)  # Add actual day to set
                print(f"[PATTERN] {status} at hour {hour} on {day_name}")
            
            if status == "ON":
                on_hours.append(hour)
            elif status == "OFF":
                off_hours.append(hour)
        
        print(f"[PATTERN] ON hours: {on_hours}")
        print(f"[PATTERN] OFF hours: {off_hours}")
        print(f"[PATTERN] Active days detected: {sorted(active_days)}")  # Show actual days
        
        # Need at least 2 ON and 2 OFF events
        if len(on_hours) < 2 or len(off_hours) < 2:
            print(f"[PATTERN] Not enough data (need 2+ ON and 2+ OFF events)")
            return None
        
        # Find most common hours
        most_common_on = Counter(on_hours).most_common(1)[0][0]
        most_common_off = Counter(off_hours).most_common(1)[0][0]
        
        print(f"[PATTERN] Most common: ON={most_common_on}, OFF={most_common_off}")
        
        # FIXED: Use actual days from data instead of hardcoded weekdays
        pattern = {
            "start": f"{most_common_on:02d}:00",
            "end": f"{most_common_off:02d}:00",
            "days": sorted(list(active_days)),  # Use actual days from timestamps
            "enabled": True,
            "source": "historical",
            "createdAt": datetime.now().isoformat(),
            "lastModified": datetime.now().isoformat(),
            "basedOnEvents": len(on_hours) + len(off_hours)
        }
        
        print(f"[PATTERN] Generated: {pattern}")
        return pattern
        
    except Exception as e:
        print(f"[PATTERN] Error analyzing {device_id}: {e}")
        import traceback
        traceback.print_exc()
        return None

def generate_automation_rules():
    """Generate automation rules for all devices based on historical patterns"""
    print("[PATTERN] Starting pattern detection for all devices...")
    
    for device_id in DEVICE_GPIO_CONFIG.keys():
        if device_id in device_building_map:
            pattern = analyze_device_patterns(device_id)
            if pattern:
                try:
                    # Save rule to AUTOMATIONRULE collection
                    rule_ref = firestore_db.collection("AUTOMATIONRULE").document(device_id)
                    rule_ref.set(pattern)
                    print(f"[PATTERN] ✅ Rule created for {device_id}: {pattern['start']}-{pattern['end']}")
                except Exception as e:
                    print(f"[PATTERN] ❌ Error saving rule for {device_id}: {e}")
            else:
                print(f"[PATTERN] ⚠️ No pattern found for {device_id}")

# --- Rule Executor Functions (FIXED) ---
def execute_automation_rules():
    """Execute device-level automation rules"""
    if not firebase_connected:
        return
    
    current_time = datetime.now()
    current_hour = current_time.strftime("%H:00")
    current_day = current_time.strftime("%A")
    
    print(f"[RULE_EXEC] Checking rules at {current_hour} on {current_day}")
    
    for device_id in DEVICE_GPIO_CONFIG.keys():
        if device_id not in device_building_map:
            continue
            
        building_id = device_building_map[device_id]
        automation_state = building_automation_states.get(building_id, {})
        
        # Only execute device rules if building automation is not active
        if automation_state.get("mode", "none") != "none":
            continue
            
        # Check if device is locked by building automation
        locked_devices = automation_state.get("locked_devices", set())
        if device_id in locked_devices:
            continue
        
        try:
            # Get automation rule for this device from AUTOMATIONRULE collection
            rule_ref = firestore_db.collection("AUTOMATIONRULE").document(device_id)
            rule_doc = rule_ref.get()
            
            # FIXED: Use .exists (property) not .exists() (method)
            if not rule_doc.exists:
                continue
                
            rule_data = rule_doc.to_dict()
            
            if not rule_data.get("enabled", False):
                continue
                
            start_time = rule_data.get("start", "")
            end_time = rule_data.get("end", "")
            days = rule_data.get("days", [])
            
            if current_day not in days:
                continue
            
            # Check if current time matches rule times
            if current_hour == start_time:
                print(f"[RULE_EXEC] ⚡ Turning ON {device_id} (rule: {start_time})")
                switch_device(device_id, "ON")
            elif current_hour == end_time:
                print(f"[RULE_EXEC] ⏹️ Turning OFF {device_id} (rule: {end_time})")
                switch_device(device_id, "OFF")
                
        except Exception as e:
            print(f"[RULE_EXEC] ❌ Error executing rule for {device_id}: {e}")

# --- Automation Logic ---
def apply_building_automation(building_id, automation_data):
    """Apply automation to all devices in a building"""
    if not firebase_connected:
        print(f"[OFFLINE] Skipping automation for building {building_id} - Firebase disconnected")
        return
        
    print(f"[AUTOMATION] Applying automation to building {building_id}: {automation_data}")
    
    if building_id not in building_automation_states:
        print(f"[ERROR] Building {building_id} not found in automation states")
        return
    
    automation_state = building_automation_states[building_id]
    building_devices = automation_state["devices"]
    
    # Extract automation mode from Firestore data
    current_mode = automation_data.get("currentMode", "none")
    modes = automation_data.get("modes", {})
    
    # Update local automation state
    automation_state["mode"] = current_mode
    
    if modes.get("turn-off-all", False):
        print(f"[AUTOMATION] Applying TURN-OFF-ALL to building {building_id}")
        # Turn off all devices and lock them
        for device_id in building_devices:
            switch_device(device_id, "OFF", force=True)
            automation_state["locked_devices"].add(device_id)
            # Set locked status in RTDB immediately
            try:
                db.reference(f'Devices/{device_id}/locked').set(True)
            except:
                print(f"[RTDB] Failed to lock device {device_id}")
        
    elif modes.get("eco-mode", False):
        print(f"[AUTOMATION] Applying ECO-MODE to building {building_id}")
        # Turn off high-energy devices (AC units)
        automation_state["locked_devices"].clear()
        for device_id in building_devices:
            try:
                db.reference(f'Devices/{device_id}/locked').set(False)
            except:
                pass
                
            device_type = device_type_map.get(device_id, 'Unknown')
            if device_type == "AC":
                switch_device(device_id, "OFF", force=True)
                print(f"[ECO-MODE] Turned off AC device: {device_id}")
        
    elif modes.get("night-mode", False):
        print(f"[AUTOMATION] Applying NIGHT-MODE to building {building_id}")
        # Turn off non-essential devices (Fan, AC)
        automation_state["locked_devices"].clear()
        for device_id in building_devices:
            try:
                db.reference(f'Devices/{device_id}/locked').set(False)
            except:
                pass
                
            device_type = device_type_map.get(device_id, 'Unknown')
            if device_type in ["Fan", "AC"]:
                switch_device(device_id, "OFF", force=True)
                print(f"[NIGHT-MODE] Turned off device: {device_id} (Type: {device_type})")
    
    else:
        print(f"[AUTOMATION] Clearing automation for building {building_id}")
        # Clear automation - unlock all devices
        automation_state["locked_devices"].clear()
        for device_id in building_devices:
            try:
                db.reference(f'Devices/{device_id}/locked').set(False)
            except:
                pass
    
    print(f"[AUTOMATION] Building {building_id} automation applied. Mode: {current_mode}")

# --- Firestore Listeners ---
def create_automation_listener(building_id):
    """Create listener for building automation changes"""
    def on_automation_change(doc_snapshot, changes, read_time):
        if not firebase_connected:
            return
            
        for doc in doc_snapshot:
            if doc.exists:
                building_data = doc.to_dict()
                automation_data = building_data.get("Automation", {})
                if automation_data:
                    print(f"[FIRESTORE] Automation change detected for building {building_id}")
                    apply_building_automation(building_id, automation_data)
                else:
                    print(f"[FIRESTORE] No automation data for building {building_id}")
            else:
                print(f"[FIRESTORE] Building document {building_id} does not exist")
    
    return on_automation_change

# --- RTDB Device Listeners (for manual control) ---
def create_device_listener(device_id):
    """Create listener for individual device control (with automation override)"""
    def listener(event):
        if not firebase_connected:
            return
            
        data = str(event.data).upper()
        if data in ["ON", "OFF"]:
            success = switch_device(device_id, data)
            if not success and data == "ON":
                # Revert RTDB state if automation blocked the action
                try:
                    db.reference(f'Devices/{device_id}/status').set("OFF")
                    print(f"[RTDB] Reverted {device_id} to OFF due to automation lock")
                except:
                    print(f"[RTDB] Failed to revert status for {device_id}")
        else:
            print(f"[RTDB] Ignored invalid state '{data}' for {device_id}")
    return listener

# --- Load Initial States ---
def reload_all_automation_states():
    """Reload automation states for all buildings"""
    if not firebase_connected:
        return
        
    try:
        for building_id in building_automation_states.keys():
            building_doc = firestore_db.collection("BUILDING").document(building_id).get()
            if building_doc.exists:
                building_data = building_doc.to_dict()
                automation_data = building_data.get("Automation", {})
                if automation_data.get("status") == "active":
                    print(f"[RELOAD] Loading automation for building {building_id}")
                    apply_building_automation(building_id, automation_data)
                else:
                    print(f"[RELOAD] No active automation for building {building_id}")
            else:
                print(f"[RELOAD] Building {building_id} document not found")
    except Exception as e:
        print(f"[RELOAD] Error reloading automation states: {e}")

# --- Scheduler Functions ---
def run_scheduler():
    """Run the scheduler in a separate thread"""
    # Schedule pattern detection to run weekly (every Sunday at 2 AM)
    schedule.every().sunday.at("02:00").do(generate_automation_rules)
    
    # Schedule rule execution every minute
    schedule.every().minute.do(execute_automation_rules)
    
    while True:
        schedule.run_pending()
        time.sleep(1)

# --- Testing Functions ---
def test_pattern_detection_for_device(device_id):
    """Test pattern detection for a specific device"""
    print(f"[TEST] Testing pattern detection for {device_id}")
    
    try:
        pattern = analyze_device_patterns(device_id)
        if pattern:
            print(f"[TEST] ✅ Pattern generated: {pattern}")
            
            # Save the rule
            rule_ref = firestore_db.collection("AUTOMATIONRULE").document(device_id)
            rule_ref.set(pattern)
            print(f"[TEST] ✅ Rule saved for {device_id}")
        else:
            print(f"[TEST] ❌ No pattern could be generated for {device_id}")
            
    except Exception as e:
        print(f"[TEST] ❌ Error testing pattern detection for {device_id}: {e}")

def manual_pattern_detection():
    """Manually trigger pattern detection for all devices"""
    print("[MANUAL] Starting manual pattern detection...")
    generate_automation_rules()
    print("[MANUAL] Manual pattern detection completed")

# --- Energy Tracking ---
def record_device_status(device_id, status):
    try:
        now = get_readable()
        firestore_db.collection("ENERGYUSAGE").document(device_id).set({
            "DeviceID": device_id,
            "CreatedAt": now,
            "Wattage": DEVICE_GPIO_CONFIG[device_id]["wattage"]
        }, merge=True)
    except Exception as e:
        print(f"[ENERGY] Error recording status for {device_id}: {e}")

def update_daily_energy(device_id, energy):
    try:
        today = get_today_str()
        now = get_readable()
        wattage = DEVICE_GPIO_CONFIG[device_id]["wattage"]

        doc_ref = firestore_db.collection("ENERGYUSAGE").document(device_id).collection("DailyUsage").document(today)
        existing = doc_ref.get()
        if existing.exists:
            usage = existing.to_dict().get("Usage", 0)
        else:
            usage = 0

        doc_ref.set({
            "Usage": usage + energy,
            "LastUpdated": now,
            "Date": today,
            "DeviceWattage": wattage
        })
    except Exception as e:
        print(f"[ENERGY] Error updating daily energy for {device_id}: {e}")

def periodic_update(device_id):
    while True:
        if device_on_timestamps[device_id] is not None and firebase_connected:
            now = datetime.now()
            last_time = device_last_energy_update_time[device_id]
            if last_time:
                elapsed_min = (now - last_time).total_seconds() / 60

                if elapsed_min >= periodic_interval_minutes:
                    watt = DEVICE_GPIO_CONFIG[device_id]["wattage"]
                    energy = calculate_energy(elapsed_min, watt)
                    update_daily_energy(device_id, energy)
                    device_last_energy_update_time[device_id] = now
        time.sleep(10)

# --- Main ---
if __name__ == "__main__":
    print("SISEOA Multi-Building Automation Controller Started (Raspberry Pi)")
    print(f"GPIO-configured devices: {list(DEVICE_GPIO_CONFIG.keys())}")
    
    try:
        # Start Firebase connection monitoring
        monitor_firebase_connection()
        
        # Load device-to-building mappings from Firestore
        if not load_device_mappings():
            print("[ERROR] Failed to load device mappings. Exiting...")
            exit(1)
        
        # Start scheduler thread for pattern detection and rule execution
        scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
        scheduler_thread.start()
        print("[SCHEDULER] Pattern detection and rule execution scheduler started")
        
        # Set up Firestore listeners for building automation
        for building_id in building_automation_states.keys():
            try:
                building_ref = firestore_db.collection("BUILDING").document(building_id)
                automation_listeners[building_id] = building_ref.on_snapshot(create_automation_listener(building_id))
                print(f"[FIRESTORE] Listening for automation changes in building: {building_id}")
            except Exception as e:
                print(f"[FIRESTORE] Error setting up listener for building {building_id}: {e}")
        
        # Set up RTDB listeners for individual device control
        for device_id in device_building_map.keys():
            try:
                device_ref = db.reference(f'Devices/{device_id}/status')
                device_ref.listen(create_device_listener(device_id))
                print(f"[RTDB] Listening for device control: {device_id}")
            except Exception as e:
                print(f"[RTDB] Error setting up listener for device {device_id}: {e}")
        
        # Load initial automation states
        print("[SYSTEM] Loading initial automation states...")
        reload_all_automation_states()
        
        print(f"[SYSTEM] Managing {len(building_automation_states)} buildings with {len(device_building_map)} devices")
        print("[SYSTEM] All listeners active. Multi-building automation controller running...")
        
        # Print summary
        for building_id, state in building_automation_states.items():
            print(f"[SUMMARY] Building {building_id}: {len(state['devices'])} devices - {state['devices']}")
        
        # TESTING: Add delayed test for pattern detection
        def delayed_test():
            time.sleep(30)  # Wait 30 seconds for initialization
            print("[TEST] Starting delayed pattern detection test...")
            for device_id in DEVICE_GPIO_CONFIG.keys():
                if device_id in device_building_map:
                    test_pattern_detection_for_device(device_id)
            
            # Also test manual trigger
            print("[TEST] Testing manual pattern detection trigger...")
            manual_pattern_detection()
        
        test_thread = threading.Thread(target=delayed_test, daemon=True)
        test_thread.start()
        print("[TEST] Test thread started - will run pattern detection test in 30 seconds")
        
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("Stopping automation controller...")
    except Exception as e:
        print(f"[FATAL] Critical error: {e}")
    finally:
        # Cleanup
        try:
            # Stop all listeners
            for listener in automation_listeners.values():
                listener.unsubscribe()
        except:
            pass
        GPIO.cleanup()
        print("GPIO cleanup completed")