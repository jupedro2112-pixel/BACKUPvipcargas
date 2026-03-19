const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

// ============================================
// CONEXIÓN A MONGODB
// ============================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/saladejuegos';
let mongoConnected = false;

// Conectar a MongoDB
async function connectMongoDB() {
  if (!MONGODB_URI) {
    console.log('⚠️ MONGODB_URI no configurado');
    return false;
  }
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000
    });
    mongoConnected = true;
    console.log('✅ MongoDB conectado');
    return true;
  } catch (err) {
    console.log('⚠️ MongoDB no conectado:', err.message);
    mongoConnected = false;
    return false;
  }
}

// ============================================
// MODELOS DE MONGOOSE
// ============================================

// Schema de Usuario
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, default: null },
  phone: { type: String, default: null },
  whatsapp: { type: String, default: null },
  role: { type: String, enum: ['user', 'admin', 'depositor', 'withdrawer'], default: 'user' },
  accountNumber: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  bonusBalance: { type: Number, default: 0 },
  createdAt: { type: String, default: () => new Date().toISOString() },
  lastLogin: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 },
  passwordChangedAt: { type: String, default: null },
  jugayganaUserId: { type: String, default: null },
  jugayganaUsername: { type: String, default: null },
  jugayganaSyncStatus: { type: String, default: null },
  source: { type: String, default: null },
  lastBonusDate: { type: String, default: null },
  bonusDay: { type: Number, default: 0 },
  dailyWager: { type: Number, default: 0 },
  weeklyWager: { type: Number, default: 0 },
  monthlyWager: { type: Number, default: 0 },
  lastDailyRefund: { type: String, default: null },
  lastWeeklyRefund: { type: String, default: null },
  lastMonthlyRefund: { type: String, default: null }
}, { timestamps: true });

// Schema de Mensaje
const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  senderId: { type: String, required: true },
  senderUsername: { type: String, required: true },
  senderRole: { type: String, enum: ['user', 'admin', 'depositor', 'withdrawer', 'system'], required: true },
  receiverId: { type: String, required: true },
  receiverRole: { type: String, enum: ['user', 'admin', 'depositor', 'withdrawer'], required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['text', 'image'], default: 'text' },
  timestamp: { type: String, default: () => new Date().toISOString() },
  read: { type: Boolean, default: false }
}, { timestamps: true });

// Schema para comandos personalizados
const commandSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  type: { type: String, default: 'text' },
  bonusPercent: { type: Number, default: 0 },
  response: { type: String, required: true },
  createdBy: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Schema para configuración (CBU, etc)
const configSchema = new mongoose.Schema({
  key: { type: String, default: 'main' },
  cbu: {
    number: { type: String, default: '0000000000000000000000' },
    alias: { type: String, default: 'mi.alias.cbu' },
    bank: { type: String, default: 'Banco Ejemplo' },
    titular: { type: String, default: 'Sala de Juegos' }
  },
  welcomeMessage: { type: String, default: '🎉 ¡Bienvenido a la Sala de Juegos!' },
  depositMessage: { type: String, default: '💰 ¡Fichas cargadas!' },
  maintenanceMode: { type: Boolean, default: false },
  allowRegistration: { type: Boolean, default: true }
}, { timestamps: true });

// Schema para transacciones
const transactionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  type: { type: String, enum: ['deposit', 'withdrawal', 'bonus', 'refund', 'adjustment'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'rejected', 'cancelled'], default: 'pending' },
  method: { type: String, default: null },
  reference: { type: String, default: null },
  notes: { type: String, default: null },
  processedBy: { type: String, default: null },
  processedAt: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
  jugayganaTransactionId: { type: String, default: null }
}, { timestamps: true });

// Schema para reembolsos
const refundSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  type: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  percentage: { type: Number, required: true },
  amount: { type: Number, required: true },
  wagerAmount: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 },
  deposits: { type: Number, default: 0 },
  withdrawals: { type: Number, default: 0 },
  status: { type: String, enum: ['claimed', 'pending', 'rejected'], default: 'claimed' },
  processedAt: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });

// Schema para fueguito
const fireRewardSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  streak: { type: Number, default: 0 },
  lastClaim: { type: String, default: null },
  totalClaimed: { type: Number, default: 0 }
}, { timestamps: true });

// Schema para usuarios externos
const externalUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  phone: { type: String, default: null },
  whatsapp: { type: String, default: null },
  firstSeen: { type: String, default: () => new Date().toISOString() },
  lastSeen: { type: String, default: () => new Date().toISOString() },
  messageCount: { type: Number, default: 0 }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);
const Command = mongoose.model('Command', commandSchema);
const Config = mongoose.model('Config', configSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Refund = mongoose.model('Refund', refundSchema);
const FireReward = mongoose.model('FireReward', fireRewardSchema);
const ExternalUser = mongoose.model('ExternalUser', externalUserSchema);

// ============================================
// INTEGRACIÓN JUGAYGANA
// ============================================

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const API_URL = 'https://admin.agentesadmin.bet/api/admin/';
const PROXY_URL = process.env.PROXY_URL || '';

// Variables de sesión
let SESSION_TOKEN = null;
let SESSION_COOKIE = null;
let SESSION_PARENT_ID = null;
let SESSION_LAST_LOGIN = 0;

const PLATFORM_USER = process.env.PLATFORM_USER;
const PLATFORM_PASS = process.env.PLATFORM_PASS;
const TOKEN_TTL_MINUTES = parseInt(process.env.TOKEN_TTL_MINUTES || '20', 10);

// Configurar agente proxy si existe
let httpsAgent = null;
if (PROXY_URL) {
  httpsAgent = new HttpsProxyAgent(PROXY_URL);
  console.log('✅ Proxy configurado:', PROXY_URL.replace(/:.*@/, ':****@'));
}

// Cliente HTTP
const client = axios.create({
  baseURL: API_URL,
  timeout: 20000,
  httpsAgent,
  proxy: false,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': 'https://admin.agentesadmin.bet',
    'Referer': 'https://admin.agentesadmin.bet/users',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Accept-Language': 'es-419,es;q=0.9'
  }
});

// Helper para formatear datos
function toFormUrlEncoded(data) {
  return Object.keys(data)
    .filter(k => data[k] !== undefined && data[k] !== null)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k]))
    .join('&');
}

// Parsear JSON que puede venir envuelto
function parsePossiblyWrappedJson(data) {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data.substring(data.indexOf('{'), data.lastIndexOf('}') + 1));
  } catch {
    return data;
  }
}

// Detectar bloqueo por HTML
function isHtmlBlocked(data) {
  return typeof data === 'string' && data.trim().startsWith('<');
}

// Verificar IP pública
async function logProxyIP() {
  try {
    const res = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent,
      proxy: false,
      timeout: 10000
    });
    console.log('🌐 IP pública saliente:', res.data.ip);
    return res.data.ip;
  } catch (e) {
    console.error('❌ No se pudo verificar IP pública:', e.message);
    return null;
  }
}

// Login y obtener token
async function loginAndGetToken() {
  if (!PLATFORM_USER || !PLATFORM_PASS) {
    console.error('❌ Faltan PLATFORM_USER o PLATFORM_PASS');
    return false;
  }

  console.log('🔑 Intentando login en JUGAYGANA...');

  const body = toFormUrlEncoded({
    action: 'LOGIN',
    username: PLATFORM_USER,
    password: PLATFORM_PASS
  });

  try {
    const resp = await client.post('', body, {
      validateStatus: s => s >= 200 && s < 500,
      maxRedirects: 0
    });

    if (resp.headers['set-cookie']) {
      SESSION_COOKIE = resp.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
    }

    let data = parsePossiblyWrappedJson(resp.data);
    if (isHtmlBlocked(data)) {
      console.error('❌ Login bloqueado: respuesta HTML (posible bloqueo de IP)');
      return false;
    }

    if (!data?.token) {
      console.error('❌ Login falló: no se recibió token');
      return false;
    }

    SESSION_TOKEN = data.token;
    SESSION_PARENT_ID = data?.user?.user_id ?? null;
    SESSION_LAST_LOGIN = Date.now();
    
    console.log('✅ Login exitoso. Parent ID:', SESSION_PARENT_ID);
    return true;
  } catch (error) {
    console.error('❌ Error en login:', error.message);
    return false;
  }
}

// Asegurar sesión válida
async function ensureSession() {
  if (PLATFORM_USER && PLATFORM_PASS) {
    const expired = Date.now() - SESSION_LAST_LOGIN > TOKEN_TTL_MINUTES * 60 * 1000;
    if (!SESSION_TOKEN || expired) {
      SESSION_TOKEN = null;
      SESSION_COOKIE = null;
      SESSION_PARENT_ID = null;
      return await loginAndGetToken();
    }
    return true;
  }
  return false;
}

// CREATEUSER - Crear usuario en JUGAYGANA
async function createPlatformUser({ username, password, userrole = 'player', currency = 'ARS' }) {
  const ok = await ensureSession();
  if (!ok) return { success: false, error: 'No hay sesión válida' };

  console.log('👤 Creando usuario en JUGAYGANA:', username);

  const body = toFormUrlEncoded({
    action: 'CREATEUSER',
    token: SESSION_TOKEN,
    username,
    password,
    userrole,
    currency
  });

  const headers = {};
  if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;

  try {
    const resp = await client.post('', body, { 
      headers, 
      validateStatus: () => true, 
      maxRedirects: 0 
    });

    let data = parsePossiblyWrappedJson(resp.data);
    if (isHtmlBlocked(data)) {
      console.error('❌ CREATEUSER bloqueado: respuesta HTML');
      return { success: false, error: 'IP bloqueada / HTML' };
    }

    if (data?.success) {
      console.log('✅ Usuario creado en JUGAYGANA:', data.user?.user_name);
      return { 
        success: true, 
        user: data.user,
        jugayganaUserId: data.user?.user_id,
        jugayganaUsername: data.user?.user_name
      };
    }
    
    console.error('❌ CREATEUSER falló:', data?.error || 'Error desconocido');
    return { success: false, error: data?.error || 'CREATEUSER falló' };
  } catch (error) {
    console.error('❌ Error en CREATEUSER:', error.message);
    return { success: false, error: error.message };
  }
}

// ShowUsers - Buscar usuario
async function getUserInfoByName(username) {
  const ok = await ensureSession();
  if (!ok) return null;

  const body = toFormUrlEncoded({
    action: 'ShowUsers',
    token: SESSION_TOKEN,
    page: 1,
    pagesize: 50,
    viewtype: 'tree',
    username,
    showhidden: 'false',
    parentid: SESSION_PARENT_ID || undefined
  });

  const headers = {};
  if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;

  try {
    const resp = await client.post('', body, { 
      headers, 
      validateStatus: () => true, 
      maxRedirects: 0 
    });

    let data = parsePossiblyWrappedJson(resp.data);
    if (isHtmlBlocked(data)) return null;

    const list = data.users || data.data || (Array.isArray(data) ? data : []);
    const found = list.find(u => 
      String(u.user_name).toLowerCase().trim() === String(username).toLowerCase().trim()
    );
    
    if (!found?.user_id) return null;

    let balanceRaw = Number(found.user_balance ?? found.balance ?? found.balance_amount ?? found.available_balance ?? 0);
    let balance = Number.isInteger(balanceRaw) ? balanceRaw / 100 : balanceRaw;

    return { 
      id: found.user_id, 
      balance,
      username: found.user_name,
      email: found.user_email,
      phone: found.user_phone
    };
  } catch (error) {
    console.error('❌ Error en ShowUsers:', error.message);
    return null;
  }
}

// Verificar si usuario existe en JUGAYGANA
async function checkUserExists(username) {
  const user = await getUserInfoByName(username);
  return user !== null;
}

// Sincronización completa: crear usuario local + JUGAYGANA
async function syncUserToPlatform(localUser) {
  console.log('🔄 Sincronizando usuario con JUGAYGANA:', localUser.username);

  // 1. Verificar si ya existe en JUGAYGANA
  const existingUser = await getUserInfoByName(localUser.username);
  if (existingUser) {
    console.log('✅ Usuario ya existe en JUGAYGANA:', existingUser.id);
    return {
      success: true,
      alreadyExists: true,
      jugayganaUserId: existingUser.id,
      jugayganaUsername: localUser.username
    };
  }

  // 2. Crear en JUGAYGANA
  const result = await createPlatformUser({
    username: localUser.username,
    password: localUser.password || 'asd123',
    userrole: 'player',
    currency: 'ARS'
  });

  return result;
}

// FECHAS ARGENTINA
function getYesterdayRangeArgentinaEpoch() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const now = new Date();
  const parts = formatter.formatToParts(now);
  const yyyy = parts.find(p => p.type === 'year').value;
  const mm = parts.find(p => p.type === 'month').value;
  const dd = parts.find(p => p.type === 'day').value;

  const todayLocal = new Date(`${yyyy}-${mm}-${dd}T00:00:00-03:00`);
  const yesterdayLocal = new Date(todayLocal.getTime() - 24 * 60 * 60 * 1000);

  const yparts = formatter.formatToParts(yesterdayLocal);
  const y = yparts.find(p => p.type === 'year').value;
  const m = yparts.find(p => p.type === 'month').value;
  const d = yparts.find(p => p.type === 'day').value;

  const from = new Date(`${y}-${m}-${d}T00:00:00-03:00`);
  const to = new Date(`${y}-${m}-${d}T23:59:59-03:00`);

  return {
    fromEpoch: Math.floor(from.getTime() / 1000),
    toEpoch: Math.floor(to.getTime() / 1000),
    dateStr: `${y}-${m}-${d}`
  };
}

function getTodayRangeArgentinaEpoch() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const now = new Date();
  const parts = formatter.formatToParts(now);
  const yyyy = parts.find(p => p.type === 'year').value;
  const mm = parts.find(p => p.type === 'month').value;
  const dd = parts.find(p => p.type === 'day').value;

  const from = new Date(`${yyyy}-${mm}-${dd}T00:00:00-03:00`);
  const to = new Date(`${yyyy}-${mm}-${dd}T23:59:59-03:00`);

  return {
    fromEpoch: Math.floor(from.getTime() / 1000),
    toEpoch: Math.floor(to.getTime() / 1000),
    dateStr: `${yyyy}-${mm}-${dd}`
  };
}

// OBTENER MOVIMIENTOS DE AYER (para reembolsos)
async function getUserNetYesterday(username) {
  const ok = await ensureSession();
  if (!ok) return { success: false, error: 'No hay sesión válida' };

  if (!SESSION_PARENT_ID) {
    return { success: false, error: 'No se pudo obtener Admin ID' };
  }

  try {
    const { fromEpoch, toEpoch, dateStr } = getYesterdayRangeArgentinaEpoch();

    console.log(`📊 Consultando movimientos de ${username} para ${dateStr} (epoch: ${fromEpoch} - ${toEpoch})`);

    const body = toFormUrlEncoded({
      action: 'ShowUserTransfersByAgent',
      token: SESSION_TOKEN,
      page: 1,
      pagesize: 100,
      fromtime: fromEpoch,
      totime: toEpoch,
      username: username,
      userrole: 'player',
      direct: 'False',
      childid: SESSION_PARENT_ID
    });

    const headers = {};
    if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;

    const resp = await client.post('', body, { headers });

    let data = parsePossiblyWrappedJson(resp.data);
    if (isHtmlBlocked(data)) {
      console.error('❌ ShowUserTransfersByAgent bloqueado: respuesta HTML');
      return { success: false, error: 'IP Bloqueada (HTML)' };
    }

    console.log('📊 Respuesta de ShowUserTransfersByAgent:', JSON.stringify(data).substring(0, 500));

    // Los montos vienen en centavos
    const totalDepositsCents = Number(data?.total_deposits || 0);
    const totalWithdrawsCents = Number(data?.total_withdraws || 0);
    const netCents = totalDepositsCents - totalWithdrawsCents;

    const totalDeposits = totalDepositsCents / 100;
    const totalWithdraws = totalWithdrawsCents / 100;
    const net = netCents / 100;

    console.log(`📊 ${username}: Depósitos=$${totalDeposits}, Retiros=$${totalWithdraws}, Neto=$${net}`);

    return {
      success: true,
      net: Number(net.toFixed(2)),
      totalDeposits: Number(totalDeposits.toFixed(2)),
      totalWithdraws: Number(totalWithdraws.toFixed(2)),
      fromEpoch,
      toEpoch,
      dateStr
    };
  } catch (err) {
    console.error('❌ Error en ShowUserTransfersByAgent:', err.message);
    return { success: false, error: err.message };
  }
}

