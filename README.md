# YJKZ WebSocket服务 - 抖音云自动部署

## 项目简介

YJKZ WebSocket服务是一个专为抖音云平台设计的物联网控制服务，支持ESP32设备的远程控制和实时通信。

## 功能特性

- 🚀 WebSocket实时通信
- 🔧 ESP32设备控制
- 📊 健康监控和日志记录
- 🛡️ 安全认证和权限管理
- 🌐 抖音云原生部署
- 📱 移动端友好接口

## 快速部署

### 抖音云部署

1. 登录抖音云控制台
2. 进入云托管服务
3. 创建新服务或选择现有服务
4. 连接此GitHub仓库
5. 配置自动部署

### 环境变量配置

```bash
PORT=8080
NODE_ENV=production
ESP32_IP=192.168.8.6
ESP32_PORT=8080
DEVICE_TIMEOUT=5000
```

## API文档

### 健康检查
```
GET /health
```

### WebSocket连接
```
ws://your-domain/ws
```

## 技术栈

- Node.js 18+
- Express.js
- WebSocket (ws)
- Docker
- 抖音云平台

## 开发团队

YJKZ Team

## 许可证

MIT License