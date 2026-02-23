/**
 * Example Arduino programs for the FunShield labs.
 */

const Examples = {
    blink: `// Lab 2: Blinking LEDs - Simple chase animation
#include "funshield.h"

int currentLed = 0;
unsigned long lastChange = 0;
const int DELAY_MS = 300;

void setup() {
  pinMode(led1_pin, OUTPUT);
  pinMode(led2_pin, OUTPUT);
  pinMode(led3_pin, OUTPUT);
  pinMode(led4_pin, OUTPUT);

  // Start with all LEDs off
  digitalWrite(led1_pin, OFF);
  digitalWrite(led2_pin, OFF);
  digitalWrite(led3_pin, OFF);
  digitalWrite(led4_pin, OFF);
}

void loop() {
  unsigned long now = millis();
  if (now - lastChange >= DELAY_MS) {
    int ledPins[] = {led1_pin, led2_pin, led3_pin, led4_pin};
    
    // Turn off all LEDs
    for (int i = 0; i < 4; i++) {
      digitalWrite(ledPins[i], OFF);
    }
    
    // Turn on current LED
    digitalWrite(ledPins[currentLed], ON);
    
    currentLed = (currentLed + 1) % 4;
    lastChange = now;
  }
}`,

    knight: `// Lab 2: Knight Rider - Bouncing LED animation
#include "funshield.h"

int ledPins[] = {led1_pin, led2_pin, led3_pin, led4_pin};
const int NUM_LEDS = 4;
int currentLed = 0;
int direction = 1;
unsigned long lastChange = 0;
const int DELAY_MS = 150;

void setup() {
  for (int i = 0; i < NUM_LEDS; i++) {
    pinMode(ledPins[i], OUTPUT);
    digitalWrite(ledPins[i], OFF);
  }
}

void loop() {
  unsigned long now = millis();
  if (now - lastChange >= DELAY_MS) {
    // Turn off all LEDs
    for (int i = 0; i < NUM_LEDS; i++) {
      digitalWrite(ledPins[i], OFF);
    }
    
    // Turn on current LED
    digitalWrite(ledPins[currentLed], ON);
    
    // Move in current direction
    currentLed += direction;
    
    // Bounce at edges
    if (currentLed >= NUM_LEDS - 1) {
      direction = -1;
    } else if (currentLed <= 0) {
      direction = 1;
    }
    
    lastChange = now;
  }
}`,

    counter: `// Lab 3: Button Counter - Count up/down with buttons, display in binary on LEDs
#include "funshield.h"

int ledPins[] = {led1_pin, led2_pin, led3_pin, led4_pin};
const int NUM_LEDS = 4;
int counter = 0;

bool prevBtn1 = false;
bool prevBtn2 = false;
bool prevBtn3 = false;

unsigned long lastDebounce1 = 0;
unsigned long lastDebounce2 = 0;
unsigned long lastDebounce3 = 0;
const unsigned long DEBOUNCE_MS = 50;

void setup() {
  for (int i = 0; i < NUM_LEDS; i++) {
    pinMode(ledPins[i], OUTPUT);
  }
  pinMode(button1_pin, INPUT);
  pinMode(button2_pin, INPUT);
  pinMode(button3_pin, INPUT);
  
  displayBinary(counter);
}

void displayBinary(int value) {
  for (int i = 0; i < NUM_LEDS; i++) {
    if (value & (1 << i)) {
      digitalWrite(ledPins[i], ON);
    } else {
      digitalWrite(ledPins[i], OFF);
    }
  }
}

bool isButtonPressed(int pin) {
  return digitalRead(pin) == LOW;
}

void loop() {
  unsigned long now = millis();
  
  bool btn1 = isButtonPressed(button1_pin);
  bool btn2 = isButtonPressed(button2_pin);
  bool btn3 = isButtonPressed(button3_pin);
  
  // Button 1: increment
  if (btn1 && !prevBtn1 && now - lastDebounce1 > DEBOUNCE_MS) {
    counter = (counter + 1) % 16;
    displayBinary(counter);
    lastDebounce1 = now;
  }
  
  // Button 2: decrement
  if (btn2 && !prevBtn2 && now - lastDebounce2 > DEBOUNCE_MS) {
    counter = (counter - 1 + 16) % 16;
    displayBinary(counter);
    lastDebounce2 = now;
  }
  
  // Button 3: reset
  if (btn3 && !prevBtn3 && now - lastDebounce3 > DEBOUNCE_MS) {
    counter = 0;
    displayBinary(counter);
    lastDebounce3 = now;
  }
  
  prevBtn1 = btn1;
  prevBtn2 = btn2;
  prevBtn3 = btn3;
}`,

    segment: `// Lab 4: Segment Display - Show a counter on the 7-segment display
#include "funshield.h"

int counter = 0;
bool prevBtn1 = false;
bool prevBtn2 = false;
bool prevBtn3 = false;
unsigned long lastDebounce1 = 0;
unsigned long lastDebounce2 = 0;
unsigned long lastDebounce3 = 0;
const unsigned long DEBOUNCE_MS = 50;

// Display position index for multiplexing
int displayPos = 0;
unsigned long lastDisplayRefresh = 0;
const unsigned long DISPLAY_REFRESH_MS = 4;

void setup() {
  pinMode(latch_pin, OUTPUT);
  pinMode(clock_pin, OUTPUT);
  pinMode(data_pin, OUTPUT);
  pinMode(button1_pin, INPUT);
  pinMode(button2_pin, INPUT);
  pinMode(button3_pin, INPUT);
}

void displayDigit(int position, int glyph) {
  digitalWrite(latch_pin, LOW);
  shiftOut(data_pin, clock_pin, MSBFIRST, glyph);
  shiftOut(data_pin, clock_pin, MSBFIRST, 1 << position);
  digitalWrite(latch_pin, HIGH);
}

void loop() {
  unsigned long now = millis();
  
  // Button handling
  bool btn1 = digitalRead(button1_pin) == LOW;
  bool btn2 = digitalRead(button2_pin) == LOW;
  bool btn3 = digitalRead(button3_pin) == LOW;
  
  if (btn1 && !prevBtn1 && now - lastDebounce1 > DEBOUNCE_MS) {
    counter = (counter + 1) % 10000;
    lastDebounce1 = now;
  }
  if (btn2 && !prevBtn2 && now - lastDebounce2 > DEBOUNCE_MS) {
    counter = (counter - 1 + 10000) % 10000;
    lastDebounce2 = now;
  }
  if (btn3 && !prevBtn3 && now - lastDebounce3 > DEBOUNCE_MS) {
    counter = 0;
    lastDebounce3 = now;
  }
  
  prevBtn1 = btn1;
  prevBtn2 = btn2;
  prevBtn3 = btn3;
  
  // Time-multiplexed display refresh
  if (now - lastDisplayRefresh >= DISPLAY_REFRESH_MS) {
    int value = counter;
    int digitValues[4];
    
    for (int i = 0; i < 4; i++) {
      digitValues[i] = value % 10;
      value = value / 10;
    }
    
    // Show leading spaces for zero digits
    bool leadingZero = true;
    for (int i = 3; i >= 1; i--) {
      if (digitValues[i] == 0 && leadingZero) {
        digitValues[i] = -1; // blank
      } else {
        leadingZero = false;
      }
    }
    
    int glyph;
    if (digitValues[displayPos] == -1) {
      glyph = empty_glyph;
    } else {
      glyph = digits[digitValues[displayPos]];
    }
    
    displayDigit(displayPos, glyph);
    displayPos = (displayPos + 1) % 4;
    lastDisplayRefresh = now;
  }
}`,

    stopwatch: `// Lab 5: Stopwatch - Precise timing with start/stop/reset
#include "funshield.h"

unsigned long elapsedTime = 0;
unsigned long lastTick = 0;
bool isRunning = false;

bool prevBtn1 = false;
bool prevBtn2 = false;
bool prevBtn3 = false;

int displayPos = 0;
unsigned long lastDisplayRefresh = 0;
const unsigned long DISPLAY_REFRESH_MS = 4;

void setup() {
  pinMode(latch_pin, OUTPUT);
  pinMode(clock_pin, OUTPUT);
  pinMode(data_pin, OUTPUT);
  pinMode(button1_pin, INPUT);
  pinMode(button2_pin, INPUT);
  pinMode(button3_pin, INPUT);
}

void displayDigit(int position, int glyph) {
  digitalWrite(latch_pin, LOW);
  shiftOut(data_pin, clock_pin, MSBFIRST, glyph);
  shiftOut(data_pin, clock_pin, MSBFIRST, 1 << position);
  digitalWrite(latch_pin, HIGH);
}

void loop() {
  unsigned long now = millis();
  
  // Update elapsed time
  if (isRunning) {
    elapsedTime += now - lastTick;
  }
  lastTick = now;
  
  // Button 1: Start/Stop
  bool btn1 = digitalRead(button1_pin) == LOW;
  if (btn1 && !prevBtn1) {
    isRunning = !isRunning;
    lastTick = now;
  }
  prevBtn1 = btn1;
  
  // Button 2: (unused or lap)
  bool btn2 = digitalRead(button2_pin) == LOW;
  prevBtn2 = btn2;
  
  // Button 3: Reset (only when stopped)
  bool btn3 = digitalRead(button3_pin) == LOW;
  if (btn3 && !prevBtn3 && !isRunning) {
    elapsedTime = 0;
  }
  prevBtn3 = btn3;
  
  // Display: show seconds with one decimal (XX.X format)
  if (now - lastDisplayRefresh >= DISPLAY_REFRESH_MS) {
    // Convert to tenths of a second
    unsigned long tenths = elapsedTime / 100;
    
    int d0 = tenths % 10;          // tenths
    int d1 = (tenths / 10) % 10;   // ones
    int d2 = (tenths / 100) % 10;  // tens
    int d3 = (tenths / 1000) % 10; // hundreds
    
    int digitValues[] = {d0, d1, d2, d3};
    int glyph = digits[digitValues[displayPos]];
    
    // Add decimal point on position 1 (between seconds and tenths)
    if (displayPos == 1) {
      glyph = glyph & 0x7F; // Turn on decimal point (active low, bit 7)
    }
    
    displayDigit(displayPos, glyph);
    displayPos = (displayPos + 1) % 4;
    lastDisplayRefresh = now;
  }
}`,

    scroll: `// Lab 6: Scrolling Text - Display scrolling message on 7-seg
// Type a message in the Serial Monitor and press Send!
#include "funshield.h"

// Character to 7-seg glyph mapping
int charToGlyph(char c) {
  if (c >= '0' && c <= '9') return digits[c - '0'];
  switch (c) {
    case 'A': case 'a': return 0x88;
    case 'B': case 'b': return 0x83;
    case 'C': case 'c': return 0xc6;
    case 'D': case 'd': return 0xa1;
    case 'E': case 'e': return 0x86;
    case 'F': case 'f': return 0x8e;
    case 'H': case 'h': return 0x89;
    case 'I': case 'i': return 0xf9;
    case 'J': case 'j': return 0xf1;
    case 'L': case 'l': return 0xc7;
    case 'N': case 'n': return 0xab;
    case 'O': case 'o': return 0xc0;
    case 'P': case 'p': return 0x8c;
    case 'R': case 'r': return 0xaf;
    case 'S': case 's': return 0x92;
    case 'T': case 't': return 0x87;
    case 'U': case 'u': return 0xc1;
    case 'Y': case 'y': return 0x91;
    case '-': return 0xbf;
    case '_': return 0xf7;
    case ' ': return 0xff;
    default: return 0xff;
  }
}

char message[128] = "    HELLO    ";
int scrollPos = 0;
int msgLen = 13;
unsigned long lastScroll = 0;
const unsigned long SCROLL_MS = 300;

int displayPos = 0;
unsigned long lastDisplayRefresh = 0;
const unsigned long DISPLAY_REFRESH_MS = 4;

void setup() {
  pinMode(latch_pin, OUTPUT);
  pinMode(clock_pin, OUTPUT);
  pinMode(data_pin, OUTPUT);
  Serial.begin(9600);
}

void displayDigit(int position, int glyph) {
  digitalWrite(latch_pin, LOW);
  shiftOut(data_pin, clock_pin, MSBFIRST, glyph);
  shiftOut(data_pin, clock_pin, MSBFIRST, 1 << position);
  digitalWrite(latch_pin, HIGH);
}

void loop() {
  unsigned long now = millis();
  
  // Check serial for new message
  if (Serial.available() > 0) {
    // readStringUntil reads until newline (added by Send button)
    message = Serial.readString();
    msgLen = message.length;
    scrollPos = -3;
  }
  
  // Scroll timing
  if (now - lastScroll >= SCROLL_MS) {
    scrollPos++;
    if (scrollPos >= msgLen) {
      scrollPos = -3;
    }
    lastScroll = now;
  }
  
  // Display refresh (multiplexing)
  if (now - lastDisplayRefresh >= DISPLAY_REFRESH_MS) {
    int charIndex = scrollPos + displayPos;
    int glyph = empty_glyph;
    
    if (charIndex >= 0 && charIndex < msgLen) {
      glyph = charToGlyph(message[charIndex]);
    }
    
    // Display position 3 is leftmost, 0 is rightmost
    displayDigit(3 - displayPos, glyph);
    displayPos = (displayPos + 1) % 4;
    lastDisplayRefresh = now;
  }
}`
};