// VERIFICAR SI RECLAMÓ HOY
async function checkClaimedToday(username) {
  const ok = await ensureSession();
  if (!ok) return { success: false, error: 'No hay sesión válida' };

  if (!SESSION_PARENT_ID) {
    return { success: false, error: 'No se pudo obtener Admin ID' };
  }

  try {
    const { fromEpoch, toEpoch } = getTodayRangeArgentinaEpoch();

    const body = toFormUrlEncoded({
      action: 'ShowUserTransfersByAgent',
      token: SESSION_TOKEN,
      page: 1,
      pagesize: 30,
      fromtime: fromEpoch,
      totime: toEpoch,
      username: username,
      userrole: 'player',
      direct: 'False',
      childid: SESSION_PARENT_ID
    });

    const headers = {};
    if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;

    const resp = await client.post('', body, { headers });

    let data = parsePossiblyWrappedJson(resp.data);
    const totalBonusCents = Number(data?.total_bonus || 0);
    const totalBonus = totalBonusCents / 100;

    return { success: true, claimed: totalBonus > 0, totalBonus };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// DEPOSITAR BONUS (reembolso)
async function creditUserBalance(username, amount) {
  console.log(`💰 Cargando $${amount} a ${username}`);

  const ok = await ensureSession();
  if (!ok) return { success: false, error: 'No hay sesión válida' };

  const userInfo = await getUserInfoByName(username);
  if (!userInfo) return { success: false, error: 'Usuario no encontrado' };

  try {
    const amountCents = Math.round(parseFloat(amount) * 100);

    const body = toFormUrlEncoded({
      action: 'DepositMoney',
      token: SESSION_TOKEN,
      childid: userInfo.id,
      amount: amountCents,
      currency: 'ARS',
      deposit_type: 'individual_bonus'
    });

    const headers = {};
    if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;

    const resp = await client.post('', body, { headers });

    let data = parsePossiblyWrappedJson(resp.data);
    if (isHtmlBlocked(data)) {
      return { success: false, error: 'IP Bloqueada (HTML)' };
    }

    console.log("📩 Resultado DepositMoney:", JSON.stringify(data));

    if (data && data.success) {
      return { success: true, data: data };
    } else {
      return { success: false, error: data.error || 'API Error' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// DEPÓSITO NORMAL (deposit_type: deposit)
async function depositToUser(username, amount, description = '') {
  console.log(`💰 Depositando $${amount} a ${username}`);

  const ok = await ensureSession();
  if (!ok) return { success: false, error: 'No hay sesión válida' };

  let userInfo = await getUserInfoByName(username);
  
  // Si no existe, crear el usuario
  if (!userInfo) {
    console.log(`👤 Usuario no encontrado, creando: ${username}`);
    const createResult = await createPlatformUser({
      username: username,
      password: 'asd123',
      userrole: 'player',
      currency: 'ARS'
    });
    
    if (createResult.success) {
      await new Promise(r => setTimeout(r, 1000));
      userInfo = await getUserInfoByName(username);
    }
    
    if (!userInfo) {
      return { success: false, error: 'No se pudo crear el usuario' };
    }
  }

  try {
    const amountCents = Math.round(parseFloat(amount) * 100);

    const body = toFormUrlEncoded({
      action: 'DepositMoney',
      token: SESSION_TOKEN,
      childid: userInfo.id,
      amount: amountCents,
      currency: 'ARS',
      deposit_type: 'deposit',
      description: description || 'Depósito desde Sala de Juegos'
    });

    const headers = {};
    if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;

    const resp = await client.post('', body, { headers });

    let data = parsePossiblyWrappedJson(resp.data);
    if (isHtmlBlocked(data)) {
      return { success: false, error: 'IP Bloqueada (HTML)' };
    }

    console.log("📩 Resultado DepositMoney:", JSON.stringify(data));

    if (data && (data.success || data.transfer_id || data.transferId)) {
      return { success: true, data };
    } else {
      return { success: false, error: data.error || data.message || 'API Error' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// RETIRO (WithdrawMoney)
async function withdrawFromUser(username, amount, description = '') {
  console.log(`💸 Retirando $${amount} de ${username}`);

  const ok = await ensureSession();
  if (!ok) return { success: false, error: 'No hay sesión válida' };

  let userInfo = await getUserInfoByName(username);
  
  // Si no existe, crear el usuario
  if (!userInfo) {
    console.log(`👤 Usuario no encontrado, creando: ${username}`);
    const createResult = await createPlatformUser({
      username: username,
      password: 'asd123',
      userrole: 'player',
      currency: 'ARS'
    });
    
    if (createResult.success) {
      await new Promise(r => setTimeout(r, 1000));
      userInfo = await getUserInfoByName(username);
    }
    
    if (!userInfo) {
      return { success: false, error: 'No se pudo crear el usuario' };
    }
  }

  try {
    const amountCents = Math.round(parseFloat(amount) * 100);

    const body = toFormUrlEncoded({
      action: 'WithdrawMoney',
      token: SESSION_TOKEN,
      childid: userInfo.id,
      amount: amountCents,
      currency: 'ARS',
      description: description || 'Retiro desde Sala de Juegos'
    });

    const headers = {};
    if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;

    const resp = await client.post('', body, { headers });

    let data = parsePossiblyWrappedJson(resp.data);
    if (isHtmlBlocked(data)) {
      return { success: false, error: 'IP Bloqueada (HTML)' };
    }

    console.log("📩 Resultado WithdrawMoney:", JSON.stringify(data));

    if (data && (data.success || data.transfer_id || data.transferId)) {
      return { success: true, data };
    } else {
      return { success: false, error: data.error || data.message || 'API Error' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// OBTENER MOVIMIENTOS SEMANALES (semana pasada: lunes a domingo)
function getLastWeekRangeArgentinaEpoch() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const now = new Date();
  const parts = formatter.formatToParts(now);
  const yyyy = parts.find(p => p.type === 'year').value;
  const mm = parts.find(p => p.type === 'month').value;
  const dd = parts.find(p => p.type === 'day').value;

  // Fecha actual en Argentina
  const todayLocal = new Date(`${yyyy}-${mm}-${dd}T00:00:00-03:00`);
  
  // Día de la semana (0 = domingo, 1 = lunes, etc.)
  const dayOfWeek = todayLocal.getDay();
  
  // Días desde el lunes de esta semana
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  // Lunes de esta semana
  const thisMonday = new Date(todayLocal.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  
  // Lunes de la semana pasada (7 días antes)
  const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Domingo de la semana pasada (6 días después del lunes pasado)
  const lastSunday = new Date(lastMonday.getTime() + 6 * 24 * 60 * 60 * 1000);

  const mondayParts = formatter.formatToParts(lastMonday);
  const sundayParts = formatter.formatToParts(lastSunday);

  const from = new Date(`${mondayParts.find(p => p.type === 'year').value}-${mondayParts.find(p => p.type === 'month').value}-${mondayParts.find(p => p.type === 'day').value}T00:00:00-03:00`);
  const to = new Date(`${sundayParts.find(p => p.type === 'year').value}-${sundayParts.find(p => p.type === 'month').value}-${sundayParts.find(p => p.type === 'day').value}T23:59:59-03:00`);

  return {
    fromEpoch: Math.floor(from.getTime() / 1000),
    toEpoch: Math.floor(to.getTime() / 1000),
    fromDateStr: `${mondayParts.find(p => p.type === 'year').value}-${mondayParts.find(p => p.type === 'month').value}-${mondayParts.find(p => p.type === 'day').value}`,
    toDateStr: `${sundayParts.find(p => p.type === 'year').value}-${sundayParts.find(p => p.type === 'month').value}-${sundayParts.find(p => p.type === 'day').value}`
  };
}

async function getUserNetLastWeek(username) {
  const ok = await ensureSession();
  if (!ok) return { success: false, error: 'No hay sesión válida' };

  if (!SESSION_PARENT_ID) {
    return { success: false, error: 'No se pudo obtener Admin ID' };
  }

  try {
    const { fromEpoch, toEpoch, fromDateStr, toDateStr } = getLastWeekRangeArgentinaEpoch();

    console.log(`📊 Consultando movimientos semanales de ${username}: ${fromDateStr} a ${toDateStr}`);

    const body = toFormUrlEncoded({
      action: 'ShowUserTransfersByAgent',
      token: SESSION_TOKEN,
      page: 1,
      pagesize: 200,
      fromtime: fromEpoch,
      totime: toEpoch,
      username: username,
      userrole: 'player',
      direct: 'False',
      childid: SESSION_PARENT_ID
    });

    const headers = {};
    if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;

    const resp = await client.post('', body, { headers });

    let data = parsePossiblyWrappedJson(resp.data);
    if (isHtmlBlocked(data)) {
      return { success: false, error: 'IP Bloqueada (HTML)' };
    }

    const totalDepositsCents = Number(data?.total_deposits || 0);
    const totalWithdrawsCents = Number(data?.total_withdraws || 0);
    const netCents = totalDepositsCents - totalWithdrawsCents;

    const totalDeposits = totalDepositsCents / 100;
    const totalWithdraws = totalWithdrawsCents / 100;
    const net = netCents / 100;

    console.log(`📊 ${username} semana pasada: Depósitos=$${totalDeposits}, Retiros=$${totalWithdraws}, Neto=$${net}`);

    return {
      success: true,
      net: Number(net.toFixed(2)),
      totalDeposits: Number(totalDeposits.toFixed(2)),
      totalWithdraws: Number(totalWithdraws.toFixed(2)),
      fromEpoch,
      toEpoch,
      fromDateStr,
      toDateStr
    };
  } catch (err) {
    console.error('❌ Error en getUserNetLastWeek:', err.message);
    return { success: false, error: err.message };
  }
}

// OBTENER MOVIMIENTOS MENSUALES (mes pasado completo)
function getLastMonthRangeArgentinaEpoch() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const now = new Date();
  const parts = formatter.formatToParts(now);
  const yyyy = parseInt(parts.find(p => p.type === 'year').value);
  const mm = parseInt(parts.find(p => p.type === 'month').value);

  // Mes pasado
  let lastMonth = mm - 1;
  let lastMonthYear = yyyy;
  if (lastMonth === 0) {
    lastMonth = 12;
    lastMonthYear = yyyy - 1;
  }

  // Último día del mes pasado
  const lastDayOfLastMonth = new Date(lastMonthYear, lastMonth, 0).getDate();

  const from = new Date(`${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-01T00:00:00-03:00`);
  const to = new Date(`${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-${lastDayOfLastMonth}T23:59:59-03:00`);

  return {
    fromEpoch: Math.floor(from.getTime() / 1000),
    toEpoch: Math.floor(to.getTime() / 1000),
    fromDateStr: `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-01`,
    toDateStr: `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-${lastDayOfLastMonth}`
  };
}

async function getUserNetLastMonth(username) {
  const ok = await ensureSession();
  if (!ok) return { success: false, error: 'No hay sesión válida' };

  if (!SESSION_PARENT_ID) {
    return { success: false, error: 'No se pudo obtener Admin ID' };
  }

  try {
    const { fromEpoch, toEpoch, fromDateStr, toDateStr } = getLastMonthRangeArgentinaEpoch();

    console.log(`📊 Consultando movimientos mensuales de ${username}: ${fromDateStr} a ${toDateStr}`);

    const body = toFormUrlEncoded({
      action: 'ShowUserTransfersByAgent',
      token: SESSION_TOKEN,
      page: 1,
      pagesize: 500,
      fromtime: fromEpoch,
      totime: toEpoch,
      username: username,
      userrole: 'player',
      direct: 'False',
      childid: SESSION_PARENT_ID
    });

    const headers = {};
    if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;

    const resp = await client.post('', body, { headers });

    let data = parsePossiblyWrappedJson(resp.data);
    if (isHtmlBlocked(data)) {
      return { success: false, error: 'IP Bloqueada (HTML)' };
    }

    const totalDepositsCents = Number(data?.total_deposits || 0);
    const totalWithdrawsCents = Number(data?.total_withdraws || 0);
    const netCents = totalDepositsCents - totalWithdrawsCents;

    const totalDeposits = totalDepositsCents / 100;
    const totalWithdraws = totalWithdrawsCents / 100;
    const net = netCents / 100;

    console.log(`📊 ${username} mes pasado: Depósitos=$${totalDeposits}, Retiros=$${totalWithdraws}, Neto=$${net}`);

    return {
      success: true,
      net: Number(net.toFixed(2)),
      totalDeposits: Number(totalDeposits.toFixed(2)),
      totalWithdraws: Number(totalWithdraws.toFixed(2)),
      fromEpoch,
      toEpoch,
      fromDateStr,
      toDateStr
    };
  } catch (err) {
    console.error('❌ Error en getUserNetLastMonth:', err.message);
    return { success: false, error: err.message };
  }
}

// ============================================
// JUGAYGANA MOVEMENTS
// ============================================

async function getUserMovements(username, options = {}) {
  const { 
    startDate, 
    endDate, 
    operationType = 'all',
    page = 1, 
    pageSize = 100 
  } = options;
  
  const sessionOk = await ensureSession();
  if (!sessionOk) {
    return { success: false, error: 'No hay sesión válida' };
  }
  
  try {
    const params = {
      action: 'ShowUserMovements',
      token: SESSION_TOKEN,
      username,
      page,
      pagesize: pageSize
    };
    
    if (startDate) params.startdate = startDate;
    if (endDate) params.enddate = endDate;
    if (operationType !== 'all') params.operationtype = operationType;
    
    const body = toFormUrlEncoded(params);
    
    const headers = {};
    if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;
    
    const resp = await axios.post(API_URL, body, {
      httpsAgent,
      proxy: false,
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: 30000
    });
    
    let data = parsePossiblyWrappedJson(resp.data);
    if (isHtmlBlocked(data)) {
      return { success: false, error: 'IP bloqueada / respuesta HTML' };
    }
    
    let movements = null;
    
    if (data.movements && Array.isArray(data.movements)) {
      movements = data.movements;
    } else if (data.data && Array.isArray(data.data)) {
      movements = data.data;
    } else if (data.Movements && Array.isArray(data.Movements)) {
      movements = data.Movements;
    } else if (data.Data && Array.isArray(data.Data)) {
      movements = data.Data;
    } else if (data.items && Array.isArray(data.items)) {
      movements = data.items;
    } else if (data.records && Array.isArray(data.records)) {
      movements = data.records;
    } else if (data.result && Array.isArray(data.result)) {
      movements = data.result;
    }
    
    if (!movements) {
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key]) && data[key].length > 0) {
          movements = data[key];
          break;
        }
      }
    }
    
    movements = movements || [];
    
    return {
      success: true,
      movements,
      total: data.total || data.Total || data.count || data.Count || movements.length,
      page,
      pageSize
    };
  } catch (error) {
    console.error('Error obteniendo movimientos:', error.message);
    return { success: false, error: error.message };
  }
}

async function getUserBalance(username) {
  const userInfo = await getUserInfoByName(username);
  
  if (!userInfo) {
    return { success: false, error: 'Usuario no encontrado' };
  }
  
  return {
    success: true,
    balance: userInfo.balance || 0,
    username: userInfo.username,
    userId: userInfo.id
  };
}

async function makeBonus(username, amount, description = '') {
  if (!amount || amount <= 0) {
    return { success: false, error: 'Monto inválido' };
  }
  
  const sessionOk = await ensureSession();
  if (!sessionOk) {
    return { success: false, error: 'No hay sesión válida' };
  }
  
  let userInfo = await getUserInfoByName(username);
  
  if (!userInfo || !userInfo.id) {
    console.log('👤 Usuario no encontrado, intentando crear:', username);
    const createResult = await createPlatformUser({
      username: username,
      password: 'asd123',
      userrole: 'player',
      currency: 'ARS'
    });
    
    if (createResult.success) {
      await new Promise(r => setTimeout(r, 1000));
      userInfo = await getUserInfoByName(username);
    }
    
    if (!userInfo || !userInfo.id) {
      return { success: false, error: 'Usuario no encontrado en JUGAYGANA y no se pudo crear' };
    }
  }
  
  try {
    const amountCents = Math.round(parseFloat(amount) * 100);
    
    const body = toFormUrlEncoded({
      action: 'DepositMoney',
      token: SESSION_TOKEN,
      childid: userInfo.id,
      amount: amountCents,
      currency: 'ARS',
      deposit_type: 'individual_bonus',
      description: description || 'Bonificación - Sala de Juegos'
    });
    
    const headers = {};
    if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;
    
    const resp = await axios.post(API_URL, body, {
      httpsAgent,
      proxy: false,
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });
    
    let data = parsePossiblyWrappedJson(resp.data);
    if (isHtmlBlocked(data)) {
      return { success: false, error: 'IP bloqueada / respuesta HTML' };
    }
    
    if (data.success || data.status === 'success' || data.transfer_id || data.transferId) {
      return {
        success: true,
        message: 'Bonificación realizada correctamente',
        newBalance: data.user_balance_after || data.new_balance || data.balance,
        transactionId: data.transfer_id || data.transferId || data.id,
        transfer: data
      };
    } else {
      return {
        success: false,
        error: data.error || data.message || 'Error al realizar bonificación'
      };
    }
  } catch (error) {
    console.error('Error en bonificación:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// JUGAYGANA SYNC
// ============================================

async function getAllJugayganaUsers() {
  const allUsers = [];
  let page = 1;
  const pageSize = 100;
  let hasMore = true;
  let consecutiveErrors = 0;

  console.log('🔍 Obteniendo usuarios de JUGAYGANA...');

  while (hasMore && page <= 2000 && consecutiveErrors < 5) {
    try {
      const sessionOk = await ensureSession();
      if (!sessionOk) {
        console.error('❌ No hay sesión válida');
        break;
      }

      const body = toFormUrlEncoded({
        action: 'ShowUsers',
        token: SESSION_TOKEN,
        page: page,
        pagesize: pageSize,
        viewtype: 'tree',
        showhidden: 'false',
        parentid: SESSION_PARENT_ID || undefined
      });

      const headers = {};
      if (SESSION_COOKIE) headers.Cookie = SESSION_COOKIE;

      const resp = await axios.post(API_URL, body, {
        httpsAgent,
        proxy: false,
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*'
        },
        timeout: 30000
      });

      let data = resp.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data.substring(data.indexOf('{'), data.lastIndexOf('}') + 1));
        } catch (_) {}
      }

      if (typeof data === 'string' && data.trim().startsWith('<')) {
        console.error('❌ Respuesta HTML (bloqueo de IP)');
        consecutiveErrors++;
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      const users = data.users || data.data || [];
      
      if (users.length === 0) {
        hasMore = false;
        console.log(`✅ No hay más usuarios en página ${page}`);
      } else {
        allUsers.push(...users);
        console.log(`📄 Página ${page}: +${users.length} usuarios (Total: ${allUsers.length})`);
        page++;
        consecutiveErrors = 0;
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (error) {
      console.error(`❌ Error página ${page}:`, error.message);
      consecutiveErrors++;
      if (consecutiveErrors >= 5) {
        console.error('❌ Demasiados errores consecutivos, abortando');
        break;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return allUsers;
}

async function syncAllUsers(progressCallback = null) {
  console.log('\n🚀 INICIANDO SINCRONIZACIÓN MASIVA\n');
  
  const startTime = Date.now();
  const syncLog = loadSyncLog();
  
  const jugayganaUsers = await getAllJugayganaUsers();
  
  if (jugayganaUsers.length === 0) {
    return { 
      success: false, 
      error: 'No se pudieron obtener usuarios de JUGAYGANA',
      totalJugaygana: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };
  }

  let localUsers = loadUsers();
  const initialCount = localUsers.length;
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  const localUsersMap = new Map();
  localUsers.forEach(u => {
    localUsersMap.set(u.username.toLowerCase(), u);
  });
  
  for (let i = 0; i < jugayganaUsers.length; i++) {
    const jgUser = jugayganaUsers[i];
    const username = jgUser.user_name;
    const userId = jgUser.user_id;
    
    if (!username) {
      skipped++;
      continue;
    }
    
    try {
      const existingUser = localUsersMap.get(username.toLowerCase());
      
      if (existingUser) {
        let needsUpdate = false;
        
        if (!existingUser.jugayganaUserId) {
          existingUser.jugayganaUserId = userId;
          existingUser.jugayganaUsername = username;
          existingUser.jugayganaSyncStatus = 'linked';
          existingUser.source = 'jugaygana';
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          updated++;
        } else {
          skipped++;
        }
      } else {
        const hashedPassword = await bcrypt.hash('asd123', 10);
        
        const newUser = {
          id: uuidv4(),
          username: username,
          password: hashedPassword,
          email: jgUser.user_email || null,
          phone: jgUser.user_phone || null,
          role: 'user',
          accountNumber: generateAccountNumber(),
          balance: 0,
          createdAt: new Date().toISOString(),
          lastLogin: null,
          isActive: true,
          jugayganaUserId: userId,
          jugayganaUsername: username,
          jugayganaSyncStatus: 'imported',
          source: 'jugaygana'
        };
        
        localUsers.push(newUser);
        localUsersMap.set(username.toLowerCase(), newUser);
        created++;
      }
      
      if (progressCallback && i % 100 === 0) {
        progressCallback({
          current: i + 1,
          total: jugayganaUsers.length,
          percent: Math.round(((i + 1) / jugayganaUsers.length) * 100),
          created,
          updated,
          skipped
        });
      }
      
    } catch (error) {
      console.error(`❌ Error procesando ${username}:`, error.message);
      errors++;
    }
  }
  
  saveUsers(localUsers);
  
  syncLog.lastSync = new Date().toISOString();
  syncLog.totalSynced = (syncLog.totalSynced || 0) + created + updated;
  syncLog.lastResult = {
    totalJugaygana: jugayganaUsers.length,
    initialLocal: initialCount,
    finalLocal: localUsers.length,
    created,
    updated,
    skipped,
    errors,
    duration: Date.now() - startTime
  };
  saveSyncLog(syncLog);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ SINCRONIZACIÓN COMPLETADA');
  console.log('='.repeat(50));
  console.log(`📊 Total JUGAYGANA: ${jugayganaUsers.length}`);
  console.log(`📊 Usuarios locales inicial: ${initialCount}`);
  console.log(`📊 Usuarios locales final: ${localUsers.length}`);
  console.log(`✅ Creados: ${created}`);
  console.log(`🔄 Actualizados: ${updated}`);
  console.log(`⏭️ Saltados: ${skipped}`);
  console.log(`❌ Errores: ${errors}`);
  console.log(`⏱️ Duración: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log('='.repeat(50));
  
  return {
    success: true,
    totalJugaygana: jugayganaUsers.length,
    initialLocal: initialCount,
    finalLocal: localUsers.length,
    created,
    updated,
    skipped,
    errors,
    duration: Date.now() - startTime
  };
}

async function syncRecentUsers(limit = 100) {
  console.log(`🔄 Sincronizando ${limit} usuarios más recientes...`);
  
  const allUsers = await getAllJugayganaUsers();
  
  if (allUsers.length === 0) {
    return { success: false, error: 'No se pudieron obtener usuarios' };
  }
  
  const recentUsers = allUsers
    .sort((a, b) => (b.registration_time_unix || 0) - (a.registration_time_unix || 0))
    .slice(0, limit);
  
  let localUsers = loadUsers();
  const localUsersMap = new Map(localUsers.map(u => [u.username.toLowerCase(), u]));
  
  let created = 0;
  let skipped = 0;
  
  for (const jgUser of recentUsers) {
    const username = jgUser.user_name;
    if (!username) continue;
    
    if (!localUsersMap.has(username.toLowerCase())) {
      const hashedPassword = await bcrypt.hash('asd123', 10);
      
      localUsers.push({
        id: uuidv4(),
        username: username,
        password: hashedPassword,
        email: jgUser.user_email || null,
        phone: jgUser.user_phone || null,
        role: 'user',
        accountNumber: generateAccountNumber(),
        balance: 0,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        isActive: true,
        jugayganaUserId: jgUser.user_id,
        jugayganaUsername: username,
        jugayganaSyncStatus: 'imported',
        source: 'jugaygana'
      });
      
      created++;
    } else {
      skipped++;
    }
  }
  
  saveUsers(localUsers);
  
  return {
    success: true,
    checked: recentUsers.length,
    created,
    skipped,
    totalLocal: localUsers.length
  };
}

async function syncSingleUser(username) {
  console.log(`🔍 Verificando usuario: ${username}`);
  
  const localUsers = loadUsers();
  const existingUser = localUsers.find(u => 
    u.username.toLowerCase() === username.toLowerCase()
  );
  
  if (existingUser) {
    console.log(`✅ Usuario ${username} ya existe localmente`);
    return { 
      success: true, 
      action: 'exists',
      user: existingUser 
    };
  }
  
  const jgUser = await getUserInfoByName(username);
  
  if (!jgUser) {
    console.log(`❌ Usuario ${username} no existe en JUGAYGANA`);
    return { 
      success: false, 
      error: 'Usuario no encontrado en JUGAYGANA' 
    };
  }
  
  const hashedPassword = await bcrypt.hash('asd123', 10);
  
  const newUser = {
    id: uuidv4(),
    username: jgUser.username,
    password: hashedPassword,
    email: jgUser.email || null,
    phone: jgUser.phone || null,
    role: 'user',
    accountNumber: generateAccountNumber(),
    balance: jgUser.balance || 0,
    createdAt: new Date().toISOString(),
    lastLogin: null,
    isActive: true,
    jugayganaUserId: jgUser.id,
    jugayganaUsername: jgUser.username,
    jugayganaSyncStatus: 'linked',
    source: 'jugaygana'
  };
  
  localUsers.push(newUser);
  saveUsers(localUsers);
  
  console.log(`✅ Usuario ${username} creado desde JUGAYGANA`);
  
  return {
    success: true,
    action: 'created',
    user: newUser
  };
}

// ============================================
// REFUNDS MODEL
// ============================================

async function loadRefunds() {
  if (mongoConnected) {
    try {
      const refunds = await Refund.find().lean();
      if (refunds && refunds.length > 0) {
        fs.writeFileSync(REFUNDS_FILE, JSON.stringify(refunds, null, 2));
        return refunds;
      }
    } catch (err) {
      console.error('Error cargando reembolsos de MongoDB:', err.message);
    }
  }
  try {
    if (!fs.existsSync(REFUNDS_FILE)) {
      fs.writeFileSync(REFUNDS_FILE, JSON.stringify([], null, 2));
      return [];
    }
    return JSON.parse(fs.readFileSync(REFUNDS_FILE, 'utf8'));
  } catch (error) {
    return [];
  }
}

async function saveRefunds(refunds) {
  fs.writeFileSync(REFUNDS_FILE, JSON.stringify(refunds, null, 2));
  
  if (mongoConnected) {
    try {
      await Refund.deleteMany({});
      if (refunds.length > 0) {
        await Refund.insertMany(refunds);
      }
      console.log(`✅ ${refunds.length} reembolsos guardados en MongoDB`);
    } catch (err) {
      console.error('Error guardando reembolsos en MongoDB:', err.message);
    }
  }
}

async function getUserRefunds(userId) {
  const refunds = await loadRefunds();
  return refunds.filter(r => r.userId === userId);
}

async function getAllRefunds() {
  return await loadRefunds();
}

async function canClaimDailyRefund(userId) {
  const refunds = await loadRefunds();
  const today = new Date().toDateString();
  
  const lastDaily = refunds
    .filter(r => r.userId === userId && r.type === 'daily')
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  
  if (!lastDaily) return { canClaim: true, nextClaim: null };
  
  const lastDate = new Date(lastDaily.date).toDateString();
  const canClaim = lastDate !== today;
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  return {
    canClaim,
    nextClaim: canClaim ? null : tomorrow.toISOString(),
    lastClaim: lastDaily.date
  };
}

async function canClaimWeeklyRefund(userId) {
  const refunds = await loadRefunds();
  const now = new Date();
  const currentDay = now.getDay();
  
  const canClaimByDay = currentDay === 1 || currentDay === 2;
  
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() - currentDay + 1);
  currentWeekStart.setHours(0, 0, 0, 0);
  
  const lastWeekly = refunds
    .filter(r => r.userId === userId && r.type === 'weekly')
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  
  let canClaim = canClaimByDay;
  
  if (lastWeekly) {
    const lastDate = new Date(lastWeekly.date);
    if (lastDate >= currentWeekStart) {
      canClaim = false;
    }
  }
  
  const nextMonday = new Date(now);
  const daysUntilMonday = currentDay === 0 ? 1 : 8 - currentDay;
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  
  return {
    canClaim,
    nextClaim: canClaim ? null : nextMonday.toISOString(),
    lastClaim: lastWeekly?.date || null,
    availableDays: 'Lunes y Martes'
  };
}

async function canClaimMonthlyRefund(userId) {
  const refunds = await loadRefunds();
  const now = new Date();
  const currentDay = now.getDate();
  
  const canClaimByDay = currentDay >= 7;
  
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const lastMonthly = refunds
    .filter(r => r.userId === userId && r.type === 'monthly')
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  
  let canClaim = canClaimByDay;
  
  if (lastMonthly) {
    const lastDate = new Date(lastMonthly.date);
    if (lastDate >= currentMonthStart) {
      canClaim = false;
    }
  }
  
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 7);
  nextMonth.setHours(0, 0, 0, 0);
  
  return {
    canClaim,
    nextClaim: canClaim ? null : nextMonth.toISOString(),
    lastClaim: lastMonthly?.date || null,
    availableFrom: 'Día 7 de cada mes'
  };
}

async function recordRefund(userId, username, type, amount, netAmount, deposits, withdrawals) {
  const refunds = await loadRefunds();
  
  const refund = {
    id: uuidv4(),
    userId,
    username,
    type,
    amount,
    netAmount,
    deposits,
    withdrawals,
    date: new Date().toISOString(),
    status: 'claimed'
  };
  
  refunds.push(refund);
  await saveRefunds(refunds);
  
  return refund;
}

function calculateRefund(deposits, withdrawals, percentage) {
  const netAmount = Math.max(0, deposits - withdrawals);
  const refundAmount = netAmount * (percentage / 100);
  return {
    netAmount,
    refundAmount: Math.round(refundAmount),
    percentage
  };
}

// ============================================
// SEGURIDAD - RATE LIMITING
// ============================================

const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 100;
const AUTH_RATE_LIMIT_MAX = 10;

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const isAuthEndpoint = req.path.includes('/auth/');
  const maxRequests = isAuthEndpoint ? AUTH_RATE_LIMIT_MAX : RATE_LIMIT_MAX;
  
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  for (const [key, data] of requestCounts) {
    if (data.timestamp < windowStart) {
      requestCounts.delete(key);
    }
  }
  
  const key = `${ip}:${req.path}`;
  const current = requestCounts.get(key);
  
  if (current && current.timestamp > windowStart) {
    if (current.count >= maxRequests) {
      return res.status(429).json({ 
        error: 'Demasiadas solicitudes. Intenta más tarde.',
        retryAfter: Math.ceil((current.timestamp + RATE_LIMIT_WINDOW - now) / 1000)
      });
    }
    current.count++;
  } else {
    requestCounts.set(key, { count: 1, timestamp: now });
  }
  
  next();
}

// ============================================
// SEGURIDAD - HEADERS DE SEGURIDAD
// ============================================

function securityHeaders(req, res, next) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self';");
  next();
}

// ============================================
// SEGURIDAD - VALIDACIÓN DE INPUT
// ============================================

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>]/g, '')
    .trim()
    .substring(0, 1000);
}

function validateUsername(username) {
  if (!username || typeof username !== 'string') return false;
  const sanitized = username.trim();
  return /^[a-zA-Z0-9_.-]{3,30}$/.test(sanitized);
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 6 && password.length <= 100;
}

// ============================================
// BLOQUEO DE REEMBOLSOS
// ============================================
const refundLocks = new Map();

function acquireRefundLock(userId, type) {
  const key = `${userId}-${type}`;
  if (refundLocks.has(key)) {
    return false;
  }
  refundLocks.set(key, Date.now());
  return true;
}

function releaseRefundLock(userId, type) {
  const key = `${userId}-${type}`;
  refundLocks.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of refundLocks.entries()) {
    if (now - timestamp > 5 * 60 * 1000) {
      refundLocks.delete(key);
    }
  }
}, 60 * 1000);

// ============================================
// CONFIGURACIÓN DE DIRECTORIOS Y ARCHIVOS
// ============================================

const DATA_DIR = process.env.VERCEL ? '/tmp/data' : path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const CONFIG_FILE = path.join(DATA_DIR, 'system-config.json');
const COMMANDS_FILE = path.join(DATA_DIR, 'commands.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const REFUNDS_FILE = path.join(DATA_DIR, 'refunds.json');
const EXTERNAL_DB_FILE = path.join(DATA_DIR, 'external-users.json');
const CHAT_STATUS_FILE = path.join(DATA_DIR, 'chat-status.json');
const SYNC_LOG_FILE = path.join(DATA_DIR, 'sync-log.json');
const CUSTOM_COMMANDS_FILE = path.join(DATA_DIR, 'custom-commands.json');
const ACTIVITY_FILE = path.join(DATA_DIR, 'user-activity.json');
const FIRE_REWARDS_FILE = path.join(DATA_DIR, 'fire-rewards.json');

// Crear directorio de datos si no existe
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (error) {
  console.error('Error creando directorio de datos:', error);
}

// Crear archivos JSON si no existen
try {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(MESSAGES_FILE)) {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({
      cbu: {
        number: '0000000000000000000000',
        alias: 'mi.alias.cbu',
        bank: 'Banco Ejemplo',
        titular: 'Sala de Juegos'
      },
      welcomeMessage: '🎉 ¡Bienvenido a la Sala de Juegos!',
      depositMessage: '💰 ¡Fichas cargadas! ${amount}. ¡Ya tenés tu carga en la plataforma! 🍀\n\n👤 Tu usuario: {username}\n🌐 Plataforma: www.jugaygana.bet\n\n¡Mucha suerte! 🎰✨'
    }, null, 2));
  }
  if (!fs.existsSync(COMMANDS_FILE)) {
    fs.writeFileSync(COMMANDS_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(TRANSACTIONS_FILE)) {
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(REFUNDS_FILE)) {
    fs.writeFileSync(REFUNDS_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(EXTERNAL_DB_FILE)) {
    fs.writeFileSync(EXTERNAL_DB_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(CHAT_STATUS_FILE)) {
    fs.writeFileSync(CHAT_STATUS_FILE, JSON.stringify({}, null, 2));
  }
  if (!fs.existsSync(SYNC_LOG_FILE)) {
    fs.writeFileSync(SYNC_LOG_FILE, JSON.stringify({ lastSync: null, totalSynced: 0 }, null, 2));
  }
  if (!fs.existsSync(CUSTOM_COMMANDS_FILE)) {
    fs.writeFileSync(CUSTOM_COMMANDS_FILE, JSON.stringify({}, null, 2));
  }
  if (!fs.existsSync(ACTIVITY_FILE)) {
    fs.writeFileSync(ACTIVITY_FILE, JSON.stringify({}, null, 2));
  }
  if (!fs.existsSync(FIRE_REWARDS_FILE)) {
    fs.writeFileSync(FIRE_REWARDS_FILE, JSON.stringify({}, null, 2));
  }
} catch (error) {
  console.error('Error creando archivos de datos:', error);
}

// ============================================
// FUNCIONES HELPERS DE BASE DE DATOS
// ============================================

const loadUsers = () => {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

const saveUsers = async (users) => {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  if (mongoConnected) {
    try {
      await User.deleteMany({});
      if (users.length > 0) await User.insertMany(users);
      console.log(`✅ ${users.length} usuarios guardados en MongoDB`);
    } catch (err) {
      console.error('Error guardando usuarios en MongoDB:', err.message);
    }
  }
};

const loadMessages = () => {
  try {
    const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

const saveMessages = async (messages) => {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  if (mongoConnected) {
    try {
      await Message.deleteMany({});
      if (messages.length > 0) await Message.insertMany(messages);
    } catch (err) {
      console.error('Error guardando mensajes en MongoDB:', err.message);
    }
  }
};

const loadCommands = async () => {
  if (mongoConnected) {
    try {
      const commands = await Command.find().lean();
      if (commands && commands.length > 0) {
        fs.writeFileSync(COMMANDS_FILE, JSON.stringify(commands, null, 2));
        return commands;
      }
    } catch (err) {
      console.error('Error cargando comandos de MongoDB:', err.message);
    }
  }
  try {
    if (!fs.existsSync(COMMANDS_FILE)) {
      fs.writeFileSync(COMMANDS_FILE, JSON.stringify([], null, 2));
      return [];
    }
    return JSON.parse(fs.readFileSync(COMMANDS_FILE, 'utf8'));
  } catch (error) {
    return [];
  }
};

const saveCommands = async (commands) => {
  fs.writeFileSync(COMMANDS_FILE, JSON.stringify(commands, null, 2));
  if (mongoConnected) {
    try {
      await Command.deleteMany({});
      if (commands.length > 0) await Command.insertMany(commands);
      console.log(`✅ ${commands.length} comandos guardados en MongoDB`);
    } catch (err) {
      console.error('Error guardando comandos en MongoDB:', err.message);
    }
  }
};

const loadSystemConfig = async () => {
  const defaultConfig = {
    cbu: {
      number: '0000000000000000000000',
      alias: 'mi.alias.cbu',
      bank: 'Banco Ejemplo',
      titular: 'Sala de Juegos'
    },
    welcomeMessage: '🎉 ¡Bienvenido a la Sala de Juegos!',
    depositMessage: '💰 ¡Fichas cargadas! ${amount}. ¡Ya tenés tu carga en la plataforma! 🍀\n\n👤 Tu usuario: {username}\n🌐 Plataforma: www.jugaygana.bet\n\n¡Mucha suerte! 🎰✨',
    maintenanceMode: false,
    allowRegistration: true
  };
  
  if (mongoConnected) {
    try {
      let config = await Config.findOne({ key: 'main' }).lean();
      if (config) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        return { ...defaultConfig, ...config };
      }
      await Config.create({ key: 'main', ...defaultConfig });
      return defaultConfig;
    } catch (err) {
      console.error('Error cargando config de MongoDB:', err.message);
    }
  }
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (error) {
    return defaultConfig;
  }
};

const saveSystemConfig = async (config) => {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  if (mongoConnected) {
    try {
      await Config.findOneAndUpdate(
        { key: 'main' },
        { ...config, key: 'main' },
        { upsert: true, new: true }
      );
      console.log('✅ Configuración guardada en MongoDB');
    } catch (err) {
      console.error('Error guardando config en MongoDB:', err.message);
    }
  }
};

const loadTransactions = async () => {
  if (mongoConnected) {
    try {
      const transactions = await Transaction.find().lean();
      if (transactions && transactions.length > 0) {
        fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
        return transactions;
      }
    } catch (err) {
      console.error('Error cargando transacciones de MongoDB:', err.message);
    }
  }
  try {
    if (!fs.existsSync(TRANSACTIONS_FILE)) {
      fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify([], null, 2));
      return [];
    }
    return JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
  } catch (error) {
    return [];
  }
};

const saveTransactions = async (transactions) => {
  fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
  if (mongoConnected) {
    try {
      await Transaction.deleteMany({});
      if (transactions.length > 0) await Transaction.insertMany(transactions);
      console.log(`✅ ${transactions.length} transacciones guardadas en MongoDB`);
    } catch (err) {
      console.error('Error guardando transacciones en MongoDB:', err.message);
    }
  }
};

const saveTransaction = async (transactionData) => {
  try {
    const transactions = await loadTransactions();
    const newTransaction = {
      id: uuidv4(),
      ...transactionData,
      timestamp: new Date().toISOString()
    };
    transactions.push(newTransaction);
    await saveTransactions(transactions);
    console.log('✅ Transacción registrada:', transactionData.type, '- $' + transactionData.amount);
    return newTransaction;
  } catch (error) {
    console.error('Error guardando transacción:', error);
    return null;
  }
};

function loadExternalUsers() {
  try {
    if (!fs.existsSync(EXTERNAL_DB_FILE)) {
      fs.writeFileSync(EXTERNAL_DB_FILE, JSON.stringify([], null, 2));
      return [];
    }
    return JSON.parse(fs.readFileSync(EXTERNAL_DB_FILE, 'utf8'));
  } catch (error) {
    return [];
  }
}

function saveExternalUsers(users) {
  fs.writeFileSync(EXTERNAL_DB_FILE, JSON.stringify(users, null, 2));
}

function addExternalUser(userData) {
  const users = loadExternalUsers();
  const existingIndex = users.findIndex(u => u.username === userData.username);
  
  const userRecord = {
    username: userData.username,
    phone: userData.phone || null,
    whatsapp: userData.whatsapp || null,
    firstSeen: existingIndex >= 0 ? users[existingIndex].firstSeen : new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    messageCount: existingIndex >= 0 ? (users[existingIndex].messageCount || 0) + 1 : 1
  };
  
  if (existingIndex >= 0) {
    users[existingIndex] = { ...users[existingIndex], ...userRecord };
  } else {
    users.push(userRecord);
  }
  
  saveExternalUsers(users);
}

function findUserByPhone(phone) {
  const users = loadUsers();
  const externalUsers = loadExternalUsers();
  
  const mainUser = users.find(u => u.phone === phone || u.whatsapp === phone);
  if (mainUser) {
    return { username: mainUser.username, phone: mainUser.phone, source: 'main' };
  }
  
  const externalUser = externalUsers.find(u => u.phone === phone || u.whatsapp === phone);
  if (externalUser) {
    return { username: externalUser.username, phone: externalUser.phone, source: 'external' };
  }
  
  return null;
}

async function changePasswordByPhone(phone, newPassword) {
  const users = loadUsers();
  const userIndex = users.findIndex(u => u.phone === phone || u.whatsapp === phone);
  
  if (userIndex === -1) {
    return { success: false, error: 'Usuario no encontrado con ese número de teléfono' };
  }
  
  users[userIndex].password = await bcrypt.hash(newPassword, 10);
  users[userIndex].passwordChangedAt = new Date().toISOString();
  await saveUsers(users);
  
  return { success: true, username: users[userIndex].username };
}

function loadChatStatus() {
  try {
    if (!fs.existsSync(CHAT_STATUS_FILE)) {
      fs.writeFileSync(CHAT_STATUS_FILE, JSON.stringify({}, null, 2));
      return {};
    }
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
  return status[userId] || { status: 'open', assignedTo: null, closedAt: null, closedBy: null };
}

function updateChatStatus(userId, updates) {
  const status = loadChatStatus();
  status[userId] = { ...getChatStatus(userId), ...updates };
  saveChatStatus(status);
}

function loadSyncLog() {
  try {
    const data = fs.readFileSync(SYNC_LOG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { lastSync: null, totalSynced: 0, errors: [] };
  }
}

function saveSyncLog(log) {
  fs.writeFileSync(SYNC_LOG_FILE, JSON.stringify(log, null, 2));
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

async function loadFireRewards() {
  if (mongoConnected) {
    try {
      const rewards = await FireReward.find().lean();
      if (rewards && rewards.length > 0) {
        const rewardsObj = {};
        rewards.forEach(r => {
          rewardsObj[r.userId] = {
            streak: r.streak,
            lastClaim: r.lastClaim,
            totalClaimed: r.totalClaimed
          };
        });
        fs.writeFileSync(FIRE_REWARDS_FILE, JSON.stringify(rewardsObj, null, 2));
        return rewardsObj;
      }
    } catch (err) {
      console.error('Error cargando fueguito de MongoDB:', err.message);
    }
  }
  try {
    if (!fs.existsSync(FIRE_REWARDS_FILE)) return {};
    return JSON.parse(fs.readFileSync(FIRE_REWARDS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function saveFireRewards(rewards) {
  fs.writeFileSync(FIRE_REWARDS_FILE, JSON.stringify(rewards, null, 2));
  
  if (mongoConnected) {
    try {
      await FireReward.deleteMany({});
      const rewardsArray = Object.entries(rewards).map(([userId, data]) => ({
        userId,
        streak: data.streak,
        lastClaim: data.lastClaim,
        totalClaimed: data.totalClaimed
      }));
      if (rewardsArray.length > 0) {
        await FireReward.insertMany(rewardsArray);
      }
      console.log(`✅ ${rewardsArray.length} registros de fueguito guardados en MongoDB`);
    } catch (err) {
      console.error('Error guardando fueguito en MongoDB:', err.message);
    }
  }
}

function recordUserActivity(userId, type, amount) {
  const activity = loadUserActivity();
  const today = new Date().toDateString();
  
  if (!activity[userId]) {
    activity[userId] = { days: {} };
  }
  
  if (!activity[userId].days[today]) {
    activity[userId].days[today] = { deposits: 0, withdrawals: 0 };
  }
  
  activity[userId].days[today][type === 'deposit' ? 'deposits' : 'withdrawals'] += amount;
  saveUserActivity(activity);
}

function hasActivityToday(userId) {
  const activity = loadUserActivity();
  const today = new Date().toDateString();
  
  if (!activity[userId] || !activity[userId].days[today]) {
    return false;
  }
  
  const todayActivity = activity[userId].days[today];
  return (todayActivity.deposits > 0 || todayActivity.withdrawals > 0);
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
// LIMPIEZA DE MENSAJES
// ============================================

function cleanupOldMessages() {
  try {
    const messages = loadMessages();
    const now = new Date();
    const maxAge = 25 * 60 * 60 * 1000;
    
    const filteredMessages = messages.filter(msg => {
      const msgTime = new Date(msg.timestamp).getTime();
      return (now.getTime() - msgTime) < maxAge;
    });
    
    if (filteredMessages.length < messages.length) {
      saveMessages(filteredMessages);
      console.log(`🧹 Limpieza de mensajes: ${messages.length - filteredMessages.length} mensajes eliminados`);
    }
  } catch (error) {
    console.error('Error limpiando mensajes antiguos:', error);
  }
}

function limitMessagesPerChat(userId) {
  try {
    const messages = loadMessages();
    
    const userMessages = messages.filter(m => 
      (m.senderId === userId && m.senderRole === 'user') || 
      (m.receiverId === userId && m.receiverRole === 'user')
    );
    
    if (userMessages.length > 10) {
      const messagesToDelete = userMessages.length - 10;
      const sortedMessages = userMessages.sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      const idsToDelete = sortedMessages.slice(0, messagesToDelete).map(m => m.id);
      
      const filteredMessages = messages.filter(m => !idsToDelete.includes(m.id));
      saveMessages(filteredMessages);
      console.log(`🧹 Chat ${userId}: ${messagesToDelete} mensajes antiguos eliminados`);
    }
  } catch (error) {
    console.error('Error limitando mensajes por chat:', error);
  }
}

setInterval(cleanupOldMessages, 60 * 60 * 1000);

const generateAccountNumber = () => {
  return 'ACC' + Date.now().toString().slice(-8) + Math.random().toString(36).substr(2, 4).toUpperCase();
};

// ============================================
// CONFIGURACIÓN Y COMANDOS PERSONALIZADOS
// ============================================

const defaultConfig = {
  cbu: {
    number: '0000000000000000000000',
    alias: 'mi.alias.cbu',
    bank: 'Banco Ejemplo',
    titular: 'Sala de Juegos',
    message: '💳 *Datos para transferir:*\n\n🏦 Banco: {bank}\n👤 Titular: {titular}\n🔢 CBU: `{cbu}`\n📱 Alias: `{alias}`\n\n✅ Una vez realizada la transferencia, envíanos el comprobante por aquí.'
  },
  welcomeMessage: '🎉 ¡Bienvenido a la Sala de Juegos!',
  depositMessage: '💰 ¡Fichas cargadas! ${amount}. ¡Ya tenés tu carga en la plataforma! 🍀\n\n👤 Tu usuario: {username}\n🌐 Plataforma: www.jugaygana.bet\n\n¡Mucha suerte! 🎰✨'
};

async function loadConfig() {
  if (mongoConnected) {
    try {
      const config = await Config.findOne({ key: 'main' }).lean();
      if (config) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        return { ...defaultConfig, ...config };
      }
      await Config.create({ key: 'main', ...defaultConfig });
      return defaultConfig;
    } catch (err) {
      console.error('Error cargando config de MongoDB:', err.message);
    }
  }
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (error) {
    console.error('Error cargando config:', error);
    return defaultConfig;
  }
}

async function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    if (mongoConnected) {
      try {
        await Config.findOneAndUpdate(
          { key: 'main' },
          { ...config, key: 'main' },
          { upsert: true, new: true }
        );
        console.log('✅ Configuración guardada en MongoDB');
      } catch (err) {
        console.error('Error guardando config en MongoDB:', err.message);
      }
    }
  } catch (error) {
    console.error('Error guardando config:', error);
  }
}

async function loadCustomCommands() {
  if (mongoConnected) {
    try {
      const commands = await Command.find().lean();
      if (commands && commands.length > 0) {
        const commandsObj = {};
        commands.forEach(cmd => {
          commandsObj[cmd.name] = {
            description: cmd.description,
            type: cmd.type,
            bonusPercent: cmd.bonusPercent,
            response: cmd.response,
            createdAt: cmd.createdAt
          };
        });
        fs.writeFileSync(CUSTOM_COMMANDS_FILE, JSON.stringify(commandsObj, null, 2));
        return commandsObj;
      }
    } catch (err) {
      console.error('Error cargando comandos de MongoDB:', err.message);
    }
  }
  try {
    if (!fs.existsSync(CUSTOM_COMMANDS_FILE)) {
      fs.writeFileSync(CUSTOM_COMMANDS_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    return JSON.parse(fs.readFileSync(CUSTOM_COMMANDS_FILE, 'utf8'));
  } catch (error) {
    console.error('Error cargando comandos:', error);
    return {};
  }
}

async function saveCustomCommands(commands) {
  try {
    fs.writeFileSync(CUSTOM_COMMANDS_FILE, JSON.stringify(commands, null, 2));
    
    if (mongoConnected) {
      try {
        await Command.deleteMany({});
        const commandsArray = Object.entries(commands).map(([name, cmd]) => ({
          name,
          description: cmd.description,
          type: cmd.type,
          bonusPercent: cmd.bonusPercent,
          response: cmd.response,
          createdAt: cmd.createdAt
        }));
        if (commandsArray.length > 0) {
          await Command.insertMany(commandsArray);
        }
        console.log(`✅ ${commandsArray.length} comandos guardados en MongoDB`);
      } catch (err) {
        console.error('Error guardando comandos en MongoDB:', err.message);
      }
    }
  } catch (error) {
    console.error('Error guardando comandos:', error);
  }
}

// ============================================
// INICIALIZAR EXPRESS
// ============================================

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'sala-de-juegos-secret-key-2024';

// ============================================
// MIDDLEWARE DE SEGURIDAD
// ============================================

app.use(securityHeaders);
app.use(rateLimit);
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true
}));
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    const body = buf.toString();
    if (body.length > 10 * 1024 * 1024) {
      throw new Error('Payload too large');
    }
  }
}));
app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  index: false,
  maxAge: '1d'
}));

// ============================================
// MIDDLEWARE DE AUTENTICACIÓN
// ============================================

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const users = loadUsers();
    const user = users.find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    
    if (user.tokenVersion && decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: 'Sesión expirada. Por favor, vuelve a iniciar sesión.' });
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'depositor' && req.user.role !== 'withdrawer') {
    return res.status(403).json({ error: 'Acceso denegado. Solo administradores.' });
  }
  next();
};

const depositorMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'depositor') {
    return res.status(403).json({ error: 'Acceso denegado. Solo agentes de carga.' });
  }
  next();
};

const withdrawerMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'withdrawer') {
    return res.status(403).json({ error: 'Acceso denegado. Solo agentes de retiro.' });
  }
  next();
};

// ============================================
// RUTAS DE AUTENTICACIÓN
// ============================================

app.get('/api/auth/check-username', async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username || username.length < 3) {
      return res.json({ available: false, message: 'Usuario muy corto' });
    }
    
    const users = loadUsers();
    const localExists = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (localExists) {
      return res.json({ available: false, message: 'Usuario ya registrado' });
    }
    
    try {
      const jgUser = await getUserInfoByName(username);
      if (jgUser) {
        return res.json({ 
          available: false, 
          message: 'Este nombre de usuario ya está en uso en JUGAYGANA. Intenta con otro nombre.',
          existsInJugaygana: true,
          alreadyExists: true
        });
      }
    } catch (jgError) {
      console.log('⚠️ No se pudo verificar en JUGAYGANA:', jgError.message);
    }
    
    res.json({ 
      available: true, 
      message: 'Usuario disponible',
      existsInJugaygana: false
    });
  } catch (error) {
    console.error('Error verificando username:', error);
    res.status(500).json({ available: false, message: 'Error del servidor' });
  }
});

app.post('/api/admin/send-cbu', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    const config = await loadConfig();
    
    if (!config.cbu || !config.cbu.number) {
      return res.status(400).json({ error: 'CBU no configurado' });
    }
    
    const messages = loadMessages();
    const timestamp = new Date().toISOString();
    
    const fullMessage = `💳 *Datos para transferir:*\n\n🏦 Banco: ${config.cbu.bank}\n👤 Titular: ${config.cbu.titular}\n🔢 CBU: ${config.cbu.number}\n📱 Alias: ${config.cbu.alias}\n\n✅ Una vez realizada la transferencia, envianos el comprobante por aquí.`;
    
    messages.push({
      id: uuidv4(),
      senderId: req.user.userId,
      senderUsername: req.user.username,
      senderRole: 'admin',
      receiverId: userId,
      receiverRole: 'user',
      content: fullMessage,
      type: 'text',
      timestamp: timestamp,
      read: false
    });
    
    messages.push({
      id: uuidv4(),
      senderId: req.user.userId,
      senderUsername: req.user.username,
      senderRole: 'admin',
      receiverId: userId,
      receiverRole: 'user',
      content: config.cbu.number,
      type: 'text',
      timestamp: new Date(Date.now() + 100).toISOString(),
      read: false
    });
    
    await saveMessages(messages);
    
    res.json({ success: true, message: 'CBU enviado' });
  } catch (error) {
    console.error('Error enviando CBU:', error);
    res.status(500).json({ error: 'Error enviando CBU' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, email, phone } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    
    if (!phone || phone.trim().length < 8) {
      return res.status(400).json({ error: 'El número de teléfono es obligatorio (mínimo 8 dígitos)' });
    }
    
    const users = loadUsers();
    
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    let jgResult = null;
    try {
      jgResult = await syncUserToPlatform({
        username: username,
        password: password
      });
      
      if (!jgResult.success && !jgResult.alreadyExists) {
        return res.status(400).json({ error: 'No se pudo crear el usuario en JUGAYGANA: ' + (jgResult.error || 'Error desconocido') });
      }
      
      console.log('✅ Usuario creado/vinculado en JUGAYGANA:', username);
    } catch (jgError) {
      console.error('❌ Error creando en JUGAYGANA:', jgError);
      return res.status(400).json({ error: 'Error al crear usuario en la plataforma. Intenta con otro nombre de usuario.' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      email: email || null,
      phone: phone.trim(),
      role: 'user',
      accountNumber: generateAccountNumber(),
      balance: jgResult.user?.balance || jgResult.user?.user_balance || 0,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      isActive: true,
      jugayganaUserId: jgResult.jugayganaUserId || jgResult.user?.user_id,
      jugayganaUsername: jgResult.jugayganaUsername || jgResult.user?.user_name,
      jugayganaSyncStatus: jgResult.alreadyExists ? 'linked' : 'synced'
    };
    
    users.push(newUser);
    saveUsers(users);
    
    const messages = loadMessages();
    const welcomeMessage = {
      id: uuidv4(),
      senderId: 'system',
      senderUsername: 'Sistema',
      senderRole: 'admin',
      receiverId: newUser.id,
      receiverRole: 'user',
      content: `🎉 ¡Bienvenido a la Sala de Juegos, ${username}!\n\n🎁 Beneficios exclusivos:\n• Reembolso DIARIO del 20%\n• Reembolso SEMANAL del 10%\n• Reembolso MENSUAL del 5%\n• Fueguito diario con recompensas\n• Atención 24/7\n\n💬 Escribe aquí para hablar con un agente.`,
      type: 'text',
      timestamp: new Date().toISOString(),
      read: false
    };
    messages.push(welcomeMessage);
    saveMessages(messages);
    
    const token = jwt.sign(
      { userId: newUser.id, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '100y' }
    );
    
    res.status(201).json({
      message: 'Usuario creado exitosamente',
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        phone: newUser.phone,
        accountNumber: newUser.accountNumber,
        role: newUser.role,
        balance: newUser.balance,
        jugayganaLinked: true,
        needsPasswordChange: false
      }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    
    let users = loadUsers();
    let user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!user) {
      console.log(`🔍 Usuario ${username} no encontrado localmente, verificando en JUGAYGANA...`);
      
      const jgUser = await getUserInfoByName(username);
      
      if (jgUser) {
        console.log(`✅ Usuario encontrado en JUGAYGANA, creando localmente...`);
        
        const hashedPassword = await bcrypt.hash('asd123', 10);
        const newUser = {
          id: uuidv4(),
          username: jgUser.username,
          password: hashedPassword,
          email: jgUser.email || null,
          phone: jgUser.phone || null,
          role: 'user',
          accountNumber: generateAccountNumber(),
          balance: jgUser.balance || 0,
          createdAt: new Date().toISOString(),
          lastLogin: null,
          isActive: true,
          jugayganaUserId: jgUser.id,
          jugayganaUsername: jgUser.username,
          jugayganaSyncStatus: 'linked',
          source: 'jugaygana'
        };
        
        users.push(newUser);
        await saveUsers(users);
        user = newUser;
        
        console.log(`✅ Usuario ${username} creado automáticamente desde JUGAYGANA`);
      } else {
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      }
    }
    
    if (!user.isActive) {
      return res.status(401).json({ error: 'Usuario desactivado' });
    }
    
    let isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword && !user.passwordChangedAt) {
      const defaultHash = await bcrypt.hash('asd123', 10);
      isValidPassword = await bcrypt.compare(password, defaultHash);
    }
    
    if (!isValidPassword) {
      if (user.passwordChangedAt) {
        return res.status(401).json({ error: 'Contraseña incorrecta. Usa tu nueva contraseña.' });
      }
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    
    user.lastLogin = new Date().toISOString();
    saveUsers(users);
    
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, tokenVersion: user.tokenVersion || 0 },
      JWT_SECRET,
      { expiresIn: '100y' }
    );
    
    const isDefaultPassword = await bcrypt.compare('asd123', user.password);
    
    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        accountNumber: user.accountNumber,
        role: user.role,
        balance: user.balance,
        jugayganaLinked: !!user.jugayganaUserId,
        needsPasswordChange: isDefaultPassword
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user });
});

app.get('/api/users/me', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const user = users.find(u => u.id === req.user.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword, whatsapp, closeAllSessions } = req.body;
    const users = await loadUsers();
    const user = users.find(u => u.id === req.user.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    if (whatsapp && whatsapp.trim().length < 8) {
      return res.status(400).json({ error: 'El número de WhatsApp debe tener al menos 8 dígitos' });
    }
    
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }
    
    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = new Date().toISOString();
    
    if (whatsapp && whatsapp.trim()) {
      user.whatsapp = whatsapp.trim();
    }
    
    if (closeAllSessions) {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
    }
    
    await saveUsers(users);
    
    res.json({ 
      message: 'Contraseña cambiada exitosamente',
      sessionsClosed: closeAllSessions || false
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// RUTAS PÚBLICAS - RECUPERACIÓN DE CUENTA
// ============================================

app.post('/api/auth/find-user-by-phone', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone || phone.trim().length < 8) {
      return res.status(400).json({ error: 'Número de teléfono inválido' });
    }
    
    const user = findUserByPhone(phone.trim());
    
    if (user) {
      res.json({ 
        found: true, 
        username: user.username,
        phone: user.phone,
        message: 'Usuario encontrado'
      });
    } else {
      res.json({ 
        found: false, 
        message: 'No se encontró ningún usuario con ese número de teléfono' 
      });
    }
  } catch (error) {
    console.error('Error buscando usuario por teléfono:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/auth/reset-password-by-phone', async (req, res) => {
  try {
    const { phone, newPassword } = req.body;
    
    if (!phone || phone.trim().length < 8) {
      return res.status(400).json({ error: 'Número de teléfono inválido' });
    }
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    
    const result = await changePasswordByPhone(phone.trim(), newPassword);
    
    if (result.success) {
      res.json({ 
        success: true, 
        username: result.username,
        message: 'Contraseña cambiada exitosamente' 
      });
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error cambiando contraseña por teléfono:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// RUTAS DE CONFIGURACIÓN PÚBLICA
// ============================================

app.get('/api/config/cbu', authMiddleware, async (req, res) => {
  try {
    const config = await loadConfig();
    if (!config.cbu) {
      return res.status(404).json({ error: 'CBU no configurado' });
    }
    
    res.json({
      cbu: config.cbu.number,
      alias: config.cbu.alias,
      bank: config.cbu.bank,
      titular: config.cbu.titular
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/cbu/request', authMiddleware, async (req, res) => {
  try {
    const config = await loadConfig();
    if (!config.cbu) {
      return res.status(404).json({ error: 'CBU no configurado' });
    }
    
    const messages = loadMessages();
    
    messages.push({
      id: uuidv4(),
      senderId: req.user.userId,
      senderUsername: req.user.username,
      senderRole: 'user',
      receiverId: 'admin',
      receiverRole: 'admin',
      content: '💳 Solicito los datos para transferir (CBU)',
      type: 'text',
      timestamp: new Date().toISOString(),
      read: false
    });
    
    const fullMessage = `💳 *Datos para transferir:*\n\n🏦 Banco: ${config.cbu.bank}\n👤 Titular: ${config.cbu.titular}\n🔢 CBU: ${config.cbu.number}\n📱 Alias: ${config.cbu.alias}\n\n✅ Una vez realizada la transferencia, envianos el comprobante por aquí.`;
    
    messages.push({
      id: uuidv4(),
      senderId: 'system',
      senderUsername: 'Sistema',
      senderRole: 'admin',
      receiverId: req.user.userId,
      receiverRole: 'user',
      content: fullMessage,
      type: 'text',
      timestamp: new Date().toISOString(),
      read: false
    });
    
    messages.push({
      id: uuidv4(),
      senderId: 'system',
      senderUsername: 'Sistema',
      senderRole: 'admin',
      receiverId: req.user.userId,
      receiverRole: 'user',
      content: config.cbu.number,
      type: 'text',
      timestamp: new Date().toISOString(),
      read: false
    });
    
    saveMessages(messages);
    
    res.json({ 
      success: true, 
      message: 'Solicitud enviada',
      cbu: {
        number: config.cbu.number,
        alias: config.cbu.alias,
        bank: config.cbu.bank,
        titular: config.cbu.titular
      }
    });
  } catch (error) {
    console.error('Error enviando solicitud CBU:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});


// ============================================
// RUTAS DE USUARIOS (ADMIN)
// ============================================

app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = loadUsers();
  const usersWithoutPassword = users.map(u => ({
    ...u,
    password: undefined
  }));
  res.json(usersWithoutPassword);
});

app.post('/api/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, password, email, phone, role = 'user', balance = 0 } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    
    if (!phone || phone.trim().length < 8) {
      return res.status(400).json({ error: 'El número de teléfono es obligatorio (mínimo 8 dígitos)' });
    }
    
    const validRoles = ['user', 'admin', 'depositor', 'withdrawer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    
    const users = await loadUsers();
    
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
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
      jugayganaSyncStatus: 'pending'
    };
    
    users.push(newUser);
    await saveUsers(users);
    
    if (role === 'user') {
      syncUserToPlatform({
        username: newUser.username,
        password: password
      }).then(result => {
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
    } else {
      const users = loadUsers();
      const userIndex = users.findIndex(u => u.id === newUser.id);
      if (userIndex !== -1) {
        users[userIndex].jugayganaSyncStatus = 'not_applicable';
        saveUsers(users);
      }
    }
    
    res.status(201).json({
      message: 'Usuario creado exitosamente',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        accountNumber: newUser.accountNumber,
        role: newUser.role,
        balance: newUser.balance
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.put('/api/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const users = await loadUsers();
    const userIndex = users.findIndex(u => u.id === id);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const targetUser = users[userIndex];
    
    const isAdminRole = ['admin', 'depositor', 'withdrawer'].includes(targetUser.role);
    if (isAdminRole && req.user.username !== 'ignite100') {
      return res.status(403).json({ error: 'Solo el administrador principal puede modificar otros administradores' });
    }
    
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
      updates.passwordChangedAt = new Date().toISOString();
    }
    
    users[userIndex] = { ...users[userIndex], ...updates };
    await saveUsers(users);
    
    res.json({
      message: 'Usuario actualizado',
      user: { ...users[userIndex], password: undefined }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/users/:id/sync-jugaygana', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const users = await loadUsers();
    const user = users.find(u => u.id === id);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const result = await syncUserToPlatform({
      username: user.username,
      password: 'asd123'
    });
    
    if (result.success) {
      user.jugayganaUserId = result.jugayganaUserId || result.user?.user_id;
      user.jugayganaUsername = result.jugayganaUsername || result.user?.user_name;
      user.jugayganaSyncStatus = result.alreadyExists ? 'linked' : 'synced';
      await saveUsers(users);
      
      res.json({
        message: result.alreadyExists ? 'Usuario vinculado con JUGAYGANA' : 'Usuario sincronizado con JUGAYGANA',
        jugayganaUserId: user.jugayganaUserId,
        jugayganaUsername: user.jugayganaUsername
      });
    } else {
      res.status(400).json({ error: result.error || 'Error sincronizando con JUGAYGANA' });
    }
  } catch (error) {
    console.error('Error sincronizando:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/admin/sync-all-jugaygana', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const syncLog = loadSyncLog();
    if (syncLog.inProgress) {
      return res.status(409).json({ 
        error: 'Ya hay una sincronización en curso',
        startedAt: syncLog.inProgressStartedAt
      });
    }
    
    syncLog.inProgress = true;
    syncLog.inProgressStartedAt = new Date().toISOString();
    fs.writeFileSync(SYNC_LOG_FILE, JSON.stringify(syncLog, null, 2));
    
    syncAllUsers((progress) => {
      console.log(`📊 Progreso: ${progress.percent}% | Creados: ${progress.created} | Saltados: ${progress.skipped}`);
    }).then(result => {
      const finalLog = loadSyncLog();
      finalLog.inProgress = false;
      finalLog.inProgressStartedAt = null;
      fs.writeFileSync(SYNC_LOG_FILE, JSON.stringify(finalLog, null, 2));
      console.log('✅ Sincronización masiva completada:', result);
    }).catch(error => {
      console.error('❌ Error en sincronización masiva:', error);
      const errorLog = loadSyncLog();
      errorLog.inProgress = false;
      errorLog.inProgressStartedAt = null;
      errorLog.lastError = error.message;
      fs.writeFileSync(SYNC_LOG_FILE, JSON.stringify(errorLog, null, 2));
    });
    
    res.json({
      message: 'Sincronización masiva iniciada',
      note: 'Este proceso puede tardar 30-60 minutos para 100K usuarios',
      checkStatus: 'GET /api/admin/sync-status'
    });
  } catch (error) {
    console.error('Error iniciando sincronización:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/admin/sync-status', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const syncLog = loadSyncLog();
    const users = loadUsers();
    
    res.json({
      inProgress: syncLog.inProgress || false,
      startedAt: syncLog.inProgressStartedAt || null,
      lastSync: syncLog.lastSync,
      totalSynced: syncLog.totalSynced || 0,
      lastResult: syncLog.lastResult || null,
      localUsers: users.length,
      jugayganaUsers: users.filter(u => u.jugayganaUserId).length,
      pendingUsers: users.filter(u => !u.jugayganaUserId && u.role === 'user').length
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/admin/sync-recent-jugaygana', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await syncRecentUsers(100);
    res.json(result);
  } catch (error) {
    console.error('Error sincronizando recientes:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

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
      return res.status(403).json({ error: 'Solo los administradores pueden eliminar otros administradores' });
    }
    
    users = users.filter(u => u.id !== id);
    saveUsers(users);
    
    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// DEBUG - Ver todos los mensajes
// ============================================

app.get('/api/debug/messages', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const messages = loadMessages();
    res.json({
      count: messages.length,
      messages: messages.slice(-20)
    });
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// SISTEMA DE CHATS ABIERTOS/CERRADOS
// ============================================

app.get('/api/admin/chat-status/all', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const status = loadChatStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/admin/chats/:status', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { status } = req.params;
    const messages = loadMessages();
    const users = loadUsers();
    const chatStatus = loadChatStatus();
    
    console.log(`📨 Cargando chats con estado: ${status}`);
    console.log(`📊 Total mensajes: ${messages.length}`);
    console.log(`👥 Total usuarios: ${users.length}`);
    
    const userMessages = {};
    messages.forEach(msg => {
      if (msg.senderRole === 'user') {
        if (!userMessages[msg.senderId]) {
          userMessages[msg.senderId] = [];
        }
        userMessages[msg.senderId].push(msg);
      }
      if (msg.receiverRole === 'user' && msg.senderRole !== 'user') {
        if (!userMessages[msg.receiverId]) {
          userMessages[msg.receiverId] = [];
        }
        userMessages[msg.receiverId].push(msg);
      }
    });
    
    console.log(`💬 Usuarios con mensajes: ${Object.keys(userMessages).length}`);
    
    const filteredChats = [];
    
    Object.keys(userMessages).forEach(userId => {
      const user = users.find(u => u.id === userId);
      if (!user) {
        console.log(`⚠️ Usuario no encontrado: ${userId}`);
        return;
      }
      
      const statusInfo = chatStatus[userId] || { status: 'open', category: 'cargas', assignedTo: null };
      
      console.log(`👤 ${user.username} - Estado: ${statusInfo.status}, Categoría: ${statusInfo.category} (buscando: ${status})`);
      
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
    
    console.log(`✅ Chats encontrados: ${filteredChats.length}`);
    
    res.json(filteredChats);
  } catch (error) {
    console.error('Error obteniendo chats:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/admin/all-chats', authMiddleware, adminMiddleware, (req, res) => {
  try {
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
    
    const allChats = Object.keys(userMessages).map(userId => {
      const user = users.find(u => u.id === userId);
      const statusInfo = chatStatus[userId] || { status: 'open', assignedTo: null };
      const msgs = userMessages[userId].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      return {
        userId,
        username: user?.username || 'Desconocido',
        status: statusInfo.status,
        messageCount: msgs.length,
        lastMessage: msgs[msgs.length - 1]
      };
    });
    
    res.json(allChats);
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/admin/chats/:userId/close', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const chatStatus = loadChatStatus();
    const currentStatus = chatStatus[userId] || { status: 'open', category: 'cargas' };
    
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

// ============================================
// CATEGORÍAS DE CHAT (CARGAS/PAGOS)
// ============================================

app.post('/api/admin/chats/:userId/category', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const { category } = req.body;
    
    if (!category || !['cargas', 'pagos'].includes(category)) {
      return res.status(400).json({ error: 'Categoría inválida. Use "cargas" o "pagos"' });
    }
    
    const chatStatus = loadChatStatus();
    if (!chatStatus[userId]) {
      chatStatus[userId] = { status: 'open', assignedTo: null };
    }
    chatStatus[userId].category = category;
    saveChatStatus(chatStatus);
    
    res.json({ success: true, message: `Chat movido a ${category.toUpperCase()}` });
  } catch (error) {
    console.error('Error cambiando categoría:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/admin/chats/category/:category', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { category } = req.params;
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
      
      const statusInfo = chatStatus[userId] || { status: 'open', assignedTo: null, category: 'cargas' };
      
      if ((statusInfo.category || 'cargas') === category) {
        const msgs = userMessages[userId].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const lastMsg = msgs[msgs.length - 1];
        const unreadCount = msgs.filter(m => m.receiverRole === 'admin' && !m.read).length;
        
        filteredChats.push({
          userId,
          username: user.username,
          lastMessage: lastMsg,
          unreadCount,
          assignedTo: statusInfo.assignedTo,
          status: statusInfo.status
        });
      }
    });
    
    filteredChats.sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));
    res.json(filteredChats);
  } catch (error) {
    console.error('Error obteniendo chats por categoría:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// RUTAS DE MENSAJES
// ============================================

app.get('/api/messages/:userId', authMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const messages = loadMessages();
    
    const allowedRoles = ['admin', 'depositor', 'withdrawer'];
    if (!allowedRoles.includes(req.user.role) && req.user.userId !== userId) {
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

app.get('/api/conversations', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const messages = loadMessages();
    const users = loadUsers();
    
    console.log(`📨 Cargando conversaciones. Total mensajes: ${messages.length}`);
    
    const conversations = {};
    
    messages.forEach(msg => {
      let userId = null;
      
      if (msg.senderRole === 'user') {
        userId = msg.senderId;
      } else if (msg.receiverRole === 'user') {
        userId = msg.receiverId;
      }
      
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
    
    console.log(`✅ Conversaciones encontradas: ${Object.keys(conversations).length}`);
    
    res.json(Object.values(conversations));
  } catch (error) {
    console.error('Error obteniendo conversaciones:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

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

app.post('/api/messages/send', authMiddleware, async (req, res) => {
  try {
    const { content, type = 'text' } = req.body;
    
    console.log('📨 Recibida solicitud de enviar mensaje');
    console.log('👤 Usuario:', req.user?.username, 'Rol:', req.user?.role);
    console.log('📝 Contenido:', content?.substring(0, 50));
    
    if (!content) {
      console.log('❌ Error: Contenido vacío');
      return res.status(400).json({ error: 'Contenido requerido' });
    }
    
    const messages = await loadMessages();
    console.log('💬 Mensajes actuales:', messages.length);
    
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
    
    console.log('📤 Guardando mensaje - senderRole:', message.senderRole, 'senderUsername:', message.senderUsername);
    
    messages.push(message);
    await saveMessages(messages);
    
    const savedMessages = await loadMessages();
    const savedMessage = savedMessages.find(m => m.id === message.id);
    console.log('✅ Mensaje guardado - senderRole:', savedMessage?.senderRole, 'senderUsername:', savedMessage?.senderUsername);
    
    if (req.user.role === 'user') {
      const users = await loadUsers();
      const user = users.find(u => u.id === req.user.userId);
      if (user) {
        addExternalUser({
          username: user.username,
          phone: user.phone,
          whatsapp: user.whatsapp
        });
      }
    }
    
    const targetUserId = req.user.role === 'admin' ? req.body.receiverId : req.user.userId;
    if (targetUserId) {
      limitMessagesPerChat(targetUserId);
    }
    
    if (req.user.role === 'user') {
      const chatStatus = loadChatStatus();
      const currentStatus = chatStatus[req.user.userId];
      
      if (currentStatus && currentStatus.status === 'closed') {
        console.log('🔄 Reabriendo chat cerrado para usuario:', req.user.username);
        chatStatus[req.user.userId] = {
          status: 'open',
          assignedTo: null,
          closedAt: null,
          closedBy: null
        };
        saveChatStatus(chatStatus);
      }
    }
    
    res.json(message);
  } catch (error) {
    console.error('❌ Error enviando mensaje:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/messages/welcome', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Contenido requerido' });
    }
    
    const messages = await loadMessages();
    
    const message = {
      id: uuidv4(),
      senderId: 'admin',
      senderUsername: 'Admin',
      senderRole: 'admin',
      receiverId: req.user.userId,
      receiverRole: 'user',
      content,
      type: 'text',
      timestamp: new Date().toISOString(),
      read: false
    };
    
    messages.push(message);
    await saveMessages(messages);
    
    console.log('✅ Mensaje de bienvenida enviado desde Admin');
    res.json(message);
  } catch (error) {
    console.error('❌ Error enviando mensaje de bienvenida:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});


// ============================================
// REEMBOLSOS (DIARIO, SEMANAL, MENSUAL)
// ============================================

app.get('/api/refunds/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const username = req.user.username;
    
    const userInfo = await getUserInfoByName(username);
    const currentBalance = userInfo ? userInfo.balance : 0;
    
    const [yesterdayMovements, lastWeekMovements, lastMonthMovements] = await Promise.all([
      getUserNetYesterday(username),
      getUserNetLastWeek(username),
      getUserNetLastMonth(username)
    ]);
    
    const claimedToday = await checkClaimedToday(username);
    
    const dailyStatus = await canClaimDailyRefund(userId);
    const weeklyStatus = await canClaimWeeklyRefund(userId);
    const monthlyStatus = await canClaimMonthlyRefund(userId);
    
    const dailyDeposits = yesterdayMovements.success ? yesterdayMovements.totalDeposits : 0;
    const dailyWithdrawals = yesterdayMovements.success ? yesterdayMovements.totalWithdraws : 0;
    const dailyNet = yesterdayMovements.success ? yesterdayMovements.net : 0;
    
    const weeklyDeposits = lastWeekMovements.success ? lastWeekMovements.totalDeposits : 0;
    const weeklyWithdrawals = lastWeekMovements.success ? lastWeekMovements.totalWithdraws : 0;
    const weeklyNet = lastWeekMovements.success ? lastWeekMovements.net : 0;
    
    const monthlyDeposits = lastMonthMovements.success ? lastMonthMovements.totalDeposits : 0;
    const monthlyWithdrawals = lastMonthMovements.success ? lastMonthMovements.totalWithdraws : 0;
    const monthlyNet = lastMonthMovements.success ? lastMonthMovements.net : 0;
    
    const dailyCalc = calculateRefund(dailyDeposits, dailyWithdrawals, 20);
    const weeklyCalc = calculateRefund(weeklyDeposits, weeklyWithdrawals, 10);
    const monthlyCalc = calculateRefund(monthlyDeposits, monthlyWithdrawals, 5);
    
    res.json({
      user: {
        username,
        currentBalance,
        jugayganaLinked: !!userInfo
      },
      daily: {
        ...dailyStatus,
        potentialAmount: dailyCalc.refundAmount,
        netAmount: dailyCalc.netAmount,
        percentage: 20,
        period: yesterdayMovements.success ? yesterdayMovements.dateStr : 'ayer',
        deposits: dailyDeposits,
        withdrawals: dailyWithdrawals
      },
      weekly: {
        ...weeklyStatus,
        potentialAmount: weeklyCalc.refundAmount,
        netAmount: weeklyCalc.netAmount,
        percentage: 10,
        period: lastWeekMovements.success ? `${lastWeekMovements.fromDateStr} a ${lastWeekMovements.toDateStr}` : 'semana pasada',
        deposits: weeklyDeposits,
        withdrawals: weeklyWithdrawals
      },
      monthly: {
        ...monthlyStatus,
        potentialAmount: monthlyCalc.refundAmount,
        netAmount: monthlyCalc.netAmount,
        percentage: 5,
        period: lastMonthMovements.success ? `${lastMonthMovements.fromDateStr} a ${lastMonthMovements.toDateStr}` : 'mes pasado',
        deposits: monthlyDeposits,
        withdrawals: monthlyWithdrawals
      },
      claimedToday: claimedToday.success ? claimedToday.claimed : false
    });
  } catch (error) {
    console.error('Error obteniendo estado de reembolsos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/refunds/claim/daily', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const username = req.user.username;
    
    if (!acquireRefundLock(userId, 'daily')) {
      return res.json({
        success: false,
        message: '⏳ Ya estás procesando un reembolso. Por favor espera...',
        canClaim: true,
        processing: true
      });
    }
    
    try {
      const status = await canClaimDailyRefund(userId);
      
      if (!status.canClaim) {
        return res.json({
          success: false,
          message: 'Ya reclamaste tu reembolso diario. Vuelve mañana!',
          canClaim: false,
          nextClaim: status.nextClaim
        });
      }
      
      const yesterdayMovements = await getUserNetYesterday(username);
      
      if (!yesterdayMovements.success) {
        return res.json({
          success: false,
          message: 'No se pudieron obtener tus movimientos. Intenta más tarde.',
          canClaim: true
        });
      }
      
      const deposits = yesterdayMovements.totalDeposits;
      const withdrawals = yesterdayMovements.totalWithdraws;
      
      const calc = calculateRefund(deposits, withdrawals, 20);
      
      if (calc.refundAmount <= 0) {
        return res.json({
          success: false,
          message: `No tienes saldo neto positivo para reclamar reembolso. Depósitos: $${deposits}, Retiros: $${withdrawals}`,
          canClaim: true,
          netAmount: calc.netAmount
        });
      }
      
      const depositResult = await creditUserBalance(username, calc.refundAmount);
      
      if (!depositResult.success) {
        return res.json({
          success: false,
          message: 'Error al acreditar el reembolso: ' + depositResult.error,
          canClaim: true
        });
      }
      
      const refund = await recordRefund(
        userId,
        username,
        'daily',
        calc.refundAmount,
        calc.netAmount,
        deposits,
        withdrawals
      );
      
      res.json({
        success: true,
        message: `¡Reembolso diario de $${calc.refundAmount} acreditado!`,
        amount: calc.refundAmount,
        percentage: 20,
        netAmount: calc.netAmount,
        refund,
        nextClaim: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
    } finally {
      setTimeout(() => releaseRefundLock(userId, 'daily'), 3000);
    }
  } catch (error) {
    console.error('Error reclamando reembolso diario:', error);
    res.json({ success: false, message: 'Error del servidor', canClaim: true });
  }
});

app.post('/api/refunds/claim/weekly', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const username = req.user.username;
    
    if (!acquireRefundLock(userId, 'weekly')) {
      return res.json({
        success: false,
        message: '⏳ Ya estás procesando un reembolso. Por favor espera...',
        canClaim: true,
        processing: true
      });
    }
    
    try {
      const status = await canClaimWeeklyRefund(userId);
      
      if (!status.canClaim) {
        return res.json({
          success: false,
          message: `No puedes reclamar el reembolso semanal. Disponible: ${status.availableDays}`,
          canClaim: false,
          nextClaim: status.nextClaim,
          availableDays: status.availableDays
        });
      }
      
      const lastWeekMovements = await getUserNetLastWeek(username);
      
      if (!lastWeekMovements.success) {
        return res.json({
          success: false,
          message: 'No se pudieron obtener tus movimientos. Intenta más tarde.',
          canClaim: true
        });
      }
      
      const deposits = lastWeekMovements.totalDeposits;
      const withdrawals = lastWeekMovements.totalWithdraws;
      
      const calc = calculateRefund(deposits, withdrawals, 10);
      
      if (calc.refundAmount <= 0) {
        return res.json({
          success: false,
          message: `No tienes saldo neto positivo. Depósitos: $${deposits}, Retiros: $${withdrawals}`,
          canClaim: true,
          netAmount: calc.netAmount
        });
      }
      
      const depositResult = await creditUserBalance(username, calc.refundAmount);
      
      if (!depositResult.success) {
        return res.json({
          success: false,
          message: 'Error al acreditar el reembolso: ' + depositResult.error,
          canClaim: true
        });
      }
      
      const refund = await recordRefund(
        userId,
        username,
        'weekly',
        calc.refundAmount,
        calc.netAmount,
        deposits,
        withdrawals
      );
      
      res.json({
        success: true,
        message: `¡Reembolso semanal de $${calc.refundAmount} acreditado!`,
        amount: calc.refundAmount,
        percentage: 10,
        netAmount: calc.netAmount,
        refund,
        nextClaim: status.nextClaim
      });
    } finally {
      setTimeout(() => releaseRefundLock(userId, 'weekly'), 3000);
    }
  } catch (error) {
    console.error('Error reclamando reembolso semanal:', error);
    res.json({ success: false, message: 'Error del servidor', canClaim: true });
  }
});

app.post('/api/refunds/claim/monthly', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const username = req.user.username;
    
    if (!acquireRefundLock(userId, 'monthly')) {
      return res.json({
        success: false,
        message: '⏳ Ya estás procesando un reembolso. Por favor espera...',
        canClaim: true,
        processing: true
      });
    }
    
    try {
      const status = await canClaimMonthlyRefund(userId);
      
      if (!status.canClaim) {
        return res.json({
          success: false,
          message: `No puedes reclamar el reembolso mensual. Disponible: ${status.availableFrom}`,
          canClaim: false,
          nextClaim: status.nextClaim,
          availableFrom: status.availableFrom
        });
      }
      
      const lastMonthMovements = await getUserNetLastMonth(username);
      
      if (!lastMonthMovements.success) {
        return res.json({
          success: false,
          message: 'No se pudieron obtener tus movimientos. Intenta más tarde.',
          canClaim: true
        });
      }
      
      const deposits = lastMonthMovements.totalDeposits;
      const withdrawals = lastMonthMovements.totalWithdraws;
      
      const calc = calculateRefund(deposits, withdrawals, 5);
      
      if (calc.refundAmount <= 0) {
        return res.json({
          success: false,
          message: `No tienes saldo neto positivo. Depósitos: $${deposits}, Retiros: $${withdrawals}`,
          canClaim: true,
          netAmount: calc.netAmount
        });
      }
      
      const depositResult = await creditUserBalance(username, calc.refundAmount);
      
      if (!depositResult.success) {
        return res.json({
          success: false,
          message: 'Error al acreditar el reembolso: ' + depositResult.error,
          canClaim: true
        });
      }
      
      const refund = await recordRefund(
        userId,
        username,
        'monthly',
        calc.refundAmount,
        calc.netAmount,
        deposits,
        withdrawals
      );
      
      res.json({
        success: true,
        message: `¡Reembolso mensual de $${calc.refundAmount} acreditado!`,
        amount: calc.refundAmount,
        percentage: 5,
        netAmount: calc.netAmount,
        refund,
        nextClaim: status.nextClaim
      });
    } finally {
      setTimeout(() => releaseRefundLock(userId, 'monthly'), 3000);
    }
  } catch (error) {
    console.error('Error reclamando reembolso mensual:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/refunds/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRefunds = await getUserRefunds(userId);
    
    res.json({
      refunds: userRefunds.sort((a, b) => new Date(b.date) - new Date(a.date))
    });
  } catch (error) {
    console.error('Error obteniendo historial de reembolsos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/refunds/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const allRefunds = await getAllRefunds();
    
    const summary = {
      dailyCount: 0,
      weeklyCount: 0,
      monthlyCount: 0,
      totalAmount: 0
    };
    
    allRefunds.forEach(r => {
      summary.totalAmount += r.amount || 0;
      if (r.type === 'daily') summary.dailyCount++;
      else if (r.type === 'weekly') summary.weeklyCount++;
      else if (r.type === 'monthly') summary.monthlyCount++;
    });
    
    res.json({
      refunds: allRefunds.sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp)),
      summary
    });
  } catch (error) {
    console.error('Error obteniendo todos los reembolsos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// MOVIMIENTOS DE SALDO (DEPÓSITOS/RETIROS)
// ============================================

app.get('/api/balance', authMiddleware, async (req, res) => {
  try {
    const username = req.user.username;
    const result = await getUserBalance(username);
    
    if (result.success) {
      res.json({
        balance: result.balance,
        username: result.username
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error obteniendo balance:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/balance/live', authMiddleware, async (req, res) => {
  try {
    const username = req.user.username;
    const result = await getUserBalance(username);
    
    if (result.success) {
      const users = await loadUsers();
      const userIndex = users.findIndex(u => u.username === username);
      if (userIndex !== -1) {
        users[userIndex].balance = result.balance;
        await saveUsers(users);
      }
      
      res.json({
        balance: result.balance,
        username: result.username,
        updatedAt: new Date().toISOString()
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error obteniendo balance en tiempo real:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/movements', authMiddleware, async (req, res) => {
  try {
    const username = req.user.username;
    const { startDate, endDate, page = 1 } = req.query;
    
    const result = await getUserMovements(username, {
      startDate,
      endDate,
      page: parseInt(page),
      pageSize: 50
    });
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error obteniendo movimientos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/admin/deposit', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, amount, description } = req.body;
    
    if (!username || !amount) {
      return res.status(400).json({ error: 'Usuario y monto requeridos' });
    }
    
    const result = await depositToUser(username, amount, description);
    
    if (result.success) {
      const users = await loadUsers();
      const user = users.find(u => u.username === username);
      if (user) {
        recordUserActivity(user.id, 'deposit', amount);
      }
      
      await saveTransaction({
        type: 'deposit',
        amount: parseFloat(amount),
        username: username,
        description: description || 'Depósito realizado',
        adminId: req.user?.userId,
        adminUsername: req.user?.username,
        adminRole: req.user?.role || 'admin'
      });
      
      res.json({
        success: true,
        message: 'Depósito realizado correctamente',
        newBalance: result.data?.user_balance_after,
        transactionId: result.data?.transfer_id || result.data?.transferId
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error realizando depósito:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/admin/balance/:username', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const result = await getUserBalance(username);
    
    if (result.success) {
      res.json({ balance: result.balance });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error obteniendo balance:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/admin/withdrawal', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, amount, description } = req.body;
    
    if (!username || !amount) {
      return res.status(400).json({ error: 'Usuario y monto requeridos' });
    }
    
    const result = await withdrawFromUser(username, amount, description);
    
    if (result.success) {
      const users = await loadUsers();
      const user = users.find(u => u.username === username);
      if (user) {
        recordUserActivity(user.id, 'withdrawal', amount);
      }
      
      await saveTransaction({
        type: 'withdrawal',
        amount: parseFloat(amount),
        username: username,
        description: description || 'Retiro realizado',
        adminId: req.user?.userId,
        adminUsername: req.user?.username,
        adminRole: req.user?.role || 'admin'
      });
      
      res.json({
        success: true,
        message: 'Retiro realizado correctamente',
        newBalance: result.data?.user_balance_after,
        transactionId: result.data?.transfer_id || result.data?.transferId
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error realizando retiro:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/admin/bonus', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, amount } = req.body;
    
    console.log('🎁 POST /api/admin/bonus - Body:', req.body);
    console.log('🎁 Usuario:', req.user?.username, 'Rol:', req.user?.role);
    
    if (!username || !amount) {
      console.log('❌ Error: Usuario y monto requeridos');
      return res.status(400).json({ error: 'Usuario y monto requeridos' });
    }
    
    const bonusAmount = parseFloat(amount);
    if (isNaN(bonusAmount) || bonusAmount <= 0) {
      console.log('❌ Error: Monto de bonificación inválido');
      return res.status(400).json({ error: 'Monto de bonificación inválido' });
    }
    
    console.log(`🎁 Aplicando bonus de $${bonusAmount} a ${username}`);
    
    const depositResult = await creditUserBalance(username, bonusAmount);
    
    if (depositResult.success) {
      console.log(`✅ Bonus aplicado: $${bonusAmount} a ${username}`);
      
      await saveTransaction({
        type: 'bonus',
        amount: bonusAmount,
        username: username,
        description: 'Bonificación otorgada',
        adminId: req.user?.userId,
        adminUsername: req.user?.username,
        adminRole: req.user?.role || 'admin'
      });
      
      res.json({
        success: true,
        message: `Bonificación de $${bonusAmount.toLocaleString()} realizada correctamente`,
        newBalance: depositResult.data?.user_balance_after,
        transactionId: depositResult.data?.transfer_id || depositResult.data?.transferId
      });
    } else {
      console.error('❌ Error aplicando bonus:', depositResult.error);
      res.status(400).json({ error: depositResult.error || 'Error al aplicar bonificación' });
    }
  } catch (error) {
    console.error('Error realizando bonificación:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// ENDPOINTS DE MOVIMIENTOS (DEPÓSITOS/RETIROS)
// ============================================

app.post('/api/movements/deposit', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const username = req.user.username;
    
    if (!amount || amount < 100) {
      return res.status(400).json({ error: 'Monto mínimo $100' });
    }
    
    const result = await depositToUser(
      username, 
      amount, 
      `Depósito desde Sala de Juegos - ${new Date().toLocaleString('es-AR')}`
    );
    
    if (result.success) {
      recordUserActivity(req.user.userId, 'deposit', amount);
      
      res.json({
        success: true,
        message: `Depósito de $${amount} realizado correctamente`,
        newBalance: result.data?.user_balance_after,
        transactionId: result.data?.transfer_id || result.data?.transferId
      });
    } else {
      res.status(400).json({ error: result.error || 'Error al realizar depósito' });
    }
  } catch (error) {
    console.error('Error en depósito:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/movements/withdraw', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const username = req.user.username;
    
    if (!amount || amount < 100) {
      return res.status(400).json({ error: 'Monto mínimo $100' });
    }
    
    const result = await withdrawFromUser(
      username, 
      amount, 
      `Retiro desde Sala de Juegos - ${new Date().toLocaleString('es-AR')}`
    );
    
    if (result.success) {
      recordUserActivity(req.user.userId, 'withdrawal', amount);
      
      res.json({
        success: true,
        message: `Retiro de $${amount} realizado correctamente`,
        newBalance: result.data?.user_balance_after,
        transactionId: result.data?.transfer_id || result.data?.transferId
      });
    } else {
      res.status(400).json({ error: result.error || 'Error al realizar retiro' });
    }
  } catch (error) {
    console.error('Error en retiro:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/movements/balance', authMiddleware, async (req, res) => {
  try {
    const username = req.user.username;
    const result = await getUserBalance(username);
    
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
// SISTEMA DE FUEGUITO (RACHA DIARIA)
// ============================================

app.get('/api/fire/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const rewards = await loadFireRewards();
    const userRewards = rewards[userId] || { streak: 0, lastClaim: null, totalClaimed: 0 };
    
    const todayArgentina = getArgentinaDateString();
    const lastClaim = userRewards.lastClaim ? getArgentinaDateString(new Date(userRewards.lastClaim)) : null;
    
    const canClaim = lastClaim !== todayArgentina;
    
    const yesterdayArgentina = getArgentinaYesterday();
    
    if (lastClaim !== yesterdayArgentina && lastClaim !== todayArgentina && userRewards.streak > 0) {
      userRewards.streak = 0;
      rewards[userId] = userRewards;
      await saveFireRewards(rewards);
    }
    
    res.json({
      streak: userRewards.streak || 0,
      lastClaim: userRewards.lastClaim,
      totalClaimed: userRewards.totalClaimed || 0,
      canClaim: canClaim,
      hasActivityToday: true,
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
      return res.status(400).json({ error: 'Ya reclamaste tu fueguito hoy' });
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
      
      const bonusResult = await makeBonus(
        username,
        reward,
        `Recompensa racha 10 días - Sala de Juegos`
      );
      
      if (!bonusResult.success) {
        return res.status(400).json({ 
          error: 'Error al acreditar recompensa: ' + bonusResult.error 
        });
      }
      
      message = `¡Felicidades! 10 días de racha! Recompensa: $${reward.toLocaleString()}`;
    }
    
    rewards[userId] = userRewards;
    await saveFireRewards(rewards);
    
    res.json({
      success: true,
      streak: userRewards.streak,
      reward,
      message,
      totalClaimed: userRewards.totalClaimed
    });
  } catch (error) {
    console.error('Error reclamando fueguito:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// ENDPOINTS DE CONFIGURACIÓN
// ============================================

app.get('/api/admin/config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Error cargando configuración' });
  }
});

app.put('/api/admin/config/cbu', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const config = await loadConfig();
    config.cbu = { ...config.cbu, ...req.body };
    await saveConfig(config);
    res.json({ success: true, message: 'CBU actualizado', cbu: config.cbu });
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando CBU' });
  }
});

app.get('/api/admin/commands', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const commands = await loadCustomCommands();
    res.json(commands);
  } catch (error) {
    res.status(500).json({ error: 'Error cargando comandos' });
  }
});

app.post('/api/admin/commands', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description, type, bonusPercent, response } = req.body;
    
    if (!name || !name.startsWith('/')) {
      return res.status(400).json({ error: 'El comando debe empezar con /' });
    }
    
    const commands = await loadCustomCommands();
    commands[name] = {
      description,
      type,
      bonusPercent: parseInt(bonusPercent) || 0,
      response,
      createdAt: new Date().toISOString()
    };
    
    await saveCustomCommands(commands);
    res.json({ success: true, message: 'Comando guardado', commands });
  } catch (error) {
    res.status(500).json({ error: 'Error guardando comando' });
  }
});

app.delete('/api/admin/commands/:name', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const commands = await loadCustomCommands();
    delete commands[req.params.name];
    await saveCustomCommands(commands);
    res.json({ success: true, message: 'Comando eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error eliminando comando' });
  }
});

app.get('/api/admin/database', authMiddleware, adminMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Solo el administrador principal puede acceder.' });
    }
    
    const users = loadUsers();
    const messages = loadMessages();
    
    const adminRoles = ['admin', 'depositor', 'withdrawer'];
    const totalAdmins = users.filter(u => adminRoles.includes(u.role)).length;
    
    res.json({
      users: users,
      totalUsers: users.length,
      totalAdmins: totalAdmins,
      totalMessages: messages.length
    });
  } catch (error) {
    console.error('Error obteniendo base de datos:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/admin/transactions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { from, to, type } = req.query;
    let transactions = await loadTransactions();
    
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
    
    const summary = {
      deposits: 0,
      withdrawals: 0,
      bonuses: 0,
      refunds: 0
    };
    
    transactions.forEach(t => {
      if (summary.hasOwnProperty(t.type + 's') || summary.hasOwnProperty(t.type)) {
        const key = t.type + 's';
        summary[key] = (summary[key] || 0) + (t.amount || 0);
      }
    });
    
    transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      transactions: transactions.slice(0, 100),
      summary,
      total: transactions.length
    });
  } catch (error) {
    console.error('Error obteniendo transacciones:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ============================================
// SOCKET.IO - CHAT EN TIEMPO REAL
// ============================================

const connectedUsers = new Map();
const connectedAdmins = new Map();

io.on('connection', (socket) => {
  console.log('Nueva conexión:', socket.id);
  
  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      socket.role = decoded.role;
      
      if (decoded.role === 'admin') {
        connectedAdmins.set(decoded.userId, socket);
        console.log(`Admin conectado: ${decoded.username}`);
        broadcastStats();
      } else {
        connectedUsers.set(decoded.userId, socket);
        console.log(`Usuario conectado: ${decoded.username}`);
        
        socket.join(`user_${decoded.userId}`);
        
        notifyAdmins('user_connected', {
          userId: decoded.userId,
          username: decoded.username
        });
      }
      
      socket.emit('authenticated', { success: true, role: decoded.role });
    } catch (error) {
      socket.emit('authenticated', { success: false, error: 'Token inválido' });
    }
  });
  
  socket.on('send_message', async (data) => {
    try {
      const { content, type = 'text' } = data;
      
      if (!socket.userId) {
        return socket.emit('error', { message: 'No autenticado' });
      }
      
      const messages = await loadMessages();
      const users = await loadUsers();
      
      const message = {
        id: uuidv4(),
        senderId: socket.userId,
        senderUsername: socket.username,
        senderRole: socket.role,
        receiverId: socket.role === 'admin' ? data.receiverId : 'admin',
        receiverRole: socket.role === 'admin' ? 'user' : 'admin',
        content,
        type,
        timestamp: new Date().toISOString(),
        read: false
      };
      
      messages.push(message);
      await saveMessages(messages);
      
      if (socket.role === 'user') {
        notifyAdmins('new_message', {
          message,
          userId: socket.userId,
          username: socket.username
        });
        
        socket.emit('message_sent', message);
      } else {
        const userSocket = connectedUsers.get(data.receiverId);
        if (userSocket) {
          userSocket.emit('new_message', message);
        }
        
        socket.emit('message_sent', message);
      }
      
      broadcastStats();
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      socket.emit('error', { message: 'Error enviando mensaje' });
    }
  });
  
  socket.on('typing', (data) => {
    if (socket.role === 'user') {
      notifyAdmins('user_typing', {
        userId: socket.userId,
        username: socket.username,
        isTyping: data.isTyping
      });
    } else {
      const userSocket = connectedUsers.get(data.receiverId);
      if (userSocket) {
        userSocket.emit('admin_typing', {
          adminId: socket.userId,
          adminName: socket.username,
          isTyping: data.isTyping
        });
      }
    }
  });
  
  socket.on('stop_typing', (data) => {
    if (socket.role === 'user') {
      notifyAdmins('user_stop_typing', {
        userId: socket.userId,
        username: socket.username
      });
    } else {
      const userSocket = connectedUsers.get(data.receiverId);
      if (userSocket) {
        userSocket.emit('admin_stop_typing', {
          adminId: socket.userId,
          adminName: socket.username
        });
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Desconexión:', socket.id);
    
    if (socket.role === 'admin') {
      connectedAdmins.delete(socket.userId);
      broadcastStats();
    } else {
      connectedUsers.delete(socket.userId);
      notifyAdmins('user_disconnected', {
        userId: socket.userId,
        username: socket.username
      });
    }
  });
});

function notifyAdmins(event, data) {
  connectedAdmins.forEach((socket) => {
    socket.emit(event, data);
  });
}

function broadcastStats() {
  const stats = {
    connectedUsers: connectedUsers.size,
    connectedAdmins: connectedAdmins.size,
    totalUsers: loadUsers().filter(u => u.role === 'user').length
  };
  
  connectedAdmins.forEach((socket) => {
    socket.emit('stats', stats);
  });
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

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  const content = readFileSafe(indexPath);
  if (content) {
    res.setHeader('Content-Type', 'text/html');
    res.send(content);
  } else {
    res.status(500).send('Error loading page');
  }
});

app.get('/adminprivado2026', (req, res) => {
  const adminPath = path.join(__dirname, 'public', 'adminprivado2026', 'index.html');
  const content = readFileSafe(adminPath);
  if (content) {
    res.setHeader('Content-Type', 'text/html');
    res.send(content);
  } else {
    res.status(500).send('Error loading admin page');
  }
});

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
  await connectMongoDB();
  
  if (process.env.PROXY_URL) {
    console.log('🔍 Verificando IP pública...');
    await logProxyIP();
  }
  
  console.log('🔑 Probando conexión con JUGAYGANA...');
  const sessionOk = await ensureSession();
  if (sessionOk) {
    console.log('✅ Conexión con JUGAYGANA establecida');
  } else {
    console.log('⚠️ No se pudo conectar con JUGAYGANA');
  }
  
  let users = [];
  
  if (mongoConnected) {
    try {
      const mongoUsers = await User.find().lean();
      if (mongoUsers && mongoUsers.length > 0) {
        users = mongoUsers;
        console.log(`✅ ${users.length} usuarios cargados desde MongoDB`);
      } else {
        console.log('📁 No hay usuarios en MongoDB, cargando desde archivo...');
        users = loadUsers();
      }
    } catch (err) {
      console.log('⚠️ Error cargando de MongoDB:', err.message);
      users = loadUsers();
    }
  } else {
    users = loadUsers();
  }
  
  console.log(`📊 Total usuarios en sistema: ${users.length}`);
  
  let adminExists = users.find(u => u.username === 'ignite100');
  if (!adminExists) {
    const adminPassword = await bcrypt.hash('pepsi100', 10);
    const admin = {
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
    };
    users.push(admin);
    console.log('✅ Admin creado: ignite100 / pepsi100');
  } else {
    adminExists.password = await bcrypt.hash('pepsi100', 10);
    adminExists.role = 'admin';
    adminExists.isActive = true;
    console.log('✅ Admin actualizado: ignite100 / pepsi100');
  }
  
  let oldAdmin = users.find(u => u.username === 'admin');
  if (!oldAdmin) {
    const adminPassword = await bcrypt.hash('admin123', 10);
    const admin = {
      id: uuidv4(),
      username: 'admin',
      password: adminPassword,
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
    };
    users.push(admin);
    console.log('✅ Admin respaldo creado: admin / admin123');
  } else {
    oldAdmin.password = await bcrypt.hash('admin123', 10);
    oldAdmin.role = 'admin';
    oldAdmin.isActive = true;
    console.log('✅ Admin respaldo actualizado: admin / admin123');
  }
  
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
      console.log('🔄 Sincronizando usuario de prueba con JUGAYGANA...');
      const result = await syncUserToPlatform({
        username: '672rosana1',
        password: 'asd123'
      });
      if (result.success) {
        user.jugayganaUserId = result.jugayganaUserId || result.user?.user_id;
        user.jugayganaUsername = result.jugayganaUsername || result.user?.user_name;
        user.jugayganaSyncStatus = result.alreadyExists ? 'linked' : 'synced';
        console.log('✅ Usuario de prueba sincronizado con JUGAYGANA');
      } else {
        console.log('⚠️ No se pudo sincronizar usuario de prueba:', result.error);
      }
    }
  }
  
  await saveUsers(users);
  
  if (mongoConnected) {
    try {
      const mongoMessages = await Message.find().lean();
      if (mongoMessages && mongoMessages.length > 0) {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(mongoMessages, null, 2));
        console.log(`✅ ${mongoMessages.length} mensajes cargados desde MongoDB`);
      }
    } catch (err) {
      console.log('⚠️ Error cargando mensajes de MongoDB:', err.message);
    }
  }
  
  if (mongoConnected) {
    try {
      const mongoCommands = await Command.find().lean();
      if (mongoCommands && mongoCommands.length > 0) {
        fs.writeFileSync(COMMANDS_FILE, JSON.stringify(mongoCommands, null, 2));
        console.log(`✅ ${mongoCommands.length} comandos cargados desde MongoDB`);
      }
    } catch (err) {
      console.log('⚠️ Error cargando comandos de MongoDB:', err.message);
    }
  }
  
  if (mongoConnected) {
    try {
      const mongoConfig = await Config.findOne({ key: 'main' }).lean();
      if (mongoConfig) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(mongoConfig, null, 2));
        console.log('✅ Configuración cargada desde MongoDB');
      }
    } catch (err) {
      console.log('⚠️ Error cargando configuración de MongoDB:', err.message);
    }
  }
  
  if (mongoConnected) {
    try {
      const mongoTransactions = await Transaction.find().lean();
      if (mongoTransactions && mongoTransactions.length > 0) {
        fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(mongoTransactions, null, 2));
        console.log(`✅ ${mongoTransactions.length} transacciones cargadas desde MongoDB`);
      }
    } catch (err) {
      console.log('⚠️ Error cargando transacciones de MongoDB:', err.message);
    }
  }
  
  if (mongoConnected) {
    try {
      const mongoRefunds = await Refund.find().lean();
      if (mongoRefunds && mongoRefunds.length > 0) {
        fs.writeFileSync(REFUNDS_FILE, JSON.stringify(mongoRefunds, null, 2));
        console.log(`✅ ${mongoRefunds.length} reembolsos cargados desde MongoDB`);
      }
    } catch (err) {
      console.log('⚠️ Error cargando reembolsos de MongoDB:', err.message);
    }
  }
  
  if (mongoConnected) {
    try {
      const mongoFireRewards = await FireReward.find().lean();
      if (mongoFireRewards && mongoFireRewards.length > 0) {
        const fireRewardsObj = {};
        mongoFireRewards.forEach(r => {
          fireRewardsObj[r.userId] = {
            streak: r.streak,
            lastClaim: r.lastClaim,
            totalClaimed: r.totalClaimed
          };
        });
        fs.writeFileSync(FIRE_REWARDS_FILE, JSON.stringify(fireRewardsObj, null, 2));
        console.log(`✅ ${mongoFireRewards.length} registros de fueguito cargados desde MongoDB`);
      }
    } catch (err) {
      console.log('⚠️ Error cargando fueguito de MongoDB:', err.message);
    }
  }
  
  console.log('✅✅✅ INICIALIZACIÓN COMPLETADA ✅✅✅');
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
