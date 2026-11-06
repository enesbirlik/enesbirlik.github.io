#!/bin/sh
# Show the real SO-101 on the site while it runs (Ctrl+C stops). Needs the robot's ROS 2
# stack running (it reads /joint_states) and, once, the venv:
#   python3 -m venv --system-site-packages ~/.venvs/so101-live && ~/.venvs/so101-live/bin/pip install paho-mqtt
set -e
. /opt/ros/jazzy/setup.sh
exec "$HOME/.venvs/so101-live/bin/python" "$(dirname "$0")/so101_live_bridge.py" "$@"
