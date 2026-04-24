/**
 * Example Webhook Receiver
 * 
 * This is a complete example of how to receive and verify webhooks
 * from the Ahjoorxmr backend system.
 * 
 * Usage:
 *   1. Set WEBHOOK_SECRET environment variable
 *   2. Run: node webhook-receiver-example.js
 *   3. Use ngrok or similar to expose: ngrok http 3001
 *   4. Configure webhook in Ahjoorxmr with ngrok URL
 */

const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret-here';

// Middleware to capture raw body for signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature) {
    return false;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')}`;

  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Process contribution verified event
 */
async function processContributionVerified(data) {
  console.log('\n=== Processing Contribution ===');
  console.log('Contribution ID:', data.contributionId);
  console.log('Group ID:', data.groupId);
  console.log('User ID:', data.userId);
  console.log('Wallet:', data.walletAddress);
  console.log('Amount:', data.amount);
  console.log('Round:', data.roundNumber);
  console.log('Transaction:', data.transactionHash);
  console.log('Timestamp:', data.timestamp);
  console.log('==============================\n');

  // TODO: Implement your business logic here
  // Examples:
  // - Update treasury database
  // - Send notifications
  // - Update accounting records
  // - Trigger downstream processes
}

/**
 * Webhook endpoint
 */
app.post('/webhooks/contributions', async (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const rawBody = req.rawBody;

  console.log('\n--- Webhook Received ---');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Signature:', signature);

  // Verify signature
  if (!verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET)) {
    console.error('❌ Invalid signature!');
    return res.status(401).json({ 
      error: 'Invalid signature',
      message: 'Webhook signature verification failed'
    });
  }

  console.log('✅ Signature verified');

  // Respond immediately (important for webhook reliability)
  res.status(200).json({ 
    received: true,
    timestamp: new Date().toISOString()
  });

  // Process webhook asynchronously
  try {
    const { event, data } = req.body;

    console.log('Event Type:', event);

    if (event === 'contribution.verified') {
      await processContributionVerified(data);
    } else {
      console.warn('Unknown event type:', event);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Don't throw - we already responded with 200
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Ahjoorxmr Webhook Receiver',
    version: '1.0.0',
    endpoints: {
      webhook: 'POST /webhooks/contributions',
      health: 'GET /health'
    }
  });
});

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log('\n🚀 Webhook Receiver Started');
  console.log('================================');
  console.log(`Port: ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhooks/contributions`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log('================================');
  console.log('\n⚠️  Make sure to set WEBHOOK_SECRET environment variable!');
  console.log(`Current secret: ${WEBHOOK_SECRET.substring(0, 10)}...`);
  console.log('\nWaiting for webhooks...\n');
});

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});
