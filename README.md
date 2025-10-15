# Duet Controller API

A Node.js Express API for controlling a CNC machine with a Duet mainboard via USB serial connection on Raspberry Pi.

## Features

- **CNC Control**: Position queries, movement commands, homing
- **G-code Execution**: Run files from SD card or send raw G-code
- **GPIO Control**: Read and write GPIO pins
- **System Management**: Shutdown and restart Raspberry Pi
- **Development Mode**: Test without physical hardware connection
- **REST API**: Clean JSON endpoints for all operations

## Prerequisites

- Node.js 24.10 or higher
- Raspberry Pi (for production deployment)
- Duet mainboard connected via USB (for production)

## Installation

### 1. Clone or Copy Project Files

Ensure you have all project files:
- `express.js` - Main application
- `duet.js` - Duet controller class
- `system.js` - System management class
- `routes.js` - API routes
- `tests.js` - Test suite
- `.env.sample` - Sample environment configuration

### 2. Install Dependencies

```bash
npm install express serialport @serialport/parser-readline dotenv
```

### 3. Configure Environment

Create a `.env` file from the sample:

```bash
cp .env.sample .env
```

Edit `.env` with your configuration:

```bash
# Server Configuration
PORT=3000

# Development Mode (set to true to run without physical Duet connection)
DEV_MODE=true

# Serial Port Configuration
SERIAL_PATH=/dev/ttyUSB0
BAUD_RATE=115200
COMMAND_TIMEOUT=5000

# CNC Machine Dimensions (in mm)
X_DIMENSION=200
Y_DIMENSION=200

# System Management
DEFAULT_SHUTDOWN_MINUTES=5
```

**Important:** Make sure your `package.json` includes `"type": "module"` to support ES6 imports. This should already be configured in the repository.

## About Gellyroller

The Gellyroller is a pen-plotter machine designed to create multi-color pen plotter artwork. Named after the beloved Gellyroll pens by Sakura, this machine brings digital designs to life with the smooth, vibrant ink that artists have trusted for years.

### Project Repository

- **GitHub**: https://github.com/dirtybirdnj/gellyroller
- **Hostname**: plotterbot.local
- **IP Address**: 192.168.4.35
- **API Port**: 3141

## Running the Server

### Development Mode (Local Testing)

For local development without a Duet mainboard:

```bash
# Using npm scripts
npm run dev

# Or directly
node express.js  # (with DEV_MODE=true in .env)
```

The server will simulate all Duet responses for testing.

### Production Mode (Raspberry Pi)

#### Step 1: Find Serial Port

Connect the Duet via USB and find the device path:

```bash
ls /dev/tty*
# Common paths: /dev/ttyUSB0, /dev/ttyACM0
```

#### Step 2: Configure Environment

Update `.env`:

```bash
DEV_MODE=false
SERIAL_PATH=/dev/ttyUSB0  # Use your actual device path
X_DIMENSION=300           # Your machine dimensions
Y_DIMENSION=400
```

#### Step 3: Setup Sudo Permissions (for system commands)

The system management features (shutdown/restart) require sudo. Create a sudoers file:

```bash
sudo visudo -f /etc/sudoers.d/duet-api
```

Add these lines (replace `pi` with your username):

```
pi ALL=(ALL) NOPASSWD: /sbin/shutdown
pi ALL=(ALL) NOPASSWD: /sbin/reboot
```

#### Step 4: Run Server with PM2

Install PM2 globally (if not already installed):

```bash
sudo npm install -g pm2
```

Start the application using npm scripts:

```bash
# Start with PM2
npm run pm2:start

# Or directly
pm2 start express.js --name gellyroller
```

Useful npm scripts for PM2:

```bash
npm run pm2:start       # Start the app
npm run pm2:restart     # Restart the app
npm run pm2:stop        # Stop the app
npm run pm2:logs        # View logs
npm run pm2:delete      # Delete the app from PM2
npm run pm2:save        # Save current PM2 process list
npm run pm2:startup     # Generate startup script
```

Other useful PM2 commands:

```bash
pm2 list                # List all processes
pm2 show gellyroller    # Show detailed info
pm2 monit               # Monitor CPU/Memory
```

Setup PM2 to start on boot:

```bash
npm run pm2:startup
# Follow the instructions output by the command

# Save current process list
npm run pm2:save
```

#### Step 5: Setup Nginx Reverse Proxy

Install Nginx:

