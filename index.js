// Setup basic express server
const { text } = require("express");
const express = require("express");
const app = express();
const path = require("path");
const { PythonShell } = require("python-shell");
const { getGeneralScore } = require("./functions/getGeneralScore");
const { sendEmail } = require('./functions/sendEmail');
const fs = require("fs");
const xlsx = require("xlsx");
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
    cors: {
        origin: "*",
    },
});

app.enable("trust proxy");

app.get("/ping", (req, res) => res.send("pong"));

//const redis = require('socket.io-redis');
const { Sequelize } = require("sequelize");
const port = process.env.SERVER_PORT || 3000;

const sequelize = new Sequelize(
    process.env.DB_NAME || "chatcloud",
    process.env.DB_USER || "root",
    process.env.DB_PWD || "root",
    {
        dialect: "mysql",
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 3306,
        logging: false,
    }
);
try {
    sequelize.authenticate();
    sequelize.query("SELECT * FROM users").then(() => {});
    console.log("Connecté à la base de données MySQL!");
} catch (error) {
    console.error("Impossible de se connecter, erreur suivante :", error);
    process.exit(1);
}

server.listen(port, () => {
    console.log("Server listening at port %d", port);
});

// Routing
app.use(express.static(path.join(__dirname, "public")));

const generateXlsx = async () => {
    let users = [];
    return new Promise((resolve, reject) => {
        let userObject = {};

        sequelize
            .query("SELECT * FROM `users`")
            .then(([result]) => {
                result.map((user) => {
                    userObject.id = user.id;
                    userObject.username = user.username;
                    userObject.score = user.score;
                    users.push(userObject);
                    userObject = {};
                });
                fs.writeFileSync("./data/data.json", JSON.stringify(users));
                return resolve("json generated");
            })
            .catch((err) => {
                if (err) reject(err.message);
            });
    });
};

app.get("/generate-xlsx", (req, res) => {
    generateXlsx();
});

let loggedUsers = [];

//io.adapter(redis({ host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 }));
io.on("connection", (socket) => {
    let addedUser = false;
    // when the client emits 'new message', this listens and executes
    socket.on("new message", (data) => {
        data = data.includes("'") ? data.replace("'", " ") : data;

        console.log(socket.username, "send message");
        sequelize
            .query(
                "INSERT INTO `messages`(`id`, `message`, `username`, `score`, `toneName`) VALUES (null, '" +
                    data +
                    "', '" +
                    socket.username +
                    "', 0, '')"
            )
            .then((message) => {
                // we tell the client to execute 'new message'
                const newMessageId = message[0];
                let score = 0;

                const runPython = async (data, sequelize) => {
                    let options = {
                        args: data,
                    };

                    const result = await new Promise((resolve, reject) => {
                        PythonShell.run("./scripts/toneAnalyzer.py", options, (err, results) => {
                            if (err) reject(err.message);
                            if (JSON.parse(results[0]).document_tone.tones[0] !== undefined) {
                                let score = JSON.parse(results[0]).document_tone.tones[0].score;
                                let toneName = JSON.parse(results[0]).document_tone.tones[0].tone_name;
                                return resolve({score: score, toneName: toneName});
                            }
                            resolve(0);
                        });
                    });
                    score = result;

                    await sequelize
                        .query("UPDATE `messages` SET `score` = " + score.score + ", `toneName` = '" + score.toneName + "' WHERE `id` = '" + newMessageId + "'")
                        .then(() => {})
                        .catch((err) => {
                            if (err) console.error(err.message);
                        });
                    return result;
                };

                try {
                    (async () => {
                        let score = await runPython(data, sequelize);
                        const newMessage = {
                            username: socket.username,
                            message: data,
                            score: score.score,
                        };
                        console.log("Score " + score.score, newMessage);
                        socket.broadcast.emit("new message", newMessage);
                        socket.emit("new message", newMessage);
                        let generalScore = await getGeneralScore(sequelize, socket.username);
                        socket.broadcast.emit("update user score", {
                            username: socket.username,
                            score: generalScore,
                        });
                        socket.emit("update user score", {
                            username: socket.username,
                            score: generalScore,
                        });
                        
                        let toneNameMean = [];

                        await sequelize
                            .query(
                                "SELECT * FROM `messages` WHERE `username`='" + socket.username + "' AND `score` > " + 0
                            ).then(([results]) => {
                                results.forEach(msg => {
                                    if (msg.toneName === 'Sadness') {
                                        toneNameMean.push(-1);
                                    } else {
                                        toneNameMean.push(1);
                                    }
                                });
                            }).catch(err => {
                                if (err) console.log(err);
                            });
                        console.log('Tone name mean array ', toneNameMean);

                        let avg = toneNameMean.length;
                        let sumOfToneNameMean = toneNameMean.reduce((accumulator, currentValue) => accumulator + currentValue);
                        console.log('avg ' + avg);
                        console.log('sum of tone name mean ' + sumOfToneNameMean);
                        console.log(sumOfToneNameMean / avg);

                        // Send email
                        if ((sumOfToneNameMean / avg) < 0) {
                            let mailSent = await sendEmail('This is an alert !');
                            console.log(mailSent);
                        }

                        await sequelize
                            .query(
                                "UPDATE `users` SET `score` = " +
                                    generalScore +
                                    "WHERE `username`='" +
                                    socket.username +
                                    "'"
                            )
                            .then(() => {})
                            .catch((err) => {
                                if (err) console.log(err.message);
                            });
                    })();
                } catch (error) {
                    if (error) console.log(error.message);
                }
            });
    });

    // when the client emits 'add user', this listens and executes
    socket.on("add user", (username) => {
        if (addedUser) return;

        socket.username = username;
        addedUser = true;

        sequelize.query("SELECT * FROM `users` WHERE `username`='" + socket.username + "'").then(([result]) => {
            if (result.length === 0) {
                sequelize
                    .query("INSERT INTO `users` (`id`, `username`, `score`) VALUES (null, '" + username + "', 0)")
                    .then((user) => {
                        const newUserId = user[0];
                        const newUser = { id: newUserId, username, score: 0 };
                        loggedUsers.push(newUser);
                        socket.emit("login", loggedUsers);
                        socket.broadcast.emit("user joined", newUser);
                        sequelize.query("SELECT * FROM messages LIMIT 50").then(([result]) => {
                            socket.emit(
                                "previous messages",
                                result.map((r) => ({ username: r.username, message: r.message, score: r.score }))
                            );
                        });
                    })
                    .catch((err) => {
                        if (err) console.log(err.message);
                    });
            } else {
                const user = result[0];
                const newUser = { id: user.id, username: user.username, score: user.score };
                loggedUsers.push(newUser);
                socket.emit("login", loggedUsers);
                socket.broadcast.emit("user joined", newUser);
                sequelize.query("SELECT * FROM messages LIMIT 50").then(([result]) => {
                    socket.emit(
                        "previous messages",
                        result.map((r) => ({ username: r.username, message: r.message, score: r.score }))
                    );
                });
            }
        });
    });

    // when the client emits 'typing', we broadcast it to others
    socket.on("typing", () => {
        socket.broadcast.emit("typing", socket.username);
    });

    // when the client emits 'stop typing', we broadcast it to others
    socket.on("stop typing", () => {
        socket.broadcast.emit("stop typing", socket.username);
    });

    // when the user disconnects.. perform this
    socket.on("disconnect", () => {
        if (addedUser) {
            loggedUsers = loggedUsers.filter((user) => user.username !== socket.username);
            // echo globally that this client has left
            socket.broadcast.emit("user left", socket.username);
        }
    });
});
