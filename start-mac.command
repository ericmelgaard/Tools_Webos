#!/bin/bash
cd "$(dirname "$0")"

echo "================================"
echo "  LG Device Lookup - Starting"
echo "================================"
echo ""

if ! command -v node &> /dev/null; then
    echo "Node.js is not installed on this computer."
    echo ""
    echo "Please install it first from https://nodejs.org"
    echo "(choose the LTS version, click through the installer with defaults)"
    echo ""
    echo "Then double-click this file again."
    read -p "Press Enter to close..."
    exit 1
fi

if [ ! -f ".env" ]; then
    echo "ERROR: .env file not found in this folder."
    echo "This should have been included when you got this app - contact"
    echo "whoever shared it with you."
    read -p "Press Enter to close..."
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "First-time setup - installing dependencies, this may take a minute..."
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "Something went wrong during setup. Please contact whoever shared"
        echo "this app with you and share the error above."
        read -p "Press Enter to close..."
        exit 1
    fi
    echo ""
fi

echo "Starting the app..."
echo ""
echo "Once you see 'running at http://localhost:3000' below,"
echo "open your browser and go to: http://localhost:3000"
echo ""
echo "Leave this window open while you use the app."
echo "Close this window (or press Ctrl+C) to stop the app."
echo ""

( sleep 3 && open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null ) &

npm start