```bash
sudo apt update
sudo apt install nginx
```

Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/gellyroller
```

Add the following configuration:

```nginx
server {
    listen 3141;
    server_name plotterbot.local 192.168.4.35;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for long-running operations
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/gellyroller /etc/nginx/sites-enabled/
```

Test Nginx configuration:

```bash
sudo nginx -t
```

Restart Nginx:

```bash
sudo systemctl restart nginx
```

Enable Nginx to start on boot:

```bash
sudo systemctl enable nginx
```

Check Nginx status:

```bash
sudo systemctl status nginx
```

#### Step 6: Test the Setup

Access the API through Nginx:

```bash
# From another machine on the network
curl http://plotterbot.local:3141/health
curl http://192.168.4.35:3141/health

# From the Pi itself
curl http://localhost:3141/health
```

## Access the API

Once deployed, you can access the API at:

- **Via hostname**: `http://plotterbot.local:3141`
- **Via IP**: `http://192.168.4.35:3141`
- **Locally on Pi**: `http://localhost:3141`

Example requests:

```bash
# Get position
curl http://plotterbot.local:3141/position

# Move to position
curl -X POST http://plotterbot.local:3141/goto/fast \
  -H "Content-Type: application/json" \
  -d '{"x": 100, "y": 50}'
```

## Running Tests

### Local Development

```bash
# Using npm scripts (with DEV_MODE simulation)
npm run test:dev

# Or with .env configuration
npm test

# Or directly
node tests.js
```

### On Raspberry Pi

Tests can run with or without a connected Duet:

```bash
# With simulated Duet
npm run test:dev

# With real Duet (DEV_MODE=false in .env)
npm test
```

## API Endpoints

### CNC Control

- `GET /position` - Get current XYZ position
- `GET /state` - Get full Duet state
- `GET /status` - Get status summary
- `POST /home` - Home all axes (or specific axes)
- `POST /goto/fast` - Rapid positioning (G0)
- `POST /goto/slow` - Controlled move (G1)
- `POST /pause` - Pause current operation
- `POST /cancel` - Cancel/stop operation
- `POST /emergency-stop` - Emergency stop

### G-code & Files

- `GET /sd/files` - List SD card files
- `GET /sd/info` - Get SD card information
- `POST /sd/upload` - Upload file to SD card
- `POST /execute` - Execute G-code file from SD
- `POST /gcode` - Send raw G-code command

### GPIO

- `POST /gpio/send` - Set GPIO pin value
- `GET /gpio/read` - Read GPIO pin

### Configuration

- `GET /config` - Get machine configuration
- `PUT /config` - Update machine configuration

### System Management

- `POST /system/shutdown` - Schedule system shutdown
- `POST /system/shutdown/cancel` - Cancel scheduled shutdown
- `POST /system/restart` - Restart Raspberry Pi
- `GET /system/uptime` - Get system uptime

### Health

- `GET /health` - Server health check

## API Usage Examples

All examples use the production endpoint. Replace with `localhost:3000` for local development.

### Get Position

```bash
curl http://plotterbot.local:3141/position
```

### Move to Position

```bash
curl -X POST http://plotterbot.local:3141/goto/fast \
  -H "Content-Type: application/json" \
  -d '{"x": 100, "y": 50, "z": 10}'
```

### Execute G-code File

```bash
curl -X POST http://plotterbot.local:3141/execute \
  -H "Content-Type: application/json" \
  -d '{"filename": "test.g"}'
```

### Upload File to SD Card

```bash
curl -X POST http://plotterbot.local:3141/sd/upload \
  -H "Content-Type: application/json" \
  -d '{"filename": "myfile.g", "content": "G28\nG0 X100 Y100\nM0"}'
```

### Send Raw G-code

```bash
curl -X POST http://plotterbot.local:3141/gcode \
  -H "Content-Type: application/json" \
  -d '{"command": "G28 X Y"}'
```

### Set GPIO

```bash
curl -X POST http://plotterbot.local:3141/gpio/send \
  -H "Content-Type: application/json" \
  -d '{"pin": 5, "value": 1}'
```

### Schedule Shutdown

```bash
curl -X POST http://plotterbot.local:3141/system/shutdown \
  -H "Content-Type: application/json" \
  -d '{"minutes": 10}'
```

## Project Structure

```
gellyroller/
├── express.js          # Main Express application
├── duet.js            # Duet controller class
├── system.js          # System management class
├── routes.js          # API route definitions
├── tests.js           # Test suite
├── kitchensink.html   # API test interface
├── .env               # Environment configuration (git ignored)
├── .env.sample        # Sample environment file
├── package.json       # Node.js dependencies
└── README.md          # This file
```

## Development Workflow

### 1. Local Development

```bash
# Set up environment
# Edit .env and set DEV_MODE=true

# Start server
npm run dev

# Run tests in another terminal
npm run test:dev

# Make changes and test
```

### 2. Deploy to Raspberry Pi

```bash
# Clone directly on the Pi
ssh pi@plotterbot.local
# or
ssh pi@192.168.4.35

cd ~
git clone https://github.com/dirtybirdnj/gellyroller.git
cd gellyroller

# Or copy from local machine
# (from your local machine)
git clone https://github.com/dirtybirdnj/gellyroller.git
cd gellyroller
scp -r * pi@plotterbot.local:~/gellyroller/

# On the Pi
ssh pi@plotterbot.local
cd ~/gellyroller

# Install dependencies
npm install

# Install PM2 globally if not already installed
sudo npm install -g pm2

# Configure for production
nano .env  # Set DEV_MODE=false, update SERIAL_PATH

# Start with PM2
npm run pm2:start
npm run pm2:save

# Set up Nginx (if not already configured)
# Follow "Setup Nginx Reverse Proxy" steps above
```

### 3. Testing Changes

```bash
# Test locally first
npm run dev

# Deploy to Pi and test
ssh pi@plotterbot.local
cd ~/duet-api
npm run pm2:restart
npm run pm2:logs

# Test specific endpoints
curl http://plotterbot.local:3141/position
curl http://plotterbot.local:3141/health
```

## Troubleshooting

### Serial Port Permission Denied

Add your user to the dialout group:

```bash
sudo usermod -a -G dialout $USER
# Log out and back in
```

### Port Already in Use

Check what's using the port:

```bash
# Check port 3000 (Node.js)
lsof -i :3000

# Check port 3141 (Nginx)
lsof -i :3141
```

Stop PM2 process:

```bash
pm2 stop gellyroller
pm2 delete gellyroller
```

Or restart Nginx:

```bash
sudo systemctl restart nginx
```

### Nginx Not Working

Check Nginx status and logs:

```bash
sudo systemctl status nginx
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

Restart Nginx:

```bash
sudo systemctl restart nginx
```

### PM2 Process Keeps Crashing

Check logs:

```bash
npm run pm2:logs
# Or with line limit
pm2 logs gellyroller --lines 100
```

Check for errors:

```bash
pm2 show gellyroller
```

Restart with fresh logs:

```bash
npm run pm2:restart
pm2 flush  # Clear old logs
```

### Can't Access via plotterbot.local

Ensure mDNS/Avahi is running:

```bash
sudo systemctl status avahi-daemon
sudo systemctl restart avahi-daemon
```

Use IP address instead:

```bash
curl http://192.168.4.35:3141/health
```

### System Commands Not Working

Ensure sudo permissions are configured correctly (see Production Mode Step 3).

### Duet Not Responding

1. Check serial connection: `ls /dev/tty*`
2. Verify correct device in `.env`
3. Check permissions: `ls -l /dev/ttyUSB0`
4. Try connecting directly: `screen /dev/ttyUSB0 115200`
5. Check PM2 logs: `npm run pm2:logs`

### System Commands Require Password

Make sure sudoers file is configured correctly (see Production Mode Step 3).

## NPM Scripts Reference

```bash
npm start              # Start server (uses .env settings)
npm run dev            # Start in development mode (simulated Duet)
npm test               # Run tests (uses .env settings)
npm run test:dev       # Run tests in development mode

npm run pm2:start      # Start app with PM2
npm run pm2:restart    # Restart PM2 app
npm run pm2:stop       # Stop PM2 app
npm run pm2:logs       # View PM2 logs
npm run pm2:delete     # Remove app from PM2
npm run pm2:save       # Save PM2 process list
npm run pm2:startup    # Generate PM2 startup script
```

## Quick Reference

### NPM Commands

```bash
npm start                  # Start server
npm run dev                # Development mode
npm test                   # Run tests
npm run test:dev           # Run tests (dev mode)
npm run pm2:start          # Start with PM2
npm run pm2:restart        # Restart PM2
npm run pm2:stop           # Stop PM2
npm run pm2:logs           # View PM2 logs
```

### PM2 Commands

```bash
pm2 start express.js --name gellyroller    # Start
pm2 restart gellyroller                    # Restart
pm2 stop gellyroller                       # Stop
pm2 logs gellyroller                       # View logs
pm2 monit                                  # Monitor resources
pm2 list                                   # List all processes
pm2 save                                   # Save process list
pm2 startup                                # Enable startup on boot
```

### Nginx Commands

```bash
sudo systemctl status nginx             # Check status
sudo systemctl restart nginx            # Restart
sudo nginx -t                          # Test configuration
sudo tail -f /var/log/nginx/error.log  # View error logs
sudo tail -f /var/log/nginx/access.log # View access logs
```

### Deployment Checklist

- [ ] Files copied to Pi
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` configured (DEV_MODE=false, correct SERIAL_PATH)
- [ ] Serial port permissions set
- [ ] Sudo permissions configured for system commands
- [ ] PM2 installed globally
- [ ] App started with PM2
- [ ] PM2 startup configured
- [ ] Nginx installed
- [ ] Nginx site configured
- [ ] Nginx site enabled
- [ ] Nginx restarted
- [ ] Test endpoints working
- [ ] Access via hostname and IP confirmed

## Support

For issues or questions, check:
1. PM2 logs: `pm2 logs duet-api`
2. Nginx logs: `/var/log/nginx/error.log`
3. Serial connection: `ls -l /dev/tty*`
4. Network connectivity: `ping plotterbot.local`