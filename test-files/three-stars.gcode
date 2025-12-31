; Three Stars Test Pattern for Gellyroller
; Machine: 480x480mm
; Pen control: M42 P0 S0 (up) / M42 P0 S1 (down)
;
; Star 1: Small (r=30) centered at (240, 240)
; Star 2: Large (r=50) centered at (240, 240), rotated 36 degrees
; Star 3: Medium (r=35) at (340, 280), squished 0.7x horizontally
;
; Feed rate is set via F parameter - change F values to test different speeds
; Default: F2000 (33 mm/sec)

; === SETUP ===
G90                    ; Absolute positioning
G21                    ; Units in mm
M42 P0 S0              ; Pen UP

; Move to start position
G0 X240 Y210 F3000     ; Rapid to first star top point

; === STAR 1: Small centered star (radius 30mm) ===
; Center: (240, 240), Points calculated for 5-point star
M42 P0 S1              ; Pen DOWN
G1 X257.6 Y264.3 F2000 ; to point 2
G1 X211.5 Y230.7 F2000 ; to point 4
G1 X268.5 Y230.7 F2000 ; to point 1
G1 X222.4 Y264.3 F2000 ; to point 3
G1 X240.0 Y210.0 F2000 ; back to point 0 (top)
M42 P0 S0              ; Pen UP

; === STAR 2: Large rotated star (radius 50mm, rotated 36 deg) ===
; Center: (240, 240), rotated so points are offset
G0 X269.4 Y215.5 F3000 ; Rapid to rotated point 0
M42 P0 S1              ; Pen DOWN
G1 X220.6 Y276.9 F2000 ; to rotated point 2
G1 X255.5 Y203.6 F2000 ; to rotated point 4
G1 X224.5 Y203.6 F2000 ; to rotated point 1
G1 X259.4 Y276.9 F2000 ; to rotated point 3
G1 X269.4 Y215.5 F2000 ; back to start
M42 P0 S0              ; Pen UP

; === STAR 3: Squished star (radius 35mm, X scale 0.7) ===
; Center: (340, 280), horizontally compressed
G0 X340.0 Y245.0 F3000 ; Rapid to squished star top
M42 P0 S1              ; Pen DOWN
G1 X352.3 Y298.4 F2000 ; to point 2 (X squished)
G1 X320.0 Y268.8 F2000 ; to point 4 (X squished)
G1 X360.0 Y268.8 F2000 ; to point 1 (X squished)
G1 X327.7 Y298.4 F2000 ; to point 3 (X squished)
G1 X340.0 Y245.0 F2000 ; back to start
M42 P0 S0              ; Pen UP

; === FINISH ===
G0 X10 Y10 F3000       ; Move to home corner
M400                   ; Wait for moves to complete

; === SPEED TEST NOTES ===
; To run faster, find/replace F2000 with:
;   F3000 = 50 mm/sec
;   F4000 = 67 mm/sec
;   F5000 = 83 mm/sec
;   F6000 = 100 mm/sec (max)
