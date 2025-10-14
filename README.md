# gellyroller
Scripts and config for raspi interface to buttons and duet via usb

MVP 1.0 Features

1. Physical buttons for:
home all - send M98 P"homeall.gcode"
start / pause - send M25
emergency stop - send M112

2. LED display tower shows
ready / awaiting input
processing gcode
finished

3. Communicate with Duet over USB
get status of duet
send gcode to duet

4. Camera
use gphoto2 to take image
store image on local storage

5. Daemons / Proceses
wait for new images to get dropped in a directory, run script on trigger
automated tracing
trace service vs browser based?

6. Machine status UI
status of supporting processes
software buttons for physical counterparts
show machine status 
show preview of uploaded gcode
pause / resume