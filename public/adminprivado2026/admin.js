// ============================================
// PANEL DE ADMINISTRACIÓN - JAVASCRIPT
// ============================================

// API URL
const API_URL = window.location.origin;

// Estado global
let currentUser = null;
let authToken = null;
let currentSection = 'dashboard';
let users = [];
let chats = [];
let currentChat = null;
let messages = [];
let messageInterval = null;
let statsInterval = null;

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Verificar sesión
  const savedToken = localStorage.getItem('adminToken');
  const savedUser = localStorage.getItem('adminUser');

  if (savedToken && savedUser) {
    authToken = savedToken;
    currentUser = JSON.parse(savedUser);
    showDashboard();
    loadStats();
    startStatsPolling();
  } else {
    showLogin();
  }

  // Event listeners
  setupEventListeners();
});

function setupEventListeners() {
  // Navegación
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      if (section) {
        switchSection(section);
      }
    });
  });

  // Menú móvil
  document.querySelector('.menu-toggle')?.addEventListener('click', toggleSidebar);

  // Cerrar modales
  document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el) {
        closeAllModals();
      }
    });
  });
}

// ============================================
// AUTENTICACIÓN
// ============================================

function showLogin() {
  document.getElementById('loginSection').classList.add('active');
  document.getElementById('dashboardSection').classList.remove('active');
  document.querySelector('.sidebar').style.display = 'none';
  document.querySelector('.main-content').style.display = 'none';
}

function showDashboard() {
  document.getElementById('loginSection').classList.remove('active');
  document.getElementById('dashboardSection').classList.add('active');
  document.querySelector('.sidebar').style.display = 'block';
  document.querySelector('.main-content').style.display = 'block';
  
  // Actualizar info de usuario
  if (currentUser) {
    document.querySelector('.user-name').textContent = currentUser.username;
    document.querySelector('.user-role').textContent = currentUser.role;
    document.querySelector('.user-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      // Verificar que sea admin
      if (data.user.role !== 'admin' && data.user.role !== 'depositor' && data.user.role !== 'withdrawer') {
        showToast('No tienes permisos de administrador', 'error');
        return;
      }

      authToken = data.token;
      currentUser = data.user;
      
      localStorage.setItem('adminToken', authToken);
      localStorage.setItem('adminUser', JSON.stringify(currentUser));
      
      showToast('¡Bienvenido!', 'success');
      showDashboard();
      loadStats();
      startStatsPolling();
    } else {
      showToast(data.error || 'Error al iniciar sesión', 'error');
    }
  } catch (error) {
    showToast('Error de conexión', 'error');
  }
}

function logout() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUser');
  authToken = null;
  currentUser = null;
  
  stopStatsPolling();
  stopMessagePolling();
  
  showLogin();
  showToast('Sesión cerrada', 'info');
}

// ============================================
// NAVEGACIÓN
// ============================================

function switchSection(section) {
  currentSection = section;
  
  // Actualizar navegación
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.section === section) {
      item.classList.add('active');
    }
  });

  // Actualizar título
  const titles = {
    dashboard: 'Dashboard',
    chats: 'Chat de Soporte',
    users: 'Gestión de Usuarios',
    transactions: 'Transacciones',
    settings: 'Configuración'
  };
  document.querySelector('.header-title').textContent = titles[section] || section;

  // Mostrar sección
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`${section}Section`)?.classList.add('active');

  // Cargar datos específicos
  switch (section) {
    case 'dashboard':
      loadStats();
      break;
    case 'chats':
      loadChats();
      startMessagePolling();
      break;
    case 'users':
      loadUsers();
      stopMessagePolling();
      break;
    case 'transactions':
      loadTransactions();
      stopMessagePolling();
      break;
    case 'settings':
      loadSettings();
      stopMessagePolling();
      break;
  }

  // Cerrar sidebar en móvil
  document.querySelector('.sidebar')?.classList.remove('open');
}

function toggleSidebar() {
  document.querySelector('.sidebar')?.classList.toggle('open');
}

// ============================================
// DASHBOARD
// ============================================

