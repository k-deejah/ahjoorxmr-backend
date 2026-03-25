# Audit Log System

Comprehensive audit logging system for tracking critical operations, user actions, admin changes, and financial transactions.

## Features

- **Automatic Logging**: Use `@AuditLog()` decorator to automatically log controller actions
- **Immutable Logs**: Audit logs cannot be updated or deleted (only archived after retention period)
- **Rich Context**: Captures userId, action, resource, metadata, timestamp, IP address, user agent, and request payload
- **Filtering & Pagination**: Admin endpoint supports filtering by user, action, resource, and date range
- **Log Retention**: Automatic archiving of logs older than 1 year (365 days)
- **Sensitive Data Protection**: Automatically redacts passwords, tokens, and secrets from request payloads

## Usage

### Using the @AuditLog Decorator

Apply the decorator to any controller method to automatically log the action:

```typescript
import { AuditLog } from '../audit/decorators/audit-log.decorator';

@Controller('users')
export class UsersController {
  @Post()
  @AuditLog({ action: 'CREATE', resource: 'USER' })
  async createUser(@Body() createUserDto: CreateUserDto) {
    // Your logic here
  }

  @Put(':id')
  @AuditLog({ action: 'UPDATE', resource: 'USER' })
  async updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    // Your logic here
  }

  @Delete(':id')
  @AuditLog({ action: 'DELETE', resource: 'USER' })
  async deleteUser(@Param('id') id: string) {
    // Your logic here
  }
}
```

### Manual Logging

You can also manually create audit logs:

```typescript
import { AuditService } from '../audit/audit.service';

constructor(private readonly auditService: AuditService) {}

async someMethod() {
  await this.auditService.createLog({
    userId: 'user-id',
    action: 'CUSTOM_ACTION',
    resource: 'RESOURCE_TYPE',
    metadata: { key: 'value' },
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0...',
    requestPayload: { data: 'example' },
  });
}
```

### Querying Audit Logs

Admin endpoint: `GET /api/v1/admin/audit-logs`

Query parameters:
- `userId`: Filter by user ID
- `action`: Filter by action type (CREATE, UPDATE, DELETE, etc.)
- `resource`: Filter by resource type (USER, GROUP, CONTRIBUTION, etc.)
- `startDate`: Start date for filtering (ISO 8601 format)
- `endDate`: End date for filtering (ISO 8601 format)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

Example:
```
GET /api/v1/admin/audit-logs?userId=123&action=DELETE&page=1&limit=20
GET /api/v1/admin/audit-logs?startDate=2024-01-01&endDate=2024-12-31
```

## Action Types

Common action types to use:
- `CREATE`: Creating new resources
- `UPDATE`: Updating existing resources
- `DELETE`: Deleting resources
- `LOGIN`: User login events
- `LOGOUT`: User logout events
- `APPROVE`: Approval actions
- `REJECT`: Rejection actions
- `TRANSFER`: Financial transfers
- `PAYMENT`: Payment operations

## Resource Types

Common resource types:
- `USER`: User-related operations
- `GROUP`: Group-related operations
- `MEMBERSHIP`: Membership operations
- `CONTRIBUTION`: Contribution operations
- `ADMIN`: Admin-specific actions
- `AUTH`: Authentication operations

## Log Retention

Logs older than 365 days are automatically archived. This is handled by a scheduled job that runs periodically.

## Security

- Sensitive fields (password, token, secret, apiKey) are automatically redacted from request payloads
- Logs are immutable - no UPDATE or DELETE operations are allowed
- Only admin users can access audit logs via the API endpoint
