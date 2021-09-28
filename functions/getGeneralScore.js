async function getGeneralScore(sequelize, username) {
    return await new Promise((resolve, reject) => {
        let generalScore = 0;
        // SELECT `username`, AVG(score) FROM `messages` GROUP BY `username`
        sequelize.query("SELECT * FROM `messages` WHERE username='" + username + "'").then(([results]) => {
            console.log('username : ' + username)
            console.log(results)
            results.map(value => {
                generalScore += value.score
            });
            console.log('General score is ' + generalScore);
            return resolve(generalScore);
        }).catch(err => {
            reject(err.message);
        });
    });
}

module.exports = {
    getGeneralScore
}