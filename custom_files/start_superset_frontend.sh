#!/bin/bash
echo "--- Starting Superset Frontend ---"

# Source NVM to make 'nvm' command available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Set the desired Node version
echo "Setting Node version (using default)..."
nvm use default || { echo "Failed to set Node version"; exit 1; } # Assumes default is v20+
# Alternatively, use: nvm use 20 || exit 1;

# Navigate to the frontend directory (adjust if needed)
FRONTEND_DIR=~/superset-4.1.2/superset-frontend
cd "$FRONTEND_DIR" || { echo "Failed to cd into $FRONTEND_DIR"; exit 1; }
echo "Changed directory to $(pwd)"

# Run the frontend dev server
echo "Starting npm dev-server on port 9000..."
npm run dev-server

echo "--- Superset Frontend stopped ---"

