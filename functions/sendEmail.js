const nodemailer = require('nodemailer');

async function sendEmail(message) {
    return new Promise(async (resolve, reject) => {
        let mails = [
            'valentin.quilliec@estiam.com',
            'arthur.lacombe@estiam.com',
            'louis.benoist-foucher@estiam.com', 
            'dramane.kamissoko@estiam.com',
            'devtestbackend@gmail.com'
        ];
        let account = await nodemailer.createTestAccount();
        let transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: account.user,
                pass: account.pass
            },
        });

        transporter.verify((error, success) => {
            if (success) console.log('Server is ready to take a message');
        });

        let info = await transporter.sendMail({
            from: '"Dream Team Bot" devtestbackend@gmail.com',
            to: mails,
            subject: '[- ALERT -] for Administration',
            text: `${message}`
        }).catch(err => {
            if (err) reject(err.message);
        });

        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        return resolve('Mail sent: %s' + info.messageId);
    });
}

module.exports = {
    sendEmail
};