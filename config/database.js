// ============================================
// CONFIGURACIÓN DE BASE DE DATOS - MONGODB
// ============================================

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

// Esquema de Usuario
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },
  email: { type: String },
  phone: { type: String },
  role: { type: String, enum: ['user', 'admin', 'depositor', 'withdrawer'], default: 'user' },
  accountNumber: { type: String, unique: true },
  balance: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
  isActive: { type: Boolean, default: true },
  jugayganaUserId: { type: String, index: true },
  jugayganaUsername: { type: String },
  jugayganaSyncStatus: { type: String, enum: ['pending', 'synced', 'linked', 'not_applicable'], default: 'pending' },
  source: { type: String, enum: ['local', 'jugaygana'], default: 'local' },
  tokenVersion: { type: Number, default: 0 },
  passwordChangedAt: { type: Date }
});

// Esquema de Mensaje
const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  senderId: { type: String, required: true },
  senderUsername: { type: String, required: true },
  senderRole: { type: String, required: true },
  receiverId: { type: String, required: true },
  receiverRole: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, default: 'text' },
  timestamp: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

// Esquema de Transacción
const transactionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  type: { type: String, enum: ['deposit', 'withdrawal', 'bonus', 'refund'], required: true },
  amount: { type: Number, required: true },
  description: { type: String },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  externalId: { type: String }, // ID de la transacción en JUGAYGANA
  timestamp: { type: Date, default: Date.now }
});

// Esquema de Reembolso
const refundSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  type: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  amount: { type: Number, required: true },
  percentage: { type: Number, required: true },
  netAmount: { type: Number, required: true },
  deposits: { type: Number, default: 0 },
  withdrawals: { type: Number, default: 0 },
  claimedAt: { type: Date, default: Date.now },
  period: { type: String }
});

// Esquema de Configuración del Sistema
const systemConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed },
  updatedAt: { type: Date, default: Date.now }
});

// Crear modelos
const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Refund = mongoose.model('Refund', refundSchema);
const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

// Conectar a MongoDB
async function connectDB() {
  if (!MONGODB_URI) {
    console.log('⚠️  MONGODB_URI no configurado, usando JSON local');
    return false;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ Conectado a MongoDB Atlas');
    
    // Crear índices
    await User.createIndexes();
    await Message.createIndexes();
    await Transaction.createIndexes();
    await Refund.createIndexes();
    
    console.log('✅ Índices creados');
    
    return true;
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    console.log('⚠️  Fallback a JSON local');
    return false;
  }
}

// Funciones helper para usuarios
async function findUserByUsername(username) {
  if (!MONGODB_URI) return null;
  return await User.findOne({ username: username.toLowerCase() });
}

async function findUserById(id) {
  if (!MONGODB_URI) return null;
  return await User.findOne({ id });
}

async function createUser(userData) {
  if (!MONGODB_URI) return null;
  const user = new User(userData);
  return await user.save();
}

async function updateUser(id, updates) {
  if (!MONGODB_URI) return null;
  return await User.findOneAndUpdate({ id }, updates, { new: true });
}

async function getAllUsers() {
  if (!MONGODB_URI) return [];
  return await User.find({}).sort({ createdAt: -1 });
}

// Funciones helper para mensajes
async function saveMessage(messageData) {
  if (!MONGODB_URI) return null;
  const message = new Message(messageData);
  return await message.save();
}

async function getMessagesByUser(userId, limit = 100) {
  if (!MONGODB_URI) return [];
  return await Message.find({
    $or: [{ senderId: userId }, { receiverId: userId }]
  })
  .sort({ timestamp: 1 })
  .limit(limit);
}

async function markMessagesAsRead(userId) {
  if (!MONGODB_URI) return;
  await Message.updateMany(
    { senderId: userId, receiverRole: 'admin', read: false },
    { read: true }
  );
}

// Funciones helper para transacciones
async function createTransaction(transactionData) {
  if (!MONGODB_URI) return null;
  const transaction = new Transaction(transactionData);
  return await transaction.save();
}

async function getTransactionsByUser(userId) {
  if (!MONGODB_URI) return [];
  return await Transaction.find({ userId }).sort({ timestamp: -1 });
}

// Funciones helper para reembolsos
async function createRefund(refundData) {
  if (!MONGODB_URI) return null;
  const refund = new Refund(refundData);
  return await refund.save();
}

async function getRefundsByUser(userId) {
  if (!MONGODB_URI) return [];
  return await Refund.find({ userId }).sort({ claimedAt: -1 });
}

async function getLastRefundByType(userId, type) {
  if (!MONGODB_URI) return null;
  return await Refund.findOne({ userId, type }).sort({ claimedAt: -1 });
}

// Funciones helper para configuración
async function getConfig(key) {
  if (!MONGODB_URI) return null;
  const config = await SystemConfig.findOne({ key });
  return config ? config.value : null;
}

async function setConfig(key, value) {
  if (!MONGODB_URI) return null;
  return await SystemConfig.findOneAndUpdate(
    { key },
    { key, value, updatedAt: new Date() },
    { upsert: true, new: true }
  );
}

module.exports = {
  connectDB,
  User,
  Message,
  Transaction,
  Refund,
  SystemConfig,
  findUserByUsername,
  findUserById,
  createUser,
  updateUser,
  getAllUsers,
  saveMessage,
  getMessagesByUser,
  markMessagesAsRead,
  createTransaction,
  getTransactionsByUser,
  createRefund,
  getRefundsByUser,
  getLastRefundByType,
  getConfig,
  setConfig
};
