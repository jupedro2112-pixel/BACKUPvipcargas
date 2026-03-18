// ============================================
// MODELO DE REEMBOLSOS - CON VERIFICACIÓN EN MONGODB
// ============================================

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Importar el modelo Refund desde database.js
const { Refund } = require('../database');

const DATA_DIR = process.env.VERCEL ? '/tmp/data' : path.join(__dirname, '../data');
const REFUNDS_FILE = path.join(DATA_DIR, 'refunds.json');

// Asegurar que exista el archivo
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(REFUNDS_FILE)) {
    fs.writeFileSync(REFUNDS_FILE, JSON.stringify([], null, 2));
  }
} catch (error) {
  console.error('Error creando archivo de reembolsos:', error);
}

// ============================================
// FUNCIONES AUXILIARES DE FECHAS
// ============================================

// Obtener fecha de hoy en hora Argentina (GMT-3)
function getTodayArgentina() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return new Date(`${year}-${month}-${day}T00:00:00-03:00`);
}

// Obtener inicio del día en Argentina
function getStartOfDayArgentina(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return new Date(`${year}-${month}-${day}T00:00:00-03:00`);
}

// Obtener fin del día en Argentina
function getEndOfDayArgentina(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return new Date(`${year}-${month}-${day}T23:59:59.999-03:00`);
}

