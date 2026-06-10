// Global variables
let socket;
let currentRoom = null;
let currentUser = null;
let users = new Map();
let foods = new Map();
let messages = new Map();
let keys = {};
let score = 0;

// Tunables
const MOVE_SPEED = 5;          // pixels per frame (at 60fps)
const LERP = 0.22;             // how quickly remote players glide to their target
const PREVIEW_LEN = 120;       // chars before a message gets a "Xem thêm" button

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

// Message modal elements
const messageModal = document.getElementById('messageModal');
const closeMessageModal = document.getElementById('closeMessageModal');
const messageModalUser = document.getElementById('messageModalUser');
const messageModalText = document.getElementById('messageModalText');

// Escape HTML so messages can't break the layout / inject markup
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Initialize the application
function init() {
    socket = io();
    setupEventListeners();
    setupKeyboardControls();
    startGameLoop();
}

// Set up event listeners
function setupEventListeners() {
    // Welcome screen buttons
    createRoomBtn.addEventListener('click', handleCreateRoom);
    joinRoomBtn.addEventListener('click', handleJoinRoom);

    // Allow Enter to join from the welcome inputs
    [roomIdInput, usernameInput].forEach(inp => {
        inp.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleJoinRoom();
        });
    });

    // Chat input
    chatInput.addEventListener('keypress', handleChatKeyPress);
    chatInput.addEventListener('input', updateCharCount);
    sendMessageBtn.addEventListener('click', sendMessage);

    // Room modal events
    roomInfoBtn.addEventListener('click', showRoomModal);
    closeModal.addEventListener('click', hideRoomModal);
    leaveRoomBtn.addEventListener('click', handleLeaveRoom);
    copyRoomIdBtn.addEventListener('click', copyRoomId);

    // Message modal events
    closeMessageModal.addEventListener('click', hideMessageModal);

    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === roomModal) hideRoomModal();
        if (e.target === messageModal) hideMessageModal();
    });

    // Close modals with Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideRoomModal();
            hideMessageModal();
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
        const typing = document.activeElement === chatInput;

        // Spacebar => "pop" the player's character (only while playing, not typing)
        if (e.code === 'Space' && !typing && gameScreen.classList.contains('active')) {
            e.preventDefault();
            popSelf();
            return;
        }

        if (!typing) {
            keys[e.key.toLowerCase()] = true;
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });

    // Stop drifting if the window loses focus
    window.addEventListener('blur', () => { keys = {}; });
}

// Make the player's own character puff up then settle back
function popSelf() {
    const el = document.querySelector('.user-character.self');
    if (!el) return;
    el.classList.remove('pop');
    void el.offsetWidth; // force reflow so the animation can restart
    el.classList.add('pop');
}

// Handle create / join room
function handleCreateRoom() {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
        showNotification('Hãy nhập tên phòng nhé!', 'error');
        return;
    }
    joinRoom(roomId, usernameInput.value.trim(), true);
}

function handleJoinRoom() {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
        showNotification('Hãy nhập tên phòng nhé!', 'error');
        return;
    }
    joinRoom(roomId, usernameInput.value.trim(), false);
}

function joinRoom(roomId, username) {
    socket.emit('joinRoom', { roomId, username });
}

// Handle room joined
function handleRoomJoined(data) {
    currentRoom = data.roomId;
    currentUser = data.users.find(user => user.id === socket.id);
    users.clear();
    foods.clear();
    messages.clear();
    gameCanvas.innerHTML = '';

    data.users.forEach(user => {
        initUserTargets(user);
        users.set(user.id, user);
        renderUser(user);
    });

    data.foods.forEach(food => {
        foods.set(food.id, food);
        renderFood(food);
    });

    data.messages.forEach(message => messages.set(message.id, message));

    updateRoomInfo();
    welcomeScreen.classList.remove('active');
    gameScreen.classList.add('active');

    setTimeout(() => {
        chatInput.focus();
        updateCharCount();
    }, 100);

    showNotification('Chào mừng tới phòng! Dùng WASD/phím mũi tên để di chuyển, Space để nhún.', 'success');
}

function initUserTargets(user) {
    user.tx = user.x;
    user.ty = user.y;
}

