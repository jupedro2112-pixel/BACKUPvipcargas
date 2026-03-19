// ============================================
// SALA DE JUEGOS - BACKEND COMPLETO
// ============================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Importar módulos
const jugaygana = require('./jugaygana');
const jugayganaMovements = require('./jugaygana-movements');
const refunds = require('./models/refunds');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'sala-de-juegos-secret-key-2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Directorio de datos
const DATA_DIR = process.env.VERCEL ? '/tmp/data' : './data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const CHAT_STATUS_FILE = path.join(DATA_DIR, 'chat-status.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const SYSTEM_CONFIG_FILE = path.join(DATA_DIR, 'system-config.json');
const CUSTOM_COMMANDS_FILE = path.join(DATA_DIR, 'custom-commands.json');
const EXTERNAL_USERS_FILE = path.join(DATA_DIR, 'external-users.json');
const ACTIVITY_FILE = path.join(DATA_DIR, 'user-activity.json');
const FIRE_REWARDS_FILE = path.join(DATA_DIR, 'fire-rewards.json');

// Crear directorio de datos si no existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Crear archivos JSON si no existen
function initializeFiles() {
  const files = [USERS_FILE, MESSAGES_FILE, CHAT_STATUS_FILE, TRANSACTIONS_FILE, 
                 SYSTEM_CONFIG_FILE, CUSTOM_COMMANDS_FILE, EXTERNAL_USERS_FILE,
                 ACTIVITY_FILE, FIRE_REWARDS_FILE];
  files.forEach(file => {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(file.includes('messages') || file.includes('transactions') || 
        file.includes('activity') || file.includes('fire') ? [] : {}, null, 2));
    }
  });
}
initializeFiles();

