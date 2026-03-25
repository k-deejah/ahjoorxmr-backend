# NestJS Redis Cache Implementation

HTTP caching implementation with Redis for frequently accessed endpoints.

## Features

- ✅ Redis-based caching with `@nestjs/cache-manager`
- ✅ Custom `@Cacheable()` decorator for controller methods
- ✅ Configurable TTL per endpoint (default: 5 minutes)
- ✅ Automatic cache invalidation on data mutations
- ✅ Cache-Control headers in responses
- ✅ Cache hit/miss metrics logging
- ✅ User context in cache keys for personalized data

## Installation

```bash
npm install
```

## Setup Redis

Make sure Redis is running:

```bash
# Using Docker
docker run -d -p 6379:6379 redis:alpine

# Or install locally
# Windows: https://redis.io/docs/getting-started/installation/install-redis-on-windows/
# Mac: brew install redis
# Linux: sudo apt-get install redis-server
```

## Configuration

Create a `.env` file:

```
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Running the Application

```bash
npm run start:dev
```

## Usage Examples

### Cached Endpoints

**Get all groups (cached for 5 minutes):**

```bash
curl http://localhost:3000/groups
# Response headers include: X-Cache: MISS (first request)
# Response headers include: X-Cache: HIT (subsequent requests)
```

**Get user profile (cached for 5 minutes):**

```bash
curl http://localhost:3000/users/profile/123
```

### Cache Invalidation

**Update group (invalidates cache):**

```bash
curl -X PUT http://localhost:3000/groups/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Group"}'
```

**Create group (invalidates list cache):**

```bash
curl -X POST http://localhost:3000/groups \
  -H "Content-Type: application/json" \
  -d '{"name": "New Group"}'
```

## Architecture

### Cache Module

- `CacheConfigService`: Redis configuration
- `CacheService`: Wrapper with logging and pattern-based invalidation
- `CacheInterceptor`: Automatic caching for GET requests
- `@Cacheable()`: Decorator to mark cacheable endpoints

### Cache Keys

Format: `{prefix}:{userId}:{url}`

Example: `groups:list:user123:/groups`

This ensures personalized data is cached separately per user.

### Cache Invalidation Strategies

1. **Specific resource**: Invalidate single item (e.g., `groups:detail:*:*/groups/1`)
2. **Pattern-based**: Invalidate all related items (e.g., `groups:list:*`)
3. **On mutation**: Automatic invalidation after POST/PUT/DELETE

## Monitoring

Cache metrics are logged automatically:

- Cache HIT: Data retrieved from cache
- Cache MISS: Data fetched from database
- Cache SET: Data stored in cache
- Cache INVALIDATED: Cache cleared

Check logs for cache performance insights.

## Customization

### Change TTL for specific endpoint:

```typescript
@Get()
@Cacheable({ keyPrefix: 'custom:key', ttl: 600 }) // 10 minutes
async myEndpoint() {
  // ...
}
```

### Manual cache operations:

```typescript
constructor(private cacheService: CacheService) {}

// Get from cache
const data = await this.cacheService.get('my-key');

// Set cache
await this.cacheService.set('my-key', data, 300);

// Delete specific key
await this.cacheService.del('my-key');

// Delete by pattern
await this.cacheService.delPattern('users:*');
```

## Acceptance Criteria ✅

- [x] GET endpoints return cached responses when available
- [x] Cache is invalidated when underlying data changes
- [x] Cache hit/miss metrics are logged
- [x] Cache keys include user context for personalized data
- [x] Cache-Control headers added to responses
