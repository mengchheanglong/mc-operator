#!/bin/bash
# OpenClaw-optimized startup for Digital Twin Mission Control
# Port: 3100 (permanent)

# Check if already running on port 3100
if curl -fsS http://localhost:3100/ > /dev/null 2>&1; then
    echo "✓ Mission Control already running on port 3100"
    exit 0
fi

cd "$(dirname "$0")"

# Set Node.js memory limits for low-resource environments
export NODE_OPTIONS="--max-old-space-size=1024"

# Reduce file watchers
export WATCHPACK_POLLING=true

# Clean cache to free memory before start
rm -rf .next/cache 2>/dev/null

echo "================================"
echo "Mission Control - Port 3100"
echo "OpenClaw Gateway Auto-Start"
echo "================================"
echo ""

# Run Next.js dev server on port 3100
exec npx next dev -p 3100
