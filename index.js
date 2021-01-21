// Setup basic express server
const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: '*'
    }
});

app.enable('trust proxy');

app.get('/ping', (req, res) => res.send('pong'));

const redis = require('socket.io-redis');
const { Sequelize } = require('sequelize');
const port = process.env.SERVER_PORT || 3000;

const sequelize = new Sequelize(
    process.env.DB_NAME || "chatcloud",
    process.env.DB_USER || "root",
    process.env.DB_PWD || "root",
    {
        dialect: "mysql",
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 3306,
        logging: false
    }
);
try {
    sequelize.authenticate();
    sequelize.query('SELECT * FROM loggedUsers').then(() => {});
    console.log('Connecté à la base de données MySQL!');
} catch (error) {
    console.error('Impossible de se connecter, erreur suivante :', error);
    process.exit(1);
}

server.listen(port, () => {
    console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));

io.adapter(redis({ host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 }));
io.on('connection', (socket) => {
    let addedUser = false;

    // when the client emits 'new message', this listens and executes
    socket.on('new message', (data) => {
        sequelize.query("INSERT INTO `messages`(`id`, `message`, `username`) VALUES (null, '" + data +"', '" + socket.username + "')").then(() => {
            // we tell the client to execute 'new message'
            socket.broadcast.emit('new message', {
                username: socket.username,
                message: data
            });
            socket.emit('new message', {
                username: socket.username,
                message: data
            });
        });
    });

    // when the client emits 'add user', this listens and executes
    socket.on('add user', (username) => {
        if (addedUser) return;

        // we store the username in the socket session for this client
        socket.username = username;
        addedUser = true;
        sequelize.query("INSERT INTO `loggedUsers` (`id`, `username`) VALUES (null, '" + username + "')").then(() => {
            sequelize.query('SELECT * FROM loggedUsers').then(([result]) => {
                socket.emit('login', result.map((r) => r.username));
                // echo globally (all clients) that a person has connected
                socket.broadcast.emit('user joined', socket.username);
            });
            sequelize.query('SELECT * FROM messages LIMIT 50').then(([result]) => {
                socket.emit('previous messages', result.map((r) => ({username: r.username, message: r.message})));
            });
        });
    });

    // when the client emits 'typing', we broadcast it to others
    socket.on('typing', () => {
        socket.broadcast.emit('typing', socket.username);
    });

    // when the client emits 'stop typing', we broadcast it to others
    socket.on('stop typing', () => {
        socket.broadcast.emit('stop typing', socket.username);
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', () => {
        if (addedUser) {
            sequelize.query("DELETE FROM `loggedUsers` WHERE username='" + socket.username + "'").then(([result]) => {
                // echo globally that this client has left
                socket.broadcast.emit('user left', socket.username);
            });
        }
    });
});
