// ===== State =====
let socket;
let currentRoom = null;
let currentUser = null;
let users = new Map();
let foods = new Map();
let messages = new Map();
let keys = {};
let score = 0;

// ===== Constants =====
const MOVE_SPEED  = 5;
const LERP        = 0.22;
const PREVIEW_LEN = 120;

const CHARACTER_EMOJIS = ['😀','😎','🤖','👾','🐱','🐶','🦊','🐸','🐙','🦄','🌈','⭐','🎮','🎯','🎪'];
const REACTION_EMOJIS  = ['👍','❤️','😂','🎉','🔥'];

// ===== DOM refs =====
const welcomeScreen  = document.getElementById('welcomeScreen');
const gameScreen     = document.getElementById('gameScreen');
const roomIdInput    = document.getElementById('roomId');
const usernameInput  = document.getElementById('username');
const createRoomBtn  = document.getElementById('createRoom');
const joinRoomBtn    = document.getElementById('joinRoom');
const gameCanvas     = document.getElementById('gameCanvas');
const chatInput      = document.getElementById('chatInput');
const sendMessageBtn = document.getElementById('sendMessage');
const scoreText      = document.getElementById('scoreText');
const roomInfo       = document.getElementById('roomInfo');
const playerCount    = document.getElementById('playerCount');
const charCount      = document.getElementById('charCount');
const roomInfoBtn    = document.getElementById('roomInfoBtn');
const roomModal      = document.getElementById('roomModal');
const closeModal     = document.getElementById('closeModal');
const leaveRoomBtn   = document.getElementById('leaveRoom');
const copyRoomIdBtn  = document.getElementById('copyRoomId');
const modalRoomId    = document.getElementById('modalRoomId');
const modalPlayerCount  = document.getElementById('modalPlayerCount');
const modalYourScore    = document.getElementById('modalYourScore');
const messageModal      = document.getElementById('messageModal');
const closeMessageModal = document.getElementById('closeMessageModal');
const messageModalUser  = document.getElementById('messageModalUser');
const messageModalText  = document.getElementById('messageModalText');

// ===== Helpers =====
function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function charEmoji(id) {
    return CHARACTER_EMOJIS[id.charCodeAt(0) % CHARACTER_EMOJIS.length];
}

// ===== Trail System =====
let trailCanvas, trailCtx;
const mouseTrail = [];   // {x, y, t}
const charTrail  = [];   // {x, y, t}
const MOUSE_AGE  = 550;  // ms
const CHAR_AGE   = 750;
const MOUSE_DIST = 7;
const CHAR_DIST  = 4;

function initTrail() {
    trailCanvas = document.createElement('canvas');
    trailCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:50;';
    trailCanvas.width  = window.innerWidth;
    trailCanvas.height = window.innerHeight;
    document.body.appendChild(trailCanvas);
    trailCtx = trailCanvas.getContext('2d');

    window.addEventListener('mousemove', (e) => {
        const now  = performance.now();
        const last = mouseTrail[mouseTrail.length - 1];
        if (!last || Math.hypot(e.clientX - last.x, e.clientY - last.y) > MOUSE_DIST) {
            mouseTrail.push({ x: e.clientX, y: e.clientY, t: now });
        }
    });

    window.addEventListener('resize', () => {
        trailCanvas.width  = window.innerWidth;
        trailCanvas.height = window.innerHeight;
    });
}

function addCharTrailPoint(x, y) {
    const now  = performance.now();
    const last = charTrail[charTrail.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) > CHAR_DIST) {
        charTrail.push({ x, y, t: now });
    }
}

