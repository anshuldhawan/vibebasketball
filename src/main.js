import * as THREE from 'three';

// HTML Elements
// const scoreElement = document.getElementById('scoreDisplay');
// const messageElement = document.getElementById('shotMessage');

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('#bg'),
    antialias: true, // Improve smoothness
});

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

// Texture Loader
const textureLoader = new THREE.TextureLoader();
const courtTexture = textureLoader.load('textures/court.png');
const backboardTexture = textureLoader.load('textures/backboard.png');
const ballTexture = textureLoader.load('textures/balldimpled.png');
const skyboxTexture = textureLoader.load('textures/skybox.jpg');
const ringTexture = textureLoader.load('textures/ring.jpg'); // Load ring texture

// Apply Skybox
scene.background = skyboxTexture;

// Rotate court texture by 90 degrees (PI/2 radians)
courtTexture.center.set(0.5, 0.5); // Set rotation center to the middle
courtTexture.rotation = Math.PI / 2; // Rotate 90 degrees

// Camera position (fixed as per requirement)
camera.position.set(0, 2.8125, -10); // Raised Y by another 25% (2.25 -> 2.8125)
camera.lookAt(0, 4.0125, -18); // Adjusted lookAt Y accordingly (3.45 -> 4.0125)

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffffff, 1.5);
pointLight.position.set(5, 15, 10);
scene.add(pointLight);

// Ground
const groundGeometry = new THREE.PlaneGeometry(40, 40); // Reduced court size (was 75x75)
const groundMaterial = new THREE.MeshStandardMaterial({ map: courtTexture, color: 0xffffff });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2; // Rotate to be flat
ground.position.y = -0.1; // Slightly below origin
scene.add(ground);

// Hoop Elements
const hoopGroup = new THREE.Group(); // Group to hold backboard and rim

// Backboard
const backboardGeometry = new THREE.BoxGeometry(1.8, 1.05, 0.1); // Width, Height, Depth
const backboardMaterial = new THREE.MeshStandardMaterial({ map: backboardTexture, color: 0xffffff });
const backboard = new THREE.Mesh(backboardGeometry, backboardMaterial);
backboard.position.set(0, 3.5, -0.1); // Centered horizontally, raised, slightly behind rim center
hoopGroup.add(backboard);

// Pole
const poleHeight = 3.5; // Height reaching up near the backboard center
const poleRadius = 0.05;
const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 16);
const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa }); // Metallic grey
const pole = new THREE.Mesh(poleGeometry, poleMaterial);
// Position the center of the pole so its bottom is near y=0 and aligned with backboard's back face
pole.position.set(0, poleHeight / 2, backboard.position.z - backboardGeometry.parameters.depth / 2);
hoopGroup.add(pole);

// Rim
const rimGeometry = new THREE.TorusGeometry(0.198, 0.018, 16, 100); // Reduced by 40% (was 0.33, 0.03)
// Apply ring texture, set color to white
const rimMaterial = new THREE.MeshStandardMaterial({ map: ringTexture, color: 0xffffff }); 
const rim = new THREE.Mesh(rimGeometry, rimMaterial);
rim.position.set(0, 3.05, 0.15); // Moved rim forward (Z was 0.0)
rim.rotation.x = Math.PI / 2; // Rotate to be horizontal
hoopGroup.add(rim);

// Net
const netHeight = 0.3; // Length of net
const netTopRadius = rimGeometry.parameters.radius * 0.95; // Slightly smaller than rim radius
const netBottomRadius = netTopRadius * 0.5; // Narrower at the bottom
const netSegments = 16; // Match with rim segments
const netMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xffffff,
    wireframe: true, // Make it see-through like a net
    opacity: 0.7,
    transparent: true
});

// Create net using a truncated cone (cylinder with different end radii)
const netGeometry = new THREE.CylinderGeometry(
    netTopRadius, // Top radius
    netBottomRadius, // Bottom radius
    netHeight, // Height
    netSegments, // Radial segments
    8, // Height segments
    true // Open-ended
);

