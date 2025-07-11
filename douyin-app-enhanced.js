/**
 * YJKZ WebSocket服务器 - 增强版
 * 集成配置管理、结构化日志和健康监控
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 配置管理
class ConfigManager {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        const defaultConfig = {
            server: {
                port: process.env.PORT || 8080,
                host: process.env.HOST || '0.0.0.0'
            },
            websocket: {
                heartbeatInterval: 30000,
                maxConnections: 1000,
                messageTimeout: 5000
            },
            logging: {
                level: process.env.LOG_LEVEL || 'info',
                format: 'json'
            },
            health: {
                checkInterval: 10000,
                endpoints: []
            }
        };

        try {
            const configPath = path.join(__dirname, 'config', 'environments.json');
            if (fs.existsSync(configPath)) {
                const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return { ...defaultConfig, ...fileConfig };
            }
        } catch (error) {
            console.warn('配置文件加载失败，使用默认配置:', error.message);
        }

        return defaultConfig;
    }

    get(key) {
        return key.split('.').reduce((obj, k) => obj && obj[k], this.config);
    }
}

// 结构化日志
class Logger {
    constructor(config) {
        this.level = config.get('logging.level');
        this.format = config.get('logging.format');
    }

    log(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...meta
        };

        if (this.format === 'json') {
            console.log(JSON.stringify(logEntry));
        } else {
            console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
        }
    }

    info(message, meta) { this.log('info', message, meta); }
    warn(message, meta) { this.log('warn', message, meta); }
    error(message, meta) { this.log('error', message, meta); }
    debug(message, meta) { this.log('debug', message, meta); }
}

// 健康监控
class HealthMonitor {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.status = {
            server: 'healthy',
            websocket: 'healthy',
            connections: 0,
            uptime: Date.now(),
            lastCheck: Date.now()
        };
        this.startMonitoring();
    }

    startMonitoring() {
        const interval = this.config.get('health.checkInterval');
        setInterval(() => {
            this.performHealthCheck();
        }, interval);
    }

    performHealthCheck() {
        this.status.lastCheck = Date.now();
        this.status.uptime = Date.now() - this.status.uptime;
        
        this.logger.debug('健康检查完成', {
            status: this.status,
            component: 'health-monitor'
        });
    }

    getStatus() {
        return {
            ...this.status,
            timestamp: new Date().toISOString()
        };
    }

    updateConnectionCount(count) {
        this.status.connections = count;
    }
}

// 会话管理
class SessionManager {
    constructor(logger) {
        this.sessions = new Map();
        this.logger = logger;
    }

    addSession(ws, sessionId) {
        const session = {
            id: sessionId,
            ws: ws,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            messageCount: 0
        };
        
        this.sessions.set(sessionId, session);
        this.logger.info('新会话创建', {
            sessionId,
            totalSessions: this.sessions.size,
            component: 'session-manager'
        });
        
        return session;
    }

    removeSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            this.sessions.delete(sessionId);
            this.logger.info('会话移除', {
                sessionId,
                totalSessions: this.sessions.size,
                component: 'session-manager'
            });
        }
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    updateActivity(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActivity = Date.now();
            session.messageCount++;
        }
    }

    getActiveSessions() {
        return Array.from(this.sessions.values());
    }

    getSessionCount() {
        return this.sessions.size;
    }
}

// 消息处理
class MessageHandler {
    constructor(sessionManager, logger) {
        this.sessionManager = sessionManager;
        this.logger = logger;
    }

    async handleMessage(sessionId, message) {
        try {
            const session = this.sessionManager.getSession(sessionId);
            if (!session) {
                throw new Error('会话不存在');
            }

            this.sessionManager.updateActivity(sessionId);
            
            let parsedMessage;
            try {
                parsedMessage = JSON.parse(message);
            } catch (e) {
                parsedMessage = { type: 'text', content: message };
            }

            this.logger.info('收到消息', {
                sessionId,
                messageType: parsedMessage.type,
                component: 'message-handler'
            });

            // 处理不同类型的消息
            switch (parsedMessage.type) {
                case 'ping':
                    return this.handlePing(session);
                case 'relay_control':
                    return this.handleRelayControl(session, parsedMessage);
                case 'status_request':
                    return this.handleStatusRequest(session);
                default:
                    return this.handleGenericMessage(session, parsedMessage);
            }
        } catch (error) {
            this.logger.error('消息处理失败', {
                sessionId,
                error: error.message,
                component: 'message-handler'
            });
            throw error;
        }
    }

    handlePing(session) {
        const response = {
            type: 'pong',
            timestamp: Date.now(),
            sessionId: session.id
        };
        session.ws.send(JSON.stringify(response));
        return response;
    }

    handleRelayControl(session, message) {
        const response = {
            type: 'relay_response',
            action: message.action,
            relay: message.relay,
            status: 'success',
            timestamp: Date.now()
        };
        
        this.logger.info('继电器控制', {
            sessionId: session.id,
            action: message.action,
            relay: message.relay,
            component: 'relay-control'
        });
        
        session.ws.send(JSON.stringify(response));
        return response;
    }

    handleStatusRequest(session) {
        const activeSessions = this.sessionManager.getActiveSessions();
        const response = {
            type: 'status_response',
            data: {
                sessionCount: activeSessions.length,
                uptime: Date.now() - session.createdAt,
                messageCount: session.messageCount
            },
            timestamp: Date.now()
        };
        
        session.ws.send(JSON.stringify(response));
        return response;
    }

    handleGenericMessage(session, message) {
        const response = {
            type: 'message_received',
            originalMessage: message,
            timestamp: Date.now()
        };
        
        session.ws.send(JSON.stringify(response));
        return response;
    }
}

// 主应用类
class YJKZWebSocketServer {
    constructor() {
        this.config = new ConfigManager();
        this.logger = new Logger(this.config);
        this.healthMonitor = new HealthMonitor(this.config, this.logger);
        this.sessionManager = new SessionManager(this.logger);
        this.messageHandler = new MessageHandler(this.sessionManager, this.logger);
        
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }

    setupMiddleware() {
        this.app.use(helmet());
        this.app.use(compression());
        this.app.use(cors({
            origin: true,
            credentials: true
        }));
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    }

    setupRoutes() {
        // 健康检查端点
        this.app.get('/health', (req, res) => {
            const status = this.healthMonitor.getStatus();
            res.json({
                status: 'healthy',
                ...status,
                service: 'yjkz-websocket-server'
            });
        });

        // API信息端点
        this.app.get('/api/info', (req, res) => {
            res.json({
                service: 'YJKZ WebSocket Server',
                version: '1.0.0',
                endpoints: {
                    health: '/health',
                    websocket: '/ws',
                    sessions: '/api/sessions'
                },
                timestamp: new Date().toISOString()
            });
        });

        // 会话信息端点
        this.app.get('/api/sessions', (req, res) => {
            const sessions = this.sessionManager.getActiveSessions().map(session => ({
                id: session.id,
                createdAt: new Date(session.createdAt).toISOString(),
                lastActivity: new Date(session.lastActivity).toISOString(),
                messageCount: session.messageCount
            }));
            
            res.json({
                totalSessions: sessions.length,
                sessions
            });
        });

        // 根路径
        this.app.get('/', (req, res) => {
            res.json({
                message: 'YJKZ WebSocket服务器运行中',
                status: 'running',
                timestamp: new Date().toISOString()
            });
        });
    }

    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const sessionId = this.generateSessionId();
            const session = this.sessionManager.addSession(ws, sessionId);
            
            // 更新连接数
            this.healthMonitor.updateConnectionCount(this.sessionManager.getSessionCount());
            
            // 发送欢迎消息
            ws.send(JSON.stringify({
                type: 'welcome',
                sessionId: sessionId,
                timestamp: Date.now(),
                message: '欢迎连接到YJKZ WebSocket服务器'
            }));

            // 消息处理
            ws.on('message', async (message) => {
                try {
                    await this.messageHandler.handleMessage(sessionId, message.toString());
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: error.message,
                        timestamp: Date.now()
                    }));
                }
            });

            // 连接关闭处理
            ws.on('close', () => {
                this.sessionManager.removeSession(sessionId);
                this.healthMonitor.updateConnectionCount(this.sessionManager.getSessionCount());
            });

            // 错误处理
            ws.on('error', (error) => {
                this.logger.error('WebSocket错误', {
                    sessionId,
                    error: error.message,
                    component: 'websocket'
                });
            });
        });
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    start() {
        const port = this.config.get('server.port');
        const host = this.config.get('server.host');
        
        this.server.listen(port, host, () => {
            this.logger.info('YJKZ WebSocket服务器启动', {
                port,
                host,
                component: 'server'
            });
            
            console.log(`\n🚀 YJKZ WebSocket服务器已启动`);
            console.log(`📡 HTTP服务: http://${host}:${port}`);
            console.log(`🔌 WebSocket服务: ws://${host}:${port}`);
            console.log(`💚 健康检查: http://${host}:${port}/health`);
            console.log(`📊 会话信息: http://${host}:${port}/api/sessions`);
        });

        // 优雅关闭处理
        process.on('SIGTERM', () => this.gracefulShutdown());
        process.on('SIGINT', () => this.gracefulShutdown());
    }

    gracefulShutdown() {
        this.logger.info('开始优雅关闭服务器', { component: 'server' });
        
        this.wss.clients.forEach((ws) => {
            ws.close(1000, '服务器关闭');
        });
        
        this.server.close(() => {
            this.logger.info('服务器已关闭', { component: 'server' });
            process.exit(0);
        });
    }
}

// 启动服务器
if (require.main === module) {
    const server = new YJKZWebSocketServer();
    server.start();
}

module.exports = YJKZWebSocketServer;