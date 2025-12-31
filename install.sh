#!/bin/bash
#
# Gellyroller Installation Script
# Idempotent installer for Raspberry Pi
#
# Usage: curl -sSL https://raw.githubusercontent.com/dirtybirdnj/gellyroller/main/install.sh | sudo bash
#    or: sudo ./install.sh
#
set -e

# Configuration
APP_NAME="gellyroller"
APP_USER="gellyroller"
APP_GROUP="gellyroller"
APP_DIR="/opt/gellyroller"
DATA_DIR="/var/lib/gellyroller"
CONFIG_DIR="/etc/gellyroller"
LOG_DIR="/var/log/gellyroller"
REPO_URL="https://github.com/dirtybirdnj/gellyroller.git"
NODE_VERSION="20"  # LTS version

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

log_info "Starting Gellyroller installation..."

# ============================================================================
# 1. Create system user and group
# ============================================================================
log_info "Setting up system user and group..."

if ! getent group "$APP_GROUP" > /dev/null 2>&1; then
    groupadd --system "$APP_GROUP"
    log_info "Created group: $APP_GROUP"
else
    log_info "Group $APP_GROUP already exists"
fi

if ! id "$APP_USER" > /dev/null 2>&1; then
    useradd --system --gid "$APP_GROUP" --shell /usr/sbin/nologin \
        --home-dir "$APP_DIR" --no-create-home "$APP_USER"
    log_info "Created user: $APP_USER"
else
    log_info "User $APP_USER already exists"
fi

# Add gellyroller user to dialout group for serial port access
usermod -a -G dialout "$APP_USER"
log_info "Added $APP_USER to dialout group"

# ============================================================================
# 2. Create directory structure
# ============================================================================
log_info "Creating directory structure..."

mkdir -p "$APP_DIR"
mkdir -p "$DATA_DIR/images"
mkdir -p "$DATA_DIR/jobs"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"

# ============================================================================
# 3. Install Node.js if not present
# ============================================================================
log_info "Checking Node.js installation..."

if ! command -v node > /dev/null 2>&1; then
    log_info "Installing Node.js $NODE_VERSION..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
else
    CURRENT_NODE=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    log_info "Node.js v$(node --version | cut -d'v' -f2) already installed"
    if [[ "$CURRENT_NODE" -lt 18 ]]; then
        log_warn "Node.js version is older than v18, consider upgrading"
    fi
fi

# ============================================================================
# 4. Install system dependencies
# ============================================================================
log_info "Installing system dependencies..."

apt-get update -qq
apt-get install -y --no-install-recommends \
    git \
    nginx \
    fswebcam \
    curl

# ============================================================================
# 5. Clone or update repository
# ============================================================================
log_info "Setting up application code..."

if [[ -d "$APP_DIR/.git" ]]; then
    log_info "Updating existing installation..."
    cd "$APP_DIR"
    sudo -u "$APP_USER" git fetch origin 2>/dev/null || git fetch origin
    sudo -u "$APP_USER" git reset --hard origin/main 2>/dev/null || git reset --hard origin/main
else
    log_info "Cloning repository..."
    rm -rf "$APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

# ============================================================================
# 6. Install Node.js dependencies
# ============================================================================
log_info "Installing Node.js dependencies..."

npm install --omit=dev --quiet

# ============================================================================
# 7. Create configuration file
# ============================================================================
log_info "Setting up configuration..."

if [[ ! -f "$CONFIG_DIR/gellyroller.env" ]]; then
    cat > "$CONFIG_DIR/gellyroller.env" << 'EOF'
# Gellyroller Configuration
# Edit this file and restart the service: sudo systemctl restart gellyroller

# Server
PORT=3000

# Serial connection to Duet
SERIAL_PATH=/dev/ttyACM0
BAUD_RATE=115200
COMMAND_TIMEOUT=5000

# Machine dimensions (mm) - update to match your plotter
X_DIMENSION=480
Y_DIMENSION=480

# Data directories (managed by installer)
WEBCAM_IMAGE_DIR=/var/lib/gellyroller/images
JOB_DATA_DIR=/var/lib/gellyroller/jobs

# Webcam
WEBCAM_DEVICE=/dev/video0
WEBCAM_WIDTH=1920
WEBCAM_HEIGHT=1080
WEBCAM_QUALITY=95
WEBCAM_SKIP=5
WEBCAM_DELAY=1

