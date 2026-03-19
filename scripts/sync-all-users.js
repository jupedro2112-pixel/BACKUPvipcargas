#!/usr/bin/env node

// ============================================
// SCRIPT DE SINCRONIZACIÓN MASIVA
// Ejecutar: node scripts/sync-all-users.js
// ============================================

require('dotenv').config();

const jugayganaSync = require('../jugaygana-sync');

async function main() {
  console.log('🚀 ==========================================');
  console.log('🚀 SINCRONIZACIÓN MASIVA JUGAYGANA');
  console.log('🚀 ==========================================');
  console.log('');

  // Verificar variables de entorno
  if (!process.env.PLATFORM_USER || !process.env.PLATFORM_PASS) {
    console.error('❌ Error: Faltan PLATFORM_USER o PLATFORM_PASS');
    console.log('');
    console.log('Por favor, crea un archivo .env con:');
    console.log('  PLATFORM_USER=tu_usuario_jugaygana');
    console.log('  PLATFORM_PASS=tu_contraseña_jugaygana');
    console.log('  PROXY_URL=http://esruunltresidential-AR-rotate:oef27c64xo9p@p.webshare.io:80');
    console.log('  MONGODB_URI=mongodb+srv://... (opcional)');
    process.exit(1);
  }

  console.log('📋 Configuración:');
  console.log(`  - Usuario: ${process.env.PLATFORM_USER}`);
  console.log(`  - Proxy: ${process.env.PROXY_URL ? 'Sí' : 'No'}`);
  console.log(`  - MongoDB: ${process.env.MONGODB_URI ? 'Sí' : 'No (JSON local)'}`);
  console.log('');

  // Confirmar
  console.log('⚠️  Este proceso puede tardar 30-60 minutos para 100K usuarios');
  console.log('');

  // Iniciar sincronización
  const startTime = Date.now();

  const result = await jugayganaSync.syncAllUsers((progress) => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const eta = progress.percent > 0 
      ? Math.round((elapsed / progress.percent) * (100 - progress.percent))
      : '?';
    
    console.log(
      `📊 ${progress.percent}% | ` +
      `Procesados: ${progress.processed}/${progress.total} | ` +
      `Creados: ${progress.created} | ` +
      `Saltados: ${progress.skipped} | ` +
      `ETA: ${eta}s`
    );
  });

  console.log('');
  console.log('✅ ==========================================');
  console.log('✅ SINCRONIZACIÓN COMPLETADA');
  console.log('✅ ==========================================');
  console.log('');
  console.log('Resultados:');
  console.log(`  - Total procesados: ${result.total}`);
  console.log(`  - Usuarios creados: ${result.created}`);
  console.log(`  - Usuarios saltados: ${result.skipped}`);
  console.log(`  - Errores: ${result.errors}`);
  console.log(`  - Duración: ${result.duration}s`);
  console.log('');

  if (result.errors > 0 && result.errorsList) {
    console.log('⚠️  Errores encontrados:');
    result.errorsList.slice(0, 10).forEach(e => {
      console.log(`     - ${e.username}: ${e.error}`);
    });
    if (result.errorsList.length > 10) {
      console.log(`     ... y ${result.errorsList.length - 10} más`);
    }
    console.log('');
  }

  process.exit(result.success ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Error fatal:', error.message);
  process.exit(1);
});
