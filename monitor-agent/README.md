# Rybbit 监控代理

Rybbit正常运行时间监控系统的区域性监控代理。这个轻量级服务在不同区域的VPS实例上运行，执行监控检查。

## 功能特性

- HTTP/HTTPS监控，包含详细的时序信息
- TCP端口监控
- DNS监控（即将推出）
- SMTP监控（即将推出）
- PING监控（即将推出）
- 通过API密钥进行身份验证
- 健康检查端点
- Prometheus指标（即将推出）

## 部署

### 1. 环境配置

复制`.env.example`到`.env`并进行配置：

```bash
cp .env.example .env
```

关键配置：
- `REGION`：此区域的唯一标识符（例如，'us-east', 'europe'）
- `API_KEY`：与主服务器共享的秘密密钥
- `ALLOWED_IPS`：主服务器的可选IP白名单

### 2. Docker部署

使用Docker构建和运行：

```bash
# 构建
docker build -t monitor-agent .

# 运行
docker run -d \
  --name monitor-agent \
  -p 3003:3003 \
  --env-file .env \
  --restart always \
  monitor-agent
```

### 3. Docker Compose

```yaml
version: '3.8'
services:
  monitor-agent:
    build: .
    ports:
      - "3003:3003"
    env_file:
      - .env
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 4. 直接使用Node.js

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行
npm start
```

## API端点

### POST /execute
执行监控检查。

请求：
```json
{
  "jobId": "unique-job-id",
  "monitorId": 123,
  "monitorType": "http",
  "config": {
    "url": "https://example.com",
    "method": "GET",
    "timeoutMs": 30000
  },
  "validationRules": []
}
```

响应：
```json
{
  "jobId": "unique-job-id",
  "region": "us-east",
  "status": "success",
  "responseTimeMs": 234,
  "statusCode": 200,
  "headers": {},
  "timing": {
    "dnsMs": 12,
    "tcpMs": 45,
    "tlsMs": 67,
    "ttfbMs": 123,
    "transferMs": 111
  }
}
```

### GET /health
健康检查端点。

### GET /metrics
Prometheus指标端点（即将推出）。

## 区域部署

### 推荐的VPS提供商

1. **美国东部**：DigitalOcean NYC, Vultr New Jersey
2. **美国西部**：Vultr Los Angeles, Linode Fremont
3. **欧洲**：Hetzner Frankfurt, DigitalOcean Amsterdam
4. **亚洲**：Vultr Singapore, Linode Tokyo

### 部署脚本

```bash
#!/bin/bash
REGION=$1
DOCKER_IMAGE="your-registry.com/monitor-agent:$REGION"

# 构建和推送
docker build -t $DOCKER_IMAGE .
docker push $DOCKER_IMAGE

# 部署到VPS
ssh $REGION_HOST << EOF
  docker pull $DOCKER_IMAGE
  docker stop monitor-agent || true
  docker rm monitor-agent || true
  docker run -d \
    --name monitor-agent \
    -p 443:3003 \
    --env-file /etc/monitor-agent/.env \
    --restart always \
    $DOCKER_IMAGE
EOF
```

## 安全注意事项

1. 生产环境中始终使用HTTPS（使用Caddy进行反向代理）
2. 保护API密钥安全并定期轮换
3. 尽可能使用IP白名单
4. 监控代理日志中的可疑活动
5. 及时更新安全补丁

## 监控监控器

主服务器应该对每个代理进行健康检查：
- 每30秒检查一次`/health`端点
- 代理宕机时发出警报
- 必要时自动故障转移到其他区域