# System
DEFAULT_SHUTDOWN_MINUTES=5
DEV_MODE=false
EOF
    log_info "Created default configuration at $CONFIG_DIR/gellyroller.env"
else
    log_info "Configuration file already exists, preserving settings"
fi

# Symlink config to app directory
ln -sf "$CONFIG_DIR/gellyroller.env" "$APP_DIR/.env"

# ============================================================================
# 8. Create systemd service
# ============================================================================
log_info "Installing systemd service..."

cat > /etc/systemd/system/gellyroller.service << EOF
[Unit]
Description=Gellyroller Pen Plotter API
Documentation=https://github.com/dirtybirdnj/gellyroller
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
EnvironmentFile=$CONFIG_DIR/gellyroller.env
ExecStart=/usr/bin/node $APP_DIR/express.js
Restart=on-failure
RestartSec=10
StandardOutput=append:$LOG_DIR/gellyroller.log
StandardError=append:$LOG_DIR/gellyroller-error.log

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR $LOG_DIR

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
log_info "Systemd service installed"

# ============================================================================
# 9. Configure nginx
# ============================================================================
log_info "Configuring nginx..."

cat > /etc/nginx/sites-available/gellyroller << 'EOF'
server {
    listen 80;
    server_name plotterbot.local _;

    root /opt/gellyroller;
    index status.html index.html;

    # Serve static HTML files
    location / {
        try_files $uri $uri/ @api;
    }

    # Serve captured images
    location /images/ {
        alias /var/lib/gellyroller/images/;
        autoindex on;
    }

    # Legacy /img path for compatibility
    location /img/ {
        alias /var/lib/gellyroller/images/;
        autoindex on;
    }

    # Proxy API requests to Node.js
    location @api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # API endpoints explicitly
    location ~ ^/(health|position|state|status|home|goto|pause|cancel|gcode|execute|sd|job|webcam|system|config|emergency-stop) {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/gellyroller /etc/nginx/sites-enabled/gellyroller

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
if nginx -t 2>/dev/null; then
    log_info "Nginx configuration valid"
else
    log_error "Nginx configuration invalid!"
    exit 1
fi

# ============================================================================
# 10. Set permissions
# ============================================================================
log_info "Setting permissions..."

chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"
chown -R "$APP_USER:$APP_GROUP" "$DATA_DIR"
chown -R "$APP_USER:$APP_GROUP" "$LOG_DIR"
chown -R root:root "$CONFIG_DIR"
chmod 644 "$CONFIG_DIR/gellyroller.env"

# ============================================================================
# 11. Configure sudo for system commands (shutdown/restart)
# ============================================================================
log_info "Configuring sudo permissions..."

cat > /etc/sudoers.d/gellyroller << EOF
# Allow gellyroller to shutdown/restart the system
$APP_USER ALL=(ALL) NOPASSWD: /sbin/shutdown, /sbin/reboot
EOF
chmod 440 /etc/sudoers.d/gellyroller

# ============================================================================
# 12. Enable and start services
# ============================================================================
log_info "Starting services..."

systemctl enable gellyroller
systemctl restart gellyroller

systemctl enable nginx
systemctl restart nginx

# ============================================================================
# 13. Create log rotation
# ============================================================================
cat > /etc/logrotate.d/gellyroller << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 $APP_USER $APP_GROUP
    sharedscripts
    postrotate
        systemctl reload gellyroller > /dev/null 2>&1 || true
    endscript
}
EOF

# ============================================================================
# Complete!
# ============================================================================
echo ""
echo "=============================================="
log_info "Gellyroller installation complete!"
echo "=============================================="
echo ""
echo "Service status:"
systemctl status gellyroller --no-pager -l | head -10
echo ""
echo "Access points:"
echo "  Web UI:     http://plotterbot.local/status.html"
echo "  API:        http://plotterbot.local/health"
echo "  WebSocket:  ws://plotterbot.local/ws"
echo ""
echo "Useful commands:"
echo "  View logs:      sudo journalctl -u gellyroller -f"
echo "  Restart:        sudo systemctl restart gellyroller"
echo "  Edit config:    sudo nano $CONFIG_DIR/gellyroller.env"
echo ""
echo "Configuration: $CONFIG_DIR/gellyroller.env"
echo "Logs:          $LOG_DIR/"
echo "Images:        $DATA_DIR/images/"
echo ""