async function loadStats() {
  try {
    const response = await fetch(`${API_URL}/api/admin/stats`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (response.ok) {
      const stats = await response.json();
      updateStatsDisplay(stats);
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

function updateStatsDisplay(stats) {
  document.getElementById('statTotalUsers').textContent = stats.totalUsers || 0;
  document.getElementById('statOnlineUsers').textContent = stats.onlineUsers || 0;
  document.getElementById('statUnreadMessages').textContent = stats.unreadMessages || 0;
  document.getElementById('statTotalBalance').textContent = `$${(stats.totalBalance || 0).toLocaleString()}`;
  
  // Actualizar badge de mensajes
  const chatBadge = document.querySelector('.nav-item[data-section="chats"] .nav-badge');
  if (chatBadge) {
    chatBadge.textContent = stats.unreadMessages || 0;
    chatBadge.style.display = stats.unreadMessages > 0 ? 'block' : 'none';
  }
}

function startStatsPolling() {
  loadStats();
  statsInterval = setInterval(loadStats, 10000);
}

function stopStatsPolling() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

// ============================================
// CHATS
// ============================================

let currentChatTab = 'open';

async function loadChats() {
  try {
    const response = await fetch(`${API_URL}/api/admin/chats/${currentChatTab}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (response.ok) {
      chats = await response.json();
      renderChatList();
    }
  } catch (error) {
    console.error('Error loading chats:', error);
  }
}

function renderChatList() {
  const container = document.getElementById('chatList');
  
  if (chats.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No hay chats ${currentChatTab === 'open' ? 'abiertos' : 'cerrados'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = chats.map(chat => {
    const time = chat.lastMessage ? new Date(chat.lastMessage.timestamp).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    }) : '';
    
    const preview = chat.lastMessage ? 
      (chat.lastMessage.content.length > 30 ? 
        chat.lastMessage.content.substring(0, 30) + '...' : 
        chat.lastMessage.content) : 
      'Sin mensajes';

    return `
      <div class="chat-item ${chat.unreadCount > 0 ? 'unread' : ''} ${currentChat?.userId === chat.userId ? 'active' : ''}" 
           onclick="openChat('${chat.userId}')">
        <div class="chat-avatar">${chat.username.charAt(0).toUpperCase()}</div>
        <div class="chat-info">
          <div class="chat-name">
            ${chat.username}
            ${chat.assignedTo ? `<span class="badge badge-info">${chat.assignedTo}</span>` : ''}
          </div>
          <div class="chat-preview">${escapeHtml(preview)}</div>
        </div>
        <div class="chat-meta">
          <div class="chat-time">${time}</div>
          ${chat.unreadCount > 0 ? `<span class="chat-badge">${chat.unreadCount}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function switchChatTab(tab) {
  currentChatTab = tab;
  
  document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  loadChats();
}

async function openChat(userId) {
  const chat = chats.find(c => c.userId === userId);
  if (!chat) return;

  currentChat = chat;
  renderChatList();

  // Actualizar header del chat
  document.getElementById('chatUserName').textContent = chat.username;
  document.getElementById('chatUserId').textContent = `ID: ${chat.userId}`;

  // Cargar mensajes
  await loadMessages(userId);
  
  // Marcar como leído
  if (chat.unreadCount > 0) {
    fetch(`${API_URL}/api/messages/read/${userId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    chat.unreadCount = 0;
    renderChatList();
  }
}

async function loadMessages(userId) {
  try {
    const response = await fetch(`${API_URL}/api/messages/${userId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (response.ok) {
      messages = await response.json();
      renderMessages();
    }
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

function renderMessages() {
  const container = document.getElementById('chatMessages');
  
  if (messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No hay mensajes aún</p>
      </div>
    `;
    return;
  }

  container.innerHTML = messages.map(msg => {
    const isSent = msg.senderRole === 'admin' || msg.senderRole === 'depositor' || msg.senderRole === 'withdrawer';
    const time = new Date(msg.timestamp).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="message ${isSent ? 'sent' : 'received'}">
        <div class="message-content">${escapeHtml(msg.content)}</div>
        <div class="message-time">${time}</div>
      </div>
    `;
  }).join('');

  // Scroll al final
  container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
  if (!currentChat) return;

  const input = document.getElementById('messageInput');
  const content = input.value.trim();

  if (!content) return;

  try {
    const response = await fetch(`${API_URL}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        content,
        receiverId: currentChat.userId
      })
    });

    if (response.ok) {
      input.value = '';
      await loadMessages(currentChat.userId);
    } else {
      showToast('Error al enviar mensaje', 'error');
    }
  } catch (error) {
    showToast('Error de conexión', 'error');
  }
}

function handleChatKeyPress(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

async function closeChat() {
  if (!currentChat) return;

  try {
    const response = await fetch(`${API_URL}/api/admin/chats/${currentChat.userId}/close`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (response.ok) {
      showToast('Chat cerrado', 'success');
      currentChat = null;
      loadChats();
      
      // Limpiar mensajes
      document.getElementById('chatMessages').innerHTML = `
        <div class="empty-state">
          <p>Selecciona un chat para ver los mensajes</p>
        </div>
      `;
      document.getElementById('chatUserName').textContent = 'Selecciona un chat';
      document.getElementById('chatUserId').textContent = '';
    }
  } catch (error) {
    showToast('Error al cerrar chat', 'error');
  }
}

function startMessagePolling() {
  if (currentSection === 'chats') {
    loadChats();
    messageInterval = setInterval(() => {
      if (currentSection === 'chats') {
        loadChats();
        if (currentChat) {
          loadMessages(currentChat.userId);
        }
      }
    }, 3000);
  }
}

function stopMessagePolling() {
  if (messageInterval) {
    clearInterval(messageInterval);
    messageInterval = null;
  }
}

// ============================================
// USUARIOS
// ============================================

async function loadUsers() {
  try {
    const response = await fetch(`${API_URL}/api/users`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (response.ok) {
      users = await response.json();
      renderUsersTable();
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

function renderUsersTable() {
  const container = document.getElementById('usersTableBody');
  const searchTerm = document.getElementById('userSearch')?.value.toLowerCase() || '';
  
  let filteredUsers = users;
  if (searchTerm) {
    filteredUsers = users.filter(u => 
      u.username.toLowerCase().includes(searchTerm) ||
      u.email?.toLowerCase().includes(searchTerm) ||
      u.accountNumber?.toLowerCase().includes(searchTerm)
    );
  }

  if (filteredUsers.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          <p>No se encontraron usuarios</p>
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = filteredUsers.map(user => `
    <tr>
      <td>
        <strong>${escapeHtml(user.username)}</strong>
        ${user.jugayganaUserId ? '<span class="badge badge-success">JUGAYGANA</span>' : ''}
      </td>
      <td>${user.email || '-'}</td>
      <td>${user.accountNumber || '-'}</td>
      <td><span class="badge badge-${user.role}">${user.role}</span></td>
      <td>$${(user.balance || 0).toLocaleString()}</td>
      <td>
        <div class="actions">
          <button class="action-btn edit" onclick="editUser('${user.id}')" title="Editar">
            ✏️
          </button>
          <button class="action-btn delete" onclick="deleteUser('${user.id}')" title="Eliminar">
            🗑️
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function searchUsers() {
  renderUsersTable();
}

function openAddUserModal() {
  document.getElementById('userModalTitle').textContent = 'Nuevo Usuario';
  document.getElementById('userForm').reset();
  document.getElementById('userId').value = '';
  openModal('userModal');
}

async function editUser(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('userModalTitle').textContent = 'Editar Usuario';
  document.getElementById('userId').value = user.id;
  document.getElementById('userUsername').value = user.username;
  document.getElementById('userEmail').value = user.email || '';
  document.getElementById('userPhone').value = user.phone || '';
  document.getElementById('userRole').value = user.role;
  document.getElementById('userBalance').value = user.balance || 0;
  document.getElementById('userPassword').value = '';
  
  openModal('userModal');
}

async function saveUser(e) {
  e.preventDefault();

  const userId = document.getElementById('userId').value;
  const userData = {
    username: document.getElementById('userUsername').value,
    email: document.getElementById('userEmail').value,
    phone: document.getElementById('userPhone').value,
    role: document.getElementById('userRole').value,
    balance: parseFloat(document.getElementById('userBalance').value) || 0
  };

  const password = document.getElementById('userPassword').value;
  if (password) {
    userData.password = password;
  }

  try {
    const url = userId 
      ? `${API_URL}/api/users/${userId}`
      : `${API_URL}/api/users`;
    
    const method = userId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(userData)
    });

    if (response.ok) {
      closeModal('userModal');
      showToast(userId ? 'Usuario actualizado' : 'Usuario creado', 'success');
      loadUsers();
    } else {
      const data = await response.json();
      showToast(data.error || 'Error al guardar usuario', 'error');
    }
  } catch (error) {
    showToast('Error de conexión', 'error');
  }
}

async function deleteUser(userId) {
  if (!confirm('¿Estás seguro de eliminar este usuario?')) return;

  try {
    const response = await fetch(`${API_URL}/api/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (response.ok) {
      showToast('Usuario eliminado', 'success');
      loadUsers();
    } else {
      const data = await response.json();
      showToast(data.error || 'Error al eliminar usuario', 'error');
    }
  } catch (error) {
    showToast('Error de conexión', 'error');
  }
}

// ============================================
// TRANSACCIONES
// ============================================

async function loadTransactions() {
  // Implementar carga de transacciones
  document.getElementById('transactionsTableBody').innerHTML = `
    <tr>
      <td colspan="6" class="empty-state">
        <p>Próximamente...</p>
      </td>
    </tr>
  `;
}

// ============================================
// CONFIGURACIÓN
// ============================================

async function loadSettings() {
  // Implementar carga de configuración
}

// ============================================
// MODALES
// ============================================

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

// ============================================
// UTILIDADES
// ============================================

function showToast(message, type = 'info') {
  const container = document.querySelector('.toast-container') || createToastContainer();
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// ANIMACIONES CSS
// ============================================

const style = document.createElement('style');
style.textContent = `
  @keyframes toastOut {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100px);
    }
  }
`;
document.head.appendChild(style);