function drawTrails(now) {
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);

    // --- Prune old points ---
    while (mouseTrail.length && now - mouseTrail[0].t > MOUSE_AGE) mouseTrail.shift();
    while (charTrail.length  && now - charTrail[0].t  > CHAR_AGE)  charTrail.shift();

    // --- Mouse cursor trail (smooth bezier curve) ---
    if (mouseTrail.length >= 2) {
        trailCtx.beginPath();
        trailCtx.moveTo(mouseTrail[0].x, mouseTrail[0].y);
        for (let i = 1; i < mouseTrail.length - 1; i++) {
            const mx = (mouseTrail[i].x + mouseTrail[i + 1].x) / 2;
            const my = (mouseTrail[i].y + mouseTrail[i + 1].y) / 2;
            trailCtx.quadraticCurveTo(mouseTrail[i].x, mouseTrail[i].y, mx, my);
        }
        const last = mouseTrail[mouseTrail.length - 1];
        trailCtx.lineTo(last.x, last.y);

        // Use a gradient along the path based on the canvas coordinates
        const first = mouseTrail[0];
        const grad = trailCtx.createLinearGradient(first.x, first.y, last.x, last.y);
        grad.addColorStop(0, 'hsla(220,75%,70%,0)');
        grad.addColorStop(1, 'hsla(270,75%,72%,0.28)');

        trailCtx.strokeStyle = grad;
        trailCtx.lineWidth   = 5;
        trailCtx.lineCap     = 'round';
        trailCtx.lineJoin    = 'round';
        trailCtx.stroke();
    }

    // --- Character position trail (soft glowing blobs) ---
    for (let i = 0; i < charTrail.length; i++) {
        const p    = charTrail[i];
        const age  = (now - p.t) / CHAR_AGE;
        const prog = i / Math.max(charTrail.length - 1, 1);
        const alpha  = (1 - age) * (1 - age) * 0.28;   // quadratic fade, lower peak
        const radius = (1 - age) * 20 + 4;
        const hue    = 210 + prog * 50;

        const g = trailCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        g.addColorStop(0, `hsla(${hue},75%,72%,${alpha})`);
        g.addColorStop(1, `hsla(${hue + 20},75%,72%,0)`);

        trailCtx.beginPath();
        trailCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        trailCtx.fillStyle = g;
        trailCtx.fill();
    }
}

// ===== Welcome screen particles =====
function initWelcomeParticles() {
    const colors = ['#bfe3ff','#ffd6e8','#c8f4e0','#e7d8ff','#ffe0c7','#fff'];
    for (let i = 0; i < 18; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = 10 + Math.random() * 22;
        p.style.cssText = `
            left: ${Math.random() * 100}%;
            top:  ${Math.random() * 100}%;
            width:  ${size}px;
            height: ${size}px;
            background: ${colors[i % colors.length]};
            opacity: ${0.3 + Math.random() * 0.45};
            animation-duration: ${3.5 + Math.random() * 5}s;
            animation-delay: ${-Math.random() * 6}s;
        `;
        welcomeScreen.appendChild(p);
    }
}

// ===== Typing indicator =====
const typingTimers = new Map();

function showTypingIndicator(userId) {
    let el = document.querySelector(`[data-typing-id="${userId}"]`);
    if (!el) {
        el = document.createElement('div');
        el.className = 'typing-indicator';
        el.setAttribute('data-typing-id', userId);
        el.innerHTML = '<span></span><span></span><span></span>';
        gameCanvas.appendChild(el);
    }
    const user = users.get(userId);
    if (user) {
        el.style.left = `${user.x - 12}px`;
        el.style.top  = `${user.y - 85}px`;
    }
}

function hideTypingIndicator(userId) {
    const el = document.querySelector(`[data-typing-id="${userId}"]`);
    if (el) el.remove();
    typingTimers.delete(userId);
}

// ===== Emoji reactions =====
function spawnReactionFloat(x, y, emoji) {
    const el = document.createElement('div');
    el.className  = 'reaction-float';
    el.textContent = emoji;
    el.style.left  = `${x - 15}px`;
    el.style.top   = `${y - 30}px`;
    gameCanvas.appendChild(el);
    setTimeout(() => el.remove(), 1700);
}

// ===== Init =====
function init() {
    socket = io();
    initTrail();
    initWelcomeParticles();
    setupEventListeners();
    setupKeyboardControls();
    startGameLoop();
}

// ===== Event listeners =====
function setupEventListeners() {
    createRoomBtn.addEventListener('click', handleCreateRoom);
    joinRoomBtn.addEventListener('click',   handleJoinRoom);

    [roomIdInput, usernameInput].forEach(inp => {
        inp.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleJoinRoom(); });
    });

    chatInput.addEventListener('keypress', handleChatKeyPress);
    chatInput.addEventListener('input', () => {
        updateCharCount();
        if (currentRoom) socket.emit('typing', { roomId: currentRoom });
    });

    sendMessageBtn.addEventListener('click', sendMessage);
    roomInfoBtn.addEventListener('click', showRoomModal);
    closeModal.addEventListener('click',  hideRoomModal);
    leaveRoomBtn.addEventListener('click', handleLeaveRoom);
    copyRoomIdBtn.addEventListener('click', copyRoomId);
    closeMessageModal.addEventListener('click', hideMessageModal);

    window.addEventListener('click', (e) => {
        if (e.target === roomModal)    hideRoomModal();
        if (e.target === messageModal) hideMessageModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { hideRoomModal(); hideMessageModal(); }
    });

    // Socket events
    socket.on('roomJoined',    handleRoomJoined);
    socket.on('userJoined',    handleUserJoined);
    socket.on('userLeft',      handleUserLeft);
    socket.on('userMoved',     handleUserMoved);
    socket.on('newMessage',    handleNewMessage);
    socket.on('newFood',       handleNewFood);
    socket.on('foodEaten',     handleFoodEaten);
    socket.on('foodRemoved',   handleFoodRemoved);

    socket.on('userTyping', ({ userId }) => {
        if (userId === socket.id) return;
        showTypingIndicator(userId);
        if (typingTimers.has(userId)) clearTimeout(typingTimers.get(userId));
        typingTimers.set(userId, setTimeout(() => hideTypingIndicator(userId), 3000));
    });

    socket.on('userReaction', ({ userId, emoji, x, y }) => {
        if (userId !== socket.id) spawnReactionFloat(x, y, emoji);
    });

    socket.on('userPopped', ({ userId }) => {
        popUser(userId);
    });
}

