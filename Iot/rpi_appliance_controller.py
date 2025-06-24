import threading
import time
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import credentials, firestore, db
import RPi.GPIO as GPIO
from collections import Counter, defaultdict
import schedule

# --- Configuration Constants ---
MINIMUM_STAGE_GAP_MINUTES = 15  # Easy to change later - minimum gap between stages
MAX_EVENT_HISTORY = 30  # Maximum events to keep per device
MAX_STAGES_PER_DAY = 3  # Maximum stages allowed per day

# --- Firebase Initialization ---
cred = credentials.Certificate('serviceAccountKey.json')
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://siseoa1-default-rtdb.asia-southeast1.firebasedatabase.app/'
})
firestore_db = firestore.client()

# --- Device Configuration (GPIO mapping only) ---
DEVICE_GPIO_CONFIG = {

    #building1
    "device1": {"gpio": 6, "wattage": 20},
    "device2": {"gpio": 5, "wattage": 60},

    #building2
    #gf
    "device3": {"gpio": 9, "wattage": 20},
    #f1
    "device4": {"gpio": 0, "wattage": 20},
    "device5": {"gpio": 11, "wattage": 60},
    "device6": {"gpio": 10, "wattage": 1200},
    
    #building3
    #gf
    "device7": {"gpio": 17, "wattage": 20},
    "device8": {"gpio": 22, "wattage": 1200},
    #f1
    "device9": {"gpio": 27, "wattage": 20},
    "device10": {"gpio": 4, "wattage": 1200},
    #f2
    "device11": {"gpio": 2, "wattage": 20},
    "device12": {"gpio": 3, "wattage": 1200},
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

def time_to_minutes(time_str):
    """Convert HH:MM to minutes since midnight"""
    hours, minutes = map(int, time_str.split(':'))
    return hours * 60 + minutes

def minutes_to_time(minutes):
    """Convert minutes since midnight to HH:MM"""
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours:02d}:{mins:02d}"

# --- Event Logging Function (WITH ROLLING LIMIT) ---
def log_device_event(device_id, status):
    """Log device ON/OFF events to Firestore with rolling 30-event limit"""
    try:
        if firebase_connected:
            now = datetime.now()
            
            # Event data for pattern detection
            event_data = {
                "status": status,        # "ON" or "OFF" - REQUIRED
                "timestamp": now,        # datetime - REQUIRED  
                "hour": now.hour         # hour (0-23) - REQUIRED for pattern detection
            }
            
            # Get current event count and enforce rolling limit
            events_ref = firestore_db.collection("DEVICE").document(device_id).collection("eventHistory")
            
            # Get all events ordered by timestamp (oldest first)
            existing_events = events_ref.order_by("timestamp").stream()
            event_docs = list(existing_events)
            
            # If we're at the limit, delete the oldest event
            if len(event_docs) >= MAX_EVENT_HISTORY:
                oldest_event = event_docs[0]
                oldest_event.reference.delete()
                print(f"[EVENT] Deleted oldest event for {device_id} (rolling limit: {MAX_EVENT_HISTORY})")
            
            # Log new event
            event_ref = events_ref.document()
            event_ref.set(event_data)
            
            print(f"[EVENT] {device_id}: {status} at {now.strftime('%H:%M')} (hour={now.hour}) - {len(event_docs)}/{MAX_EVENT_HISTORY} events")
            
    except Exception as e:
        print(f"[EVENT] Error logging event for {device_id}: {e}")

def clear_device_event_history(device_id):
    """Clear all event history for a device (for 'Learn New Pattern' feature)"""
    try:
        if firebase_connected:
            events_ref = firestore_db.collection("DEVICE").document(device_id).collection("eventHistory")
            
            # Get all events
            events = events_ref.stream()
            
            # Delete all events
            count = 0
            for event in events:
                event.reference.delete()
                count += 1
            
            print(f"[CLEAR] Cleared {count} events from {device_id} history")
            return count
        return 0
        
    except Exception as e:
        print(f"[CLEAR] Error clearing event history for {device_id}: {e}")
        return 0

# --- Pattern Detection Functions (ENHANCED FOR MULTI-STAGE) ---
def group_events_into_sessions(events, gap_minutes=MINIMUM_STAGE_GAP_MINUTES):
    """Group ON/OFF events into sessions based on time gaps"""
    if not events:
        return []
    
    sessions = []
    current_session = []
    
    for event in sorted(events, key=lambda x: x.get('timestamp')):
        if not current_session:
            current_session.append(event)
        else:
            last_event = current_session[-1]
            time_diff = (event['timestamp'] - last_event['timestamp']).total_seconds() / 60
            
            # If gap is too small, merge into current session
            if time_diff <= gap_minutes:
                current_session.append(event)
            else:
                # Gap is large enough - finish current session and start new one
                if len(current_session) >= 2:  # Need at least ON and OFF
                    sessions.append(current_session)
                current_session = [event]
    
    # Don't forget the last session
    if len(current_session) >= 2:
        sessions.append(current_session)
    
    return sessions

