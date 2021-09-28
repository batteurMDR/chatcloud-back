async function getGeneralScore(sequelize, username) {
    return await new Promise((resolve, reject) => {
        sequelize
            .query("SELECT `username`, AVG(score) AS score FROM `messages` GROUP BY `username`")
            .then(([results]) => {
                return resolve(results.find((us) => us.username === username).score);
            })
            .catch((err) => {
                reject(err.message);
            });
    });
}

module.exports = {
    getGeneralScore,
};
