#include <WiFi.h>
#include <PubSubClient.h>

// Wi-Fi credentials
const char* ssid = "Y45Net2.4";
const char* password = "petaiman";

// Raspberry Pi IP running Mosquitto MQTT broker
const char* mqtt_server = "192.168.8.186";  // Your Pi's IP
const int mqtt_port = 1883;

WiFiClient espClient;
PubSubClient client(espClient);

// Device topic mapping
const char* lampControlTopic = "device1/control"; // Lamp = device1
const char* lampStatusTopic  = "device1/status";

const char* fanControlTopic = "device2/control"; // Fan = device2
const char* fanStatusTopic  = "device2/status";

// GPIO setup
const int lampPin = 5;   // GPIO5 for Lamp
const int fanPin = 18;   // GPIO18 for Fan

// Device states
String lampState = "OFF";
String fanState = "OFF";

// Timing variables
unsigned long lastReconnectAttempt = 0;
unsigned long lastHeartbeat = 0;
const unsigned long heartbeatInterval = 30000; // 30 seconds

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.printf("Connecting to %s", ssid);

  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected successfully!");
    Serial.printf("IP address: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("Signal strength: %d dBm\n", WiFi.RSSI());
  } else {
    Serial.println("\nFailed to connect to WiFi!");
    Serial.println("Restarting ESP32...");
    delay(1000);
    ESP.restart();
  }
}

void callback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.printf("Message received on topic '%s': %s\n", topic, message.c_str());

  // Handle lamp control
  if (String(topic) == lampControlTopic) {
    String newState = lampState; // Store previous state
    
    if (message == "ON" && lampState != "ON") {
      digitalWrite(lampPin, HIGH);
      lampState = "ON";
      Serial.println("Lamp turned ON");
    } else if (message == "OFF" && lampState != "OFF") {
      digitalWrite(lampPin, LOW);
      lampState = "OFF";
      Serial.println("Lamp turned OFF");
    }
    
    // Only publish if state actually changed
    if (newState != lampState) {
      if (client.publish(lampStatusTopic, lampState.c_str(), true)) {
        Serial.printf("Published lamp status: %s\n", lampState.c_str());
      } else {
        Serial.println("Failed to publish lamp status");
      }
    }
  }

  // Handle fan control
  if (String(topic) == fanControlTopic) {
    String newState = fanState; // Store previous state
    
    if (message == "ON" && fanState != "ON") {
      digitalWrite(fanPin, HIGH);
      fanState = "ON";
      Serial.println("Fan turned ON");
    } else if (message == "OFF" && fanState != "OFF") {
      digitalWrite(fanPin, LOW);
      fanState = "OFF";
      Serial.println("Fan turned OFF");
    }
    
    // Only publish if state actually changed
    if (newState != fanState) {
      if (client.publish(fanStatusTopic, fanState.c_str(), true)) {
        Serial.printf("Published fan status: %s\n", fanState.c_str());
      } else {
        Serial.println("Failed to publish fan status");
      }
    }
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    
    // Create a unique client ID
    String clientId = "ESP32Device-";
    clientId += String(random(0xffff), HEX);
    
    if (client.connect(clientId.c_str())) {
      Serial.println("connected to MQTT broker");

      // Subscribe to control topics
      if (client.subscribe(lampControlTopic)) {
        Serial.printf("Subscribed to %s\n", lampControlTopic);
      } else {
        Serial.printf("Failed to subscribe to %s\n", lampControlTopic);
      }
      
      if (client.subscribe(fanControlTopic)) {
        Serial.printf("Subscribed to %s\n", fanControlTopic);
      } else {
        Serial.printf("Failed to subscribe to %s\n", fanControlTopic);
      }

      // Publish initial states with retain flag
      if (client.publish(lampStatusTopic, lampState.c_str(), true)) {
        Serial.printf("Published initial lamp state: %s\n", lampState.c_str());
      }
      
      if (client.publish(fanStatusTopic, fanState.c_str(), true)) {
        Serial.printf("Published initial fan state: %s\n", fanState.c_str());
      }
      
    } else {
      Serial.printf("failed, rc=%d. ", client.state());
      Serial.println("Retrying in 5 seconds...");
      delay(5000);
    }
  }
}

void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi connection lost. Reconnecting...");
    setup_wifi();
  }
}

void sendHeartbeat() {
  unsigned long now = millis();
  if (now - lastHeartbeat > heartbeatInterval) {
    if (client.connected()) {
      // Send heartbeat with device info
      String heartbeat = "{\"status\":\"online\",\"uptime\":" + String(millis()) + ",\"rssi\":" + String(WiFi.RSSI()) + "}";
      
      if (client.publish("device1/heartbeat", heartbeat.c_str(), false)) {
        Serial.println("Heartbeat sent for device1");
      }
      
      String heartbeat2 = "{\"status\":\"online\",\"uptime\":" + String(millis()) + ",\"rssi\":" + String(WiFi.RSSI()) + "}";
      if (client.publish("device2/heartbeat", heartbeat2.c_str(), false)) {
        Serial.println("Heartbeat sent for device2");
      }
    }
    lastHeartbeat = now;
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== ESP32 MQTT Device Controller ===");
  
  // Initialize GPIO pins
  pinMode(lampPin, OUTPUT);
  pinMode(fanPin, OUTPUT);
  
  // Ensure devices start in OFF state
  digitalWrite(lampPin, LOW);
  digitalWrite(fanPin, LOW);
  
  Serial.printf("Lamp Pin: GPIO%d\n", lampPin);
  Serial.printf("Fan Pin: GPIO%d\n", fanPin);

  // Setup WiFi connection
  setup_wifi();

  // Setup MQTT client
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
  client.setKeepAlive(60); // 60 seconds keep-alive
  client.setSocketTimeout(30); // 30 seconds socket timeout
  
  Serial.printf("MQTT Server: %s:%d\n", mqtt_server, mqtt_port);
  Serial.println("Setup completed!");
}

void loop() {
  // Check WiFi connection
  checkWiFiConnection();
  
  // Handle MQTT connection
  if (!client.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = now;
      reconnect();
    }
  } else {
    client.loop();
    sendHeartbeat(); // Send periodic heartbeat
  }
  
  // Small delay to prevent watchdog issues
  delay(10);
}