#include <WiFi.h>
#include <PubSubClient.h>

// Wi-Fi credentials
const char* ssid = "Y45PC";
const char* password = "yasrizal";

// Raspberry Pi IP running Mosquitto MQTT broker
const char* mqtt_server = "192.168.137.34";  // <-- Change to your Pi's IP

WiFiClient espClient;
PubSubClient client(espClient);

// Device topic mapping
const char* lampControlTopic = "device1/control"; // Lamp = device1
const char* lampStatusTopic  = "device1/status";

const char* fanControlTopic = "device2/control"; // Fan = device2
const char* fanStatusTopic  = "device2/status";

// GPIO setup (adjust if needed)
const int lampPin = 5;   // GPIO5
const int fanPin = 18;   // GPIO18

String lampState = "OFF";
String fanState = "OFF";

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.printf("Connecting to %s\n", ssid);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected. IP address: ");
  Serial.println(WiFi.localIP());
}

void callback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.printf("Message received on topic %s: %s\n", topic, message.c_str());

  if (String(topic) == lampControlTopic) {
    if (message == "ON") {
      digitalWrite(lampPin, HIGH);
      lampState = "ON";
    } else {
      digitalWrite(lampPin, LOW);
      lampState = "OFF";
    }
    client.publish(lampStatusTopic, lampState.c_str(), true);
  }

  if (String(topic) == fanControlTopic) {
    if (message == "ON") {
      digitalWrite(fanPin, HIGH);
      fanState = "ON";
    } else {
      digitalWrite(fanPin, LOW);
      fanState = "OFF";
    }
    client.publish(fanStatusTopic, fanState.c_str(), true);
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    if (client.connect("ESP32Device")) {
      Serial.println("connected");

      // Subscribe to control topics
      client.subscribe(lampControlTopic);
      client.subscribe(fanControlTopic);

      // Publish initial states
      client.publish(lampStatusTopic, lampState.c_str(), true);
      client.publish(fanStatusTopic, fanState.c_str(), true);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" retrying in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(lampPin, OUTPUT);
  pinMode(fanPin, OUTPUT);

  digitalWrite(lampPin, LOW);
  digitalWrite(fanPin, LOW);

  setup_wifi();

  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();
}
