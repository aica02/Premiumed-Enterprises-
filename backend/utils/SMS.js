import express, { json } from 'express';
import axios from 'axios';
const router = express.Router();

// Test SMS endpoint
router.post('/send', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and message are required'
      });
    }

    const cleanPhone = phoneNumber.replace(/\s/g, '');
    
    // Validate phone number format
    if (!cleanPhone.match(/^\+[0-9]{10,15}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Use format: +63XXXXXXXXXX'
      });
    }

    if (!process.env.UNISMS_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: 'UNISMS_SECRET_KEY is not configured'
      });
    }

    console.log(`Sending SMS to ${cleanPhone}...`);

    const cleanMessage = message
      .replace(/[!]+/g, '!')
      .replace(/[?]+/g, '?') 
      .trim();

    const senderId = process.env.UNISMS_SENDER_ID || 'UniSMS';

    const response = await axios.post(
      'https://unismsapi.com/api/sms',
      {
        recipient: cleanPhone,
        content: cleanMessage,
        sender_id: senderId 
      },
      {
        auth: {
          username: process.env.UNISMS_SECRET_KEY,
          password: ''
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('SMS sent successfully!', response.data);
    
    res.json({
      success: true,
      message: 'SMS sent successfully!',
      data: response.data,
      recipient: cleanPhone
    });

  } catch (error) {
    console.error('=== ERROR DETAILS ===');
    console.error('Error message:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }

    // Handle specific error codes
    let errorMessage = 'Failed to send SMS';
    let statusCode = error.response?.status || 500;
    let errorDetails = error.response?.data || null;

    if (error.response?.status === 422) {
      const errorData = error.response.data;
      let details = 'Validation error';
      
      if (errorData?.errors) {
        // Format the errors nicely
        const errorMessages = [];
        if (errorData.errors.content) {
          errorMessages.push(`Message: ${errorData.errors.content.join(', ')}`);
        }
        if (errorData.errors.sender_id) {
          errorMessages.push(`Sender ID: ${errorData.errors.sender_id.join(', ')}`);
        }
        if (errorData.errors.recipient) {
          errorMessages.push(`Recipient: ${errorData.errors.recipient.join(', ')}`);
        }
        details = errorMessages.join('; ') || 'Validation error';
      } else if (errorData?.message) {
        details = errorData.message;
      }

      errorMessage = `Validation Error: ${details}`;
      errorDetails = {
        status: 422,
        data: errorData,
        suggestion: 'Check: 1) Message content (avoid spammy words) 2) Sender ID is set 3) Phone number format'
      };
    } else if (error.response?.status === 401) {
      errorMessage = 'Authentication failed. Please check your UniSMS API key.';
    } else if (error.response?.status === 400) {
      errorMessage = 'Bad request. Please verify your phone number and message.';
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timed out. Please try again.';
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: errorDetails,
      recipient: req.body?.phoneNumber
    });
  }
});

// Test connection endpoint
router.get('/test-connection', async (req, res) => {
  try {
    if (!process.env.UNISMS_SECRET_KEY) {
      throw new Error('UNISMS_SECRET_KEY is not set in .env file');
    }

    res.json({
      success: true,
      message: 'Configuration is valid! You can now send SMS.',
      hasApiKey: true,
      defaultRecipient: process.env.DEFAULT_RECIPIENT || 'Not set',
      senderId: process.env.UNISMS_SENDER_ID || 'UniSMS'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;