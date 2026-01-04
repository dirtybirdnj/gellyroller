# Ubuntu 25 / Duet2 Printer Setup Notes

## Session Date: 2025-01-04

## Printer: Belite (Printrbot Simple Metal)
- **IP Address:** 192.168.4.59
- **Controller:** Duet2 WiFi
- **Firmware:** RepRapFirmware 2.02 (2018-12-24) - old but working
- **Bed Size:** 200x200mm
- **Max Z Height:** 240mm
- **Nozzle:** 0.6mm (E3D Volcano)
- **Extruder:** Direct drive, E95 steps/mm
- **PSU:** 24V (weak, slow bed heating)

## Config Fixes Applied

### 1. Fixed conflicting extruder steps (config.g)
- Commented out old `M92 E663:663` line
- Kept correct `M92 X80 Y80 Z400 E95`

### 2. Fixed homeall.g missing relative mode
- Added `G91` at start
- Added `G90` after homing moves before absolute moves

### 3. Added M501 to config.g
- Loads saved PID tuning from config-override.g
- Commented out broken `M307 H0` line

### 4. Enabled FTP on Duet
- Added `M586 P1 S1` to enable FTP
- Credentials: `reprap:reprap`

## OrcaSlicer Setup

### Profile Location
`~/.var/app/io.github.softfever.OrcaSlicer/config/OrcaSlicer/user/default/machine/`

### Updated Profile: MyRRF 0.6 nozzle
- Corrected bed size to 200x200x240
- Set speed/acceleration limits from Duet config
- Added start G-code: homes, loads heightmap (G29 S1), heats, primes
- Added end G-code: cools down, parks at Y195
- Duet host: http://192.168.4.59

### Filament Settings for Generic PLA
- Nozzle temp: 210C (range 190-235C)
- Bed temp: 60C

## FTP Mount Scripts

### ~/bin/mount-duet
Mounts Duet FTP to ~/duet-ftp if printer is online

### ~/bin/unmount-duet
Cleanly unmounts the FTP share

### Known Issue
curlftpfs has write issues with Duet's basic FTP server. Files appear read-only.
"No such file or directory" error when trying to create files.

**Workarounds:**
- Use OrcaSlicer's built-in HTTP upload (more reliable)
- Use DWC web interface for uploads
- Investigate FTP write issue further

## Remaining Optional Tasks

1. **Firmware upgrade** (low priority)
   - Current: RRF 2.02
   - Latest: RRF 3.5.x
   - Would require config migration

2. **Bed leveling**
   - Heightmap shows ~0.9mm variance across bed
   - Consider checking bed mounting, gantry squareness

3. **FTP write issue**
   - curlftpfs can't create new files
   - May need different mount options or alternative approach

## Duet3 (New Printer)
- **IP Address:** 192.168.4.53
- Not yet configured in OrcaSlicer
