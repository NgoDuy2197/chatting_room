// Global variables
let socket;
let currentRoom = null;
let currentUser = null;
let users = new Map();
let foods = new Map();
let messages = new Map();
let keys = {};
let gameLoop;
let score = 0;

// Character emojis for users
const characterEmojis = ['😀', '😎', '🤖', '👾', '🐱', '🐶', '🦊', '🐸', '🐙', '🦄', '🌈', '⭐', '🎮', '🎯', '🎪'];

// DOM elements
const welcomeScreen = document.getElementById('welcomeScreen');
const gameScreen = document.getElementById('gameScreen');
const roomIdInput = document.getElementById('roomId');
const usernameInput = document.getElementById('username');
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const gameCanvas = document.getElementById('gameCanvas');
const chatInput = document.getElementById('chatInput');
const sendMessageBtn = document.getElementById('sendMessage');
const scoreText = document.getElementById('scoreText');
const roomInfo = document.getElementById('roomInfo');
const playerCount = document.getElementById('playerCount');
const charCount = document.getElementById('charCount');

// Modal elements
const roomInfoBtn = document.getElementById('roomInfoBtn');
const roomModal = document.getElementById('roomModal');
const closeModal = document.getElementById('closeModal');
const leaveRoomBtn = document.getElementById('leaveRoom');
const copyRoomIdBtn = document.getElementById('copyRoomId');
const modalRoomId = document.getElementById('modalRoomId');
const modalPlayerCount = document.getElementById('modalPlayerCount');
const modalYourScore = document.getElementById('modalYourScore');

// Initialize the application
function init() {
    // Connect to Socket.IO server
    socket = io();
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up keyboard controls
    setupKeyboardControls();
    
    // Start game loop
    startGameLoop();
}

// Set up event listeners
function setupEventListeners() {
    // Welcome screen buttons
    createRoomBtn.addEventListener('click', handleCreateRoom);
    joinRoomBtn.addEventListener('click', handleJoinRoom);
    
    // Chat input
    chatInput.addEventListener('keypress', handleChatKeyPress);
    chatInput.addEventListener('input', updateCharCount);
    sendMessageBtn.addEventListener('click', sendMessage);
    
    // Modal events
    roomInfoBtn.addEventListener('click', showRoomModal);
    closeModal.addEventListener('click', hideRoomModal);
    leaveRoomBtn.addEventListener('click', handleLeaveRoom);
    copyRoomIdBtn.addEventListener('click', copyRoomId);
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === roomModal) {
            hideRoomModal();
        }
    });
    
    // Socket.IO events
    socket.on('roomJoined', handleRoomJoined);
    socket.on('userJoined', handleUserJoined);
    socket.on('userLeft', handleUserLeft);
    socket.on('userMoved', handleUserMoved);
    socket.on('newMessage', handleNewMessage);
    socket.on('newFood', handleNewFood);
    socket.on('foodEaten', handleFoodEaten);
    socket.on('foodRemoved', handleFoodRemoved);
}

// Set up keyboard controls
function setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
    });
    
    document.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });
}

// Handle create room
function handleCreateRoom() {
    const roomId = roomIdInput.value.trim();
    const username = usernameInput.value.trim();
    
    if (!roomId) {
        showNotification('Please enter a room ID', 'error');
        return;
    }
    
    // Check if room already exists (this will be handled by server)
    joinRoom(roomId, username, true);
}

// Handle join room
function handleJoinRoom() {
    const roomId = roomIdInput.value.trim();
    const username = usernameInput.value.trim();
    
    if (!roomId) {
        showNotification('Please enter a room ID', 'error');
        return;
    }
    
    joinRoom(roomId, username, false);
}

// Join room function
function joinRoom(roomId, username, isCreating) {
    socket.emit('joinRoom', {
        roomId: roomId,
        username: username
    });
}

// Handle room joined
function handleRoomJoined(data) {
    currentRoom = data.roomId;
    currentUser = data.users.find(user => user.id === socket.id);
    users.clear();
    foods.clear();
    messages.clear();
    
    // Clear canvas
    gameCanvas.innerHTML = '';
    
    // Add all users and render them
    data.users.forEach(user => {
        users.set(user.id, user);
        renderUser(user);
    });
    
    // Add all foods and render them
    data.foods.forEach(food => {
        foods.set(food.id, food);
        renderFood(food);
    });
    
    // Add all messages
    data.messages.forEach(message => {
        messages.set(message.id, message);
    });
    
    // Update UI
    updateRoomInfo();
    
    // Switch to game screen
    welcomeScreen.classList.remove('active');
    gameScreen.classList.add('active');
    
    // Focus on chat input
    setTimeout(() => {
        chatInput.focus();
        updateCharCount(); // Initialize character counter
    }, 100);
}