def analyze_device_patterns_multi_stage(device_id):
    """Analyze device usage patterns - ENHANCED for multiple stages per day"""
    try:
        end_time = datetime.now()
        start_time = end_time - timedelta(days=7)
        
        print(f"[PATTERN] Analyzing {device_id} for multi-stage patterns (last 7 days)")
        
        # Get event history from Firestore
        events_ref = firestore_db.collection("DEVICE").document(device_id).collection("eventHistory")
        events_query = events_ref.where("timestamp", ">=", start_time).where("timestamp", "<=", end_time)
        events = list(events_query.stream())
        
        print(f"[PATTERN] Found {len(events)} events for {device_id}")
        
        if len(events) < 4:  # Need at least 2 ON and 2 OFF events
            print(f"[PATTERN] Not enough data (need 4+ events for multi-stage)")
            return None
        
        # Convert to list of event dictionaries
        event_list = []
        active_days = set()
        
        for event_doc in events:
            event_data = event_doc.to_dict()
            status = event_data.get("status")
            hour = event_data.get("hour")
            timestamp = event_data.get("timestamp")
            
            # Handle timestamp conversion
            if hasattr(timestamp, 'to_pydatetime'):
                timestamp = timestamp.to_pydatetime()
            elif not isinstance(timestamp, datetime):
                continue
            
            day_name = timestamp.strftime("%A")
            active_days.add(day_name)
            
            event_list.append({
                'status': status,
                'hour': hour if hour is not None else timestamp.hour,
                'timestamp': timestamp,
                'day': day_name
            })
        
        print(f"[PATTERN] Active days detected: {sorted(active_days)}")
        
        # Group events by day and analyze patterns
        daily_patterns = defaultdict(list)
        for event in event_list:
            daily_patterns[event['day']].append(event)
        
        # Look for multi-stage patterns in each day
        day_schedules = {}
        
        for day, day_events in daily_patterns.items():
            if len(day_events) < 2:
                continue
                
            # Group events into sessions for this day
            sessions = group_events_into_sessions(day_events, MINIMUM_STAGE_GAP_MINUTES)
            stages = []
            
            for session in sessions:
                on_events = [e for e in session if e['status'] == 'ON']
                off_events = [e for e in session if e['status'] == 'OFF']
                
                if on_events and off_events:
                    # Find the first ON and last OFF in this session
                    session_start = min(on_events, key=lambda x: x['timestamp'])
                    session_end = max(off_events, key=lambda x: x['timestamp'])
                    
                    start_time = f"{session_start['hour']:02d}:00"
                    end_time = f"{session_end['hour']:02d}:00"
                    
                    # Avoid duplicate or invalid stages
                    if start_time != end_time:
                        stages.append({
                            'start': start_time,
                            'end': end_time
                        })
            
            if stages:
                day_schedules[day] = stages
        
        if not day_schedules:
            print(f"[PATTERN] No valid multi-stage patterns found")
            return None
        
        # Create multi-stage pattern
        # Find the most common pattern across days
        most_common_day = max(day_schedules.keys(), key=lambda d: len(daily_patterns[d]))
        best_stages = day_schedules[most_common_day]
        
        print(f"[PATTERN] Best pattern from {most_common_day}: {best_stages}")
        
        # Build the new rule structure with multiple stages
        pattern = {
            "schedules": [
                {
                    "day": day,
                    "stages": day_schedules.get(day, best_stages)  # Use day-specific or best pattern
                }
                for day in sorted(active_days)
            ],
            "enabled": False,  # NEW RULES START DISABLED
            "source": "historical",
            "createdAt": datetime.now().isoformat(),
            "lastModified": datetime.now().isoformat(),
            "basedOnEvents": len(event_list),
            "multiStage": True,
            "stageGapMinutes": MINIMUM_STAGE_GAP_MINUTES
        }
        
        print(f"[PATTERN] Generated multi-stage pattern: {pattern}")
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
            pattern = analyze_device_patterns_multi_stage(device_id)
            if pattern:
                try:
                    # Save rule to AUTOMATIONRULE collection
                    rule_ref = firestore_db.collection("AUTOMATIONRULE").document(device_id)
                    rule_ref.set(pattern)
                    print(f"[PATTERN] Multi-stage rule created for {device_id} (DISABLED by default)")
                except Exception as e:
                    print(f"[PATTERN] Error saving rule for {device_id}: {e}")
            else:
                print(f"[PATTERN] No pattern found for {device_id}")

