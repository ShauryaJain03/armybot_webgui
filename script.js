// Global variables
let ros;
let cmdVelTopic;
let odomTopic;
let joystick;
let isConnected = false;
let startTime = Date.now();
let totalDistance = 0;
let lastPosition = { x: 0, y: 0 };

// Connect to ROS
function connectToROS() {
    const rosbridgeAddress = document.getElementById('rosbridge-address').value;
    
    if (ros) {
        ros.close();
    }
    
    ros = new ROSLIB.Ros({
        url: rosbridgeAddress
    });

    ros.on('connection', function () {
        console.log('Connected to rosbridge server.');
        isConnected = true;
        updateConnectionStatus(true);
        setupTopics();
        setupJoystick();
    });

    ros.on('error', function (error) {
        console.error('Error connecting to rosbridge server:', error);
        isConnected = false;
        updateConnectionStatus(false);
    });

    ros.on('close', function () {
        console.log('Connection to rosbridge server closed.');
        isConnected = false;
        updateConnectionStatus(false);
    });
}

// Disconnect from ROS
function disconnectFromROS() {
    if (ros) {
        ros.close();
        ros = null;
    }
    if (joystick) {
        joystick.destroy();
        joystick = null;
    }
    isConnected = false;
    updateConnectionStatus(false);
}

// Update connection status in UI
function updateConnectionStatus(connected) {
    const statusDot = document.getElementById('ros-status-dot');
    const statusText = document.getElementById('ros-status-text');
    
    if (connected) {
        statusDot.classList.add('connected');
        statusText.textContent = 'ROS Connected';
    } else {
        statusDot.classList.remove('connected');
        statusText.textContent = 'ROS Disconnected';
    }
}

// Setup ROS topics
function setupTopics() {
    // Set up cmd_vel topic for publishing commands
    cmdVelTopic = new ROSLIB.Topic({
        ros: ros,
        name: '/bot_controller/cmd_vel_unstamped',
        messageType: 'geometry_msgs/Twist'
    });

    // Set up odometry topic for receiving position/velocity data
    odomTopic = new ROSLIB.Topic({
        ros: ros,
        name: '/bot_controller/odom',
        messageType: 'nav_msgs/Odometry'
    });

    // Subscribe to odometry messages
    odomTopic.subscribe(function (message) {
        updateOdometryDisplay(message);
    });
}

// Update odometry display
function updateOdometryDisplay(odomMsg) {
    // Position
    const pos = odomMsg.pose.pose.position;
    document.getElementById('position-x').textContent = pos.x.toFixed(2) + ' m';
    document.getElementById('position-y').textContent = pos.y.toFixed(2) + ' m';
    document.getElementById('position-z').textContent = pos.z.toFixed(2) + ' m';

    // Calculate heading from quaternion
    const orientation = odomMsg.pose.pose.orientation;
    const heading = Math.atan2(
        2 * (orientation.w * orientation.z + orientation.x * orientation.y),
        1 - 2 * (orientation.y * orientation.y + orientation.z * orientation.z)
    );
    const headingDeg = (heading * 180 / Math.PI + 360) % 360;
    document.getElementById('heading').textContent = headingDeg.toFixed(0) + '°';

    // Velocity
    const vel = odomMsg.twist.twist;
    document.getElementById('velocity-linear').textContent = vel.linear.x.toFixed(2) + ' m/s';
    document.getElementById('velocity-angular').textContent = vel.angular.z.toFixed(2) + ' rad/s';
    
    // Calculate current speed (magnitude of linear velocity)
    const speed = Math.sqrt(vel.linear.x * vel.linear.x + vel.linear.y * vel.linear.y);
    document.getElementById('current-speed').textContent = speed.toFixed(2) + ' m/s';

    // Update total distance
    const dx = pos.x - lastPosition.x;
    const dy = pos.y - lastPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 0.01) { // Only update if significant movement
        totalDistance += distance;
        document.getElementById('total-distance').textContent = totalDistance.toFixed(2) + ' m';
        lastPosition = { x: pos.x, y: pos.y };
    }
}

// Setup joystick controller
function setupJoystick() {
    if (joystick) {
        joystick.destroy();
    }

    const options = {
        zone: document.getElementById('joystick-zone'),
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: '#2563eb',
        size: 150,
        threshold: 0.1
    };

    joystick = nipplejs.create(options);

    joystick.on('move', function (evt, data) {
        if (!isConnected || !cmdVelTopic) return;

        const maxSpeed = parseFloat(document.getElementById('speedSlider').value);
        const maxTurn = 1.5;

        const linear = Math.sin(data.angle.radian) * maxSpeed * data.distance / 75;
        const angular = -Math.cos(data.angle.radian) * maxTurn * data.distance / 75;

        const twist = new ROSLIB.Message({
            linear: { x: linear, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: angular }
        });


        cmdVelTopic.publish(twist);

        // Update command display
        document.getElementById('cmd-linear').textContent = linear.toFixed(2) + ' m/s';
        document.getElementById('cmd-angular').textContent = angular.toFixed(2) + ' rad/s';
    });

    joystick.on('end', function () {
        if (!isConnected || !cmdVelTopic) return;

        // Stop the robot when joystick is released
        const twist = new ROSLIB.Message({
            linear: { x: 0, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: 0 }
        });

        cmdVelTopic.publish(twist);

        // Update command display
        document.getElementById('cmd-linear').textContent = '0.00 m/s';
        document.getElementById('cmd-angular').textContent = '0.00 rad/s';
    });
}

// Emergency stop function
function emergencyStop() {
    if (!isConnected || !cmdVelTopic) return;

    const twist = new ROSLIB.Message({
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 }
    });

    cmdVelTopic.publish(twist);
    
    // Update command display
    document.getElementById('cmd-linear').textContent = '0.00 m/s';
    document.getElementById('cmd-angular').textContent = '0.00 rad/s';
}

// Update runtime display
function updateRuntime() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('runtime').textContent = 
        String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

// Initialize the interface
document.addEventListener('DOMContentLoaded', function() {
    // Mode selection
    const modeButtons = document.querySelectorAll('.mode-btn');
    const manualControls = document.getElementById('manualControls');
    const gpsControls = document.getElementById('gpsControls');
    
    modeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            modeButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const mode = this.dataset.mode;
            document.getElementById('currentMode').textContent = this.textContent;
            
            // Show/hide controls
            manualControls.style.display = mode === 'manual' ? 'block' : 'none';
            gpsControls.style.display = mode === 'gps' ? 'block' : 'none';
        });
    });

    // View toggles
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            toggleButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Speed slider
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    speedSlider.addEventListener('input', function() {
        speedValue.textContent = this.value + ' m/s';
    });

    // Update runtime every second
    setInterval(updateRuntime, 1000);
});