# Subbots Development Setup (Ubuntu 20.04)

A guide for setting up and running the Steelhead Gazebo simulation and Lichtblick extension development environment on Ubuntu 20.04 with ROS2 Foxy.

---

## Prerequisites

### Required Software
- ROS2 Foxy
- Python 3.8+
- Node.js + Yarn
- Gazebo
- pynput (for keyboard control)
- rosbridge-suite (for Lichtblick connection)

---

## One-Time Installation

### 1. ROS2 Foxy
Follow the official guide: https://docs.ros.org/en/foxy/Installation.html

### 2. pynput (keyboard control in Gazebo)
```bash
pip3 install pynput
python3 -c "import pynput; print('ok')"  # verify
```

### 3. rosbridge (Lichtblick ↔ ROS2 bridge)
```bash
sudo apt install ros-foxy-rosbridge-suite
```

### 4. Node.js + Yarn (for Lichtblick)
```bash
# Install Node.js (v16+ recommended)
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g yarn
```

### 5. Lichtblick dependencies
```bash
cd /path/to/lichtblick
yarn install
```

### 6. Build the Steelhead workspace
```bash
cd /path/to/steelhead
source /opt/ros/foxy/setup.bash
colcon build
```

---

## Daily Workflow

### Option A — Full stack (Gazebo + Lichtblick)
Use the master launcher script:
```bash
~/scripts/subbots/launch.sh
```

### Option B — Just Gazebo/ROS
```bash
~/scripts/subbots/steelhead.sh
```

### Option C — Just Lichtblick
```bash
~/scripts/subbots/lichtblick.sh
```

---

## Connecting Lichtblick to the Simulation

1. Make sure rosbridge is running (the steelhead script handles this)
2. Open Lichtblick
3. Click **Open Connection**
4. Select **Rosbridge (ROS 1 & 2)**
5. Enter URL: `ws://localhost:9090`
6. Click **Connect**

Your ROS topics will now appear in Lichtblick's left panel.

---

## Keyboard Control in Gazebo

Keyboard input uses `pynput`. Make sure:
- `pynput` is installed (`pip3 install pynput`)
- The **teleop terminal has focus** (click on it after launching)
- `echo $DISPLAY` returns something like `:1` (not empty)
- Teleop is run in a **separate terminal**, not inside the launch file

If using a custom teleop node, run it manually:
```bash
source /opt/ros/foxy/setup.bash
source /path/to/steelhead/install/setup.bash
ros2 run <your_teleop_package> <your_teleop_node>
```

---

## Project Structure

```
/path/to/steelhead/         # ROS2 workspace (Gazebo simulation)
├── src/
│   └── steelhead_gazebo/
└── install/

/path/to/lichtblick/        # Lichtblick extension development
```

```
~/scripts/subbots/
├── launch.sh           # Master launcher (Gazebo + Lichtblick)
├── steelhead.sh        # Gazebo + rosbridge only
└── lichtblick.sh       # Lichtblick only
```

## Steelhead Integration
Be sure to use the lichtblick_gazebo_launch.py in steelhead bringup (can be found in lichtblick branch of steelhead)