# --- Rule Executor Functions (ENHANCED FOR MULTI-STAGE) ---
def execute_automation_rules():
    """Execute device-level automation rules with multi-stage support"""
    if not firebase_connected:
        return
    
    current_time = datetime.now()
    current_hour = current_time.strftime("%H:00")
    current_day = current_time.strftime("%A")
    
    print(f"[RULE_EXEC] Checking multi-stage rules at {current_hour} on {current_day}")
    
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
            
            if not rule_doc.exists:
                continue
                
            rule_data = rule_doc.to_dict()
            
            if not rule_data.get("enabled", False):
                continue
            
            # Check if this is a multi-stage rule
            if rule_data.get("multiStage", False) and "schedules" in rule_data:
                execute_multi_stage_rule(device_id, rule_data, current_hour, current_day)
            else:
                # Legacy single-stage rule
                execute_single_stage_rule(device_id, rule_data, current_hour, current_day)
                
        except Exception as e:
            print(f"[RULE_EXEC] Error executing rule for {device_id}: {e}")

def execute_multi_stage_rule(device_id, rule_data, current_hour, current_day):
    """Execute multi-stage automation rule"""
    schedules = rule_data.get("schedules", [])
    
    # Find schedule for current day
    day_schedule = None
    for schedule in schedules:
        if schedule.get("day") == current_day:
            day_schedule = schedule
            break
    
    if not day_schedule:
        return
    
    stages = day_schedule.get("stages", [])
    
    for stage in stages:
        start_time = stage.get("start", "")
        end_time = stage.get("end", "")
        
        if current_hour == start_time:
            print(f"[RULE_EXEC] Multi-stage ON: {device_id} (stage: {start_time}-{end_time})")
            switch_device(device_id, "ON")
        elif current_hour == end_time:
            print(f"[RULE_EXEC] Multi-stage OFF: {device_id} (stage: {start_time}-{end_time})")
            switch_device(device_id, "OFF")

def execute_single_stage_rule(device_id, rule_data, current_hour, current_day):
    """Execute legacy single-stage automation rule"""
    start_time = rule_data.get("start", "")
    end_time = rule_data.get("end", "")
    days = rule_data.get("days", [])
    
    if current_day not in days:
        return
    
    if current_hour == start_time:
        print(f"[RULE_EXEC] Turning ON {device_id} (single-stage rule: {start_time})")
        switch_device(device_id, "ON")
    elif current_hour == end_time:
        print(f"[RULE_EXEC] Turning OFF {device_id} (single-stage rule: {end_time})")
        switch_device(device_id, "OFF")

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
        
        # Log the event (with rolling limit)
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
        
        # Log the event (with rolling limit)
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