// Create and position the net
const net = new THREE.Mesh(netGeometry, netMaterial);
net.position.y = rim.position.y - (netHeight / 2); // Center net vertically below rim
net.position.z = rim.position.z; // Same Z as rim
net.position.x = rim.position.x; // Same X as rim
hoopGroup.add(net);

// Position the entire hoop assembly
hoopGroup.position.z = -18; // Moved hoop to the end of the smaller court (was -0.5)
scene.add(hoopGroup);

// --- Update World Positions AFTER positioning hoop --- 
// Get world position for rim center for easier calculations
const rimWorldPosition = new THREE.Vector3();
rim.getWorldPosition(rimWorldPosition);

// Backboard Bounding Box (calculate once as it's static relative to hoopGroup)
const backboardBoundingBox = new THREE.Box3().setFromObject(backboard);
// We need to manually adjust the backboard BB because it's inside a group
backboard.updateWorldMatrix(true, false);
backboardBoundingBox.applyMatrix4(backboard.matrixWorld);

// Ball variables
const ballGeometry = new THREE.SphereGeometry(0.12, 16, 16); // Reduced segments slightly for performance
const ballMaterial = new THREE.MeshStandardMaterial({ map: ballTexture, color: 0xffffff });
let currentBall = new THREE.Mesh(ballGeometry, ballMaterial);
let ballVelocity = new THREE.Vector3(0, 0, 0);
let ballActive = false; // Replace isBallInFlight for clearer state management
let ballBoundingBox = new THREE.Box3(); // Bounding box for the ball
let ballRotationAxis = new THREE.Vector3(0, 0, 0); // Axis around which the ball rotates
let ballRotationSpeed = 5; // How fast the ball rotates

// Power meter
const powerMeterWidth = 0.5;
const powerMeterHeight = 0.05;
const powerMeterBase = new THREE.Mesh(
    new THREE.PlaneGeometry(powerMeterWidth, powerMeterHeight),
    new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.7 })
);
const powerMeterFill = new THREE.Mesh(
    new THREE.PlaneGeometry(powerMeterWidth * 0.98, powerMeterHeight * 0.8),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
);
powerMeterFill.position.z = 0.001; // Slightly in front of the base
// Group for easy manipulation
const powerMeterGroup = new THREE.Group();
powerMeterGroup.add(powerMeterBase);
powerMeterGroup.add(powerMeterFill);
// Fixed position for power meter (created once)
const fixedPowerMeterPosition = new THREE.Vector3(
    camera.position.x,           // Same X as camera (centered)
    camera.position.y - 0.7,     // Below camera view
    camera.position.z - 1.5      // In front of camera
);
// Position power meter at fixed location in front of camera
powerMeterGroup.position.copy(fixedPowerMeterPosition);
// Rotate it to face the player
powerMeterGroup.rotation.x = Math.PI * 0.1; // Slight upward tilt
scene.add(powerMeterGroup);

// Initialize power meter to zero power
updatePowerMeter(0);

// Physics constants
const gravity = new THREE.Vector3(0, -9.8, 0);
const clock = new THREE.Clock();

// Input variables
let isDragging = false;
let startPoint = { x: 0, y: 0 };
let endPoint = { x: 0, y: 0 };
let currentSwipePower = 0; // Track current swipe power (0-1)
const powerFactor = 0.025; // Adjust this to control shot power
// Constants for swipe power calculation - moved out of shootBall
const minSwipeY = 100; // Minimum pixel swipe distance for minimal power
const maxSwipeY = 400; // Maximum pixel swipe distance for maximum power
const targetSwipeY = 250; // The ideal swipe Y distance we are aiming for

// --- Scorecard Setup ---
// Game variables
let score = 0;
let totalScore = 0; // New variable to track total score across all levels
let justScored = false;
let gameTime = 30; // Start with 30 seconds
let lastUpdateTime = 0;
let scoreThreshold = 5; // Initial score threshold for time extension
let nextThreshold = 5; // Next threshold to reach (5, 10, 15, etc.)
let timeExtension = 30; // Seconds to add when reaching threshold
let levelCounter = 1; // Track the current level