// ===== Keyboard controls =====
const MOVE_KEYS = new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);

function setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        const typing = document.activeElement === chatInput;
        const keyLow = e.key.toLowerCase();
        const inGame = gameScreen.classList.contains('active');

        if (!inGame) return;

        // Enter (not typing) → focus chat input
        if (e.key === 'Enter' && !typing) {
            e.preventDefault();
            chatInput.focus();
            return;
        }

        // Space → pop always (typing or not), but don't interfere with text input
        if (e.code === 'Space' && inGame) {
            popSelf();
            if (currentRoom) socket.emit('popUser', { roomId: currentRoom });
            // don't preventDefault so the space still types into the input
        }

        // Reaction keys 1-5 always
        const num = parseInt(e.key);
        if (num >= 1 && num <= 5 && currentRoom) {
            const emoji = REACTION_EMOJIS[num - 1];
            socket.emit('reaction', { roomId: currentRoom, emoji });
            if (currentUser) spawnReactionFloat(currentUser.x, currentUser.y, emoji);
        }

        // Movement keys always active in-game
        if (MOVE_KEYS.has(keyLow)) {
            if (keyLow.startsWith('arrow')) e.preventDefault(); // stop page scroll
            keys[keyLow] = true;
            return;
        }

        if (!typing) keys[keyLow] = true;
    });

    document.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { keys = {}; });
}

function popSelf() {
    popUser(socket ? socket.id : null, true);
}

function popUser(userId, isSelf = false) {
    const selector = isSelf ? '.user-character.self' : `[data-user-id="${userId}"]`;
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
}

// ===== Room handling =====
function handleCreateRoom() {
    const roomId = roomIdInput.value.trim();
    if (!roomId) { showNotification('Hãy nhập tên phòng nhé!', 'error'); return; }
    joinRoomReq(roomId, usernameInput.value.trim());
}

function handleJoinRoom() {
    const roomId = roomIdInput.value.trim();
    if (!roomId) { showNotification('Hãy nhập tên phòng nhé!', 'error'); return; }
    joinRoomReq(roomId, usernameInput.value.trim());
}

function joinRoomReq(roomId, username) {
    socket.emit('joinRoom', { roomId, username });
}

function handleRoomJoined(data) {
    currentRoom = data.roomId;
    currentUser = data.users.find(u => u.id === socket.id);
    users.clear(); foods.clear(); messages.clear();
    gameCanvas.innerHTML = '';

    data.users.forEach(u => { initUserTargets(u); users.set(u.id, u); renderUser(u); });
    data.foods.forEach(f => { foods.set(f.id, f); renderFood(f); });
    data.messages.forEach(m => messages.set(m.id, m));

    updateRoomInfo();
    welcomeScreen.classList.remove('active');
    gameScreen.classList.add('active');

    setTimeout(() => { chatInput.focus(); updateCharCount(); }, 100);
    showNotification('Chào mừng! Dùng WASD di chuyển, Space nhún, 1–5 reaction 🎉', 'success');
}

function initUserTargets(user) { user.tx = user.x; user.ty = user.y; }

function handleUserJoined(user) {
    initUserTargets(user);
    users.set(user.id, user);
    updateRoomInfo();
    renderUser(user);
    showNotification(`${user.username} đã vào phòng!`, 'info');
}

function handleUserLeft(userId) {
    const user = users.get(userId);
    if (user) showNotification(`${user.username} đã rời phòng`, 'info');
    users.delete(userId);
    hideTypingIndicator(userId);
    updateRoomInfo();
    removeUser(userId);
}

function handleUserMoved(data) {
    const user = users.get(data.userId);
    if (user && user.id !== socket.id) { user.tx = data.x; user.ty = data.y; }
}