# --- Automation Logic ---
def apply_building_automation(building_id, automation_data):
    """Apply automation to all devices in a building - Enhanced to handle exact web app format"""
    if not firebase_connected:
        print(f"[OFFLINE] Skipping automation for building {building_id} - Firebase disconnected")
        return
        
    print(f"[AUTOMATION] Applying automation to building {building_id}")
    print(f"[AUTOMATION] Automation data: {automation_data}")
    
    if building_id not in building_automation_states:
        print(f"[ERROR] Building {building_id} not found in automation states")
        return
    
    automation_state = building_automation_states[building_id]
    building_devices = automation_state["devices"]
    
    # Extract automation mode and flags using exact web app structure
    current_mode = automation_data.get("currentMode", "none")
    modes = automation_data.get("modes", {})
    
    # Update local automation state
    automation_state["mode"] = current_mode
    
    print(f"[AUTOMATION] Processing mode: {current_mode}")
    print(f"[AUTOMATION] Mode flags: {modes}")
    print(f"[AUTOMATION] Building devices: {building_devices}")
    
    # Handle exact mode names from web app: "turn-off-all", "eco-mode"
    if modes.get("turn-off-all", False) or current_mode == "turn-off-all":
        print(f"[AUTOMATION] 🔒 Applying LOCKDOWN (turn-off-all) to building {building_id}")
        
        locked_count = 0
        for device_id in building_devices:
            print(f"[LOCKDOWN] Processing device {device_id}")
            
            # Turn off device immediately
            success = switch_device(device_id, "OFF", force=True)
            if success:
                print(f"[LOCKDOWN] ✅ Device {device_id} turned OFF")
            else:
                print(f"[LOCKDOWN] ❌ Failed to turn OFF device {device_id}")
                
            # Lock device in automation state
            automation_state["locked_devices"].add(device_id)
            
            # Set locked status in RTDB
            try:
                db.reference(f'Devices/{device_id}/locked').set(True)
                locked_count += 1
                print(f"[LOCKDOWN] ✅ Device {device_id} locked in RTDB")
            except Exception as e:
                print(f"[RTDB] ❌ Failed to lock device {device_id}: {e}")
        
        print(f"[AUTOMATION] ✅ LOCKDOWN completed - {locked_count}/{len(building_devices)} devices locked")
        
    elif modes.get("eco-mode", False) or current_mode == "eco-mode":
        print(f"[AUTOMATION] 🌱 Applying ECO-MODE to building {building_id}")
        
        # Clear locked devices first (eco-mode doesn't lock all devices)
        automation_state["locked_devices"].clear()
        
        ac_devices_found = 0
        ac_devices_turned_off = 0
        
        for device_id in building_devices:
            # Unlock all devices first
            try:
                db.reference(f'Devices/{device_id}/locked').set(False)
            except Exception as e:
                print(f"[RTDB] Failed to unlock device {device_id}: {e}")
                
            # Check device type and turn off AC units
            device_type = device_type_map.get(device_id, 'Unknown')
            print(f"[ECO-MODE] Device {device_id} type: {device_type}")
            
            if device_type == "AC":
                ac_devices_found += 1
                print(f"[ECO-MODE] Found AC device: {device_id} - turning OFF")
                success = switch_device(device_id, "OFF", force=True)
                if success:
                    ac_devices_turned_off += 1
                    print(f"[ECO-MODE] ✅ AC device {device_id} turned OFF")
                else:
                    print(f"[ECO-MODE] ❌ Failed to turn OFF AC device {device_id}")
        
        print(f"[AUTOMATION] ✅ ECO-MODE completed - {ac_devices_turned_off}/{ac_devices_found} AC devices turned OFF")
        
    else:
        print(f"[AUTOMATION] 🔓 Clearing automation for building {building_id}")
        
        # Clear automation - unlock all devices
        automation_state["locked_devices"].clear()
        unlocked_count = 0
        
        for device_id in building_devices:
            try:
                db.reference(f'Devices/{device_id}/locked').set(False)
                unlocked_count += 1
                print(f"[AUTOMATION] ✅ Unlocked device: {device_id}")
            except Exception as e:
                print(f"[RTDB] ❌ Failed to unlock device {device_id}: {e}")
        
        print(f"[AUTOMATION] ✅ Automation cleared - {unlocked_count}/{len(building_devices)} devices unlocked")
    
    print(f"[AUTOMATION] Building {building_id} automation applied. Final mode: {current_mode}")

# --- Firestore Listeners ---
def create_automation_listener(building_id):
    """Create listener for building automation changes - FIXED to use BUILDINGAUTOMATION collection"""
    def on_automation_change(doc_snapshot, changes, read_time):
        if not firebase_connected:
            return
            
        for doc in doc_snapshot:
            if doc.exists:
                # Web app writes exact structure: buildingId, enabled, mode, modes{eco-mode, turn-off-all}, modifiedBy, lastModified
                automation_data = doc.to_dict()
                
                print(f"[FIRESTORE] Automation change detected for building {building_id}")
                print(f"[FIRESTORE] Raw data: {automation_data}")
                
                # Extract data using exact field names from web app
                enabled = automation_data.get('enabled', False)
                mode = automation_data.get('mode', 'none')
                modes = automation_data.get('modes', {})
                modified_by = automation_data.get('modifiedBy', 'unknown')
                
                print(f"[FIRESTORE] Enabled: {enabled}, Mode: {mode}, Modes: {modes}, ModifiedBy: {modified_by}")
                
                if enabled and mode != 'none':
                    # Convert to Pi's expected format
                    pi_automation_data = {
                        "currentMode": mode,
                        "modes": modes,
                        "status": "active"
                    }
                    print(f"[FIRESTORE] Applying automation: {pi_automation_data}")
                    apply_building_automation(building_id, pi_automation_data)
                else:
                    print(f"[FIRESTORE] Clearing automation for building {building_id}")
                    # Clear automation
                    pi_automation_data = {
                        "currentMode": "none",
                        "modes": {
                            "eco-mode": False,
                            "turn-off-all": False
                        },
                        "status": "inactive"
                    }
                    apply_building_automation(building_id, pi_automation_data)
            else:
                print(f"[FIRESTORE] Building automation document {building_id} does not exist - clearing automation")
                # Document deleted - clear automation
                pi_automation_data = {
                    "currentMode": "none",
                    "modes": {
                        "eco-mode": False,
                        "turn-off-all": False
                    },
                    "status": "inactive"
                }
                apply_building_automation(building_id, pi_automation_data)
    
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
    """Reload automation states for all buildings - FIXED to use BUILDINGAUTOMATION collection"""
    if not firebase_connected:
        return
        
    try:
        for building_id in building_automation_states.keys():
            print(f"[RELOAD] Checking automation state for building {building_id}")
            
            # Read from BUILDINGAUTOMATION collection (exact path: BUILDINGAUTOMATION/{buildingId})
            automation_doc = firestore_db.collection("BUILDINGAUTOMATION").document(building_id).get()
            
            if automation_doc.exists:
                automation_data = automation_doc.to_dict()
                print(f"[RELOAD] Found automation data: {automation_data}")
                
                # Extract using exact field names: enabled, mode, modes
                enabled = automation_data.get('enabled', False)
                mode = automation_data.get('mode', 'none')
                modes = automation_data.get('modes', {})
                
                if enabled and mode != 'none':
                    print(f"[RELOAD] Loading active automation for building {building_id}: mode={mode}")
                    
                    # Convert to Pi format
                    pi_automation_data = {
                        "currentMode": mode,
                        "modes": modes,
                        "status": "active"
                    }
                    
                    apply_building_automation(building_id, pi_automation_data)
                else:
                    print(f"[RELOAD] No active automation for building {building_id} (enabled={enabled}, mode={mode})")
            else:
                print(f"[RELOAD] No automation document found: BUILDINGAUTOMATION/{building_id}")
    except Exception as e:
        print(f"[RELOAD] Error reloading automation states: {e}")
        import traceback
        traceback.print_exc()

        # ==============================================================================
