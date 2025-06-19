let ros;
let cmdVelTopic;
let odomTopic;
let joystick;
let isConnected = false;
let startTime = Date.now();
let totalDistance = 0;
let lastPosition = { x: 0, y: 0 };
let setModeService;
let currentMode = 'manual'; // Track current mode

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
        setupServices();
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

function disconnectFromROS() {
    if (ros) {
        ros.close();
        ros = null;
    }
    if (joystick) {
        joystick.destroy();
        joystick = null;
    }
    setModeService = null;
    isConnected = false;
    updateConnectionStatus(false);
}

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


function setupServices() {
    setModeService = new ROSLIB.Service({
        ros: ros,
        name: '/set_mode',
        serviceType: 'bot_msgs/srv/SetMode'
    });
}

function setupTopics() {
    // Setup cmd_vel topic for publishing commands
    cmdVelTopic = new ROSLIB.Topic({
        ros: ros,
        name: '/bot_controller/cmd_vel_unstamped',
        messageType: 'geometry_msgs/Twist'
    });

    // Setup odometry topic for receiving position/velocity data
    odomTopic = new ROSLIB.Topic({
        ros: ros,
        name: '/bot_controller/odom',
        messageType: 'nav_msgs/Odometry'
    });

    navsatTopic = new ROSLIB.Topic({
        ros:ros,
        name:'/navsat',
        messageType: 'sensor_msgs/msg/NavSatFix'
    })

    odomTopic.subscribe(function (message) {
        updateOdometryDisplay(message);
    });

    navsatTopic.subscribe(function (message) {
        const { latitude, longitude, altitude } = message;

        document.getElementById('lat-display').textContent = latitude.toFixed(6);
        document.getElementById('lon-display').textContent = longitude.toFixed(6);
        document.getElementById('alt-display').textContent = altitude.toFixed(2);
    });
    
}

function setMode(modeName) {
    if (!isConnected || !setModeService) {
        console.error('ROS not connected or service not available');
        updateModeStatus('Error: Not connected to ROS', false);
        return;
    }

    const request = new ROSLIB.ServiceRequest({
        mode_name: modeName
    });

    updateModeStatus(`Setting mode to ${modeName}...`, null);

    setModeService.callService(request, function(result) {
        console.log('Service call result:', result);
        
        if (result.success) {
            console.log(`Successfully set mode to: ${modeName}`);
            currentMode = modeName; // Update current mode BEFORE calling toggle controls
            updateModeStatus(`Mode: ${modeName}`, true);
            updateCurrentModeDisplay(modeName);
            updateActiveModeButton(modeName);
            toggleControlsForMode(modeName); // This will now use the updated currentMode
        } else {
            console.error('Service call failed:', result.message);
            updateModeStatus(`Error: ${result.message}`, false);
        }
    }, function(error) {
        console.error('Service call error:', error);
        updateModeStatus('Error: Service call failed', false);
    });
}


function updateActiveModeButton(modeName) {
    // Remove active class from all mode buttons
    const modeButtons = document.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.style.backgroundColor = ''; // Reset to default
        btn.style.color = ''; // Reset to default
    });

    // Find and activate the current mode button
    const modeMap = {
        'manual': 'Manual',
        'follow': 'Follow Human',
        'gps_waypoint': 'GPS Navigation',
        'explore': 'Explore',
        'return_home': 'Return Home'
    };

    const targetText = modeMap[modeName] || modeName;
    
    modeButtons.forEach(btn => {
        const btnText = btn.textContent.trim();
        if (btnText === targetText) {
            btn.classList.add('active');
            btn.style.backgroundColor = '#2563eb'; // Blue background
            btn.style.color = 'white'; // White text
        }
    });
}

function updateCurrentModeDisplay(modeName) {
    const modeMap = {
        'manual': 'Manual',
        'follow': 'Follow Human',
        'gps_waypoint': 'GPS Navigation',
        'explore': 'Explore',
        'return_home': 'Return Home'
    };
    
    const displayName = modeMap[modeName] || modeName;
    document.getElementById('currentMode').textContent = displayName;
}

function toggleControlsForMode(modeName) {
    const manualControls = document.getElementById('manualControls');
    const gpsControls = document.getElementById('gpsControls');
    
    // Hide all controls first
    manualControls.style.display = 'none';
    gpsControls.style.display = 'none';
    
    // Show relevant controls and setup joystick if needed
    switch(modeName) {
        case 'manual':
            manualControls.style.display = 'block';
            if (isConnected) {
                setupJoystick();
            }
            break;
        case 'gps_waypoint':
            gpsControls.style.display = 'block';
            break;
        case 'follow':
        case 'explore':
        case 'return_home':
            if (joystick) {
                joystick.destroy();
                joystick = null;
            }
            break;
    }
}


function updateModeStatus(message, success) {
    console.log('Mode Status:', message);
    
    const statusElement = document.getElementById('mode-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = success === true ? 'success' : 
                                 success === false ? 'error' : 'loading';
    }
}