// Create canvas for scorecard texture
const scorecardCanvas = document.createElement('canvas');
scorecardCanvas.width = 512;
scorecardCanvas.height = 256;
const scorecardCtx = scorecardCanvas.getContext('2d');

// Create texture from canvas
const scorecardTexture = new THREE.CanvasTexture(scorecardCanvas);
const scorecardMaterial = new THREE.MeshBasicMaterial({ 
    map: scorecardTexture,
    transparent: true
});

// Create frame material for the lighting effect
const frameDefaultColor = new THREE.Color(0x333333);
const frameHighlightColor = new THREE.Color(0xffcc00);
const frameMaterial = new THREE.MeshBasicMaterial({ color: frameDefaultColor });

// Create scorecard mesh (increased dimensions)
const scorecardWidth = 3; // Increased from 2
const scorecardHeight = 1.5; // Increased from 1
const scorecardGeometry = new THREE.PlaneGeometry(scorecardWidth, scorecardHeight);
const scorecard = new THREE.Mesh(scorecardGeometry, scorecardMaterial);

// Create frame for the scorecard
const frameThickness = 0.08;
const frameGeometry = new THREE.BoxGeometry(
    scorecardWidth + frameThickness*2, 
    scorecardHeight + frameThickness*2, 
    frameThickness
);
const frame = new THREE.Mesh(frameGeometry, frameMaterial);

// Group the scorecard and frame
const scorecardGroup = new THREE.Group();
scorecardGroup.add(frame);
scorecardGroup.add(scorecard);
scorecard.position.z = frameThickness/2 + 0.01; // Place slightly in front of frame

// Rotate elements so that when using lookAt, the front faces the camera 
scorecardGroup.rotation.y = Math.PI; // Rotate 180 degrees so front faces the camera when using lookAt

// Position the scorecard in the scene
scorecardGroup.position.set(0, 5, -14); // Position between player and hoop
scorecardGroup.lookAt(camera.position); // Make the scorecard look at the camera
scene.add(scorecardGroup);

// Function to update the scorecard texture
function updateScorecard(message = "") {
    // Clear the canvas
    scorecardCtx.clearRect(0, 0, scorecardCanvas.width, scorecardCanvas.height);
    
    // Canvas background
    scorecardCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    scorecardCtx.fillRect(0, 0, scorecardCanvas.width, scorecardCanvas.height);
    
    // Draw border
    scorecardCtx.strokeStyle = '#444444';
    scorecardCtx.lineWidth = 10;
    scorecardCtx.strokeRect(5, 5, scorecardCanvas.width-10, scorecardCanvas.height-10);
    
    // Draw score without threshold indication
    scorecardCtx.fillStyle = 'white';
    scorecardCtx.font = 'bold 60px Arial';
    scorecardCtx.textAlign = 'center';
    scorecardCtx.textBaseline = 'middle';
    scorecardCtx.fillText(`SCORE: ${score}`, scorecardCanvas.width/2, scorecardCanvas.height/2 - 50);
    
    // Add target explanation line
    scorecardCtx.fillStyle = '#ffcc00';
    scorecardCtx.font = 'bold 18px Arial';
    scorecardCtx.fillText(`REACH ${nextThreshold} POINTS TO EXTEND TIME BY 30s`, 
                          scorecardCanvas.width/2, 
                          scorecardCanvas.height/2);
    
    // Draw level only (removed total)
    scorecardCtx.fillStyle = '#aaffaa';
    scorecardCtx.font = 'bold 22px Arial';
    scorecardCtx.fillText(`LEVEL ${levelCounter}`, scorecardCanvas.width/2, 40);
    
    // Draw timer
    const minutes = Math.floor(gameTime / 60);
    const seconds = Math.floor(gameTime % 60).toString().padStart(2, '0');
    scorecardCtx.fillStyle = gameTime < 10 ? 'red' : 'white';
    scorecardCtx.font = 'bold 45px Arial';
    scorecardCtx.fillText(`${minutes}:${seconds}`, scorecardCanvas.width/2, scorecardCanvas.height/2 + 50);
    
    // Draw message (if any)
    if (message) {
        scorecardCtx.fillStyle = '#ffcc00';
        scorecardCtx.font = 'bold 37px Arial';
        scorecardCtx.fillText(message, scorecardCanvas.width/2, scorecardCanvas.height/2 + 120);
    }
    
    // Update the texture
    scorecardTexture.needsUpdate = true;
}

