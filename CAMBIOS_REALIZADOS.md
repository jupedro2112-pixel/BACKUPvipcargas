# Cambios Realizados - Sistema de Reembolsos

## Resumen
Se implementó la verificación en MongoDB para evitar que los usuarios reclamen reembolsos múltiples, igual que funciona el sistema de fueguito.

## Archivos Modificados

### 1. `/database.js` - NUEVO ARCHIVO
- Creado modelo `Refund` con schema completo para MongoDB
- Agregados índices para búsquedas rápidas: `userId + type + date`
- Incluye campos: `id, userId, username, type, amount, netAmount, deposits, withdrawals, date, status`

### 2. `/models/refunds.js` - COMPLETAMENTE REESCRITO
**Nuevas funciones de verificación en MongoDB:**

- `hasClaimedDailyToday(userId)` - Verifica si ya existe un reembolso diario para hoy en MongoDB
- `hasClaimedWeeklyThisWeek(userId)` - Verifica si ya existe un reembolso semanal esta semana
- `hasClaimedMonthlyThisMonth(userId)` - Verifica si ya existe un reembolso mensual este mes

**Funciones actualizadas:**

- `canClaimDailyRefund(userId)` - Ahora verifica primero en MongoDB antes de permitir reclamo
- `canClaimWeeklyRefund(userId)` - Verifica en MongoDB + validación de día (lunes/martes)
- `canClaimMonthlyRefund(userId)` - Verifica en MongoDB + validación de día (del 7 en adelante)
- `recordRefund()` - Ahora guarda en MongoDB y en archivo local

**Características:**
- Usa hora Argentina (GMT-3) para todas las verificaciones de fecha
- Fallback a archivo local si MongoDB no está conectado
- Mensajes descriptivos cuando ya se reclamó un reembolso

### 3. `/server.js` - SCHEMA ACTUALIZADO
- Actualizado el schema de `refundSchema` para coincidir con el de database.js
- Agregados índices para búsquedas rápidas
- El resto del archivo permanece igual (las rutas ya usaban el módulo refunds.js correctamente)

## Cómo Funciona el Bloqueo

### Flujo de Reclamo Diario:
1. Usuario hace clic en "Reclamar Reembolso Diario"
2. El sistema verifica en MongoDB si ya existe un registro con:
   - `userId` = ID del usuario
   - `type` = 'daily'
   - `date` entre inicio y fin del día actual (hora Argentina)
3. Si existe → Bloquea con mensaje: "Ya reclamaste tu reembolso diario hoy. Vuelve mañana!"
4. Si no existe → Permite el reclamo y guarda el registro en MongoDB

### Flujo de Reclamo Semanal:
1. Verifica si es lunes o martes
2. Verifica en MongoDB si ya existe un registro con:
   - `userId` = ID del usuario
   - `type` = 'weekly'
   - `date` >= inicio de la semana actual
3. Si existe → Bloquea con mensaje de próximo lunes
4. Si no existe → Permite el reclamo

### Flujo de Reclamo Mensual:
1. Verifica si es día 7 o posterior
2. Verifica en MongoDB si ya existe un registro con:
   - `userId` = ID del usuario
   - `type` = 'monthly'
   - `date` >= inicio del mes actual
3. Si existe → Bloquea con mensaje de próximo mes
4. Si no existe → Permite el reclamo

## Comparación con Fueguito

El sistema de fueguito ya funcionaba así:
- Usa el modelo `FireReward` en MongoDB
- Verifica `lastClaim` contra la fecha actual
- Si ya reclamó hoy → devuelve error: "Ya reclamaste tu fueguito hoy"

Ahora los reembolsos funcionan exactamente igual:
- Usan el modelo `Refund` en MongoDB
- Verifican si existe un registro para el período actual
- Si ya existe → bloquean el reclamo
- Si no existe → permiten el reclamo y guardan el registro

## Testing

Para probar el sistema:

1. **Reclamo único:**
   - Reclamar reembolso diario → Debería funcionar
   - Intentar reclamar de nuevo → Debería bloquear con mensaje

2. **Verificación en MongoDB:**
   - Revisar colección `refunds` en MongoDB
   - Debería aparecer un documento con los datos del reembolso

3. **Cambio de día:**
   - Esperar al día siguiente (o modificar fecha del sistema)
   - Intentar reclamar → Debería permitir

## Notas Técnicas

- Las fechas se manejan en hora Argentina (GMT-3)
- Si MongoDB no está disponible, el sistema usa archivo local como fallback
- Los índices en MongoDB aseguran búsquedas rápidas incluso con muchos registros
- El bloqueo es por usuario + tipo + período (día/semana/mes)
