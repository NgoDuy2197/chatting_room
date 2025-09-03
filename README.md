# Chating Room Guy - Real-time Chat Game

A fun, interactive real-time chat application with game-like features where users can move around, collect food, and chat with each other in a colorful virtual space.

## Features

- **Real-time Chat**: Instant messaging with other users in the same room
- **Game-like Interface**: Move your character using WASD or arrow keys
- **Food Collection**: Collect emoji food items to earn points
- **Room System**: Create or join chat rooms with unique IDs
- **Visual Characters**: Each user has a unique emoji character and color
- **Score System**: Earn points by collecting food items
- **Responsive Design**: Works on both desktop and mobile devices

## Installation

1. Make sure you have Node.js installed (version 14 or higher)

2. Clone or download this project

3. Install dependencies:
```bash
npm install
```

4. Start the server:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

5. Open your browser and go to `http://localhost:3000`

## How to Use

### Getting Started
1. Enter a Room ID (any name you want)
2. Optionally enter your username
3. Click "Create Room" to create a new room or "Join Room" to join an existing one

### Game Controls
- **WASD** or **Arrow Keys**: Move your character
- **Enter** or **Send Button**: Send a chat message
- **Mouse**: Click on food items to collect them (or just walk over them)

### Features
- **Character Movement**: Your character appears as a colorful emoji that you can move around the screen
- **Chat Messages**: Type messages in the input box at the bottom. Messages appear above your character's head
- **Food Collection**: Emoji food items spawn every 3-5 seconds. Walk over them to collect points
- **Score Display**: Your current score is shown in the top-left corner
- **Room Information**: See the room ID and number of players in the top-right corner

## Technical Details

### Backend (Node.js + Express + Socket.IO)
- Real-time communication using Socket.IO
- Room management system
- User state tracking
- Food spawning system
- Message broadcasting

### Frontend (HTML + CSS + JavaScript)
- Responsive design with modern CSS
- Real-time game rendering
- Keyboard input handling
- Smooth animations and transitions
- Mobile-friendly interface

### Dependencies
- `express`: Web server framework
- `socket.io`: Real-time communication
- `uuid`: Unique ID generation

## Project Structure

```
chating_room_guy/
├── server.js          # Main server file
├── package.json       # Dependencies and scripts
├── README.md          # This file
└── public/            # Static files
    ├── index.html     # Main HTML page
    ├── styles.css     # CSS styles
    └── script.js      # Client-side JavaScript
```

## Customization

### Adding New Food Emojis
Edit the `foodEmojis` array in `server.js` to add or change the food items that spawn.

### Changing Character Emojis
Edit the `characterEmojis` array in `script.js` to change the available character emojis.

### Modifying Colors and Styling
Edit `styles.css` to customize the visual appearance of the application.

## Browser Compatibility

This application works best in modern browsers that support:
- ES6+ JavaScript features
- CSS Grid and Flexbox
- WebSocket connections
- CSS animations and transitions

## Troubleshooting

### Port Already in Use
If port 3000 is already in use, you can change it by setting the `PORT` environment variable:
```bash
PORT=3001 npm start
```

### Connection Issues
Make sure your firewall allows connections on the specified port and that you're accessing the correct URL.

## License

This project is open source and available under the MIT License.
