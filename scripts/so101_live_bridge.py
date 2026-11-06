#!/usr/bin/env python3
"""Stream the SO-101's joint angles to the site's 3D view while I work with the robot.

ROS 2 /joint_states -> MQTT (public HiveMQ broker) -> the "Now Building" card, which shows
"● LIVE" while messages arrive and goes back to its idle sway when they stop.
Run it by hand when wanted (scripts/so101_live.sh); nothing is sent otherwise.

    <TOPIC_ROOT>/joints  {"t": unix time, "q": {joint: rad, ...}}  at RATE_HZ, QoS 0, not retained
    <TOPIC_ROOT>/status  "online" / "offline"  retained; "offline" is also the last will

The broker is public: anyone can read these topics (and write to them; the page only accepts
known joint names with sane values). Nothing but joint angles is ever sent.
"""

import argparse
import json
import math
import threading
import time

import paho.mqtt.client as mqtt
import rclpy
from rclpy.executors import ExternalShutdownException
from rclpy.node import Node
from sensor_msgs.msg import JointState

BROKER = "broker.hivemq.com"
PORT = 1883
TOPIC_ROOT = "enesbirlik/so101/live/v1"
RATE_HZ = 10.0
JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]


class Bridge(Node):
    def __init__(self, client, rate):
        super().__init__("so101_live_bridge")
        self.client = client
        self.latest = None
        self.lock = threading.Lock()
        self.sent = 0
        self.create_subscription(JointState, "/joint_states", self.on_state, 10)
        self.create_timer(1.0 / rate, self.publish)
        self.create_timer(10.0, self.report)

    def on_state(self, msg):
        q = {n: p for n, p in zip(msg.name, msg.position) if n in JOINTS and math.isfinite(p)}
        if q:
            with self.lock:
                self.latest = {**(self.latest or {}), **q}

    def publish(self):
        with self.lock:
            q = self.latest
        if q is None:
            return
        payload = json.dumps({"t": round(time.time(), 3), "q": {n: round(v, 4) for n, v in q.items()}})
        self.client.publish(f"{TOPIC_ROOT}/joints", payload, qos=0)
        self.sent += 1

    def report(self):
        self.get_logger().info(f"{self.sent} messages sent" if self.latest else "waiting for /joint_states")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rate", type=float, default=RATE_HZ, help=f"messages per second (default {RATE_HZ:g})")
    args = parser.parse_args()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"so101-live-{int(time.time())}")
    client.will_set(f"{TOPIC_ROOT}/status", "offline", qos=1, retain=True)
    client.on_connect = lambda c, u, f, rc, p: c.publish(f"{TOPIC_ROOT}/status", "online", qos=1, retain=True)
    client.connect(BROKER, PORT, keepalive=30)
    client.loop_start()
    print(f"streaming /joint_states to mqtt://{BROKER}/{TOPIC_ROOT}/joints, Ctrl+C stops")

    rclpy.init()
    node = Bridge(client, args.rate)
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, ExternalShutdownException):   # Ctrl+C / robot_live off
        pass
    finally:
        client.publish(f"{TOPIC_ROOT}/status", "offline", qos=1, retain=True).wait_for_publish(2)
        client.loop_stop()
        client.disconnect()
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == "__main__":
    main()