// Initialize the scorecard
updateScorecard();

// Scoring zone setup
const scoreZoneCenter = rimWorldPosition.clone();
scoreZoneCenter.y -= 0.1; 
const scoreZoneRadiusSq = Math.pow(rimGeometry.parameters.radius * 1.2, 2);
const scoreZoneHeight = 0.3;

// Highlight frame function
function highlightFrame() {
    frame.material.color.copy(frameHighlightColor);
    
    // Reset after 0.5 seconds
    setTimeout(() => {
        frame.material.color.copy(frameDefaultColor);
    }, 500);
}

// Function to check if score reached threshold and add time if needed
function checkScoreThreshold() {
    if (score >= nextThreshold) {
        // Add time extension
        gameTime += timeExtension;
        
        // Show time extension message
        updateScorecard(`+${timeExtension}s TIME BONUS!`);
        
        // Highlight the frame
        highlightFrame();
        
        // Increment level
        levelCounter++;
        
        // Calculate next threshold with progressive increase:
        // Level 1 → 5 points (already done)
        // Level 2 → 5 + (2-1) = 6 points
        // Level 3 → 5 + (3-1) = 7 points
        // Level 4 → 5 + (4-1) = 8 points, etc.
        const baseThreshold = 5;
        const increase = levelCounter - 1;
        nextThreshold = score + baseThreshold + increase;
        
        // Set timeout to clear the message after 2 seconds
        setTimeout(() => {
            updateScorecard();
        }, 2000);
    }
}

// Game state
let gameState = "WAITING_TO_START"; // WAITING_TO_START, PLAYING, GAME_OVER

// --- UI Setup ---
// Create DOM UI for start button
const startButtonContainer = document.createElement('div');
startButtonContainer.style.position = 'absolute';
startButtonContainer.style.top = '50%';
startButtonContainer.style.left = '50%';
startButtonContainer.style.transform = 'translate(-50%, -50%)';
startButtonContainer.style.textAlign = 'center';
startButtonContainer.style.zIndex = '1000';

const startButton = document.createElement('button');
startButton.textContent = 'START GAME';
startButton.style.padding = '20px 40px';
startButton.style.fontSize = '24px';
startButton.style.backgroundColor = '#4CAF50';
startButton.style.color = 'white';
startButton.style.border = 'none';
startButton.style.borderRadius = '10px';
startButton.style.cursor = 'pointer';
startButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
startButton.style.transition = '0.3s';

startButton.onmouseover = () => {
    startButton.style.backgroundColor = '#45a049';
    startButton.style.transform = 'scale(1.05)';
};
startButton.onmouseout = () => {
    startButton.style.backgroundColor = '#4CAF50';
    startButton.style.transform = 'scale(1)';
};

startButton.onclick = startGame;
startButtonContainer.appendChild(startButton);
document.body.appendChild(startButtonContainer);

// Game title/instructions
const gameTitle = document.createElement('div');
gameTitle.textContent = '3-POINT CHALLENGE';
gameTitle.style.color = 'white';
gameTitle.style.fontSize = '36px';
gameTitle.style.fontWeight = 'bold';
gameTitle.style.marginBottom = '20px';
gameTitle.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
startButtonContainer.insertBefore(gameTitle, startButton);

const gameInstructions = document.createElement('div');
gameInstructions.textContent = 'Swipe to shoot! Score points to extend your time.';
gameInstructions.style.color = 'white';
gameInstructions.style.fontSize = '18px';
gameInstructions.style.marginBottom = '30px';
gameInstructions.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
startButtonContainer.insertBefore(gameInstructions, startButton);