function handleNewMessage(message) {
    messages.set(message.id, message);
    createMessageBubble(message);
    setTimeout(() => {
        messages.delete(message.id);
        const el = document.querySelector(`[data-message-id="${message.id}"]`);
        if (el) { el.classList.add('fade-out'); setTimeout(() => el.remove(), 300); }
    }, 10000);
}

function handleNewFood(food) { foods.set(food.id, food); renderFood(food); }

function handleFoodEaten(data) {
    // Keep all users' scores up to date
    const user = users.get(data.userId);
    if (user) user.score = data.score;

    if (data.userId === socket.id) {
        score = data.score;
        updateScore();
        showScoreIncrease();
    }
    if (data.foodId) { foods.delete(data.foodId); removeFood(data.foodId); }
}

function handleFoodRemoved(data) {
    if (data.foodId) { foods.delete(data.foodId); removeFood(data.foodId); }
}

// ===== Messaging =====
function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    if (message.length > 512) { showNotification('Tin nhắn quá dài! Tối đa 512 ký tự.', 'error'); return; }
    if (currentRoom) {
        socket.emit('sendMessage', { roomId: currentRoom, message });
        chatInput.value = '';
        updateCharCount();
    }
}

function handleChatKeyPress(e) {
    if (e.key === 'Enter') {
        sendMessage();
        chatInput.blur();
    }
}

function createMessageBubble(message) {
    const el = document.createElement('div');
    el.className = 'chat-message';
    el.setAttribute('data-message-id', message.id);
    el.style.left = `${message.x}px`;
    el.style.top  = `${message.y - 85}px`;

    const text = message.message;
    let body;
    if (text.length > PREVIEW_LEN) {
        const preview = escapeHtml(text.slice(0, PREVIEW_LEN).trimEnd()) + '…';
        body = `<div class="message-text">${preview}</div><button class="read-more-btn" type="button">📖 Xem thêm</button>`;
    } else {
        body = `<div class="message-text">${escapeHtml(text)}</div>`;
    }

    el.innerHTML = `<div class="username">${escapeHtml(message.username)}</div>${body}`;

    const btn = el.querySelector('.read-more-btn');
    if (btn) {
        btn.addEventListener('click', (e) => { e.stopPropagation(); openMessageModal(message.username, text); });
    }

    gameCanvas.appendChild(el);
}

function openMessageModal(username, text) {
    messageModalUser.textContent = `💬 ${username}`;
    messageModalText.textContent = text;
    messageModal.style.display = 'block';
}

function hideMessageModal() { messageModal.style.display = 'none'; }