# SIMPLE SCHEDULER TRIGGER LISTENER
# ==============================================================================

def setup_scheduler_trigger_listener():
    """Set up simple listener for manual scheduler triggers from web app"""
    try:
        def on_scheduler_trigger(doc_snapshot, changes, read_time):
            if not firebase_connected:
                return
            
            for change in changes:
                if change.type.name == 'ADDED':  # New trigger
                    doc = change.document
                    trigger_data = doc.to_dict()
                    trigger_id = doc.id
                    
                    print(f"[SCHEDULER_TRIGGER] Manual scheduler trigger received: {trigger_id}")
                    print(f"[SCHEDULER_TRIGGER] Triggered by: {trigger_data.get('triggeredBy')}")
                    
                    # Just run the existing pattern generation function
                    threading.Thread(
                        target=run_manual_scheduler,
                        args=(trigger_id,),
                        daemon=True
                    ).start()
        
        # Listen to the simple SCHEDULER_TRIGGERS collection
        scheduler_trigger_ref = firestore_db.collection("SCHEDULER_TRIGGERS")
        scheduler_trigger_listener = scheduler_trigger_ref.on_snapshot(on_scheduler_trigger)
        
        print("[SCHEDULER_TRIGGER] Scheduler trigger listener started")
        return scheduler_trigger_listener
        
    except Exception as e:
        print(f"[SCHEDULER_TRIGGER] Error setting up trigger listener: {e}")
        return None

def run_manual_scheduler(trigger_id):
    """Run the scheduler manually when triggered"""
    try:
        print(f"[SCHEDULER_TRIGGER] Running scheduler manually for trigger: {trigger_id}")
        
        # Just call the existing pattern generation function
        generate_automation_rules()
        
        print(f"[SCHEDULER_TRIGGER] Manual scheduler run completed for trigger: {trigger_id}")
        
    except Exception as e:
        print(f"[SCHEDULER_TRIGGER] Error running manual scheduler: {e}")

# --- Scheduler Functions ---
def run_scheduler():
    """Run the scheduler in a separate thread"""
    # Schedule pattern detection to run weekly (every Sunday at 2 AM)
    schedule.every().sunday.at("02:00").do(generate_automation_rules)
    
    # Schedule rule execution every minute
    schedule.every().hour.do(execute_automation_rules)
    
    while True:
        schedule.run_pending()
        time.sleep(1)

# --- Testing Functions ---
def test_pattern_detection_for_device(device_id):
    """Test pattern detection for a specific device"""
    print(f"[TEST] Testing multi-stage pattern detection for {device_id}")
    
    try:
        pattern = analyze_device_patterns_multi_stage(device_id)
        if pattern:
            print(f"[TEST] Multi-stage pattern generated: {pattern}")
            
            # Save the rule (starts DISABLED)
            rule_ref = firestore_db.collection("AUTOMATIONRULE").document(device_id)
            rule_ref.set(pattern)
            print(f"[TEST] Rule saved for {device_id} (DISABLED by default)")
        else:
            print(f"[TEST] No pattern could be generated for {device_id}")
            
    except Exception as e:
        print(f"[TEST] Error testing pattern detection for {device_id}: {e}")

def manual_pattern_detection():
    """Manually trigger pattern detection for all devices"""
    print("[MANUAL] Starting manual multi-stage pattern detection...")
    generate_automation_rules()
    print("[MANUAL] Manual pattern detection completed")