// Add game over message
const gameOverMessage = document.createElement('div');
gameOverMessage.textContent = 'GAME OVER!';
gameOverMessage.style.color = '#FF5252';
gameOverMessage.style.fontSize = '32px';
gameOverMessage.style.fontWeight = 'bold';
gameOverMessage.style.marginBottom = '20px';
gameOverMessage.style.display = 'none';
startButtonContainer.insertBefore(gameOverMessage, startButton);

// Add final score display
const finalScoreDisplay = document.createElement('div');
finalScoreDisplay.style.color = 'white';
finalScoreDisplay.style.fontSize = '24px';
finalScoreDisplay.style.marginBottom = '30px';
finalScoreDisplay.style.display = 'none';
startButtonContainer.insertBefore(finalScoreDisplay, startButton);

// Function to start/restart the game
function startGame() {
    // Reset game variables
    score = 0;
    totalScore = 0;
    gameTime = 30;
    levelCounter = 1;
    nextThreshold = 5;
    
    // Hide UI elements
    startButtonContainer.style.display = 'none';
    
    // Update game state
    gameState = "PLAYING";
    
    // Reset ball
    resetBall();
    
    // Update scorecard
    updateScorecard();
}

// Function to handle game over
function gameOver() {
    // Update game state
    gameState = "GAME_OVER";
    
    // Update UI elements
    gameOverMessage.style.display = 'block';
    finalScoreDisplay.textContent = `FINAL SCORE: ${totalScore}`;
    finalScoreDisplay.style.display = 'block';
    startButton.textContent = 'PLAY AGAIN';
    startButtonContainer.style.display = 'block';
    
    // Ensure ball is inactive
    ballActive = false;
}

function resetBall() {
    scene.remove(currentBall);
    currentBall = new THREE.Mesh(ballGeometry, ballMaterial);
    // Ball position remains relative to camera, adjust Y offset for 15% height increase
    currentBall.position.set(camera.position.x, camera.position.y - 0.21421875, camera.position.z - 1);
    ballVelocity.set(0, 0, 0);
    ballActive = false; // Replaced isBallInFlight
    justScored = false;
    
    // Reset power meter to zero when the ball resets
    updatePowerMeter(0);
    
    scene.add(currentBall);
}

// Input Listeners (modify to respect game state)
window.addEventListener('pointerdown', (event) => {
    if (gameState === "PLAYING" && !ballActive) {
        isDragging = true;
        startPoint.x = event.clientX;
        startPoint.y = event.clientY;
        
        // Reset power meter fill
        updatePowerMeter(0);
    }
});

window.addEventListener('pointermove', (event) => {
    if (gameState !== "PLAYING" || !isDragging || ballActive) return;
    
    // Update temporary end point
    const tempEndY = event.clientY;
    
    // Calculate swipe distance (vertical only, for power)
    let deltaY = startPoint.y - tempEndY; // Vertical swipe distance
    
    // Clamp between 0 and maxSwipeY (no negative values)
    deltaY = Math.max(0, deltaY);
    
    // Calculate power ratio from 0 to 1
    // First clamp deltaY between min and max
    const clampedDeltaY = Math.max(minSwipeY, Math.min(deltaY, maxSwipeY));
    // Then calculate the ratio within that range
    const powerRatio = (clampedDeltaY - minSwipeY) / (maxSwipeY - minSwipeY);
    
    // Update power meter visualization
    updatePowerMeter(powerRatio);
    
    // Store current power for use when shooting
    currentSwipePower = powerRatio;
});

window.addEventListener('pointerup', (event) => {
    if (gameState === "PLAYING" && isDragging && !ballActive) {
        endPoint.x = event.clientX;
        endPoint.y = event.clientY;
        isDragging = false;
        
        shootBall();
    }
});

// Function to update power meter fill and color
function updatePowerMeter(powerRatio) {
    // Make sure powerRatio is between 0 and 1
    powerRatio = Math.max(0, Math.min(powerRatio, 1));
    
    // Scale the fill mesh based on power
    powerMeterFill.scale.x = powerRatio;
    powerMeterFill.position.x = -(powerMeterWidth * (1 - powerRatio) / 2) * 0.98; // Adjust position to left-align
    
    // Change color based on power (green -> yellow -> red)
    if (powerRatio < 0.5) {
        // Green to yellow
        const r = Math.floor(255 * powerRatio * 2);
        powerMeterFill.material.color.setRGB(r/255, 1, 0);
    } else {
        // Yellow to red
        const g = Math.floor(255 * (1 - (powerRatio - 0.5) * 2));
        powerMeterFill.material.color.setRGB(1, g/255, 0);
    }
}

