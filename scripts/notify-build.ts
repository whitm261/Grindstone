import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';

async function main() {
  const apkPath = process.argv[2];
  const buildDurationSeconds = process.argv[3];
  
  const host = process.env.SMTP_HOST || '127.0.0.1';
  const port = parseInt(process.env.SMTP_PORT || '1025', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.NOTIFY_EMAIL;

  if (!user || !pass || !to) {
    console.error('Missing email configuration in environment variables.');
    console.error('Please set SMTP_USER, SMTP_PASS, and NOTIFY_EMAIL in your .env.local file.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // STARTTLS
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const apkName = apkPath ? path.basename(apkPath) : 'app-release.apk';
  const fullApkPath = apkPath ? path.resolve(process.cwd(), apkPath) : null;
  
  let statsStr = '';
  if (fullApkPath && fs.existsSync(fullApkPath)) {
    const stats = fs.statSync(fullApkPath);
    const sizeInMb = (stats.size / (1024 * 1024)).toFixed(2);
    statsStr += `Size: ${sizeInMb} MB\n`;
  }

  if (buildDurationSeconds) {
    const minutes = Math.floor(parseInt(buildDurationSeconds, 10) / 60);
    const seconds = parseInt(buildDurationSeconds, 10) % 60;
    statsStr += `Build Time: ${minutes}m ${seconds}s\n`;
  }

  const timestamp = new Date().toLocaleString();

  console.log(`Sending notification for ${apkName}...`);

  try {
    const info = await transporter.sendMail({
      from: `"MovingWeight Build" <${user}>`,
      to,
      subject: `Build Complete: ${apkName}`,
      text: `Your build of MovingWeight has completed successfully.\n\n` +
            `Timestamp: ${timestamp}\n` +
            `${statsStr}` +
            `File: ${apkName}\n` +
            `Path: ${fullApkPath || 'Unknown'}`,
    });

    console.log('Notification sent: %s', info.messageId);
  } catch (error) {
    console.error('Failed to send email:', error);
    process.exit(1);
  }
}

main();
