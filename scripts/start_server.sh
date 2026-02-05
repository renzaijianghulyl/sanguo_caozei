#!/bin/bash

echo "Starting adjudication server..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 16 or higher."
    exit 1
fi

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi

# Start the server
echo "Server starting on port 3000..."
echo "Open another terminal to test with:"
echo "  ./test_api.sh"
echo ""
echo "Press Ctrl+C to stop the server"

node src/server/index.js