// Handle user joined
function handleUserJoined(user) {
    initUserTargets(user);
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

// Handle user moved (remote) -> set glide target, animation does the rest
function handleUserMoved(data) {
    const user = users.get(data.userId);
    if (user && user.id !== socket.id) {
        user.tx = data.x;
        user.ty = data.y;
    }
}

// Handle new message
function handleNewMessage(message) {
    messages.set(message.id, message);
    createMessageBubble(message);

    setTimeout(() => {
        messages.delete(message.id);
        const el = document.querySelector(`[data-message-id="${message.id}"]`);
        if (el) {
            el.classList.add('fade-out');
            setTimeout(() => el.remove(), 300);
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
        showNotification('Tin nhắn quá dài! Tối đa 512 ký tự.', 'error');
        return;
    }

    if (currentRoom) {
        socket.emit('sendMessage', { roomId: currentRoom, message });
        chatInput.value = '';
        updateCharCount();
    }
}

function handleChatKeyPress(e) {
    if (e.key === 'Enter') sendMessage();
}

// Create message bubble (with "Xem thêm" for long messages)
function createMessageBubble(message) {
    const el = document.createElement('div');
    el.className = 'chat-message';
    el.setAttribute('data-message-id', message.id);
    el.style.left = `${message.x}px`;
    el.style.top = `${message.y - 80}px`;

    const text = message.message;
    let body;
    if (text.length > PREVIEW_LEN) {
        const preview = escapeHtml(text.slice(0, PREVIEW_LEN).trimEnd()) + '…';
        body = `<div class="message-text">${preview}</div>
                <button class="read-more-btn" type="button">📖 Xem thêm</button>`;
    } else {
        body = `<div class="message-text">${escapeHtml(text)}</div>`;
    }

    el.innerHTML = `<div class="username">${escapeHtml(message.username)}</div>${body}`;

    const btn = el.querySelector('.read-more-btn');
    if (btn) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openMessageModal(message.username, text);
        });
    }

    gameCanvas.appendChild(el);
}

// Open the full-message window
function openMessageModal(username, text) {
    messageModalUser.textContent = `💬 ${username}`;
    messageModalText.textContent = text;
    messageModal.style.display = 'block';
}

function hideMessageModal() {
    messageModal.style.display = 'none';
}

// Update room info
function updateRoomInfo() {
    roomInfo.textContent = `Phòng: ${currentRoom}`;
    playerCount.textContent = `Người chơi: ${users.size}`;
}

// Update score
function updateScore() {
    scoreText.textContent = `Điểm: ${score}`;
}

function showScoreIncrease() {
    const scoreDisplay = document.getElementById('scoreDisplay');
    scoreDisplay.classList.add('score-increase');
    setTimeout(() => scoreDisplay.classList.remove('score-increase'), 500);
}

// Room modal
function showRoomModal() {
    modalRoomId.textContent = currentRoom;
    modalPlayerCount.textContent = users.size;
    modalYourScore.textContent = score;
    roomModal.style.display = 'block';
}

function hideRoomModal() {
    roomModal.style.display = 'none';
}

// Handle leave room
function handleLeaveRoom() {
    if (confirm('Bạn có chắc muốn rời phòng?')) {
        if (currentRoom) socket.emit('leaveRoom', { roomId: currentRoom });

        currentRoom = null;
        currentUser = null;
        users.clear();
        foods.clear();
        messages.clear();
        score = 0;

        gameScreen.classList.remove('active');
        welcomeScreen.classList.add('active');

        roomIdInput.value = '';
        usernameInput.value = '';

        hideRoomModal();
        showNotification('Bạn đã rời phòng', 'info');
    }
}

// Copy room ID
function copyRoomId() {
    navigator.clipboard.writeText(currentRoom).then(() => {
        showNotification('Đã sao chép tên phòng!', 'success');
    }).catch(() => {
        showNotification('Không sao chép được tên phòng', 'error');
    });
}

// Update character count
function updateCharCount() {
    const len = chatInput.value.length;
    charCount.textContent = len;
    if (len > 450) {
        charCount.style.color = '#ff6b6b';
    } else if (len > 400) {
        charCount.style.color = '#ffa726';
    } else {
        charCount.style.color = '#7c9cff';
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    const container = document.getElementById('notificationContainer');
    container.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) notification.parentNode.removeChild(notification);
    }, 3000);
}

