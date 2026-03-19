// ============================================
// SINCRONIZACIÓN MASIVA CON JUGAYGANA
// Maneja 100,000+ usuarios
// ============================================

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://admin.agentesadmin.bet/api/admin/';
const PROXY_URL = process.env.PROXY_URL || '';
const PLATFORM_USER = process.env.PLATFORM_USER;
const PLATFORM_PASS = process.env.PLATFORM_PASS;

// Configurar agente proxy
let httpsAgent = null;
if (PROXY_URL) {
  httpsAgent = new HttpsProxyAgent(PROXY_URL);
}

// Cliente HTTP
const client = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  httpsAgent,
  proxy: false,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/x-www-form-urlencoded'
  }
});

function toFormUrlEncoded(data) {
  return Object.keys(data)
    .filter(k => data[k] !== undefined && data[k] !== null)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k]))
    .join('&');
}

function parsePossiblyWrappedJson(data) {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data.substring(data.indexOf('{'), data.lastIndexOf('}') + 1));
  } catch {
    return data;
  }
}

function isHtmlBlocked(data) {
  return typeof data === 'string' && data.trim().startsWith('<');
}

// ============================================
// LOGIN EN JUGAYGANA
// ============================================

async function loginJugaygana() {
  if (!PLATFORM_USER || !PLATFORM_PASS) {
    throw new Error('Faltan PLATFORM_USER o PLATFORM_PASS');
  }

  console.log('🔑 Login en JUGAYGANA...');

  const body = toFormUrlEncoded({
    action: 'LOGIN',
    username: PLATFORM_USER,
    password: PLATFORM_PASS
  });

  const resp = await client.post('', body, { validateStatus: () => true });
  
  let data = parsePossiblyWrappedJson(resp.data);
  if (isHtmlBlocked(data)) {
    throw new Error('Login bloqueado: respuesta HTML');
  }

  if (!data?.token) {
    throw new Error('Login falló: ' + (data?.error || 'No token'));
  }

  const cookie = resp.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ');

  console.log('✅ Login exitoso');
  
  return {
    token: data.token,
    cookie,
    user: data.user,
    parentId: data.user?.user_id
  };
}

// ============================================
// OBTENER TODOS LOS USUARIOS DE JUGAYGANA (paginado)
// ============================================