function shootBall() {
    if (ballActive) return; // Prevent shooting if ball already in flight

    const deltaX = endPoint.x - startPoint.x;
    let deltaY = startPoint.y - endPoint.y; // Invert Y for intuitive swipe up = shoot up

    // --- Clamp the vertical swipe power --- 
    // Using the constants defined at the top level now
    
    // Clamp deltaY
    let effectiveSwipeY = Math.max(minSwipeY, Math.min(deltaY, maxSwipeY)); 

    // Adjust power factor based on how forgiving we want it
    // A smaller range between min/max power factors makes it more forgiving
    const minPowerFactor = 0.020; // Increased from 0.018 - higher minimum
    const maxPowerFactor = 0.024; // Decreased from 0.025 - lower maximum
    
    // Interpolate the power factor based on the clamped swipe
    const swipeRatio = (effectiveSwipeY - minSwipeY) / (maxSwipeY - minSwipeY);
    const interpolatedPowerFactor = minPowerFactor + (maxPowerFactor - minPowerFactor) * swipeRatio;

    // Calculate adjusted power based on the interpolated factor
    // We use targetSwipeY here so that the power corresponds to a 'good' swipe
    const verticalPower = targetSwipeY * interpolatedPowerFactor;
    const forwardPower = targetSwipeY * interpolatedPowerFactor * 1.6; // Adjusted forward multiplier
    const sidePower = deltaX * interpolatedPowerFactor * 0.4; // Adjusted side multiplier

    // Map swipe to velocity 
    const shootDirection = new THREE.Vector3(sidePower, verticalPower, -forwardPower);

    // Reduce overall power by 10%
    shootDirection.multiplyScalar(0.9);

    // Apply the velocity
    ballVelocity.copy(shootDirection);
    
    // Calculate rotation axis perpendicular to velocity direction
    // Cross product of velocity with world up vector gives us a rotation axis
    // that makes the ball appear to have appropriate backspin
    ballRotationAxis.set(-ballVelocity.z, 0, ballVelocity.x).normalize();
    
    ballActive = true; // Updated from isBallInFlight
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop (modify to respect game state)
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();
    const currentTime = clock.getElapsedTime();
    const previousBallY = currentBall.position.y;
    
    // Update timer every second when playing
    if (gameState === "PLAYING" && Math.floor(currentTime) > Math.floor(lastUpdateTime)) {
        lastUpdateTime = currentTime;
        if (gameTime > 0) {
            gameTime--;
            updateScorecard();
            
            // Game over check
            if (gameTime === 0) {
                gameOver();
            }
        }
    }
    
    // Make scorecard always face the camera
    scorecardGroup.lookAt(camera.position);
    
    // Make scorecard visible only during gameplay
    scorecardGroup.visible = (gameState === "PLAYING");

    // Physics Update - only active during gameplay
    if (gameState === "PLAYING" && ballActive) {
        ballVelocity.add(gravity.clone().multiplyScalar(deltaTime));
        currentBall.position.add(ballVelocity.clone().multiplyScalar(deltaTime));

        // Apply rotation to the ball based on its velocity
        // The rotation speed is proportional to the ball's horizontal speed
        const horizontalSpeed = Math.sqrt(ballVelocity.x * ballVelocity.x + ballVelocity.z * ballVelocity.z);
        currentBall.rotateOnAxis(ballRotationAxis, horizontalSpeed * ballRotationSpeed * deltaTime);

        // Update Ball Bounding Box
        ballBoundingBox.setFromObject(currentBall);

        // --- Collision Checks --- 

        // 1. Ground Collision
        if (ballBoundingBox.min.y <= 0) {
            currentBall.position.y = ballGeometry.parameters.radius;
            ballVelocity.y *= -0.4; // Bounce
            ballVelocity.x *= 0.8; // Friction
            ballVelocity.z *= 0.8;
            // Score check removed from here
        }

        // 2. Backboard Collision
        if (ballBoundingBox.intersectsBox(backboardBoundingBox)) {
            // Simple bounce off backboard - reverse Z velocity
            // A more realistic bounce would calculate reflection angle
            if (ballVelocity.z < 0) { // Only reflect if moving towards the backboard
                 ballVelocity.z *= -0.8; // Reverse and dampen
                 ballVelocity.x *= 0.9; 
                 ballVelocity.y *= 0.9;
                 // Nudge ball slightly away to prevent sticking
                 currentBall.position.z = backboardBoundingBox.max.z + ballGeometry.parameters.radius;
            }
        }

        // 3. Rim Collision (Simplified proximity check)
        const distToRimCenterSq = currentBall.position.distanceToSquared(rimWorldPosition);
        const rimRadius = rimGeometry.parameters.radius + rimGeometry.parameters.tube;
        const ballRadius = ballGeometry.parameters.radius;
        if (distToRimCenterSq < Math.pow(rimRadius + ballRadius, 2)) { // justScored check removed
             // Check vertical proximity as well
             if (Math.abs(currentBall.position.y - rimWorldPosition.y) < ballRadius * 1.5) {
                 // --- Friendly Rim Roll --- 
                 // Calculate direction from ball to rim center
                 const directionToCenter = rimWorldPosition.clone().sub(currentBall.position);
                 directionToCenter.y = 0; // Ignore vertical difference for nudge direction
                 directionToCenter.normalize();

                 // Dampen existing velocity significantly
                 ballVelocity.multiplyScalar(0.7);

                 // Add a small velocity nudge towards the center
                 const nudgeStrength = 0.1;
                 ballVelocity.add(directionToCenter.multiplyScalar(nudgeStrength));
                 
                 //console.log("Hit Rim - Reduced Friendly Roll");
             }
        }

        // 4. Score Check
        const ballDistToScoreCenterSq = currentBall.position.clone().setY(scoreZoneCenter.y).distanceToSquared(scoreZoneCenter);
        if (!justScored && 
            ballDistToScoreCenterSq < scoreZoneRadiusSq && // Within horizontal radius of score zone
            currentBall.position.y < scoreZoneCenter.y && // Below score zone center
            currentBall.position.y > scoreZoneCenter.y - scoreZoneHeight && // Above bottom of score zone
            previousBallY > scoreZoneCenter.y && // Was previously above the score zone center
            ballVelocity.y < 0) // Moving downwards
        {
            // Basket made!
            justScored = true;
            score++;
            totalScore++; // Increment total score too
            
            // Only highlight the frame, don't show "BASKET!" message
            updateScorecard(); // Just update with the new score
            highlightFrame();
            
            // Check if reached score threshold
            checkScoreThreshold();
            
            // Dampen ball velocity for better visual effect after scoring
            ballVelocity.x *= 0.5;
            ballVelocity.z *= 0.5;
        }

        // Reset if ball goes too far out of bounds OR hits ground
        const ballHitGround = ballBoundingBox.min.y <= 0;
        const ballOutOfBounds = Math.abs(currentBall.position.x) > 20 || Math.abs(currentBall.position.z) > 20 || currentBall.position.y < -5 || currentBall.position.y > 20;
        
        if (ballHitGround || ballOutOfBounds) {
             // justScored check removed
            resetBall(); 
        }
    } else if (gameState === "PLAYING" && !ballActive) {
        // Keep ball in hand if not shot and game is playing
        currentBall.position.set(camera.position.x, camera.position.y - 0.21421875, camera.position.z - 1);
    }

    // Optional: Update helpers if uncommented
    // backboardBoxHelper.update();

    renderer.render(scene, camera);
}

// Hide scorecard initially
scorecardGroup.visible = false;

// Initialize ball (but don't have it in play yet)
resetBall();

animate();

// updateScoreDisplay(); // Removed
console.log('Three.js setup complete - Score/Message UI Removed'); 