#!/bin/bash
cd "$(dirname "$0")"

echo "Stopping anything already listening on port 3100..."
pids=$(lsof -ti tcp:3100 2>/dev/null)
if [ -n "$pids" ]; then
  kill -9 $pids 2>/dev/null
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found on PATH. Install Node.js, then run this file again."
  read -r -p "Press Enter to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  if ! npm install; then
    echo "npm install failed."
    read -r -p "Press Enter to close..."
    exit 1
  fi
fi

echo "Starting HVAC Project Planner at http://localhost:3100"
echo "The browser will open when the server is ready."
echo "Close this window to stop the server."

(
  for i in $(seq 1 80); do
    if nc -z 127.0.0.1 3100 2>/dev/null; then
      open "http://localhost:3100"
      exit 0
    fi
    sleep 0.5
  done
) &

npm run dev
status=$?
if [ $status -ne 0 ]; then
  read -r -p "Press Enter to close..."
fi
exit $status
