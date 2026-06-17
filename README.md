Arduino Drag Race Timing System
A high-precision timing system designed for scale drag racing. This project uses an Arduino microcontroller and motion sensors to automate race starts, detect false starts, and calculate elapsed time (ET) with millisecond accuracy.

Features
Automatic Start Sequence: Simulates a "Christmas Tree" countdown.

Motion Detection: High-speed polling to detect the exact moment a car crosses the start/finish lines.

Jump-Start Logic: Detects if a vehicle breaks the beam before the green light.

Real-time Statistics: Outputs Elapsed Time (ET) and race status via the Serial Monitor.

Hardware Components
Microcontroller: Arduino (Uno/Nano/Mega)

Sensors: Ultrasonic (HC-SR04) or IR Obstacle Sensors

Indicators: LEDs (Red, Yellow, Green) for the start sequence

Optional: 16x2 LCD Display for standalone results

Project Structure
DragRaceCode.ino: The main firmware containing sensor logic and timing interrupts.

How It Works
The system initializes and waits for cars to be staged at the start line.

Once both lanes are ready, the countdown sequence begins.

The Arduino continuously polls the sensors to trigger the timer as soon as the beam is broken.

Final race times are calculated and displayed immediately.

Developed as part of an engineering exploration into embedded systems and real-time signal processing.
