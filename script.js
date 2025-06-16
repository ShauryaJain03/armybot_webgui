let ros;
let cmdVelTopic;
let joystick;

function connectToROS() {
    const rosbridgeAddress = document.getElementById('rosbridge-address').value;
    ros = new ROSLIB.Ros({
        url: rosbridgeAddress
    });

    ros.on('connection', function () {
        console.log('Connected to rosbridge server.');
        setupTopics();
    });

    ros.on('error', function (error) {
        console.error('Error connecting to rosbridge server:', error);
    });

    ros.on('close', function () {
        console.log('Connection to rosbridge server closed.');
    });
}


function setupTopics() {
    // Set up cmd_vel topic
    cmdVelTopic = new ROSLIB.Topic({
        ros: ros,
        name: '/bot_controller/cmd_vel_unstamped',
        messageType: 'geometry_msgs/Twist'
    });

    // Set up odometry topic
    const odomTopic = new ROSLIB.Topic({
        ros: ros,
        name: '/bot_controller/odom',
        messageType: 'nav_msgs/Odometry'
    });

    odomTopic.subscribe(function (message) {
        document.getElementById('position-x').textContent = message.pose.pose.position.x.toFixed(2);
        document.getElementById('position-y').textContent = message.pose.pose.position.y.toFixed(2);
        document.getElementById('velocity-linear').textContent = message.twist.twist.linear.x.toFixed(2);
        document.getElementById('velocity-angular').textContent = message.twist.twist.angular.z.toFixed(2);
    });

    setupJoystick();
}



function setupJoystick() {
    const options = {
        zone: document.getElementById('joystick'),
        mode: 'static',
        position: { left: '75%', top: '35%' },
        color: 'blue',
        size: 150
    };

    joystick = nipplejs.create(options);

    joystick.on('move', function (evt, data) {
        const maxSpeed = 2.0;
        const maxTurn = 1.5;

        const linear = Math.sin(data.angle.radian) * maxSpeed * data.distance / 75;
        const angular = -Math.cos(data.angle.radian) * maxTurn * data.distance / 75;

        const twist = new ROSLIB.Message({
            linear: { x: linear, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: angular }
        });

        cmdVelTopic.publish(twist);
    });

    joystick.on('end', function () {
        const twist = new ROSLIB.Message({
            linear: { x: 0, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: 0 }
        });

        cmdVelTopic.publish(twist);
    });
}

function sendStart() {
    logToConsole("Start command sent.");
    // TODO: Add ROS topic publish for start
}

function sendStop() {
    logToConsole("Stop command sent.");
    // TODO: Add ROS topic publish for stop
}

function sendReturn() {
    logToConsole("Return to base command sent.");
    // TODO: Add ROS topic publish for return
}

function sendEmergencyStop() {
    logToConsole("EMERGENCY STOP triggered!");
    // TODO: Add ROS topic publish for emergency stop
}

function logToConsole(message) {
    console.log(message);
}