async function getAllJugayganaUsers(session, options = {}) {
  const { 
    pageSize = 100, 
    maxPages = 1000, // Máximo 1000 páginas = 100K usuarios
    onProgress = null 
  } = options;

  const allUsers = [];
  let page = 1;
  let hasMore = true;
  let consecutiveErrors = 0;
  const maxErrors = 3;

  console.log('📊 Obteniendo usuarios de JUGAYGANA...');

  while (hasMore && page <= maxPages) {
    try {
      const body = toFormUrlEncoded({
        action: 'ShowUsers',
        token: session.token,
        page,
        pagesize: pageSize,
        viewtype: 'tree',
        parentid: session.parentId
      });

      const headers = {};
      if (session.cookie) headers.Cookie = session.cookie;

      const resp = await client.post('', body, { 
        headers, 
        validateStatus: () => true,
        timeout: 60000
      });

      let data = parsePossiblyWrappedJson(resp.data);
      if (isHtmlBlocked(data)) {
        throw new Error('IP bloqueada / respuesta HTML');
      }

      // Intentar extraer usuarios de diferentes formatos
      let users = [];
      if (data.users && Array.isArray(data.users)) {
        users = data.users;
      } else if (data.data && Array.isArray(data.data)) {
        users = data.data;
      } else if (Array.isArray(data)) {
        users = data;
      }

      if (users.length === 0) {
        hasMore = false;
        break;
      }

      allUsers.push(...users);
      consecutiveErrors = 0;

      console.log(`📄 Página ${page}: ${users.length} usuarios (Total: ${allUsers.length})`);

      if (onProgress) {
        onProgress({
          page,
          pageSize: users.length,
          total: allUsers.length,
          percent: Math.min(Math.round((allUsers.length / 100000) * 100), 99)
        });
      }

      // Si recibimos menos del pageSize, es la última página
      if (users.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }

      // Delay para no saturar la API
      if (hasMore) {
        await new Promise(r => setTimeout(r, 500));
      }

    } catch (error) {
      console.error(`❌ Error en página ${page}:`, error.message);
      consecutiveErrors++;
      
      if (consecutiveErrors >= maxErrors) {
        console.error('❌ Demasiados errores consecutivos, abortando');
        break;
      }
      
      // Esperar antes de reintentar
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`✅ Total usuarios obtenidos: ${allUsers.length}`);
  
  return {
    users: allUsers,
    totalPages: page,
    totalUsers: allUsers.length
  };
}

// ============================================
// CARGAR USUARIOS LOCALES (JSON o MongoDB)
// ============================================

function loadLocalUsers() {
  const DATA_DIR = process.env.VERCEL ? '/tmp/data' : './data';
  const USERS_FILE = path.join(DATA_DIR, 'users.json');

  try {
    if (!fs.existsSync(USERS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error cargando usuarios locales:', error.message);
    return [];
  }
}

function saveLocalUsers(users) {
  const DATA_DIR = process.env.VERCEL ? '/tmp/data' : './data';
  const USERS_FILE = path.join(DATA_DIR, 'users.json');

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error guardando usuarios:', error.message);
  }
}

// ============================================
// LOG DE SINCRONIZACIÓN
// ============================================

const SYNC_LOG_FILE = path.join(process.env.VERCEL ? '/tmp/data' : './data', 'sync-log.json');

function loadSyncLog() {
  try {
    if (!fs.existsSync(SYNC_LOG_FILE)) {
      return { 
        lastSync: null, 
        totalSynced: 0, 
        lastResult: null,
        inProgress: false,
        inProgressStartedAt: null
      };
    }
    return JSON.parse(fs.readFileSync(SYNC_LOG_FILE, 'utf8'));
  } catch {
    return { 
      lastSync: null, 
      totalSynced: 0, 
      lastResult: null,
      inProgress: false,
      inProgressStartedAt: null
    };
  }
}

function saveSyncLog(log) {
  try {
    const DATA_DIR = process.env.VERCEL ? '/tmp/data' : './data';
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SYNC_LOG_FILE, JSON.stringify(log, null, 2));
  } catch (error) {
    console.error('Error guardando log:', error.message);
  }
}

// ============================================
// SINCRONIZAR TODOS LOS USUARIOS
// ============================================

async function syncAllUsers(onProgress = null) {
  const startTime = Date.now();
  const stats = {
    total: 0,
    created: 0,
    skipped: 0,
    errors: 0,
    errorsList: []
  };

  console.log('🚀 Iniciando sincronización masiva...');

  try {
    // 1. Login
    const session = await loginJugaygana();

    // 2. Obtener todos los usuarios de JUGAYGANA
    const jugayganaResult = await getAllJugayganaUsers(session, {
      pageSize: 100,
      maxPages: 1000,
      onProgress
    });

    const jugayganaUsers = jugayganaResult.users;
    stats.total = jugayganaUsers.length;

    // 3. Cargar usuarios locales
    const localUsers = loadLocalUsers();
    const localUsernames = new Set(localUsers.map(u => u.username.toLowerCase()));

    console.log(`📊 Usuarios locales: ${localUsers.length}`);
    console.log(`📊 Usuarios JUGAYGANA: ${jugayganaUsers.length}`);

    // 4. Procesar cada usuario
    for (let i = 0; i < jugayganaUsers.length; i++) {
      const jgUser = jugayganaUsers[i];
      const username = jgUser.user_name || jgUser.username;
      
      if (!username) {
        console.log(`⚠️ Usuario sin username, saltando`);
        continue;
      }

      // Verificar si ya existe localmente
      if (localUsernames.has(username.toLowerCase())) {
        stats.skipped++;
        
        // Actualizar el link con JUGAYGANA
        const localIndex = localUsers.findIndex(u => 
          u.username.toLowerCase() === username.toLowerCase()
        );
        if (localIndex !== -1) {
          localUsers[localIndex].jugayganaUserId = jgUser.user_id || jgUser.id;
          localUsers[localIndex].jugayganaUsername = username;
          localUsers[localIndex].jugayganaSyncStatus = 'linked';
        }
        continue;
      }

      // Crear nuevo usuario local
      try {
        const newUser = {
          id: require('uuid').v4(),
          username: username,
          password: await require('bcryptjs').hash('asd123', 10), // Contraseña por defecto
          email: jgUser.user_email || null,
          phone: jgUser.user_phone || null,
          role: 'user',
          accountNumber: `ACC${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
          balance: 0,
          createdAt: new Date().toISOString(),
          lastLogin: null,
          isActive: true,
          jugayganaUserId: jgUser.user_id || jgUser.id,
          jugayganaUsername: username,
          jugayganaSyncStatus: 'synced',
          source: 'jugaygana'
        };

        localUsers.push(newUser);
        localUsernames.add(username.toLowerCase());
        stats.created++;

        console.log(`✅ Creado: ${username}`);

        // Guardar cada 100 usuarios
        if (stats.created % 100 === 0) {
          saveLocalUsers(localUsers);
          console.log(`💾 Guardados ${stats.created} nuevos usuarios`);
        }

        // Delay para no saturar
        await new Promise(r => setTimeout(r, 50));

      } catch (error) {
        stats.errors++;
        stats.errorsList.push({ username, error: error.message });
        console.error(`❌ Error creando ${username}:`, error.message);
      }

      // Reportar progreso
      if (onProgress && i % 100 === 0) {
        onProgress({
          percent: Math.round((i / jugayganaUsers.length) * 100),
          processed: i,
          total: jugayganaUsers.length,
          created: stats.created,
          skipped: stats.skipped
        });
      }
    }

    // Guardar usuarios finales
    saveLocalUsers(localUsers);

    // Guardar log
    const syncLog = loadSyncLog();
    syncLog.lastSync = new Date().toISOString();
    syncLog.totalSynced = (syncLog.totalSynced || 0) + stats.created;
    syncLog.lastResult = stats;
    saveSyncLog(syncLog);

    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log('✅ Sincronización completada');
    console.log(`⏱️  Duración: ${duration}s`);
    console.log(`📊 Total: ${stats.total}`);
    console.log(`✅ Creados: ${stats.created}`);
    console.log(`⏭️  Saltados: ${stats.skipped}`);
    console.log(`❌ Errores: ${stats.errors}`);

    return {
      success: true,
      duration,
      ...stats
    };

  } catch (error) {
    console.error('❌ Error en sincronización:', error.message);
    
    // Guardar log de error
    const syncLog = loadSyncLog();
    syncLog.lastError = error.message;
    syncLog.lastErrorAt = new Date().toISOString();
    saveSyncLog(syncLog);

    return {
      success: false,
      error: error.message,
      ...stats
    };
  }
}

// ============================================
// SINCRONIZAR USUARIOS RECIENTES (últimos N)
// ============================================

async function syncRecentUsers(count = 100) {
  console.log(`🔄 Sincronizando últimos ${count} usuarios...`);

  try {
    const session = await loginJugaygana();
    
    // Obtener solo las últimas páginas
    const jugayganaResult = await getAllJugayganaUsers(session, {
      pageSize: count,
      maxPages: 1
    });

    const jugayganaUsers = jugayganaResult.users;
    const localUsers = loadLocalUsers();
    const localUsernames = new Set(localUsers.map(u => u.username.toLowerCase()));

    let created = 0;
    let skipped = 0;

    for (const jgUser of jugayganaUsers) {
      const username = jgUser.user_name || jgUser.username;
      
      if (!username) continue;

      if (localUsernames.has(username.toLowerCase())) {
        skipped++;
        continue;
      }

      const newUser = {
        id: require('uuid').v4(),
        username: username,
        password: await require('bcryptjs').hash('asd123', 10),
        email: jgUser.user_email || null,
        phone: jgUser.user_phone || null,
        role: 'user',
        accountNumber: `ACC${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
        balance: 0,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        isActive: true,
        jugayganaUserId: jgUser.user_id || jgUser.id,
        jugayganaUsername: username,
        jugayganaSyncStatus: 'synced',
        source: 'jugaygana'
      };

      localUsers.push(newUser);
      created++;
    }

    saveLocalUsers(localUsers);

    return {
      success: true,
      created,
      skipped,
      total: jugayganaUsers.length
    };

  } catch (error) {
    console.error('❌ Error:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// EXPORTAR
// ============================================

module.exports = {
  syncAllUsers,
  syncRecentUsers,
  getAllJugayganaUsers,
  loginJugaygana,
  loadSyncLog,
  saveSyncLog
};
