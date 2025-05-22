
#!/bin/bash
echo "--- Starting Superset Backend ---"

# Navigate to the project directory (adjust if your folder name is different)
PROJECT_DIR=~/superset-4.1.2
cd "$PROJECT_DIR" || { echo "Failed to cd into $PROJECT_DIR"; exit 1; }
echo "Changed directory to $(pwd)"

# Activate Python virtual environment
echo "Activating venv..."
source venv/bin/activate || { echo "Failed to activate venv"; exit 1; }

# Set the configuration path
echo "Exporting SUPERSET_CONFIG_PATH..."
export SUPERSET_CONFIG_PATH="$PROJECT_DIR/custom_files/superset_config.py"

# Run the backend server
echo "Starting Superset server on port 5000..."
superset run -p 5000 -h 0.0.0.0 --with-threads --reload --debugger

echo "--- Superset Backend stopped ---"
# Deactivate venv when server stops (optional)
# deactivate
