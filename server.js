const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store rooms and their data
const rooms = new Map();

// Food emojis for the game
const foodEmojis = [
  '🍎', '🍕', '🍔', '🍦', '🍩', '🍪', '🍫', '🍭', '🍬', '🍡',
  '🍰', '🧁', '🍮', '🍯', '🥞', '🥨', '🥯', '🥖', '🧀', '🥚'
];

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join room
  socket.on('joinRoom', (data) => {
    const { roomId, username } = data;
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Map(),
        foods: [],
        messages: []
      });
    }

    const room = rooms.get(roomId);
    
    // Add user to room
    room.users.set(socket.id, {
      id: socket.id,
      username: username || `User_${socket.id.slice(0, 6)}`,
      x: Math.random() * 800,
      y: Math.random() * 600,
      score: 0,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`
    });

    socket.join(roomId);
    
    // Send room data to the new user
    socket.emit('roomJoined', {
      roomId,
      users: Array.from(room.users.values()),
      foods: room.foods,
      messages: room.messages.slice(-50) // Last 50 messages
    });

    // Notify other users in the room
    socket.to(roomId).emit('userJoined', room.users.get(socket.id));
  });

  // Handle user movement
  socket.on('moveUser', (data) => {
    const { roomId, x, y } = data;
    const room = rooms.get(roomId);
    
    if (room && room.users.has(socket.id)) {
      const user = room.users.get(socket.id);
      user.x = x;
      user.y = y;
      
      // Check for food collision with larger collision area
      const foodIndex = room.foods.findIndex(food => {
        const distanceX = Math.abs(food.x - x);
        const distanceY = Math.abs(food.y - y);
        // Increased collision area: 40px radius instead of 30px
        return distanceX < 40 && distanceY < 40;
      });
      
      if (foodIndex !== -1) {
        user.score += 10;
        const eatenFood = room.foods.splice(foodIndex, 1)[0];
        
        // Notify all users in the room
        io.to(roomId).emit('foodEaten', {
          userId: socket.id,
          score: user.score,
          foodId: eatenFood.id
        });
      }
      
      // Broadcast movement to other users
      socket.to(roomId).emit('userMoved', {
        userId: socket.id,
        x: user.x,
        y: user.y
      });
    }
  });

  // Handle chat messages
  socket.on('sendMessage', (data) => {
    const { roomId, message } = data;
    const room = rooms.get(roomId);
    
    if (room && room.users.has(socket.id)) {
      const user = room.users.get(socket.id);
      const messageData = {
        id: uuidv4(),
        userId: socket.id,
        username: user.username,
        message: message,
        timestamp: Date.now(),
        x: user.x,
        y: user.y
      };
      
      room.messages.push(messageData);
      
      // Keep only last 100 messages
      if (room.messages.length > 100) {
        room.messages = room.messages.slice(-100);
      }
      
      // Broadcast message to all users in the room
      io.to(roomId).emit('newMessage', messageData);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove user from all rooms
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        
        // If room is empty, delete it
        if (room.users.size === 0) {
          rooms.delete(roomId);
        } else {
          // Notify other users
          socket.to(roomId).emit('userLeft', socket.id);
        }
        break;
      }
    }
  });
});

// Generate food every 3-5 seconds
setInterval(() => {
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size > 0) {
      const food = {
        id: uuidv4(),
        emoji: foodEmojis[Math.floor(Math.random() * foodEmojis.length)],
        x: Math.random() * 800,
        y: Math.random() * 600,
        createdAt: Date.now()
      };
      
      room.foods.push(food);
      io.to(roomId).emit('newFood', food);
      
      // Remove food after 15-20 seconds
      const removeTime = Math.random() * 5000 + 15000; // 15-20 seconds
      setTimeout(() => {
        const foodIndex = room.foods.findIndex(f => f.id === food.id);
        if (foodIndex !== -1) {
          room.foods.splice(foodIndex, 1);
          io.to(roomId).emit('foodRemoved', { foodId: food.id });
        }
      }, removeTime);
    }
  }
}, Math.random() * 2000 + 3000); // Random interval between 3-5 seconds

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});
