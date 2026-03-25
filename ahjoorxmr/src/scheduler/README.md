# Scheduler Module

This module implements scheduled tasks and cron jobs for the application using `@nestjs/schedule`.

## Features

- **Distributed Locking**: Ensures only one instance executes scheduled tasks in multi-server deployments using Redis
- **Retry Logic**: Failed tasks are automatically retried with exponential backoff
- **Comprehensive Logging**: All tasks log execution time, status, and results
- **Audit Log Management**: Automatic archival of old audit logs

## Scheduled Tasks

### 1. Archive Audit Logs (Daily at 2 AM)
- **Cron**: `0 2 * * *`
- **Lock TTL**: 10 minutes
- **Description**: Archives audit logs older than 90 days
- **Retry**: Up to 3 attempts with exponential backoff

### 2. Send Contribution Summaries (Weekly - Monday at 9 AM)
- **Cron**: `0 9 * * 1-5` (filtered to Mondays only)
- **Lock TTL**: 10 minutes
- **Description**: Generates and sends weekly contribution summaries to all group members
- **Retry**: Up to 3 attempts with exponential backoff

### 3. Update Group Statuses (Hourly)
- **Cron**: `0 * * * *`
- **Lock TTL**: 5 minutes
- **Description**: Checks and updates group statuses based on business rules
  - PENDING → ACTIVE: When minimum members reached and contract deployed
  - ACTIVE → COMPLETED: When all rounds are completed
- **Retry**: Up to 3 attempts with exponential backoff

## Services

### DistributedLockService
Provides distributed locking using Redis to ensure only one instance runs scheduled tasks.

```typescript
// Acquire a lock
const acquired = await lockService.acquireLock('task-name', 300);

// Execute with automatic lock management
const result = await lockService.withLock('task-name', async () => {
  // Your task logic here
}, 300);
```

### AuditLogService
Manages audit log entries and archival.

```typescript
// Create an audit log
await auditLogService.createLog({
  action: 'USER_LOGIN',
  userId: 'user-id',
  details: 'User logged in successfully',
});

// Archive old logs
const archivedCount = await auditLogService.archiveOldLogs(90);
```

### ContributionSummaryService
Generates and sends weekly contribution summaries.

```typescript
// Generate summaries
const summaries = await contributionSummaryService.generateWeeklySummaries();

// Send to members
await contributionSummaryService.sendSummariesToMembers(summaries);
```

### GroupStatusService
Manages group status transitions and checks.

```typescript
// Update all group statuses
const updatedCount = await groupStatusService.updateGroupStatuses();

// Check for inactive groups
const inactiveGroups = await groupStatusService.checkInactiveGroups();
```

## Configuration

The scheduler module uses the following environment variables:

- `REDIS_HOST`: Redis host for distributed locking (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)
- `REDIS_PASSWORD`: Redis password (optional)
- `LOG_LEVEL`: Logging level (default: info)

## Distributed Lock Mechanism

The module uses Redis SET with NX (set if not exists) and EX (expiration) to implement distributed locks:

1. When a task starts, it attempts to acquire a lock with a TTL
2. If the lock is acquired, the task executes
3. If the lock cannot be acquired (another instance is running), the task is skipped
4. After execution, the lock is released
5. If a task crashes, the lock expires automatically after the TTL

## Retry Strategy

Failed tasks are retried with exponential backoff:

- Attempt 1: Immediate
- Attempt 2: 1 second delay
- Attempt 3: 2 seconds delay

After 3 failed attempts, the task is marked as failed and logged.

## Monitoring

All scheduled tasks log:
- Start time
- Execution duration
- Success/failure status
- Number of items processed
- Lock acquisition status

Example log output:
```
[SchedulerService] Starting task: archive-audit-logs
[AuditLogService] Archived 1523 audit logs older than 90 days
[SchedulerService] Task archive-audit-logs completed successfully in 234ms. Archived 1523 logs.
```

## Testing

To test scheduled tasks manually, you can inject the services and call them directly:

```typescript
// In a controller or test
constructor(private readonly schedulerService: SchedulerService) {}

async testArchiveTask() {
  await this.schedulerService.handleArchiveAuditLogs();
}
```

## Future Enhancements

- Integration with notification service for contribution summaries
- Dashboard for monitoring scheduled task execution
- Configurable task schedules via environment variables
- Task execution history and metrics
