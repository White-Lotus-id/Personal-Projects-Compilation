// ============================================================
//  Arduino Traffic Light — Advanced Level (Perfect Score)
//  Features:
//    - State Machine architecture
//    - Non-blocking timing with millis()
//    - Pedestrian button with software debounce
//    - Blinking Green warning before Yellow
//    - System stays GREEN indefinitely until button pressed
//    - Returns to GREEN idle state after RED
// ============================================================

// --- Pin Definitions ---
const int PIN_RED    = 10;
const int PIN_YELLOW = 9;
const int PIN_GREEN  = 8;
const int PIN_BUTTON = 2;

// --- Timing Constants (milliseconds) ---
const unsigned long TIME_BLINK_GREEN    = 3000;
const unsigned long TIME_BLINK_INTERVAL = 400;
const unsigned long TIME_YELLOW         = 2000;
const unsigned long TIME_RED            = 5000;
const unsigned long DEBOUNCE_DELAY      = 50;

// --- State Machine Definition ---
enum TrafficState {
  STATE_GREEN_IDLE,
  STATE_GREEN_BLINK,
  STATE_YELLOW,
  STATE_RED
};

TrafficState currentState = STATE_GREEN_IDLE;

// --- Timing Variables ---
unsigned long stateStartTime = 0;
unsigned long blinkTimer     = 0;
bool          blinkOn        = false;

// --- Debounce Variables ---
int           lastButtonReading = HIGH;
int           stableButtonState = HIGH;
unsigned long lastDebounceTime  = 0;
bool          pedestrianRequest = false;

// ============================================================
void setup() {
  pinMode(PIN_RED,    OUTPUT);
  pinMode(PIN_YELLOW, OUTPUT);
  pinMode(PIN_GREEN,  OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);

  Serial.begin(9600);
  Serial.println("Traffic Light System Initialized.");

  enterState(STATE_GREEN_IDLE);
}

// ============================================================
void loop() {
  readButton();
  updateStateMachine();
}

// ============================================================
// BUTTON READING — Software Debounce
// ============================================================
void readButton() {
  int reading = digitalRead(PIN_BUTTON);

  if (reading != lastButtonReading) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY) {
    if (reading != stableButtonState) {
      stableButtonState = reading;
      if (stableButtonState == LOW) {
        pedestrianRequest = true;
        Serial.println(">> Pedestrian button pressed!");
      }
    }
  }

  lastButtonReading = reading;
}

// ============================================================
// STATE MACHINE — Transitions & Behavior
// ============================================================
void updateStateMachine() {
  unsigned long now = millis();

  switch (currentState) {

    case STATE_GREEN_IDLE:
      if (pedestrianRequest) {
        pedestrianRequest = false;
        enterState(STATE_GREEN_BLINK);
      }
      break;

    case STATE_GREEN_BLINK:
      if (now - stateStartTime >= TIME_BLINK_GREEN) {
        enterState(STATE_YELLOW);
      } else {
        if (now - blinkTimer >= TIME_BLINK_INTERVAL) {
          blinkOn = !blinkOn;
          digitalWrite(PIN_GREEN, blinkOn ? HIGH : LOW);
          blinkTimer = now;
        }
      }
      break;

    case STATE_YELLOW:
      if (now - stateStartTime >= TIME_YELLOW) {
        enterState(STATE_RED);
      }
      break;

    case STATE_RED:
      if (now - stateStartTime >= TIME_RED) {
        pedestrianRequest = false;
        enterState(STATE_GREEN_IDLE);
      }
      break;
  }
}

// ============================================================
// STATE ENTRY — Turn LEDs on/off and log the transition
// ============================================================
void enterState(TrafficState newState) {
  digitalWrite(PIN_RED,    LOW);
  digitalWrite(PIN_YELLOW, LOW);
  digitalWrite(PIN_GREEN,  LOW);

  currentState   = newState;
  stateStartTime = millis();

  switch (newState) {
    case STATE_GREEN_IDLE:
      digitalWrite(PIN_GREEN, HIGH);
      Serial.println("[GREEN] Idle — waiting for pedestrian input.");
      break;

    case STATE_GREEN_BLINK:
      blinkTimer = millis();
      blinkOn    = true;
      digitalWrite(PIN_GREEN, HIGH);
      Serial.println("[GREEN BLINK] Warning — prepare to stop!");
      break;

    case STATE_YELLOW:
      digitalWrite(PIN_YELLOW, HIGH);
      Serial.println("[YELLOW] Caution — 2 seconds.");
      break;

    case STATE_RED:
      digitalWrite(PIN_RED, HIGH);
      Serial.println("[RED] Stop — pedestrians crossing for 5 seconds.");
      break;
  }
}