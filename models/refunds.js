// ============================================
// SISTEMA DE REEMBOLSOS (DIARIO, SEMANAL, MENSUAL)
// ============================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.VERCEL ? '/tmp/data' : './data';
const REFUNDS_FILE = path.join(DATA_DIR, 'refunds.json');

// Asegurar que existe el directorio
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Cargar reembolsos
function loadRefunds() {
  try {
    if (!fs.existsSync(REFUNDS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(REFUNDS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error cargando reembolsos:', error.message);
    return [];
  }
}

// Guardar reembolsos
function saveRefunds(refunds) {
  try {
    fs.writeFileSync(REFUNDS_FILE, JSON.stringify(refunds, null, 2));
  } catch (error) {
    console.error('Error guardando reembolsos:', error.message);
  }
}

// ============================================
// CALCULAR REEMBOLSO
// ============================================

function calculateRefund(deposits, withdrawals, percentage) {
  const netAmount = deposits - withdrawals;
  
  if (netAmount <= 0) {
    return {
      refundAmount: 0,
      netAmount: 0,
      percentage,
      deposits,
      withdrawals
    };
  }
  
  const refundAmount = Math.floor(netAmount * (percentage / 100));
  
  return {
    refundAmount,
    netAmount,
    percentage,
    deposits,
    withdrawals
  };
}

// ============================================
// VERIFICAR SI PUEDE RECLAMAR DIARIO
// ============================================

function canClaimDailyRefund(userId) {
  const refunds = loadRefunds();
  const today = new Date().toISOString().split('T')[0];
  
  // Buscar último reembolso diario del usuario
  const lastDailyRefund = refunds
    .filter(r => r.userId === userId && r.type === 'daily')
    .sort((a, b) => new Date(b.claimedAt) - new Date(a.claimedAt))[0];
  
  if (!lastDailyRefund) {
    return { canClaim: true, nextClaim: null };
  }
  
  const lastClaimDate = new Date(lastDailyRefund.claimedAt).toISOString().split('T')[0];
  
  if (lastClaimDate === today) {
    // Ya reclamó hoy
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    return {
      canClaim: false,
      nextClaim: tomorrow.toISOString(),
      lastClaimed: lastDailyRefund.claimedAt
    };
  }
  
  return { canClaim: true, nextClaim: null };
}

// ============================================
// VERIFICAR SI PUEDE RECLAMAR SEMANAL
// ============================================

function canClaimWeeklyRefund(userId) {
  const refunds = loadRefunds();
  
  // Buscar último reembolso semanal del usuario
  const lastWeeklyRefund = refunds
    .filter(r => r.userId === userId && r.type === 'weekly')
    .sort((a, b) => new Date(b.claimedAt) - new Date(a.claimedAt))[0];
  
  if (!lastWeeklyRefund) {
    return { canClaim: true, nextClaim: null, availableDays: 7 };
  }
  
  const lastClaimDate = new Date(lastWeeklyRefund.claimedAt);
  const now = new Date();
  
  // Calcular días desde el último reclamo
  const daysSinceLastClaim = Math.floor((now - lastClaimDate) / (1000 * 60 * 60 * 24));
  
  // Semana completa = 7 días
  if (daysSinceLastClaim < 7) {
    const nextClaim = new Date(lastClaimDate);
    nextClaim.setDate(nextClaim.getDate() + 7);
    
    return {
      canClaim: false,
      nextClaim: nextClaim.toISOString(),
      lastClaimed: lastWeeklyRefund.claimedAt,
      availableDays: Math.max(0, 7 - daysSinceLastClaim)
    };
  }
  
  return { canClaim: true, nextClaim: null, availableDays: 7 };
}

// ============================================
// VERIFICAR SI PUEDE RECLAMAR MENSUAL
// ============================================

function canClaimMonthlyRefund(userId) {
  const refunds = loadRefunds();
  
  // Buscar último reembolso mensual del usuario
  const lastMonthlyRefund = refunds
    .filter(r => r.userId === userId && r.type === 'monthly')
    .sort((a, b) => new Date(b.claimedAt) - new Date(a.claimedAt))[0];
  
  if (!lastMonthlyRefund) {
    return { canClaim: true, nextClaim: null };
  }
  
  const lastClaimDate = new Date(lastMonthlyRefund.claimedAt);
  const now = new Date();
  
  // Mes completo = 30 días (aproximado)
  const daysSinceLastClaim = Math.floor((now - lastClaimDate) / (1000 * 60 * 60 * 24));
  
  if (daysSinceLastClaim < 30) {
    const nextClaim = new Date(lastClaimDate);
    nextClaim.setDate(nextClaim.getDate() + 30);
    
    return {
      canClaim: false,
      nextClaim: nextClaim.toISOString(),
      lastClaimed: lastMonthlyRefund.claimedAt
    };
  }
  
  return { canClaim: true, nextClaim: null };
}

// ============================================
// REGISTRAR REEMBOLSO
// ============================================

function recordRefund(userId, username, type, amount, netAmount, deposits, withdrawals, period = '') {
  const refunds = loadRefunds();
  
  const refund = {
    id: require('uuid').v4(),
    userId,
    username,
    type, // 'daily', 'weekly', 'monthly'
    amount,
    netAmount,
    deposits,
    withdrawals,
    period: period || new Date().toISOString().split('T')[0],
    claimedAt: new Date().toISOString()
  };
  
  refunds.push(refund);
  saveRefunds(refunds);
  
  return refund;
}

// ============================================
// OBTENER HISTORIAL DE REEMBOLSOS
// ============================================

function getUserRefundHistory(userId) {
  const refunds = loadRefunds();
  return refunds
    .filter(r => r.userId === userId)
    .sort((a, b) => new Date(b.claimedAt) - new Date(a.claimedAt));
}

// ============================================
// ESTADÍSTICAS DE REEMBOLSOS
// ============================================

function getRefundStats() {
  const refunds = loadRefunds();
  
  const daily = refunds.filter(r => r.type === 'daily');
  const weekly = refunds.filter(r => r.type === 'weekly');
  const monthly = refunds.filter(r => r.type === 'monthly');
  
  return {
    totalRefunds: refunds.length,
    totalAmount: refunds.reduce((sum, r) => sum + r.amount, 0),
    daily: {
      count: daily.length,
      totalAmount: daily.reduce((sum, r) => sum + r.amount, 0)
    },
    weekly: {
      count: weekly.length,
      totalAmount: weekly.reduce((sum, r) => sum + r.amount, 0)
    },
    monthly: {
      count: monthly.length,
      totalAmount: monthly.reduce((sum, r) => sum + r.amount, 0)
    }
  };
}

// ============================================
// EXPORTAR
// ============================================

module.exports = {
  calculateRefund,
  canClaimDailyRefund,
  canClaimWeeklyRefund,
  canClaimMonthlyRefund,
  recordRefund,
  getUserRefundHistory,
  getRefundStats
};