// Handle user joined
function handleUserJoined(user) {
    users.set(user.id, user);
    updateRoomInfo();
    renderUser(user);
}

// Handle user left
function handleUserLeft(userId) {
    users.delete(userId);
    updateRoomInfo();
    removeUser(userId);
}

// Handle user moved
function handleUserMoved(data) {
    const user = users.get(data.userId);
    if (user) {
        user.x = data.x;
        user.y = data.y;
        updateUserPosition(user);
    }
}

// Handle new message
function handleNewMessage(message) {
    messages.set(message.id, message);
    
    // Create message bubble
    createMessageBubble(message);
    
    // Remove message after 10 seconds
    setTimeout(() => {
        messages.delete(message.id);
        const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
        if (messageElement) {
            messageElement.remove();
        }
    }, 10000);
}

// Handle new food
function handleNewFood(food) {
    foods.set(food.id, food);
    renderFood(food);
}

// Handle food eaten
function handleFoodEaten(data) {
    if (data.userId === socket.id) {
        score = data.score;
        updateScore();
        showScoreIncrease();
    }
    
    // Remove food from map using foodId
    if (data.foodId) {
        foods.delete(data.foodId);
        removeFood(data.foodId);
    }
}

// Handle food removed (auto-disappear)
function handleFoodRemoved(data) {
    if (data.foodId) {
        foods.delete(data.foodId);
        removeFood(data.foodId);
    }
}

// Send message
function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    if (message.length > 512) {
        showNotification('Message too long! Maximum 512 characters allowed.', 'error');
        return;
    }
    
    if (currentRoom) {
        socket.emit('sendMessage', {
            roomId: currentRoom,
            message: message
        });
        chatInput.value = '';
        updateCharCount(); // Reset character counter
    }
}