// ----- Smooth game loop (requestAnimationFrame) -----
let lastFrame = performance.now();

function startGameLoop() {
    lastFrame = performance.now();
    requestAnimationFrame(animate);
}

function animate(now) {
    // dt in "frames" (1 = 60fps); clamped so a stutter doesn't teleport players
    const dt = Math.min(3, (now - lastFrame) / 16.67) || 1;
    lastFrame = now;

    if (currentUser && currentRoom) handleMovement(dt);
    interpolateRemoteUsers(dt);

    requestAnimationFrame(animate);
}

// Movement throttling for the network
let lastMoveTime = 0;
const MOVE_THROTTLE = 50;
let movementTimeout = null;

// Handle local player movement
function handleMovement(dt) {
    const speed = MOVE_SPEED * dt;
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

    if (!moved) return;

    updateUserPosition(currentUser);
    checkLocalFoodCollision();

    const now = Date.now();
    if (now - lastMoveTime > MOVE_THROTTLE) {
        if (movementTimeout) clearTimeout(movementTimeout);
        socket.emit('moveUser', { roomId: currentRoom, x: currentUser.x, y: currentUser.y });
        lastMoveTime = now;
    } else {
        if (movementTimeout) clearTimeout(movementTimeout);
        movementTimeout = setTimeout(() => {
            socket.emit('moveUser', { roomId: currentRoom, x: currentUser.x, y: currentUser.y });
            lastMoveTime = Date.now();
        }, 100);
    }
}

// Smoothly glide remote players toward their last reported position
function interpolateRemoteUsers(dt) {
    const factor = Math.min(1, LERP * dt);
    users.forEach(user => {
        if (user.id === socket.id) return;
        if (user.tx === undefined) initUserTargets(user);

        const dx = user.tx - user.x;
        const dy = user.ty - user.y;

        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
            if (user.x !== user.tx || user.y !== user.ty) {
                user.x = user.tx;
                user.y = user.ty;
                updateUserPosition(user);
            }
            return;
        }

        user.x += dx * factor;
        user.y += dy * factor;
        updateUserPosition(user);
    });
}

// Local food collision feedback
function checkLocalFoodCollision() {
    foods.forEach(food => {
        if (Math.abs(food.x - currentUser.x) < 40 && Math.abs(food.y - currentUser.y) < 40) {
            const el = document.querySelector(`[data-food-id="${food.id}"]`);
            if (el) el.classList.add('food-near');
        }
    });
}

// Render food element
function renderFood(food) {
    const el = document.createElement('div');
    el.className = 'food-item';
    el.setAttribute('data-food-id', food.id);
    el.textContent = food.emoji;
    el.style.left = `${food.x}px`;
    el.style.top = `${food.y}px`;
    gameCanvas.appendChild(el);
}

// Render user element
function renderUser(user) {
    const el = document.createElement('div');
    el.className = 'user-character';
    el.setAttribute('data-user-id', user.id);
    if (user.id === socket.id) el.classList.add('self');
    el.textContent = characterEmojis[user.id.charCodeAt(0) % characterEmojis.length];
    el.style.left = `${user.x - 30}px`;
    el.style.top = `${user.y - 30}px`;
    el.style.backgroundColor = user.color;
    el.title = user.username;
    gameCanvas.appendChild(el);
}

// Update user position
function updateUserPosition(user) {
    const el = document.querySelector(`[data-user-id="${user.id}"]`);
    if (el) {
        el.style.left = `${user.x - 30}px`;
        el.style.top = `${user.y - 30}px`;
    }
}

// Remove elements
function removeUser(userId) {
    const el = document.querySelector(`[data-user-id="${userId}"]`);
    if (el) el.remove();
}

function removeFood(foodId) {
    const el = document.querySelector(`[data-food-id="${foodId}"]`);
    if (el) el.remove();
}

// Handle window resize
window.addEventListener('resize', () => {
    if (currentUser) {
        currentUser.x = Math.min(window.innerWidth - 30, Math.max(30, currentUser.x));
        currentUser.y = Math.min(window.innerHeight - 30, Math.max(30, currentUser.y));
        updateUserPosition(currentUser);
    }
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
