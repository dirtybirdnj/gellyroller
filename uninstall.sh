#!/bin/bash
#
# Gellyroller Uninstall Script
# Cleanly removes Gellyroller from the system
#
set -e

APP_NAME="gellyroller"
APP_USER="gellyroller"
APP_GROUP="gellyroller"
APP_DIR="/opt/gellyroller"
DATA_DIR="/var/lib/gellyroller"
CONFIG_DIR="/etc/gellyroller"
LOG_DIR="/var/log/gellyroller"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}[ERROR]${NC} This script must be run as root (use sudo)"
   exit 1
fi

echo ""
echo "This will remove Gellyroller from your system."
echo ""
read -p "Remove application code and service? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Stopping and disabling service..."
    systemctl stop gellyroller 2>/dev/null || true
    systemctl disable gellyroller 2>/dev/null || true
    rm -f /etc/systemd/system/gellyroller.service
    systemctl daemon-reload

    log_info "Removing nginx configuration..."
    rm -f /etc/nginx/sites-enabled/gellyroller
    rm -f /etc/nginx/sites-available/gellyroller
    systemctl reload nginx 2>/dev/null || true

    log_info "Removing application directory..."
    rm -rf "$APP_DIR"

    log_info "Removing sudo configuration..."
    rm -f /etc/sudoers.d/gellyroller

    log_info "Removing logrotate configuration..."
    rm -f /etc/logrotate.d/gellyroller
fi

read -p "Remove configuration files? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Removing configuration..."
    rm -rf "$CONFIG_DIR"
fi

read -p "Remove data (images, jobs)? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Removing data directory..."
    rm -rf "$DATA_DIR"
fi

read -p "Remove log files? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Removing logs..."
    rm -rf "$LOG_DIR"
fi

read -p "Remove gellyroller system user? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Removing user and group..."
    userdel "$APP_USER" 2>/dev/null || true
    groupdel "$APP_GROUP" 2>/dev/null || true
fi

echo ""
log_info "Uninstall complete!"
echo ""
echo "Note: Node.js and nginx were NOT removed."
echo "Remove them manually if no longer needed:"
echo "  sudo apt remove nodejs nginx"
echo ""