// Also update the setupJoystick function to be more robust:
function setupJoystick() {
    // Always destroy existing joystick first
    if (joystick) {
        joystick.destroy();
        joystick = null;
    }

    // Only create joystick if we're connected and in manual mode
    if (!isConnected || currentMode !== 'manual') {
        return;
    }

    const joystickZone = document.getElementById('joystick-zone');
    if (!joystickZone) {
        console.error('Joystick zone not found');
        return;
    }

    const options = {
        zone: joystickZone,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: '#2563eb',
        size: 150,
        threshold: 0.1
    };

    joystick = nipplejs.create(options);

    joystick.on('move', function (evt, data) {
        if (!isConnected || !cmdVelTopic || currentMode !== 'manual') return;

        const maxSpeed = parseFloat(document.getElementById('speedSlider').value);
        const maxTurn = 1.5;

        const linear = Math.sin(data.angle.radian) * maxSpeed * data.distance / 75;
        const angular = -Math.cos(data.angle.radian) * maxTurn * data.distance / 75;

        const twist = new ROSLIB.Message({
            linear: { x: linear, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: angular }
        });

        cmdVelTopic.publish(twist);
        updateCommandDisplay(linear, angular);
    });

    joystick.on('end', function () {
        if (!isConnected || !cmdVelTopic) return;

        const twist = new ROSLIB.Message({
            linear: { x: 0, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: 0 }
        });

        cmdVelTopic.publish(twist);
        updateCommandDisplay(0, 0);
    });
}


function emergencyStop() {
    if (!isConnected || !cmdVelTopic) return;

    const twist = new ROSLIB.Message({
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 }
    });

    cmdVelTopic.publish(twist);
    updateCommandDisplay(0, 0);
}

function updateCommandDisplay(linear, angular) {
    document.getElementById('cmd-linear').textContent = linear.toFixed(2) + ' m/s';
    document.getElementById('cmd-angular').textContent = angular.toFixed(2) + ' rad/s';
}

function sendReturn() {
    const lat = parseFloat(document.getElementById('lat').value);
    const lon = parseFloat(document.getElementById('lon').value);

    if (isNaN(lat) || isNaN(lon)) {
        console.error('Invalid GPS coordinates');
        return;
    }

    const service = new ROSLIB.Service({
        ros: ros,
        name: '/send_gps_home',
        serviceType: 'bot_msgs/srv/GPSHome'
    });

    const request = new ROSLIB.ServiceRequest({ 
        latitude: lat, 
        longitude: lon 
    });

    service.callService(request, function(result) {
        if (result.success) {
            console.log("GPS coordinates sent. Switching to return_home mode...");
            setMode('return_home');
        } else {
            console.error("Failed to set GPS:", result.message);
        }
    });
}

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
    
    // Calculate current speed
    const speed = Math.sqrt(vel.linear.x * vel.linear.x + vel.linear.y * vel.linear.y);
    document.getElementById('current-speed').textContent = speed.toFixed(2) + ' m/s';

    // Update total distance
    updateTotalDistance(pos);
}

function updateTotalDistance(pos) {
    const dx = pos.x - lastPosition.x;
    const dy = pos.y - lastPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0.01) { // Only update if significant movement
        totalDistance += distance;
        document.getElementById('total-distance').textContent = totalDistance.toFixed(2) + ' m';
        lastPosition = { x: pos.x, y: pos.y };
    }
}

function updateRuntime() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('runtime').textContent = 
        String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function handleModeButtonClick(button, modeName) {
    updateActiveModeButton(modeName);
    
    setMode(modeName);
}

document.addEventListener('DOMContentLoaded', function() {
    initializeModeButtons();
    
    initializeSpeedSlider();
    initializeViewToggles();
    
    setInterval(updateRuntime, 1000);
    
    updateActiveModeButton(currentMode);
});

function initializeModeButtons() {
    const modeButtons = document.querySelectorAll('.mode-btn');
    
    modeButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            
            const btnText = this.textContent.trim();
            let modeName;
            
            // Map button text to mode names
            switch(btnText) {
                case 'Manual':
                    modeName = 'manual';
                    break;
                case 'Follow Human':
                    modeName = 'follow';
                    break;
                case 'GPS Navigation':
                    modeName = 'gps_waypoint';
                    break;
                case 'Explore':
                    modeName = 'explore';
                    break;
                case 'Return Home':
                    modeName = 'return_home';
                    break;
                default:
                    modeName = btnText.toLowerCase().replace(' ', '_');
            }
            
            handleModeButtonClick(this, modeName);
        });
    });
}

function initializeSpeedSlider() {
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    
    speedSlider.addEventListener('input', function() {
        speedValue.textContent = this.value + ' m/s';
    });
}

function initializeViewToggles() {
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            toggleButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

