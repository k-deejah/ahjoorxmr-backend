# NestJS BullMQ with Bull Board Integration

This project integrates Bull Board for monitoring BullMQ queues in a NestJS application.

## Features

- ✅ Bull Board dashboard at `/admin/queues`
- ✅ Admin-only access with authentication middleware
- ✅ Three registered queues: email, notifications, payments
- ✅ Real-time job statistics (completed, failed, delayed, active)
- ✅ Manual job retry and removal from UI
- ✅ Job payload and error details visibility

## Installation

```bash
npm install
```

## Prerequisites

- Redis server running on localhost:6379 (or configure via environment variables)
- Node.js 18+

## Environment Variables

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Running the Application

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start
```

## Accessing Bull Board Dashboard

1. Navigate to: `http://localhost:3000/admin/queues`
2. Add authentication header: `x-admin-token: admin-secret-token`

### Using curl:

```bash
curl -H "x-admin-token: admin-secret-token" http://localhost:3000/admin/queues
```

### Using Postman/Insomnia:

- Add header: `x-admin-token` with value `admin-secret-token`

## Testing the Queues

### Add Email Job

```bash
curl -X POST http://localhost:3000/jobs/email \
  -H "Content-Type: application/json" \
  -d '{"to":"user@example.com","subject":"Test","body":"Hello"}'
```

### Add Notification Job

```bash
curl -X POST http://localhost:3000/jobs/notification \
  -H "Content-Type: application/json" \
  -d '{"userId":"123","message":"New message","type":"push"}'
```

### Add Payment Job

```bash
curl -X POST http://localhost:3000/jobs/payment \
  -H "Content-Type: application/json" \
  -d '{"orderId":"ORD-001","amount":99.99,"currency":"USD"}'
```

## Bull Board Features

The dashboard provides:

1. **Queue Overview**: See all registered queues with job counts
2. **Job Statistics**:
   - Active jobs currently processing
   - Completed jobs
   - Failed jobs with error details
   - Delayed jobs scheduled for later
   - Waiting jobs in queue

3. **Job Management**:
   - View job payload and data
   - See error stack traces for failed jobs
   - Retry failed jobs manually
   - Remove jobs from queue
   - Clean completed/failed jobs in bulk

4. **Real-time Updates**: Dashboard updates automatically as jobs are processed

## Security

The Bull Board dashboard is protected by `BullBoardAuthMiddleware`:

- Only accessible with valid admin token
- Replace `admin-secret-token` with your actual authentication logic
- Integrate with your existing auth system (JWT, session, etc.)

### Customizing Authentication

Edit `src/middleware/bull-board-auth.middleware.ts` to integrate with your auth system:

```typescript
// Example: JWT validation
const token = req.headers.authorization?.split(" ")[1];
const decoded = jwt.verify(token, process.env.JWT_SECRET);
if (decoded.role !== "admin") {
  throw new UnauthorizedException();
}
```

## Queue Processors

### Email Queue

- Processes email sending jobs
- 1 second processing time
- Located in `src/queues/email.processor.ts`

### Notifications Queue

- Handles push/SMS notifications
- 500ms processing time
- Located in `src/queues/notifications.processor.ts`

### Payments Queue

- Processes payment transactions
- 2 second processing time
- Automatic retry on failure (3 attempts with exponential backoff)
- 10% simulated failure rate for testing
- Located in `src/queues/payments.processor.ts`

## Architecture

```
src/
├── app.module.ts                 # Main application module
├── main.ts                       # Application entry point
├── app.controller.ts             # API endpoints for adding jobs
├── bull-board/
│   └── bull-board.module.ts      # Bull Board configuration
├── queues/
│   ├── queues.module.ts          # Queue registration
│   ├── email.processor.ts        # Email job processor
│   ├── notifications.processor.ts # Notification job processor
│   └── payments.processor.ts     # Payment job processor
├── middleware/
│   └── bull-board-auth.middleware.ts # Admin authentication
└── guards/
    └── admin.guard.ts            # Admin guard (optional)
```

## Acceptance Criteria Status

- ✅ Dashboard accessible only to admin users
- ✅ All BullMQ queues visible with real-time stats
- ✅ Failed jobs can be retried manually
- ✅ UI shows job payload and error details
- ✅ Manual job removal from UI
- ✅ Queue statistics (completed, failed, delayed, active)

## Next Steps

1. Replace the simple token authentication with your production auth system
2. Configure Redis connection for production
3. Add more queues as needed
4. Customize job processors for your business logic
5. Set up monitoring and alerting for failed jobs