// ===== Room modal =====
function showRoomModal() {
    modalRoomId.textContent      = currentRoom;
    modalPlayerCount.textContent = users.size;
    modalYourScore.textContent   = score;

    const sorted = Array.from(users.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
    const lb = document.getElementById('leaderboard');
    if (sorted.length === 0) {
        lb.innerHTML = '<div style="text-align:center;color:#b0aac8;font-size:13px;padding:8px">Chưa có ai.</div>';
    } else {
        lb.innerHTML = sorted.map((u, i) => `
            <div class="lb-row ${u.id === socket.id ? 'lb-self' : ''}">
                <span class="lb-rank">${i + 1}</span>
                <span class="lb-name">${escapeHtml(u.username)}</span>
                <span class="lb-score">⭐ ${u.score || 0}</span>
            </div>`).join('');
    }

    roomModal.style.display = 'block';
}

function hideRoomModal() { roomModal.style.display = 'none'; }

function handleLeaveRoom() {
    if (!confirm('Bạn có chắc muốn rời phòng?')) return;
    if (currentRoom) socket.emit('leaveRoom', { roomId: currentRoom });
    currentRoom = null; currentUser = null;
    users.clear(); foods.clear(); messages.clear();
    score = 0; charTrail.length = 0;
    gameScreen.classList.remove('active');
    welcomeScreen.classList.add('active');
    roomIdInput.value = ''; usernameInput.value = '';
    hideRoomModal();
    showNotification('Bạn đã rời phòng', 'info');
}

function copyRoomId() {
    navigator.clipboard.writeText(currentRoom)
        .then(() => showNotification('Đã sao chép tên phòng!', 'success'))
        .catch(() => showNotification('Không sao chép được', 'error'));
}

// ===== UI helpers =====
function updateRoomInfo() {
    roomInfo.textContent  = `Phòng: ${currentRoom}`;
    playerCount.textContent = `👥 ${users.size}`;
}

function updateScore() { scoreText.textContent = score; }

function showScoreIncrease() {
    const d = document.getElementById('scoreDisplay');
    d.classList.add('score-increase');
    setTimeout(() => d.classList.remove('score-increase'), 500);
}

function updateCharCount() {
    const len = chatInput.value.length;
    charCount.textContent = len;
    charCount.style.color = len > 450 ? '#ff6b6b' : len > 400 ? '#ffa726' : '';
}

function showNotification(message, type = 'info') {
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = message;
    document.getElementById('notificationContainer').appendChild(n);
    setTimeout(() => { if (n.parentNode) n.parentNode.removeChild(n); }, 3000);
}

// ===== Render =====
function renderUser(user) {
    const el = document.createElement('div');
    el.className = 'user-character';
    el.setAttribute('data-user-id', user.id);
    if (user.id === socket.id) el.classList.add('self');

    el.style.cssText = `left:${user.x - 30}px;top:${user.y - 42}px;--char-color:${user.color};`;
    el.title = user.username;

    el.innerHTML = `
        <div class="char-avatar">${charEmoji(user.id)}</div>
        <div class="user-label">${escapeHtml(user.username)}</div>
    `;

    gameCanvas.appendChild(el);
}

function renderFood(food) {
    const el = document.createElement('div');
    el.className = 'food-item';
    el.setAttribute('data-food-id', food.id);
    el.textContent = food.emoji;
    el.style.left = `${food.x}px`;
    el.style.top  = `${food.y}px`;
    gameCanvas.appendChild(el);
}

function updateUserPosition(user) {
    const el = document.querySelector(`[data-user-id="${user.id}"]`);
    if (el) { el.style.left = `${user.x - 30}px`; el.style.top = `${user.y - 42}px`; }
}

function removeUser(userId) {
    const el = document.querySelector(`[data-user-id="${userId}"]`);
    if (el) el.remove();
}

function removeFood(foodId) {
    const el = document.querySelector(`[data-food-id="${foodId}"]`);
    if (el) el.remove();
}

// ===== Game loop =====
let lastFrame = performance.now();

function startGameLoop() {
    lastFrame = performance.now();
    requestAnimationFrame(animate);
}

function animate(now) {
    const dt = Math.min(3, (now - lastFrame) / 16.67) || 1;
    lastFrame = now;

    drawTrails(now);

    if (currentUser && currentRoom) handleMovement(dt);
    interpolateRemoteUsers(dt);

    requestAnimationFrame(animate);
}

// ===== Movement =====
let lastMoveTime    = 0;
const MOVE_THROTTLE = 50;
let movementTimeout = null;

function handleMovement(dt) {
    const speed = MOVE_SPEED * dt;
    let moved = false;

    if (keys['w'] || keys['arrowup'])    { currentUser.y = Math.max(42, currentUser.y - speed); moved = true; }
    if (keys['s'] || keys['arrowdown'])  { currentUser.y = Math.min(window.innerHeight - 30, currentUser.y + speed); moved = true; }
    if (keys['a'] || keys['arrowleft'])  { currentUser.x = Math.max(30, currentUser.x - speed); moved = true; }
    if (keys['d'] || keys['arrowright']) { currentUser.x = Math.min(window.innerWidth  - 30, currentUser.x + speed); moved = true; }

    if (!moved) return;

    addCharTrailPoint(currentUser.x, currentUser.y);
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

function interpolateRemoteUsers(dt) {
    const factor = Math.min(1, LERP * dt);
    users.forEach(user => {
        if (user.id === socket.id) return;
        if (user.tx === undefined) initUserTargets(user);
        const dx = user.tx - user.x;
        const dy = user.ty - user.y;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
            if (user.x !== user.tx || user.y !== user.ty) { user.x = user.tx; user.y = user.ty; updateUserPosition(user); }
            return;
        }
        user.x += dx * factor;
        user.y += dy * factor;
        updateUserPosition(user);
    });
}

function checkLocalFoodCollision() {
    foods.forEach(food => {
        if (Math.abs(food.x - currentUser.x) < 40 && Math.abs(food.y - currentUser.y) < 40) {
            const el = document.querySelector(`[data-food-id="${food.id}"]`);
            if (el) el.classList.add('food-near');
        }
    });
}

// ===== Window resize =====
window.addEventListener('resize', () => {
    if (currentUser) {
        currentUser.x = Math.min(window.innerWidth  - 30, Math.max(30, currentUser.x));
        currentUser.y = Math.min(window.innerHeight - 30, Math.max(42, currentUser.y));
        updateUserPosition(currentUser);
    }
});

document.addEventListener('DOMContentLoaded', init);
