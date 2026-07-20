// utils/nodemailer.js
import axios from 'axios';

const sendMail = async (to, subject, htmlContent, replyToEmail) => {
  try {
    console.log(`📧 Sending email to ${to}...`);
    console.log(`📧 Using API Key: ${process.env.BREVO_API_KEY?.substring(0, 15)}...`);
    console.log(`📧 EMAIL_FROM: ${process.env.EMAIL_FROM}`);

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      throw new Error('BREVO_API_KEY is not configured');
    }

    // ✅ Use Brevo's REST API directly with Axios
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: {
          name: 'Holovox',
          email: process.env.EMAIL_FROM || 'no-reply@holovox.io',
        },
        to: [{ email: to }],
        subject: subject,
        htmlContent: htmlContent,
        replyTo: {
          email: replyToEmail || process.env.EMAIL_FROM || 'no-reply@holovox.io',
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
          'Accept': 'application/json',
        },
        timeout: 30000, // 30 seconds
      }
    );

    console.log(`✅ Email sent to ${to}:`, response.data.messageId || 'Success');
    return response.data;
  } catch (error) {
    console.error('❌ Brevo Error Details:');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('Message:', error.message);
    
    // Extract detailed error message
    let errorMessage = error.message;
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.response?.data?.code) {
      errorMessage = `${error.response.data.code}: ${error.response.data.message || 'Unknown error'}`;
    }

    throw new Error(`Email failed: ${errorMessage}`);
  }
};

export default sendMail;