def manual_clear_event_history(device_id):
    """Manually clear event history for a device (for web app 'Learn New Pattern' button)"""
    print(f"[MANUAL] Clearing event history for {device_id}")
    count = clear_device_event_history(device_id)
    print(f"[MANUAL] Cleared {count} events for {device_id}")
    return count

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

def create_heartbeat():
    """Create heartbeat file for backup system"""
    def heartbeat_loop():
        while True:
            try:
                with open('/tmp/siseao_primary_heartbeat', 'w') as f:
                    f.write(str(time.time()))
                time.sleep(5)  # Update every 5 seconds
            except Exception as e:
                print(f"[HEARTBEAT] Error: {e}")
                time.sleep(5)
    
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    print("[HEARTBEAT] Started heartbeat for backup system")


# ==============================================================================
# DYNAMIC DEVICE DISCOVERY (Hot-Plug Support)
# ==============================================================================

def setup_device_discovery_listener():
    """Set up listener for new devices added to locations"""
    try:
        def on_device_change(doc_snapshot, changes, read_time):
            if not firebase_connected:
                return
            
            for change in changes:
                if change.type.name == 'ADDED':
                    # New device added
                    device_doc = change.document
                    device_id = device_doc.id
                    device_data = device_doc.to_dict()
                    
                    if device_id in DEVICE_GPIO_CONFIG:
                        print(f"[DEVICE_DISCOVERY] 🔌 New device detected: {device_id}")
                        integrate_new_device(device_id, device_data)
                        
                elif change.type.name == 'MODIFIED':
                    # Device location changed
                    device_doc = change.document
                    device_id = device_doc.id
                    device_data = device_doc.to_dict()
                    
                    if device_id in DEVICE_GPIO_CONFIG:
                        print(f"[DEVICE_DISCOVERY] 📝 Device location updated: {device_id}")
                        update_device_mapping(device_id, device_data)
                        
                elif change.type.name == 'REMOVED':
                    # Device removed
                    device_doc = change.document
                    device_id = device_doc.id
                    
                    if device_id in DEVICE_GPIO_CONFIG:
                        print(f"[DEVICE_DISCOVERY] 🗑️ Device removed: {device_id}")
                        remove_device_mapping(device_id)
        
        # Listen to DEVICE collection changes
        devices_ref = firestore_db.collection("DEVICE")
        device_listener = devices_ref.on_snapshot(on_device_change)
        
        print("[DEVICE_DISCOVERY] ✅ Dynamic device discovery listener started")
        return device_listener
        
    except Exception as e:
        print(f"[DEVICE_DISCOVERY] ❌ Error setting up device discovery: {e}")
        return None

def integrate_new_device(device_id, device_data):
    """Integrate a newly discovered device into the system"""
    try:
        location_id = device_data.get('Location')
        device_type = device_data.get('DeviceType', 'Unknown')
        
        if not location_id:
            print(f"[DEVICE_DISCOVERY] ⚠️ Device {device_id} has no location - skipping")
            return
        
        # Get building from location
        location_doc = firestore_db.collection('LOCATION').document(location_id).get()
        if not location_doc.exists():
            print(f"[DEVICE_DISCOVERY] ❌ Location {location_id} not found for device {device_id}")
            return
        
        location_data = location_doc.to_dict()
        building_id = location_data.get('Building')
        
        if not building_id:
            print(f"[DEVICE_DISCOVERY] ❌ No building found for location {location_id}")
            return
        
        # Update device mappings
        device_building_map[device_id] = building_id
        device_location_map[device_id] = location_id
        device_type_map[device_id] = device_type
        
        # Initialize device tracking
        device_on_timestamps[device_id] = None
        device_last_energy_update_time[device_id] = None
        
        # Add to building automation state
        if building_id in building_automation_states:
            building_devices = building_automation_states[building_id]["devices"]
            if device_id not in building_devices:
                building_devices.append(device_id)
                print(f"[DEVICE_DISCOVERY] ✅ Added {device_id} to building {building_id}")
        else:
            # Create new building state if needed
            building_automation_states[building_id] = {
                "mode": "none",
                "locked_devices": set(),
                "devices": [device_id]
            }
            print(f"[DEVICE_DISCOVERY] Created new building state for {building_id}")
        
        # Set up RTDB listener for new device
        setup_device_rtdb_listener(device_id)
        
        # Initialize device in RTDB if needed
        try:
            device_ref = db.reference(f'Devices/{device_id}')
            device_snapshot = device_ref.get()
            if not device_snapshot:
                device_ref.set({
                    'status': 'OFF',
                    'locationId': location_id
                })
                print(f"[DEVICE_DISCOVERY] Initialized RTDB for {device_id}")
        except Exception as rtdb_error:
            print(f"[DEVICE_DISCOVERY] RTDB initialization error for {device_id}: {rtdb_error}")
        
        print(f"[DEVICE_DISCOVERY] Device {device_id} successfully integrated!")
        print(f"[DEVICE_DISCOVERY] Building: {building_id}, Location: {location_id}, Type: {device_type}")
        
    except Exception as e:
        print(f"[DEVICE_DISCOVERY] Error integrating device {device_id}: {e}")
        import traceback
        traceback.print_exc()