// Handle chat key press
function handleChatKeyPress(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

// Create message bubble
function createMessageBubble(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.setAttribute('data-message-id', message.id);
    messageElement.style.left = `${message.x}px`;
    messageElement.style.top = `${message.y - 80}px`;
    
    messageElement.innerHTML = `
        <div class="username">${message.username}</div>
        <div class="message-text">${message.message}</div>
    `;
    
    gameCanvas.appendChild(messageElement);
}

// Update room info
function updateRoomInfo() {
    roomInfo.textContent = `Room: ${currentRoom}`;
    playerCount.textContent = `Players: ${users.size}`;
}

// Update score
function updateScore() {
    scoreText.textContent = `Score: ${score}`;
}

// Show score increase animation
function showScoreIncrease() {
    const scoreDisplay = document.getElementById('scoreDisplay');
    scoreDisplay.classList.add('score-increase');
    setTimeout(() => {
        scoreDisplay.classList.remove('score-increase');
    }, 500);
}

// Show room modal
function showRoomModal() {
    modalRoomId.textContent = currentRoom;
    modalPlayerCount.textContent = users.size;
    modalYourScore.textContent = score;
    roomModal.style.display = 'block';
}

// Hide room modal
function hideRoomModal() {
    roomModal.style.display = 'none';
}

// Handle leave room
function handleLeaveRoom() {
    if (confirm('Are you sure you want to leave this room?')) {
        // Disconnect from current room
        if (currentRoom) {
            socket.emit('leaveRoom', { roomId: currentRoom });
        }
        
        // Reset game state
        currentRoom = null;
        currentUser = null;
        users.clear();
        foods.clear();
        messages.clear();
        score = 0;
        
        // Switch back to welcome screen
        gameScreen.classList.remove('active');
        welcomeScreen.classList.add('active');
        
        // Clear inputs
        roomIdInput.value = '';
        usernameInput.value = '';
        
        // Hide modal
        hideRoomModal();
        
        showNotification('You have left the room', 'info');
    }
}

// Copy room ID to clipboard
function copyRoomId() {
    navigator.clipboard.writeText(currentRoom).then(() => {
        showNotification('Room ID copied to clipboard!', 'success');
    }).catch(() => {
        showNotification('Failed to copy room ID', 'error');
    });
}

// Update character count
function updateCharCount() {
    const currentLength = chatInput.value.length;
    charCount.textContent = currentLength;
    
    // Change color based on length
    if (currentLength > 450) {
        charCount.style.color = '#ff6b6b';
    } else if (currentLength > 400) {
        charCount.style.color = '#ffa726';
    } else {
        charCount.style.color = '#667eea';
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const container = document.getElementById('notificationContainer');
    container.appendChild(notification);
    
    // Remove notification after animation
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// Start game loop
function startGameLoop() {
    gameLoop = setInterval(() => {
        if (currentUser && currentRoom) {
            handleMovement();
        }
    }, 32); // ~30 FPS for better performance
}

// Movement throttling
let lastMoveTime = 0;
const MOVE_THROTTLE = 50; // Send movement every 50ms instead of every frame
let movementTimeout = null;

// Handle movement
function handleMovement() {
    const speed = 5;
    let moved = false;
    
    if (keys['w'] || keys['arrowup']) {
        currentUser.y = Math.max(30, currentUser.y - speed);
        moved = true;
    }
    if (keys['s'] || keys['arrowdown']) {
        currentUser.y = Math.min(window.innerHeight - 30, currentUser.y + speed);
        moved = true;
    }
    if (keys['a'] || keys['arrowleft']) {
        currentUser.x = Math.max(30, currentUser.x - speed);
        moved = true;
    }
    if (keys['d'] || keys['arrowright']) {
        currentUser.x = Math.min(window.innerWidth - 30, currentUser.x + speed);
        moved = true;
    }
    
    // Always update local position immediately for smooth movement
    if (moved) {
        updateUserPosition(currentUser);
        
        // Check for local food collision for immediate feedback
        checkLocalFoodCollision();
        
        // Throttle server updates to reduce network traffic
        const now = Date.now();
        if (now - lastMoveTime > MOVE_THROTTLE) {
            // Clear any pending movement
            if (movementTimeout) {
                clearTimeout(movementTimeout);
            }
            
            // Send movement immediately
            socket.emit('moveUser', {
                roomId: currentRoom,
                x: currentUser.x,
                y: currentUser.y
            });
            lastMoveTime = now;
        } else {
            // Debounce movement - send final position after stopping
            if (movementTimeout) {
                clearTimeout(movementTimeout);
            }
            movementTimeout = setTimeout(() => {
                socket.emit('moveUser', {
                    roomId: currentRoom,
                    x: currentUser.x,
                    y: currentUser.y
                });
                lastMoveTime = Date.now();
            }, 100);
        }
    }
}

// Check for local food collision
function checkLocalFoodCollision() {
    foods.forEach(food => {
        const distanceX = Math.abs(food.x - currentUser.x);
        const distanceY = Math.abs(food.y - currentUser.y);
        
        if (distanceX < 40 && distanceY < 40) {
            // Visual feedback - make food glow or shake
            const foodElement = document.querySelector(`[data-food-id="${food.id}"]`);
            if (foodElement) {
                foodElement.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    foodElement.style.transform = 'scale(1)';
                }, 200);
            }
        }
    });
}



// Render food element
function renderFood(food) {
    const foodElement = document.createElement('div');
    foodElement.className = 'food-item';
    foodElement.setAttribute('data-food-id', food.id);
    foodElement.textContent = food.emoji;
    foodElement.style.left = `${food.x}px`;
    foodElement.style.top = `${food.y}px`;
    gameCanvas.appendChild(foodElement);
}

// Render user element
function renderUser(user) {
    const userElement = document.createElement('div');
    userElement.className = 'user-character';
    userElement.setAttribute('data-user-id', user.id);
    if (user.id === socket.id) {
        userElement.classList.add('self');
    }
    userElement.textContent = characterEmojis[user.id.charCodeAt(0) % characterEmojis.length];
    userElement.style.left = `${user.x - 30}px`;
    userElement.style.top = `${user.y - 30}px`;
    userElement.style.backgroundColor = user.color;
    userElement.title = user.username;
    gameCanvas.appendChild(userElement);
}

// Update user position
function updateUserPosition(user) {
    const userElement = document.querySelector(`[data-user-id="${user.id}"]`);
    if (userElement) {
        userElement.style.left = `${user.x - 30}px`;
        userElement.style.top = `${user.y - 30}px`;
    }
}

// Remove user element
function removeUser(userId) {
    const userElement = document.querySelector(`[data-user-id="${userId}"]`);
    if (userElement) {
        userElement.remove();
    }
}

// Remove food element
function removeFood(foodId) {
    const foodElement = document.querySelector(`[data-food-id="${foodId}"]`);
    if (foodElement) {
        foodElement.remove();
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    if (currentUser) {
        // Keep user within bounds
        currentUser.x = Math.min(window.innerWidth - 30, Math.max(30, currentUser.x));
        currentUser.y = Math.min(window.innerHeight - 30, Math.max(30, currentUser.y));
        updateUserPosition(currentUser);
    }
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