// ============================================
// FUNCIONES DE DATOS
// ============================================

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadMessages() {
  try {
    return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveMessages(messages) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

function loadChatStatus() {
  try {
    if (!fs.existsSync(CHAT_STATUS_FILE)) return {};
    return JSON.parse(fs.readFileSync(CHAT_STATUS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveChatStatus(status) {
  fs.writeFileSync(CHAT_STATUS_FILE, JSON.stringify(status, null, 2));
}

function getChatStatus(userId) {
  const status = loadChatStatus();
  return status[userId] || { status: 'open', assignedTo: null, closedAt: null, closedBy: null, category: 'cargas' };
}

function updateChatStatus(userId, updates) {
  const status = loadChatStatus();
  status[userId] = { ...getChatStatus(userId), ...updates };
  saveChatStatus(status);
}

function loadTransactions() {
  try {
    if (!fs.existsSync(TRANSACTIONS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveTransaction(transaction) {
  const transactions = loadTransactions();
  transactions.push({ ...transaction, id: uuidv4(), timestamp: new Date().toISOString() });
  fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
}

function loadConfig() {
  try {
    if (!fs.existsSync(SYSTEM_CONFIG_FILE)) {
      const defaultConfig = {
        cbu: { number: '', alias: '', bank: '', titular: '', message: '' },
        welcomeMessage: '', depositMessage: ''
      };
      fs.writeFileSync(SYSTEM_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(SYSTEM_CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.writeFileSync(SYSTEM_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadCustomCommands() {
  try {
    if (!fs.existsSync(CUSTOM_COMMANDS_FILE)) return {};
    return JSON.parse(fs.readFileSync(CUSTOM_COMMANDS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveCustomCommands(commands) {
  fs.writeFileSync(CUSTOM_COMMANDS_FILE, JSON.stringify(commands, null, 2));
}

function loadExternalUsers() {
  try {
    if (!fs.existsSync(EXTERNAL_USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(EXTERNAL_USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveExternalUsers(users) {
  fs.writeFileSync(EXTERNAL_USERS_FILE, JSON.stringify(users, null, 2));
}

function addExternalUser(userData) {
  const users = loadExternalUsers();
  if (!users.find(u => u.username === userData.username)) {
    users.push({ ...userData, id: uuidv4(), addedAt: new Date().toISOString() });
    saveExternalUsers(users);
  }
}

function loadUserActivity() {
  try {
    if (!fs.existsSync(ACTIVITY_FILE)) return {};
    return JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveUserActivity(activity) {
  fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(activity, null, 2));
}

function loadFireRewards() {
  try {
    if (!fs.existsSync(FIRE_REWARDS_FILE)) return {};
    return JSON.parse(fs.readFileSync(FIRE_REWARDS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveFireRewards(rewards) {
  fs.writeFileSync(FIRE_REWARDS_FILE, JSON.stringify(rewards, null, 2));
}

function generateAccountNumber() {
  return 'ACC' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

function limitMessagesPerChat(userId, limit = 10) {
  const messages = loadMessages();
  const userMessages = messages.filter(m => m.senderId === userId || m.receiverId === userId);
  
  if (userMessages.length > limit) {
    const toDelete = userMessages.length - limit;
    const userMessageIds = new Set(userMessages.slice(0, toDelete).map(m => m.id));
    const filtered = messages.filter(m => !userMessageIds.has(m.id));
    saveMessages(filtered);
  }
}

function recordUserActivity(userId, type, amount) {
  const activity = loadUserActivity();
  const today = new Date().toDateString();
  
  if (!activity[userId]) activity[userId] = { days: {} };
  if (!activity[userId].days[today]) activity[userId].days[today] = { deposits: 0, withdrawals: 0 };
  
  activity[userId].days[today][type === 'deposit' ? 'deposits' : 'withdrawals'] += parseFloat(amount);
  saveUserActivity(activity);
}

function getArgentinaDateString(date = new Date()) {
  const argentinaTime = new Date(date.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  return argentinaTime.toDateString();
}

function getArgentinaYesterday() {
  const now = new Date();
  const argentinaNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  argentinaNow.setDate(argentinaNow.getDate() - 1);
  return argentinaNow.toDateString();
}

// ============================================
// MIDDLEWARE DE AUTENTICACIÓN
// ============================================

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function adminMiddleware(req, res, next) {
  const adminRoles = ['admin', 'depositor', 'withdrawer'];
  if (!adminRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
}

function depositorMiddleware(req, res, next) {
  const allowedRoles = ['admin', 'depositor'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Acceso denegado. Solo depositores.' });
  }
  next();
}

function withdrawerMiddleware(req, res, next) {
  const allowedRoles = ['admin', 'withdrawer'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Acceso denegado. Solo retiradores.' });
  }
  next();
}

// ============================================
// BLOQUEO DE REEMBOLSOS
// ============================================

const refundLocks = new Map();

function acquireRefundLock(userId, type) {
  const key = `${userId}_${type}`;
  if (refundLocks.has(key)) return false;
  refundLocks.set(key, Date.now());
  return true;
}

function releaseRefundLock(userId, type) {
  refundLocks.delete(`${userId}_${type}`);
}

// ============================================
// RUTAS DE AUTENTICACIÓN
// ============================================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    
    if (!user.isActive) {
      return res.status(403).json({ error: 'Cuenta desactivada' });
    }
    
    // Actualizar último login
    user.lastLogin = new Date().toISOString();
    saveUsers(users);
    
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        accountNumber: user.accountNumber,
        balance: user.balance
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Registro
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;
    const users = loadUsers();
    
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      email,
      phone,
      role: 'user',
      accountNumber: generateAccountNumber(),
      balance: 0,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      isActive: true,
      jugayganaUserId: null,
      jugayganaUsername: null,
      jugayganaSyncStatus: 'pending'
    };
    
    users.push(newUser);
    saveUsers(users);
    
    // Sincronizar con JUGAYGANA
    jugaygana.syncUserToPlatform({ username, password }).then(result => {
      if (result.success) {
        const users = loadUsers();
        const userIndex = users.findIndex(u => u.id === newUser.id);
        if (userIndex !== -1) {
          users[userIndex].jugayganaUserId = result.jugayganaUserId || result.user?.user_id;
          users[userIndex].jugayganaUsername = result.jugayganaUsername || result.user?.user_name;
          users[userIndex].jugayganaSyncStatus = result.alreadyExists ? 'linked' : 'synced';
          saveUsers(users);
        }
      }
    });
    
    const token = jwt.sign(
      { userId: newUser.id, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        accountNumber: newUser.accountNumber,
        balance: newUser.balance
      }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Verificar token
app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Cambiar contraseña
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const users = loadUsers();
    const userIndex = users.findIndex(u => u.id === req.user.userId);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const validPassword = await bcrypt.compare(currentPassword, users[userIndex].password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }
    
    users[userIndex].password = await bcrypt.hash(newPassword, 10);
    users[userIndex].passwordChangedAt = new Date().toISOString();
    saveUsers(users);
    
    res.json({ message: 'Contraseña actualizada' });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// RUTAS DE USUARIOS
// ============================================

// Obtener todos los usuarios
app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    res.json(users.map(u => ({ ...u, password: undefined })));
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Crear usuario
app.post('/api/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, email, phone, password, role = 'user', balance = 0 } = req.body;
    const users = loadUsers();
    
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    const hashedPassword = await bcrypt.hash(password || 'asd123', 10);
    const newUser = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      email,
      phone,
      role,
      accountNumber: generateAccountNumber(),
      balance,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      isActive: true,
      jugayganaUserId: null,
      jugayganaUsername: null,
      jugayganaSyncStatus: role === 'user' ? 'pending' : 'not_applicable'
    };
    
    users.push(newUser);
    saveUsers(users);
    
    if (role === 'user') {
      jugaygana.syncUserToPlatform({ username, password: password || 'asd123' }).then(result => {
        if (result.success) {
          const users = loadUsers();
          const userIndex = users.findIndex(u => u.id === newUser.id);
          if (userIndex !== -1) {
            users[userIndex].jugayganaUserId = result.jugayganaUserId || result.user?.user_id;
            users[userIndex].jugayganaUsername = result.jugayganaUsername || result.user?.user_name;
            users[userIndex].jugayganaSyncStatus = result.alreadyExists ? 'linked' : 'synced';
            saveUsers(users);
          }
        }
      });
    }
    
    res.status(201).json({
      message: 'Usuario creado',
      user: { ...newUser, password: undefined }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Actualizar usuario
app.put('/api/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const users = loadUsers();
    const userIndex = users.findIndex(u => u.id === id);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
      updates.passwordChangedAt = new Date().toISOString();
    }
    
    users[userIndex] = { ...users[userIndex], ...updates };
    saveUsers(users);
    
    res.json({
      message: 'Usuario actualizado',
      user: { ...users[userIndex], password: undefined }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Eliminar usuario
app.delete('/api/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    let users = loadUsers();
    
    const userToDelete = users.find(u => u.id === id);
    if (!userToDelete) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const adminRoles = ['admin', 'depositor', 'withdrawer'];
    if (adminRoles.includes(userToDelete.role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden eliminar otros administradores' });
    }
    
    users = users.filter(u => u.id !== id);
    saveUsers(users);
    
    res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Sincronizar usuario con JUGAYGANA
app.post('/api/users/:id/sync-jugaygana', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const users = loadUsers();
    const user = users.find(u => u.id === id);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const result = await jugaygana.syncUserToPlatform({
      username: user.username,
      password: 'asd123'
    });
    
    if (result.success) {
      user.jugayganaUserId = result.jugayganaUserId || result.user?.user_id;
      user.jugayganaUsername = result.jugayganaUsername || result.user?.user_name;
      user.jugayganaSyncStatus = result.alreadyExists ? 'linked' : 'synced';
      saveUsers(users);
      
      res.json({
        message: result.alreadyExists ? 'Usuario vinculado' : 'Usuario sincronizado',
        jugayganaUserId: user.jugayganaUserId,
        jugayganaUsername: user.jugayganaUsername
      });
    } else {
      res.status(400).json({ error: result.error || 'Error sincronizando' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// RUTAS DE MENSAJES
// ============================================

// Obtener mensajes de un usuario
app.get('/api/messages/:userId', authMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const messages = loadMessages();
    
    const adminRoles = ['admin', 'depositor', 'withdrawer'];
    if (!adminRoles.includes(req.user.role) && req.user.userId !== userId) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    let userMessages = messages
      .filter(m => m.senderId === userId || m.receiverId === userId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    if (userMessages.length > limit) {
      userMessages = userMessages.slice(-limit);
    }
    
    res.json(userMessages);
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener conversaciones
app.get('/api/conversations', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const messages = loadMessages();
    const users = loadUsers();
    
    const conversations = {};
    
    messages.forEach(msg => {
      let userId = null;
      
      if (msg.senderRole === 'user') userId = msg.senderId;
      else if (msg.receiverRole === 'user') userId = msg.receiverId;
      
      if (!userId) return;
      
      if (!conversations[userId]) {
        const user = users.find(u => u.id === userId);
        conversations[userId] = {
          userId,
          username: user?.username || 'Desconocido',
          accountNumber: user?.accountNumber || '',
          lastMessage: msg,
          unreadCount: (msg.receiverRole === 'admin' && !msg.read) ? 1 : 0
        };
      } else {
        if (new Date(msg.timestamp) > new Date(conversations[userId].lastMessage.timestamp)) {
          conversations[userId].lastMessage = msg;
        }
        if (msg.receiverRole === 'admin' && !msg.read) {
          conversations[userId].unreadCount++;
        }
      }
    });
    
    res.json(Object.values(conversations));
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Marcar mensajes como leídos
app.post('/api/messages/read/:userId', authMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const messages = loadMessages();
    
    messages.forEach(msg => {
      if (msg.senderId === userId && msg.receiverRole === 'admin') {
        msg.read = true;
      }
    });
    
    saveMessages(messages);
    res.json({ message: 'Mensajes marcados como leídos' });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Enviar mensaje
app.post('/api/messages/send', authMiddleware, async (req, res) => {
  try {
    const { content, type = 'text' } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Contenido requerido' });
    }
    
    const messages = loadMessages();
    const adminRoles = ['admin', 'depositor', 'withdrawer'];
    const isAdminRole = adminRoles.includes(req.user.role);
    
    const message = {
      id: uuidv4(),
      senderId: req.user.userId,
      senderUsername: req.user.username,
      senderRole: req.user.role,
      receiverId: isAdminRole ? (req.body.receiverId || 'admin') : 'admin',
      receiverRole: isAdminRole ? 'user' : 'admin',
      content,
      type,
      timestamp: new Date().toISOString(),
      read: false
    };
    
    messages.push(message);
    saveMessages(messages);
    
    if (req.user.role === 'user') {
      const users = loadUsers();
      const user = users.find(u => u.id === req.user.userId);
      if (user) {
        addExternalUser({ username: user.username, phone: user.phone });
      }
    }
    
    const targetUserId = req.user.role === 'admin' ? req.body.receiverId : req.user.userId;
    if (targetUserId) limitMessagesPerChat(targetUserId);
    
    if (req.user.role === 'user') {
      const chatStatus = loadChatStatus();
      if (chatStatus[req.user.userId]?.status === 'closed') {
        chatStatus[req.user.userId] = { status: 'open', assignedTo: null, closedAt: null, closedBy: null };
        saveChatStatus(chatStatus);
      }
    }
    
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});


// ============================================
// RUTAS DE CHATS (ADMIN)
// ============================================

// Obtener todos los estados de chats
app.get('/api/admin/chat-status/all', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const status = loadChatStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener chats por estado
app.get('/api/admin/chats/:status', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { status } = req.params;
    const messages = loadMessages();
    const users = loadUsers();
    const chatStatus = loadChatStatus();
    
    const userMessages = {};
    messages.forEach(msg => {
      if (msg.senderRole === 'user') {
        if (!userMessages[msg.senderId]) userMessages[msg.senderId] = [];
        userMessages[msg.senderId].push(msg);
      }
      if (msg.receiverRole === 'user' && msg.senderRole !== 'user') {
        if (!userMessages[msg.receiverId]) userMessages[msg.receiverId] = [];
        userMessages[msg.receiverId].push(msg);
      }
    });
    
    const filteredChats = [];
    
    Object.keys(userMessages).forEach(userId => {
      const user = users.find(u => u.id === userId);
      if (!user) return;
      
      const statusInfo = chatStatus[userId] || { status: 'open', category: 'cargas', assignedTo: null };
      
      if (statusInfo.status === status && statusInfo.category !== 'pagos') {
        const msgs = userMessages[userId].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const lastMsg = msgs[msgs.length - 1];
        const unreadCount = msgs.filter(m => m.receiverRole === 'admin' && !m.read).length;
        
        filteredChats.push({
          userId,
          username: user.username,
          lastMessage: lastMsg,
          unreadCount,
          assignedTo: statusInfo.assignedTo,
          closedAt: statusInfo.closedAt,
          closedBy: statusInfo.closedBy
        });
      }
    });
    
    filteredChats.sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));
    res.json(filteredChats);
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Cerrar chat
app.post('/api/admin/chats/:userId/close', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    updateChatStatus(userId, {
      status: 'closed',
      closedAt: new Date().toISOString(),
      closedBy: req.user.username,
      assignedTo: null,
      category: 'cargas'
    });
    res.json({ success: true, message: 'Chat cerrado' });
  } catch (error) {
    res.status(500).json({ error: 'Error cerrando chat' });
  }
});

// Reabrir chat
app.post('/api/admin/chats/:userId/reopen', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    updateChatStatus(userId, {
      status: 'open',
      closedAt: null,
      closedBy: null,
      assignedTo: req.user.username
    });
    res.json({ success: true, message: 'Chat reabierto' });
  } catch (error) {
    res.status(500).json({ error: 'Error reabriendo chat' });
  }
});

// Asignar chat
app.post('/api/admin/chats/:userId/assign', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const { agent } = req.body;
    updateChatStatus(userId, { assignedTo: agent, status: 'open' });
    res.json({ success: true, message: 'Chat asignado a ' + agent });
  } catch (error) {
    res.status(500).json({ error: 'Error asignando chat' });
  }
});

// Cambiar categoría de chat
app.post('/api/admin/chats/:userId/category', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const { category } = req.body;
    
    if (!category || !['cargas', 'pagos'].includes(category)) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }
    
    const chatStatus = loadChatStatus();
    if (!chatStatus[userId]) chatStatus[userId] = { status: 'open', assignedTo: null };
    chatStatus[userId].category = category;
    saveChatStatus(chatStatus);
    
    res.json({ success: true, message: `Chat movido a ${category.toUpperCase()}` });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// RUTAS DE REEMBOLSOS
// ============================================

// Obtener estado de reembolsos
app.get('/api/refunds/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const username = req.user.username;
    
    const userInfo = await jugaygana.getUserInfoByName(username);
    const currentBalance = userInfo ? userInfo.balance : 0;
    
    const [yesterdayMovements, lastWeekMovements, lastMonthMovements] = await Promise.all([
      jugaygana.getUserNetYesterday(username),
      jugaygana.getUserNetLastWeek(username),
      jugaygana.getUserNetLastMonth(username)
    ]);
    
    const claimedToday = await jugaygana.checkClaimedToday(username);
    
    const dailyStatus = refunds.canClaimDailyRefund(userId);
    const weeklyStatus = refunds.canClaimWeeklyRefund(userId);
    const monthlyStatus = refunds.canClaimMonthlyRefund(userId);
    
    const dailyCalc = refunds.calculateRefund(
      yesterdayMovements.success ? yesterdayMovements.totalDeposits : 0,
      yesterdayMovements.success ? yesterdayMovements.totalWithdraws : 0,
      20
    );
    
    const weeklyCalc = refunds.calculateRefund(
      lastWeekMovements.success ? lastWeekMovements.totalDeposits : 0,
      lastWeekMovements.success ? lastWeekMovements.totalWithdraws : 0,
      10
    );
    
    const monthlyCalc = refunds.calculateRefund(
      lastMonthMovements.success ? lastMonthMovements.totalDeposits : 0,
      lastMonthMovements.success ? lastMonthMovements.totalWithdraws : 0,
      5
    );
    
    res.json({
      user: { username, currentBalance, jugayganaLinked: !!userInfo },
      daily: { ...dailyStatus, potentialAmount: dailyCalc.refundAmount, netAmount: dailyCalc.netAmount, percentage: 20 },
      weekly: { ...weeklyStatus, potentialAmount: weeklyCalc.refundAmount, netAmount: weeklyCalc.netAmount, percentage: 10 },
      monthly: { ...monthlyStatus, potentialAmount: monthlyCalc.refundAmount, netAmount: monthlyCalc.netAmount, percentage: 5 },
      claimedToday: claimedToday.success ? claimedToday.claimed : false
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Reclamar reembolso diario
app.post('/api/refunds/claim/daily', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const username = req.user.username;
    
    if (!acquireRefundLock(userId, 'daily')) {
      return res.json({ success: false, message: '⏳ Procesando...', canClaim: true, processing: true });
    }
    
    try {
      const status = refunds.canClaimDailyRefund(userId);
      if (!status.canClaim) {
        return res.json({ success: false, message: 'Ya reclamaste hoy', canClaim: false, nextClaim: status.nextClaim });
      }
      
      const yesterdayMovements = await jugaygana.getUserNetYesterday(username);
      if (!yesterdayMovements.success) {
        return res.json({ success: false, message: 'Error obteniendo movimientos', canClaim: true });
      }
      
      const calc = refunds.calculateRefund(yesterdayMovements.totalDeposits, yesterdayMovements.totalWithdraws, 20);
      
      if (calc.refundAmount <= 0) {
        return res.json({ success: false, message: 'No tienes saldo neto positivo', canClaim: true, netAmount: calc.netAmount });
      }
      
      const depositResult = await jugaygana.creditUserBalance(username, calc.refundAmount);
      
      if (!depositResult.success) {
        return res.json({ success: false, message: 'Error al acreditar: ' + depositResult.error, canClaim: true });
      }
      
      const refund = refunds.recordRefund(userId, username, 'daily', calc.refundAmount, calc.netAmount, yesterdayMovements.totalDeposits, yesterdayMovements.totalWithdraws);
      
      res.json({
        success: true,
        message: `¡Reembolso de $${calc.refundAmount} acreditado!`,
        amount: calc.refundAmount,
        refund
      });
    } finally {
      setTimeout(() => releaseRefundLock(userId, 'daily'), 3000);
    }
  } catch (error) {
    res.json({ success: false, message: 'Error del servidor', canClaim: true });
  }
});

// Reclamar reembolso semanal
app.post('/api/refunds/claim/weekly', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const username = req.user.username;
    
    if (!acquireRefundLock(userId, 'weekly')) {
      return res.json({ success: false, message: '⏳ Procesando...', canClaim: true, processing: true });
    }
    
    try {
      const status = refunds.canClaimWeeklyRefund(userId);
      if (!status.canClaim) {
        return res.json({ success: false, message: 'No disponible aún', canClaim: false, nextClaim: status.nextClaim });
      }
      
      const lastWeekMovements = await jugaygana.getUserNetLastWeek(username);
      if (!lastWeekMovements.success) {
        return res.json({ success: false, message: 'Error obteniendo movimientos', canClaim: true });
      }
      
      const calc = refunds.calculateRefund(lastWeekMovements.totalDeposits, lastWeekMovements.totalWithdraws, 10);
      
      if (calc.refundAmount <= 0) {
        return res.json({ success: false, message: 'No tienes saldo neto positivo', canClaim: true });
      }
      
      const depositResult = await jugaygana.creditUserBalance(username, calc.refundAmount);
      
      if (!depositResult.success) {
        return res.json({ success: false, message: 'Error al acreditar: ' + depositResult.error, canClaim: true });
      }
      
      const refund = refunds.recordRefund(userId, username, 'weekly', calc.refundAmount, calc.netAmount, lastWeekMovements.totalDeposits, lastWeekMovements.totalWithdraws);
      
      res.json({
        success: true,
        message: `¡Reembolso semanal de $${calc.refundAmount} acreditado!`,
        amount: calc.refundAmount,
        refund
      });
    } finally {
      setTimeout(() => releaseRefundLock(userId, 'weekly'), 3000);
    }
  } catch (error) {
    res.json({ success: false, message: 'Error del servidor', canClaim: true });
  }
});

// Reclamar reembolso mensual
app.post('/api/refunds/claim/monthly', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const username = req.user.username;
    
    if (!acquireRefundLock(userId, 'monthly')) {
      return res.json({ success: false, message: '⏳ Procesando...', canClaim: true, processing: true });
    }
    
    try {
      const status = refunds.canClaimMonthlyRefund(userId);
      if (!status.canClaim) {
        return res.json({ success: false, message: 'No disponible aún', canClaim: false, nextClaim: status.nextClaim });
      }
      
      const lastMonthMovements = await jugaygana.getUserNetLastMonth(username);
      if (!lastMonthMovements.success) {
        return res.json({ success: false, message: 'Error obteniendo movimientos', canClaim: true });
      }
      
      const calc = refunds.calculateRefund(lastMonthMovements.totalDeposits, lastMonthMovements.totalWithdraws, 5);
      
      if (calc.refundAmount <= 0) {
        return res.json({ success: false, message: 'No tienes saldo neto positivo', canClaim: true });
      }
      
      const depositResult = await jugaygana.creditUserBalance(username, calc.refundAmount);
      
      if (!depositResult.success) {
        return res.json({ success: false, message: 'Error al acreditar: ' + depositResult.error, canClaim: true });
      }
      
      const refund = refunds.recordRefund(userId, username, 'monthly', calc.refundAmount, calc.netAmount, lastMonthMovements.totalDeposits, lastMonthMovements.totalWithdraws);
      
      res.json({
        success: true,
        message: `¡Reembolso mensual de $${calc.refundAmount} acreditado!`,
        amount: calc.refundAmount,
        refund
      });
    } finally {
      setTimeout(() => releaseRefundLock(userId, 'monthly'), 3000);
    }
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener historial de reembolsos
app.get('/api/refunds/history', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const userRefunds = refunds.getUserRefundHistory(userId);
    res.json({ refunds: userRefunds });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// RUTAS DE BALANCE Y MOVIMIENTOS
// ============================================

// Obtener balance
app.get('/api/balance', authMiddleware, async (req, res) => {
  try {
    const username = req.user.username;
    const result = await jugayganaMovements.getUserBalance(username);
    
    if (result.success) {
      res.json({ balance: result.balance, username: result.username });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener balance en tiempo real
app.get('/api/balance/live', authMiddleware, async (req, res) => {
  try {
    const username = req.user.username;
    const result = await jugayganaMovements.getUserBalance(username);
    
    if (result.success) {
      const users = loadUsers();
      const userIndex = users.findIndex(u => u.username === username);
      if (userIndex !== -1) {
        users[userIndex].balance = result.balance;
        saveUsers(users);
      }
      
      res.json({ balance: result.balance, updatedAt: new Date().toISOString() });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// RUTAS ADMIN - DEPÓSITOS/RETIROS/BONUS
// ============================================

// Depósito
app.post('/api/admin/deposit', authMiddleware, depositorMiddleware, async (req, res) => {
  try {
    const { username, amount, description } = req.body;
    
    if (!username || !amount) {
      return res.status(400).json({ error: 'Usuario y monto requeridos' });
    }
    
    const result = await jugaygana.depositToUser(username, amount, description);
    
    if (result.success) {
      const users = loadUsers();
      const user = users.find(u => u.username === username);
      if (user) recordUserActivity(user.id, 'deposit', amount);
      
      saveTransaction({
        type: 'deposit', amount: parseFloat(amount), username,
        description: description || 'Depósito realizado',
        adminId: req.user?.userId, adminUsername: req.user?.username
      });
      
      res.json({
        success: true,
        message: 'Depósito realizado',
        transactionId: result.data?.transfer_id || result.data?.transferId
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Retiro
app.post('/api/admin/withdrawal', authMiddleware, withdrawerMiddleware, async (req, res) => {
  try {
    const { username, amount, description } = req.body;
    
    if (!username || !amount) {
      return res.status(400).json({ error: 'Usuario y monto requeridos' });
    }
    
    const result = await jugaygana.withdrawFromUser(username, amount, description);
    
    if (result.success) {
      const users = loadUsers();
      const user = users.find(u => u.username === username);
      if (user) recordUserActivity(user.id, 'withdrawal', amount);
      
      saveTransaction({
        type: 'withdrawal', amount: parseFloat(amount), username,
        description: description || 'Retiro realizado',
        adminId: req.user?.userId, adminUsername: req.user?.username
      });
      
      res.json({
        success: true,
        message: 'Retiro realizado',
        transactionId: result.data?.transfer_id || result.data?.transferId
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Bonificación
app.post('/api/admin/bonus', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, amount } = req.body;
    
    if (!username || !amount) {
      return res.status(400).json({ error: 'Usuario y monto requeridos' });
    }
    
    const bonusAmount = parseFloat(amount);
    if (isNaN(bonusAmount) || bonusAmount <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }
    
    const depositResult = await jugaygana.creditUserBalance(username, bonusAmount);
    
    if (depositResult.success) {
      saveTransaction({
        type: 'bonus', amount: bonusAmount, username,
        description: 'Bonificación otorgada',
        adminId: req.user?.userId, adminUsername: req.user?.username
      });
      
      res.json({
        success: true,
        message: `Bonificación de $${bonusAmount.toLocaleString()} realizada`,
        transactionId: depositResult.data?.transfer_id || depositResult.data?.transferId
      });
    } else {
      res.status(400).json({ error: depositResult.error || 'Error al aplicar bonificación' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener balance de usuario (admin)
app.get('/api/admin/balance/:username', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const result = await jugayganaMovements.getUserBalance(username);
    
    if (result.success) {
      res.json({ balance: result.balance });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// RUTAS ADMIN - ESTADÍSTICAS
// ============================================

app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const messages = loadMessages();
    
    const totalUsers = users.length;
    const onlineUsers = users.filter(u => u.lastLogin && new Date(u.lastLogin) > new Date(Date.now() - 5 * 60 * 1000)).length;
    const unreadMessages = messages.filter(m => m.receiverRole === 'admin' && !m.read).length;
    const totalBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);
    
    res.json({ totalUsers, onlineUsers, unreadMessages, totalBalance });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// RUTAS ADMIN - CONFIGURACIÓN
// ============================================

app.get('/api/admin/config', authMiddleware, adminMiddleware, (req, res) => {
  res.json(loadConfig());
});

app.put('/api/admin/config/cbu', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const config = loadConfig();
    config.cbu = { ...config.cbu, ...req.body };
    saveConfig(config);
    res.json({ success: true, cbu: config.cbu });
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando CBU' });
  }
});

// ============================================
// RUTAS ADMIN - COMANDOS PERSONALIZADOS
// ============================================

app.get('/api/admin/commands', authMiddleware, adminMiddleware, (req, res) => {
  res.json(loadCustomCommands());
});

app.post('/api/admin/commands', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { name, description, type, bonusPercent, response } = req.body;
    
    if (!name || !name.startsWith('/')) {
      return res.status(400).json({ error: 'El comando debe empezar con /' });
    }
    
    const commands = loadCustomCommands();
    commands[name] = { description, type, bonusPercent: parseInt(bonusPercent) || 0, response, createdAt: new Date().toISOString() };
    saveCustomCommands(commands);
    
    res.json({ success: true, commands });
  } catch (error) {
    res.status(500).json({ error: 'Error guardando comando' });
  }
});

app.delete('/api/admin/commands/:name', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const commands = loadCustomCommands();
    delete commands[req.params.name];
    saveCustomCommands(commands);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error eliminando comando' });
  }
});

// ============================================
// RUTAS ADMIN - BASE DE DATOS
// ============================================

app.get('/api/admin/database', authMiddleware, adminMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  
  const users = loadUsers();
  const messages = loadMessages();
  const adminRoles = ['admin', 'depositor', 'withdrawer'];
  
  res.json({
    users,
    totalUsers: users.length,
    totalAdmins: users.filter(u => adminRoles.includes(u.role)).length,
    totalMessages: messages.length
  });
});

// ============================================
// RUTAS ADMIN - TRANSACCIONES
// ============================================

app.get('/api/admin/transactions', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { from, to, type } = req.query;
    let transactions = loadTransactions();
    
    if (from) {
      const fromDate = new Date(from);
      transactions = transactions.filter(t => new Date(t.timestamp) >= fromDate);
    }
    
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      transactions = transactions.filter(t => new Date(t.timestamp) <= toDate);
    }
    
    if (type && type !== 'all') {
      transactions = transactions.filter(t => t.type === type);
    }
    
    const summary = { deposits: 0, withdrawals: 0, bonuses: 0, refunds: 0 };
    transactions.forEach(t => {
      const key = t.type + 's';
      if (summary.hasOwnProperty(key)) summary[key] += t.amount || 0;
    });
    
    transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({ transactions: transactions.slice(0, 100), summary, total: transactions.length });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});


// ============================================
// SISTEMA DE FUEGUITO (RACHA DIARIA)
// ============================================

app.get('/api/fire/status', authMiddleware, (req, res) => {
  try {
    const userId = req.user.userId;
    const rewards = loadFireRewards();
    const userRewards = rewards[userId] || { streak: 0, lastClaim: null, totalClaimed: 0 };
    
    const todayArgentina = getArgentinaDateString();
    const lastClaim = userRewards.lastClaim ? getArgentinaDateString(new Date(userRewards.lastClaim)) : null;
    const canClaim = lastClaim !== todayArgentina;
    
    const yesterdayArgentina = getArgentinaYesterday();
    
    if (lastClaim !== yesterdayArgentina && lastClaim !== todayArgentina && userRewards.streak > 0) {
      userRewards.streak = 0;
      rewards[userId] = userRewards;
      saveFireRewards(rewards);
    }
    
    res.json({
      streak: userRewards.streak || 0,
      lastClaim: userRewards.lastClaim,
      totalClaimed: userRewards.totalClaimed || 0,
      canClaim,
      nextReward: userRewards.streak >= 9 ? 10000 : 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/fire/claim', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const username = req.user.username;
    
    const rewards = loadFireRewards();
    const userRewards = rewards[userId] || { streak: 0, lastClaim: null, totalClaimed: 0 };
    
    const todayArgentina = getArgentinaDateString();
    const lastClaim = userRewards.lastClaim ? getArgentinaDateString(new Date(userRewards.lastClaim)) : null;
    
    if (lastClaim === todayArgentina) {
      return res.status(400).json({ error: 'Ya reclamaste hoy' });
    }
    
    const yesterdayArgentina = getArgentinaYesterday();
    
    if (lastClaim !== yesterdayArgentina && userRewards.streak > 0) {
      userRewards.streak = 0;
    }
    
    userRewards.streak += 1;
    userRewards.lastClaim = new Date().toISOString();
    
    let reward = 0;
    let message = `Día ${userRewards.streak} de racha!`;
    
    if (userRewards.streak === 10) {
      reward = 10000;
      userRewards.totalClaimed += reward;
      
      const bonusResult = await jugayganaMovements.makeBonus(username, reward, 'Recompensa racha 10 días');
      
      if (!bonusResult.success) {
        return res.status(400).json({ error: 'Error al acreditar: ' + bonusResult.error });
      }
      
      message = `¡Felicidades! 10 días de racha! Recompensa: $${reward.toLocaleString()}`;
    }
    
    rewards[userId] = userRewards;
    saveFireRewards(rewards);
    
    res.json({ success: true, streak: userRewards.streak, reward, message, totalClaimed: userRewards.totalClaimed });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// SOCKET.IO - CHAT EN TIEMPO REAL
// ============================================

const connectedUsers = new Map();
const connectedAdmins = new Map();

io.on('connection', (socket) => {
  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      socket.role = decoded.role;
      
      if (decoded.role === 'admin') {
        connectedAdmins.set(decoded.userId, socket);
        notifyAdmins('stats', getStats());
      } else {
        connectedUsers.set(decoded.userId, socket);
        socket.join(`user_${decoded.userId}`);
        notifyAdmins('user_connected', { userId: decoded.userId, username: decoded.username });
      }
      
      socket.emit('authenticated', { success: true, role: decoded.role });
    } catch (error) {
      socket.emit('authenticated', { success: false, error: 'Token inválido' });
    }
  });
  
  socket.on('send_message', async (data) => {
    try {
      const { content, receiverId } = data;
      if (!socket.userId) return socket.emit('error', { message: 'No autenticado' });
      
      const messages = loadMessages();
      const message = {
        id: uuidv4(),
        senderId: socket.userId,
        senderUsername: socket.username,
        senderRole: socket.role,
        receiverId: socket.role === 'admin' ? receiverId : 'admin',
        receiverRole: socket.role === 'admin' ? 'user' : 'admin',
        content,
        timestamp: new Date().toISOString(),
        read: false
      };
      
      messages.push(message);
      saveMessages(messages);
      
      if (socket.role === 'user') {
        notifyAdmins('new_message', { message, userId: socket.userId, username: socket.username });
      } else {
        const userSocket = connectedUsers.get(receiverId);
        if (userSocket) userSocket.emit('new_message', message);
      }
      
      socket.emit('message_sent', message);
      notifyAdmins('stats', getStats());
    } catch (error) {
      socket.emit('error', { message: 'Error enviando mensaje' });
    }
  });
  
  socket.on('disconnect', () => {
    if (socket.role === 'admin') {
      connectedAdmins.delete(socket.userId);
      notifyAdmins('stats', getStats());
    } else {
      connectedUsers.delete(socket.userId);
      notifyAdmins('user_disconnected', { userId: socket.userId, username: socket.username });
    }
  });
});

function notifyAdmins(event, data) {
  connectedAdmins.forEach(socket => socket.emit(event, data));
}

function getStats() {
  return {
    connectedUsers: connectedUsers.size,
    connectedAdmins: connectedAdmins.size,
    totalUsers: loadUsers().filter(u => u.role === 'user').length
  };
}

// ============================================
// RUTAS ESTÁTICAS
// ============================================

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Error leyendo archivo ${filePath}:`, error.message);
    return null;
  }
}

// Ruta principal
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index2.html');
  const content = readFileSafe(indexPath);
  if (content) {
    res.setHeader('Content-Type', 'text/html');
    res.send(content);
  } else {
    res.status(500).send('Error loading page');
  }
});

// Panel admin
app.get('/adminprivado2026', (req, res) => {
  const adminPath = path.join(__dirname, 'public', 'adminprivado2026', 'index3.html');
  const content = readFileSafe(adminPath);
  if (content) {
    res.setHeader('Content-Type', 'text/html');
    res.send(content);
  } else {
    res.status(500).send('Error loading admin page');
  }
});

// Archivos CSS del admin
app.get('/adminprivado2026/admin.css', (req, res) => {
  const cssPath = path.join(__dirname, 'public', 'adminprivado2026', 'admin.css');
  const content = readFileSafe(cssPath);
  if (content) {
    res.setHeader('Content-Type', 'text/css');
    res.send(content);
  } else {
    res.status(404).send('CSS not found');
  }
});

// Archivos JS del admin
app.get('/adminprivado2026/admin.js', (req, res) => {
  const jsPath = path.join(__dirname, 'public', 'adminprivado2026', 'admin.js');
  const content = readFileSafe(jsPath);
  if (content) {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(content);
  } else {
    res.status(404).send('JS not found');
  }
});

// ============================================
// INICIALIZAR DATOS DE PRUEBA
// ============================================

async function initializeData() {
  if (process.env.PROXY_URL) {
    console.log('🔍 Verificando IP pública...');
    await jugaygana.logProxyIP();
  }
  
  console.log('🔑 Probando conexión con JUGAYGANA...');
  const sessionOk = await jugaygana.ensureSession();
  if (sessionOk) {
    console.log('✅ Conexión con JUGAYGANA establecida');
  } else {
    console.log('⚠️ No se pudo conectar con JUGAYGANA');
  }
  
  const users = loadUsers();
  
  // Crear admin ignite100
  let adminExists = users.find(u => u.username === 'ignite100');
  if (!adminExists) {
    const adminPassword = await bcrypt.hash('pepsi100', 10);
    users.push({
      id: uuidv4(),
      username: 'ignite100',
      password: adminPassword,
      email: 'admin@saladejuegos.com',
      phone: null,
      role: 'admin',
      accountNumber: 'ADMIN001',
      balance: 0,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      isActive: true,
      jugayganaUserId: null,
      jugayganaUsername: null,
      jugayganaSyncStatus: 'na'
    });
    console.log('✅ Admin creado: ignite100 / pepsi100');
  } else {
    adminExists.password = await bcrypt.hash('pepsi100', 10);
    adminExists.role = 'admin';
    console.log('✅ Admin actualizado: ignite100 / pepsi100');
  }
  
  // Admin respaldo
  let oldAdmin = users.find(u => u.username === 'admin');
  if (!oldAdmin) {
    users.push({
      id: uuidv4(),
      username: 'admin',
      password: await bcrypt.hash('admin123', 10),
      email: 'admin@saladejuegos.com',
      phone: null,
      role: 'admin',
      accountNumber: 'ADMIN002',
      balance: 0,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      isActive: true,
      jugayganaUserId: null,
      jugayganaUsername: null,
      jugayganaSyncStatus: 'na'
    });
    console.log('✅ Admin respaldo creado: admin / admin123');
  }
  
  // Usuario de prueba
  const testUser = users.find(u => u.username === '672rosana1');
  if (!testUser) {
    const userPassword = await bcrypt.hash('asd123', 10);
    const user = {
      id: uuidv4(),
      username: '672rosana1',
      password: userPassword,
      email: 'rosana@email.com',
      phone: null,
      role: 'user',
      accountNumber: generateAccountNumber(),
      balance: 1500.00,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      isActive: true,
      jugayganaUserId: null,
      jugayganaUsername: null,
      jugayganaSyncStatus: 'pending'
    };
    users.push(user);
    console.log('✅ Usuario de prueba creado: 672rosana1 / asd123');
    
    if (sessionOk) {
      const result = await jugaygana.syncUserToPlatform({ username: '672rosana1', password: 'asd123' });
      if (result.success) {
        user.jugayganaUserId = result.jugayganaUserId || result.user?.user_id;
        user.jugayganaUsername = result.jugayganaUsername || result.user?.user_name;
        user.jugayganaSyncStatus = result.alreadyExists ? 'linked' : 'synced';
        console.log('✅ Usuario de prueba sincronizado');
      }
    }
  }
  
  saveUsers(users);
}

// ============================================
// INICIAR SERVIDOR
// ============================================

if (process.env.VERCEL) {
  initializeData().then(() => {
    console.log('✅ Datos inicializados para Vercel');
  });
  module.exports = app;
} else {
  initializeData().then(() => {
    server.listen(PORT, () => {
      console.log(`
🎮 ============================================
🎮  SALA DE JUEGOS - BACKEND INICIADO
🎮 ============================================
🎮  
🎮  🌐 URL: http://localhost:${PORT}
🎮  
🎮  📊 Endpoints:
🎮  • POST /api/auth/login        - Login
🎮  • POST /api/auth/register     - Registro
🎮  • GET  /api/users             - Lista usuarios (admin)
🎮  • GET  /api/messages/:userId  - Mensajes de usuario
🎮  • GET  /api/conversations     - Conversaciones (admin)
🎮  
🎮  🔑 Credenciales Admin:
🎮  • Usuario: ignite100
🎮  • Contraseña: pepsi100
🎮  
🎮  👤 Usuario de Prueba:
🎮  • Usuario: 672rosana1
🎮  • Contraseña: asd123
🎮  
🎮 ============================================
      `);
    });
  });
}