def update_device_mapping(device_id, device_data):
    """Update device mapping when location changes"""
    try:
        old_building = device_building_map.get(device_id)
        old_location = device_location_map.get(device_id)
        
        new_location = device_data.get('Location')
        new_device_type = device_data.get('DeviceType', 'Unknown')
        
        if not new_location:
            # Device location removed - treat as device removal
            remove_device_mapping(device_id)
            return
        
        # Get new building from location
        location_doc = firestore_db.collection('LOCATION').document(new_location).get()
        if not location_doc.exists():
            print(f"[DEVICE_DISCOVERY] New location {new_location} not found")
            return
        
        location_data = location_doc.to_dict()
        new_building = location_data.get('Building')
        
        if not new_building:
            print(f"[DEVICE_DISCOVERY] No building found for new location {new_location}")
            return
        
        # Update mappings
        device_building_map[device_id] = new_building
        device_location_map[device_id] = new_location
        device_type_map[device_id] = new_device_type
        
        # Remove from old building
        if old_building and old_building in building_automation_states:
            old_devices = building_automation_states[old_building]["devices"]
            if device_id in old_devices:
                old_devices.remove(device_id)
                print(f"[DEVICE_DISCOVERY] Removed {device_id} from building {old_building}")
        
        # Add to new building
        if new_building in building_automation_states:
            new_devices = building_automation_states[new_building]["devices"]
            if device_id not in new_devices:
                new_devices.append(device_id)
                print(f"[DEVICE_DISCOVERY] Added {device_id} to building {new_building}")
        else:
            # Create new building state
            building_automation_states[new_building] = {
                "mode": "none",
                "locked_devices": set(),
                "devices": [device_id]
            }
            print(f"[DEVICE_DISCOVERY] Created new building state for {new_building}")
        
        # Update RTDB location
        try:
            device_ref = db.reference(f'Devices/{device_id}')
            device_ref.update({'locationId': new_location})
        except Exception as rtdb_error:
            print(f"[DEVICE_DISCOVERY] RTDB update error for {device_id}: {rtdb_error}")
        
        print(f"[DEVICE_DISCOVERY] Device {device_id} moved:")
        print(f"[DEVICE_DISCOVERY]   From: Building {old_building}, Location {old_location}")
        print(f"[DEVICE_DISCOVERY]   To: Building {new_building}, Location {new_location}")
        
    except Exception as e:
        print(f"[DEVICE_DISCOVERY] Error updating device mapping for {device_id}: {e}")

def remove_device_mapping(device_id):
    """Remove device from system when deleted or location removed"""
    try:
        old_building = device_building_map.get(device_id)
        
        # Remove from mappings
        if device_id in device_building_map:
            del device_building_map[device_id]
        if device_id in device_location_map:
            del device_location_map[device_id]
        if device_id in device_type_map:
            del device_type_map[device_id]
        
        # Clean up tracking
        if device_id in device_on_timestamps:
            del device_on_timestamps[device_id]
        if device_id in device_last_energy_update_time:
            del device_last_energy_update_time[device_id]
        
        # Remove from building automation state
        if old_building and old_building in building_automation_states:
            building_devices = building_automation_states[old_building]["devices"]
            if device_id in building_devices:
                building_devices.remove(device_id)
                print(f"[DEVICE_DISCOVERY] Removed {device_id} from building {old_building}")
            
            # Remove from locked devices if present
            locked_devices = building_automation_states[old_building]["locked_devices"]
            locked_devices.discard(device_id)
        
        print(f"[DEVICE_DISCOVERY] Device {device_id} successfully removed from system")
        
    except Exception as e:
        print(f"[DEVICE_DISCOVERY] Error removing device {device_id}: {e}")

def setup_device_rtdb_listener(device_id):
    """Set up RTDB listener for a specific device"""
    try:
        device_ref = db.reference(f'Devices/{device_id}/status')
        device_ref.listen(create_device_listener(device_id))
        print(f"[DEVICE_DISCOVERY] RTDB listener set up for {device_id}")
    except Exception as e:
        print(f"[DEVICE_DISCOVERY] Error setting up RTDB listener for {device_id}: {e}")

# ==============================================================================
# MANUAL DEVICE REFRESH FUNCTION
# ==============================================================================

