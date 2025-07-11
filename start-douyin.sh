#!/bin/bash
# YJKZ抖音云启动脚本
echo "🚀 启动YJKZ WebSocket服务..."
echo "环境: $NODE_ENV"
echo "端口: $PORT"
echo "服务名: $SERVICE_NAME"

# 启动增强版应用
node douyin-app-enhanced.js