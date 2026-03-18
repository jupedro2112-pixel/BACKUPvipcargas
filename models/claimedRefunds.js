// Modelo para trackear reembolsos reclamados
const mongoose = require('mongoose');

// Schema para reembolsos reclamados
const ClaimedRefundSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    type: { type: String, required: true, enum: ['daily', 'weekly', 'monthly'] },
    amount: { type: Number, required: true },
    deposits: { type: Number, default: 0 },
    withdrawals: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    claimedAt: { type: Date, default: Date.now },
    periodStart: { type: Date },
    periodEnd: { type: Date }
});

// Índice compuesto para evitar reclamos duplicados del mismo tipo en el mismo período
ClaimedRefundSchema.index({ userId: 1, type: 1, periodStart: 1 }, { unique: true });

const ClaimedRefund = mongoose.model('ClaimedRefund', ClaimedRefundSchema);

// Verificar si un usuario ya reclamó un reembolso en un período específico
async function hasClaimedRefund(userId, type, periodStart) {
    try {
        const claimed = await ClaimedRefund.findOne({
            userId,
            type,
            periodStart: new Date(periodStart)
        });
        return !!claimed;
    } catch (error) {
        console.error('Error verificando reembolso reclamado:', error);
        return false;
    }
}

// Registrar un reembolso reclamado
async function recordClaimedRefund(userId, username, type, amount, deposits, withdrawals, netAmount, periodStart, periodEnd) {
    try {
        const claimedRefund = new ClaimedRefund({
            userId,
            username,
            type,
            amount,
            deposits: deposits || 0,
            withdrawals: withdrawals || 0,
            netAmount: netAmount || 0,
            periodStart: periodStart ? new Date(periodStart) : null,
            periodEnd: periodEnd ? new Date(periodEnd) : null,
            claimedAt: new Date()
        });
        
        await claimedRefund.save();
        console.log(`✅ Reembolso ${type} registrado para ${username}: $${amount}`);
        return claimedRefund;
    } catch (error) {
        // Si es error de duplicado, el reembolso ya fue reclamado
        if (error.code === 11000) {
            console.log(`⚠️ Reembolso ${type} ya fue reclamado por ${username} en este período`);
            return null;
        }
        console.error('Error registrando reembolso reclamado:', error);
        throw error;
    }
}

// Obtener reembolsos reclamados por usuario
async function getUserClaimedRefunds(userId, limit = 50) {
    try {
        return await ClaimedRefund.find({ userId })
            .sort({ claimedAt: -1 })
            .limit(limit);
    } catch (error) {
        console.error('Error obteniendo reembolsos reclamados:', error);
        return [];
    }
}

// Obtener último reembolso reclamado de un tipo específico
async function getLastClaimedRefund(userId, type) {
    try {
        return await ClaimedRefund.findOne({ userId, type })
            .sort({ claimedAt: -1 });
    } catch (error) {
        console.error('Error obteniendo último reembolso:', error);
        return null;
    }
}

module.exports = {
    ClaimedRefund,
    hasClaimedRefund,
    recordClaimedRefund,
    getUserClaimedRefunds,
    getLastClaimedRefund
};