def refresh_device_mappings():
    """Manually refresh device mappings (can be triggered from web app)"""
    try:
        print("[DEVICE_REFRESH] Manually refreshing device mappings...")
        
        # Store current state for comparison
        old_device_count = len(device_building_map)
        old_buildings = set(building_automation_states.keys())
        
        # Reload mappings
        success = load_device_mappings()
        
        if success:
            new_device_count = len(device_building_map)
            new_buildings = set(building_automation_states.keys())
            
            # Set up RTDB listeners for all devices
            for device_id in device_building_map.keys():
                setup_device_rtdb_listener(device_id)
            
            print(f"[DEVICE_REFRESH] Refresh completed!")
            print(f"[DEVICE_REFRESH] Devices: {old_device_count} → {new_device_count}")
            print(f"[DEVICE_REFRESH] Buildings: {len(old_buildings)} → {len(new_buildings)}")
            
            # Report new devices/buildings
            if new_device_count > old_device_count:
                print(f"[DEVICE_REFRESH] {new_device_count - old_device_count} new devices discovered!")
            
            new_building_count = len(new_buildings - old_buildings)
            if new_building_count > 0:
                print(f"[DEVICE_REFRESH] {new_building_count} new buildings discovered!")
                
        else:
            print("[DEVICE_REFRESH] Refresh failed")
            
        return success
        
    except Exception as e:
        print(f"[DEVICE_REFRESH] Error during manual refresh: {e}")
        return False

# ==============================================================================
# WEB APP TRIGGER FOR DEVICE REFRESH
# ==============================================================================

def setup_device_refresh_trigger_listener():
    """Listen for device refresh triggers from web app"""
    try:
        def on_refresh_trigger(doc_snapshot, changes, read_time):
            if not firebase_connected:
                return
            
            for change in changes:
                if change.type.name == 'ADDED':
                    doc = change.document
                    trigger_data = doc.to_dict()
                    trigger_id = doc.id
                    
                    if trigger_data.get('action') == 'REFRESH_DEVICES':
                        print(f"[DEVICE_REFRESH] 🔄 Refresh trigger received: {trigger_id}")
                        
                        # Run refresh in separate thread
                        threading.Thread(
                            target=refresh_device_mappings,
                            daemon=True
                        ).start()
        
        # Listen to device refresh triggers
        refresh_trigger_ref = firestore_db.collection("DEVICE_REFRESH_TRIGGERS")
        refresh_listener = refresh_trigger_ref.on_snapshot(on_refresh_trigger)
        
        print("[DEVICE_REFRESH] Device refresh trigger listener started")
        return refresh_listener
        
    except Exception as e:
        print(f"[DEVICE_REFRESH] Error setting up refresh trigger listener: {e}")
        return None


if __name__ == "__main__":
    print("SISEOA Multi-Building Automation Controller Started (Raspberry Pi)")
    print(f"GPIO-configured devices: {list(DEVICE_GPIO_CONFIG.keys())}")
    
    try:
        create_heartbeat()
        monitor_firebase_connection()
        
        # Initial device mapping load
        if not load_device_mappings():
            print("[ERROR] Failed to load device mappings. Exiting...")
            exit(1)
        
        # Start scheduler
        scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
        scheduler_thread.start()
        
        # Set up building automation listeners
        for building_id in building_automation_states.keys():
            try:
                automation_ref = firestore_db.collection("BUILDINGAUTOMATION").document(building_id)
                automation_listeners[building_id] = automation_ref.on_snapshot(create_automation_listener(building_id))
                print(f"[FIRESTORE] ✅ Listening for automation changes in BUILDINGAUTOMATION/{building_id}")
            except Exception as e:
                print(f"[FIRESTORE] ❌ Error setting up listener for building {building_id}: {e}")
        
       
        device_discovery_listener = setup_device_discovery_listener()
        
      
        device_refresh_listener = setup_device_refresh_trigger_listener()
        
        # Set up RTDB listeners for existing devices
        for device_id in device_building_map.keys():
            setup_device_rtdb_listener(device_id)
        
        # Load initial automation states
        reload_all_automation_states()
        
        print(f"[SYSTEM] Managing {len(building_automation_states)} buildings with {len(device_building_map)} devices")
        print("[SYSTEM] ✅ All listeners active with dynamic device discovery!")
        print("[DEVICE_DISCOVERY] 🔌 System ready for hot-plug device integration")
        
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("Stopping automation controller...")
    finally:
        # Cleanup all listeners
        try:
            for listener in automation_listeners.values():
                listener.unsubscribe()
            if 'device_discovery_listener' in locals() and device_discovery_listener:
                device_discovery_listener.unsubscribe()
            if 'device_refresh_listener' in locals() and device_refresh_listener:
                device_refresh_listener.unsubscribe()
        except:
            pass
        GPIO.cleanup()
        print("GPIO cleanup completed")