async function loadRefunds() {
  // Primero intentar cargar de MongoDB
  if (mongoose.connection.readyState === 1) {
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
  // Fallback a archivo
  try {
    const data = fs.readFileSync(REFUNDS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function saveRefunds(refunds) {
  fs.writeFileSync(REFUNDS_FILE, JSON.stringify(refunds, null, 2));
  
  // Guardar en MongoDB
  if (mongoose.connection.readyState === 1) {
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

// Obtener reembolsos de un usuario
async function getUserRefunds(userId) {
  // Primero intentar desde MongoDB
  if (mongoose.connection.readyState === 1) {
    try {
      return await Refund.find({ userId }).sort({ date: -1 }).lean();
    } catch (err) {
      console.error('Error obteniendo reembolsos de MongoDB:', err.message);
    }
  }
  // Fallback a archivo
  const refunds = await loadRefunds();
  return refunds.filter(r => r.userId === userId);
}

// Obtener todos los reembolsos (para admin)
async function getAllRefunds() {
  // Primero intentar desde MongoDB
  if (mongoose.connection.readyState === 1) {
    try {
      return await Refund.find().sort({ date: -1 }).lean();
    } catch (err) {
      console.error('Error obteniendo todos los reembolsos de MongoDB:', err.message);
    }
  }
  // Fallback a archivo
  return await loadRefunds();
}

// ============================================
// VERIFICACIÓN EN MONGODB - CLAVE PARA BLOQUEO
// ============================================

// Verificar si el usuario ya reclamó reembolso diario hoy (en MongoDB)
async function hasClaimedDailyToday(userId) {
  if (mongoose.connection.readyState !== 1) {
    console.log('⚠️ MongoDB no conectado, usando archivo local para verificación');
    // Fallback a archivo
    const refunds = await loadRefunds();
    const today = getTodayArgentina();
    const todayStr = today.toDateString();
    
    const lastDaily = refunds
      .filter(r => r.userId === userId && r.type === 'daily')
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    
    if (!lastDaily) return false;
    const lastDate = new Date(lastDaily.date);
    return lastDate.toDateString() === todayStr;
  }

  try {
    const startOfDay = getStartOfDayArgentina();
    const endOfDay = getEndOfDayArgentina();
    
    const existingRefund = await Refund.findOne({
      userId: userId,
      type: 'daily',
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
    
    if (existingRefund) {
      console.log(`🚫 Usuario ${userId} ya reclamó reembolso diario hoy (encontrado en MongoDB)`);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error verificando reembolso diario en MongoDB:', err.message);
    return false;
  }
}

// Verificar si el usuario ya reclamó reembolso semanal esta semana (en MongoDB)
async function hasClaimedWeeklyThisWeek(userId) {
  if (mongoose.connection.readyState !== 1) {
    console.log('⚠️ MongoDB no conectado, usando archivo local para verificación');
    // Fallback a archivo
    const refunds = await loadRefunds();
    const now = new Date();
    const currentDay = now.getDay();
    const currentWeekStart = new Date(now);
    currentWeekStart.setDate(now.getDate() - currentDay + 1);
    currentWeekStart.setHours(0, 0, 0, 0);
    
    const lastWeekly = refunds
      .filter(r => r.userId === userId && r.type === 'weekly')
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    
    if (!lastWeekly) return false;
    const lastDate = new Date(lastWeekly.date);
    return lastDate >= currentWeekStart;
  }

  try {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Domingo, 1 = Lunes
    const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysSinceMonday);
    weekStart.setHours(0, 0, 0, 0);
    
    const existingRefund = await Refund.findOne({
      userId: userId,
      type: 'weekly',
      date: {
        $gte: weekStart
      }
    });
    
    if (existingRefund) {
      console.log(`🚫 Usuario ${userId} ya reclamó reembolso semanal esta semana (encontrado en MongoDB)`);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error verificando reembolso semanal en MongoDB:', err.message);
    return false;
  }
}

// Verificar si el usuario ya reclamó reembolso mensual este mes (en MongoDB)
async function hasClaimedMonthlyThisMonth(userId) {
  if (mongoose.connection.readyState !== 1) {
    console.log('⚠️ MongoDB no conectado, usando archivo local para verificación');
    // Fallback a archivo
    const refunds = await loadRefunds();
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const lastMonthly = refunds
      .filter(r => r.userId === userId && r.type === 'monthly')
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    
    if (!lastMonthly) return false;
    const lastDate = new Date(lastMonthly.date);
    return lastDate >= currentMonthStart;
  }

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const existingRefund = await Refund.findOne({
      userId: userId,
      type: 'monthly',
      date: {
        $gte: monthStart
      }
    });
    
    if (existingRefund) {
      console.log(`🚫 Usuario ${userId} ya reclamó reembolso mensual este mes (encontrado en MongoDB)`);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error verificando reembolso mensual en MongoDB:', err.message);
    return false;
  }
}

// ============================================
// FUNCIONES PÚBLICAS DE VERIFICACIÓN
// ============================================

// Verificar si el usuario puede reclamar reembolso diario
async function canClaimDailyRefund(userId) {
  // PRIMERO: Verificar en MongoDB si ya reclamó hoy
  const alreadyClaimed = await hasClaimedDailyToday(userId);
  
  if (alreadyClaimed) {
    // Calcular próximo reclamo (mañana a las 00:00 Argentina)
    const tomorrow = getTodayArgentina();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return {
      canClaim: false,
      nextClaim: tomorrow.toISOString(),
      lastClaim: new Date().toISOString(),
      message: 'Ya reclamaste tu reembolso diario hoy. Vuelve mañana!'
    };
  }
  
  // Si no reclamó hoy, puede reclamar
  return {
    canClaim: true,
    nextClaim: null,
    lastClaim: null
  };
}

// Verificar si el usuario puede reclamar reembolso semanal
async function canClaimWeeklyRefund(userId) {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Domingo, 1 = Lunes, 2 = Martes
  
  // Solo puede reclamar lunes (1) o martes (2)
  const canClaimByDay = currentDay === 1 || currentDay === 2;
  
  if (!canClaimByDay) {
    // Calcular próximo lunes
    const nextMonday = new Date(now);
    const daysUntilMonday = currentDay === 0 ? 1 : 8 - currentDay;
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);
    
    return {
      canClaim: false,
      nextClaim: nextMonday.toISOString(),
      lastClaim: null,
      availableDays: 'Lunes y Martes',
      message: 'El reembolso semanal solo está disponible los lunes y martes.'
    };
  }
  
  // PRIMERO: Verificar en MongoDB si ya reclamó esta semana
  const alreadyClaimed = await hasClaimedWeeklyThisWeek(userId);
  
  if (alreadyClaimed) {
    // Calcular próximo lunes
    const nextMonday = new Date(now);
    const daysUntilMonday = currentDay === 0 ? 1 : 8 - currentDay;
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);
    
    return {
      canClaim: false,
      nextClaim: nextMonday.toISOString(),
      lastClaim: new Date().toISOString(),
      availableDays: 'Lunes y Martes',
      message: 'Ya reclamaste tu reembolso semanal esta semana. Vuelve el próximo lunes!'
    };
  }
  
  return {
    canClaim: true,
    nextClaim: null,
    lastClaim: null,
    availableDays: 'Lunes y Martes'
  };
}

// Verificar si el usuario puede reclamar reembolso mensual
async function canClaimMonthlyRefund(userId) {
  const now = new Date();
  const currentDay = now.getDate();
  
  // Solo puede reclamar del día 7 en adelante
  const canClaimByDay = currentDay >= 7;
  
  if (!canClaimByDay) {
    // Calcular día 7 del mes actual
    const nextAvailable = new Date(now.getFullYear(), now.getMonth(), 7);
    nextAvailable.setHours(0, 0, 0, 0);
    
    return {
      canClaim: false,
      nextClaim: nextAvailable.toISOString(),
      lastClaim: null,
      availableFrom: 'Día 7 de cada mes',
      message: 'El reembolso mensual está disponible a partir del día 7 de cada mes.'
    };
  }
  
  // PRIMERO: Verificar en MongoDB si ya reclamó este mes
  const alreadyClaimed = await hasClaimedMonthlyThisMonth(userId);
  
  if (alreadyClaimed) {
    // Calcular día 7 del próximo mes
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 7);
    nextMonth.setHours(0, 0, 0, 0);
    
    return {
      canClaim: false,
      nextClaim: nextMonth.toISOString(),
      lastClaim: new Date().toISOString(),
      availableFrom: 'Día 7 de cada mes',
      message: 'Ya reclamaste tu reembolso mensual este mes. Vuelve el día 7 del próximo mes!'
    };
  }
  
  return {
    canClaim: true,
    nextClaim: null,
    lastClaim: null,
    availableFrom: 'Día 7 de cada mes'
  };
}

// Registrar un reembolso
async function recordRefund(userId, username, type, amount, netAmount, deposits, withdrawals) {
  const refundId = uuidv4();
  
  const refund = {
    id: refundId,
    userId,
    username,
    type,
    amount,
    netAmount,
    deposits,
    withdrawals,
    date: new Date(),
    status: 'claimed'
  };
  
  // Guardar en archivo local primero
  const refunds = await loadRefunds();
  refunds.push(refund);
  await saveRefunds(refunds);
  
  // Guardar en MongoDB si está conectado
  if (mongoose.connection.readyState === 1) {
    try {
      await Refund.create(refund);
      console.log(`✅ Reembolso ${type} guardado en MongoDB para usuario ${username}`);
    } catch (err) {
      console.error('Error guardando reembolso en MongoDB:', err.message);
    }
  }
  
  return refund;
}

// Calcular reembolso
function calculateRefund(deposits, withdrawals, percentage) {
  const netAmount = Math.max(0, deposits - withdrawals);
  const refundAmount = netAmount * (percentage / 100);
  return {
    netAmount,
    refundAmount: Math.round(refundAmount),
    percentage
  };
}

module.exports = {
  loadRefunds,
  saveRefunds,
  getUserRefunds,
  getAllRefunds,
  canClaimDailyRefund,
  canClaimWeeklyRefund,
  canClaimMonthlyRefund,
  recordRefund,
  calculateRefund,
  // Exportar funciones internas para testing
  hasClaimedDailyToday,
  hasClaimedWeeklyThisWeek,
  hasClaimedMonthlyThisMonth
};
