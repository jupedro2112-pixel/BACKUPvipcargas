// ========================================
// PANEL DE ADMINISTRACIÓN - SALA DE JUEGOS
// ========================================

const API_URL = '';
let socket = null;
let currentAdmin = null;
let currentToken = localStorage.getItem('adminToken');
let selectedUserId = null;
let conversations = [];
let users = [];
let messages = [];
let messagePollingInterval = null;
let balanceUpdateInterval = null;

// ========================================
// INICIALIZACIÓN
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('Admin JS cargado, token:', currentToken ? 'existe' : 'no existe');
    
    if (currentToken) {
        verifyToken();
    } else {
        showLoginScreen();
    }
    
    setupEventListeners();
});

function setupEventListeners() {
    // Login - USAR CLICK DIRECTO EN EL BOTÓN
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Botón login clickeado');
            handleLogin();
        };
    }
    
    // Enter en password también hace login
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.onkeydown = function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        };
    }
    
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Navegación
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            showSection(section);
        });
    });
    
    // Chats
    document.getElementById('refreshChats').addEventListener('click', loadConversations);
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    document.getElementById('viewUserBtn').addEventListener('click', () => {
        if (selectedUserId) {
            viewUserDetails(selectedUserId);
        }
    });
    
    // Adjuntar archivo
    document.getElementById('attachFileBtn').addEventListener('click', () => {
        document.getElementById('adminFileInput').click();
    });
    document.getElementById('adminFileInput').addEventListener('change', handleFileUpload);
    
    // Depósito/Retiro desde admin
    document.getElementById('depositUserBtn').addEventListener('click', () => {
        if (selectedUserId) {
            showModal('adminDepositModal');
        } else {
            showToast('Selecciona un usuario primero', 'error');
        }
    });
    document.getElementById('withdrawUserBtn').addEventListener('click', () => {
        if (selectedUserId) {
            showModal('adminWithdrawModal');
        } else {
            showToast('Selecciona un usuario primero', 'error');
        }
    });
    document.getElementById('closeAdminDepositModal').addEventListener('click', () => hideModal('adminDepositModal'));
    document.getElementById('cancelAdminDeposit').addEventListener('click', () => hideModal('adminDepositModal'));
    document.getElementById('adminDepositForm').addEventListener('submit', handleAdminDeposit);
    document.getElementById('closeAdminWithdrawModal').addEventListener('click', () => hideModal('adminWithdrawModal'));
    document.getElementById('cancelAdminWithdraw').addEventListener('click', () => hideModal('adminWithdrawModal'));
    document.getElementById('adminWithdrawForm').addEventListener('submit', handleAdminWithdraw);
    
    // Buscador de chats
    document.getElementById('chatSearch').addEventListener('input', (e) => {
        filterConversations(e.target.value);
    });
    
    // Crear usuario
    document.getElementById('createUserBtn').addEventListener('click', openCreateUserModal);
    document.getElementById('closeCreateModal').addEventListener('click', () => hideModal('createUserModal'));
    document.getElementById('cancelCreate').addEventListener('click', () => hideModal('createUserModal'));
    document.getElementById('createUserForm').addEventListener('submit', handleCreateUser);
    
    // Editar usuario
    document.getElementById('closeViewModal').addEventListener('click', () => hideModal('viewUserModal'));
    document.getElementById('closeViewBtn').addEventListener('click', () => hideModal('viewUserModal'));
    document.getElementById('editUserBtn').addEventListener('click', () => {
        hideModal('viewUserModal');
        openEditUserModal();
    });
    
    // Edit User Modal
    document.getElementById('closeEditModal').addEventListener('click', () => {
        hideModal('editUserModal');
    });
    document.getElementById('cancelEdit').addEventListener('click', () => {
        hideModal('editUserModal');
    });
    document.getElementById('editUserForm').addEventListener('submit', handleEditUser);
    
    // Sincronización JUGAYGANA
    document.getElementById('syncAllBtn')?.addEventListener('click', startFullSync);
    document.getElementById('syncRecentBtn')?.addEventListener('click', syncRecentUsers);
    document.getElementById('refreshSyncStatusBtn')?.addEventListener('click', loadSyncStatus);
}

// ========================================
// AUTENTICACIÓN
// ========================================

async function handleLogin() {
    console.log('handleLogin llamado');
    
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorDiv = document.getElementById('loginError');
    
    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    
    console.log('Intentando login con usuario:', username);
    
    if (!username || !password) {
        errorDiv.textContent = 'Ingresa usuario y contraseña';
        errorDiv.classList.add('show');
        return;
    }
    
    errorDiv.classList.remove('show');
    
    // Mostrar cargando
    const loginBtn = document.getElementById('loginBtn');
    const originalText = loginBtn ? loginBtn.textContent : 'Ingresar';
    if (loginBtn) {
        loginBtn.textContent = 'Ingresando...';
        loginBtn.disabled = true;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        console.log('Respuesta login:', data);
        
        if (response.ok && data.token) {
            if (data.user.role !== 'admin') {
                errorDiv.textContent = 'Acceso denegado. Solo administradores.';
                errorDiv.classList.add('show');
                if (loginBtn) {
                    loginBtn.textContent = originalText;
                    loginBtn.disabled = false;
                }
                return;
            }
            
            currentToken = data.token;
            currentAdmin = data.user;
            localStorage.setItem('adminToken', currentToken);
            
            showDashboard();
            initializeSocket();
            loadInitialData();
            startMessagePolling();
        } else {
            errorDiv.textContent = data.error || 'Usuario o contraseña incorrectos';
            errorDiv.classList.add('show');
            if (loginBtn) {
                loginBtn.textContent = originalText;
                loginBtn.disabled = false;
            }
        }
    } catch (error) {
        console.error('Error login:', error);
        errorDiv.textContent = 'Error de conexión. Intenta de nuevo.';
        errorDiv.classList.add('show');
        if (loginBtn) {
            loginBtn.textContent = originalText;
            loginBtn.disabled = false;
        }
    }
}

async function verifyToken() {
    try {
        const response = await fetch(`${API_URL}/api/auth/verify`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            // Verificar que sea admin
            if (data.user.role !== 'admin') {
                localStorage.removeItem('adminToken');
                showLoginScreen();
                return;
            }
            currentAdmin = data.user;
            showDashboard();
            initializeSocket();
            loadInitialData();
            startMessagePolling();
        } else {
            localStorage.removeItem('adminToken');
            showLoginScreen();
        }
    } catch (error) {
        localStorage.removeItem('adminToken');
        showLoginScreen();
    }
}

function handleLogout() {
    localStorage.removeItem('adminToken');
    currentToken = null;
    currentAdmin = null;
    stopMessagePolling();
    stopBalanceUpdates();
    showLoginScreen();
}

// ========================================
// UI
// ========================================

function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('adminName').textContent = currentAdmin?.username || 'Admin';
}

function showSection(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${section}Section`).classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`.nav-item[data-section="${section}"]`).classList.add('active');
    
    if (section === 'users') loadUsers();
    if (section === 'chats') loadConversations();
    if (section === 'sync') loadSyncStatus();
}

function showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

// ========================================
// SOCKET
// ========================================

function initializeSocket() {
    // Socket.io no funciona bien en Vercel, usamos polling HTTP
    console.log('Socket inicializado (modo polling)');
}

// ========================================
// DATOS INICIALES
// ========================================

async function loadInitialData() {
    loadUsers();
    loadConversations();
    loadStats();
}

async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/api/admin/stats`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
            document.getElementById('activeUsers').textContent = stats.activeUsers || 0;
            document.getElementById('totalMessages').textContent = stats.totalMessages || 0;
            document.getElementById('onlineUsers').textContent = stats.onlineUsers || 0;
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

// ========================================
// USUARIOS
// ========================================

async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/api/users`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            users = await response.json();
            renderUsers(users);
        }
    } catch (error) {
        console.error('Error cargando usuarios:', error);
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.username}</td>
            <td>${user.email || '-'}</td>
            <td>${user.phone || '-'}</td>
            <td><span class="role-badge ${user.role}">${user.role}</span></td>
            <td><span class="status-badge ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Activo' : 'Inactivo'}</span></td>
            <td>${user.jugayganaSyncStatus === 'synced' ? '✅' : user.jugayganaSyncStatus === 'pending' ? '⏳' : '❌'}</td>
            <td>${new Date(user.createdAt).toLocaleDateString('es-AR')}</td>
            <td>
                <button class="btn btn-small" onclick="viewUserDetails('${user.id}')">👁️</button>
                <button class="btn btn-small" onclick="openEditUserModal('${user.id}')">✏️</button>
            </td>
        </tr>
    `).join('');
}

async function viewUserDetails(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    document.getElementById('viewUsername').textContent = user.username;
    document.getElementById('viewEmail').textContent = user.email || 'No especificado';
    document.getElementById('viewPhone').textContent = user.phone || 'No especificado';
    document.getElementById('viewRole').textContent = user.role;
    document.getElementById('viewStatus').textContent = user.isActive ? 'Activo' : 'Inactivo';
    document.getElementById('viewCreated').textContent = new Date(user.createdAt).toLocaleString('es-AR');
    document.getElementById('viewJugaygana').textContent = user.jugayganaSyncStatus === 'synced' ? 'Sincronizado' : 'No sincronizado';
    
    document.getElementById('editUserBtn').onclick = () => {
        hideModal('viewUserModal');
        openEditUserModal(userId);
    };
    
    showModal('viewUserModal');
}

function openCreateUserModal() {
    document.getElementById('createUserForm').reset();
    showModal('createUserModal');
}

async function handleCreateUser(e) {
    e.preventDefault();
    
    const data = {
        username: document.getElementById('createUsername').value,
        email: document.getElementById('createEmail').value,
        phone: document.getElementById('createPhone').value,
        password: document.getElementById('createPassword').value,
        role: document.getElementById('createRole').value
    };
    
    try {
        const response = await fetch(`${API_URL}/api/admin/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showToast('Usuario creado exitosamente', 'success');
            hideModal('createUserModal');
            loadUsers();
        } else {
            const error = await response.json();
            showToast(error.error || 'Error al crear usuario', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

function openEditUserModal(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editPhone').value = user.phone || '';
    document.getElementById('editRole').value = user.role;
    document.getElementById('editStatus').value = user.isActive ? 'true' : 'false';
    document.getElementById('editPassword').value = '';
    
    showModal('editUserModal');
}

async function handleEditUser(e) {
    e.preventDefault();
    
    const userId = document.getElementById('editUserId').value;
    const data = {
        email: document.getElementById('editEmail').value,
        phone: document.getElementById('editPhone').value,
        role: document.getElementById('editRole').value,
        isActive: document.getElementById('editStatus').value === 'true'
    };
    
    const newPassword = document.getElementById('editPassword').value;
    if (newPassword) {
        data.password = newPassword;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showToast('Usuario actualizado exitosamente', 'success');
            hideModal('editUserModal');
            loadUsers();
        } else {
            const error = await response.json();
            showToast(error.error || 'Error al actualizar usuario', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

// ========================================
// CHATS
// ========================================

async function loadConversations() {
    try {
        const response = await fetch(`${API_URL}/api/conversations`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            conversations = await response.json();
            renderConversations(conversations);
        }
    } catch (error) {
        console.error('Error cargando conversaciones:', error);
    }
}

function renderConversations(conversations) {
    const container = document.getElementById('conversationsList');
    
    if (conversations.length === 0) {
        container.innerHTML = '<div class="empty">No hay conversaciones</div>';
        return;
    }
    
    container.innerHTML = conversations.map(conv => `
        <div class="conversation-item ${conv.unread > 0 ? 'unread' : ''}" data-userid="${conv.userId}">
            <div class="conv-username">${conv.username}</div>
            <div class="conv-preview">${conv.lastMessage ? escapeHtml(conv.lastMessage.substring(0, 30)) : 'Sin mensajes'}</div>
            ${conv.unread > 0 ? `<span class="unread-badge">${conv.unread}</span>` : ''}
        </div>
    `).join('');
    
    // Agregar event listeners
    container.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', () => {
            const userId = item.dataset.userid;
            const username = item.querySelector('.conv-username').textContent;
            selectConversation(userId, username);
        });
    });
}

function filterConversations(query) {
    const filtered = conversations.filter(c => 
        c.username.toLowerCase().includes(query.toLowerCase())
    );
    renderConversations(filtered);
}

async function selectConversation(userId, username) {
    selectedUserId = userId;
    
    // Actualizar UI
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeItem = document.querySelector(`.conversation-item[data-userid="${userId}"]`);
    if (activeItem) activeItem.classList.add('active');
    
    // Cargar mensajes
    await loadMessages(userId);
    
    // Mostrar área de chat
    document.getElementById('chatPlaceholder').classList.add('hidden');
    document.getElementById('chatContent').classList.remove('hidden');
    
    // Actualizar info del usuario
    document.getElementById('chatUserName').textContent = username;
    
    // Buscar usuario para obtener más info
    const user = users.find(u => u.id === userId);
    if (user) {
        document.getElementById('chatUserStatus').textContent = user.isActive ? 'Activo' : 'Inactivo';
        document.getElementById('chatUserStatus').className = `user-status ${user.isActive ? 'online' : 'offline'}`;
    }
    
    // Iniciar polling de mensajes y balance en tiempo real
    const user = users.find(u => u.id === userId);
    if (user) {
        startMessagePolling();
        startBalanceUpdates(user.username);
    }
}

async function loadMessages(userId) {
    try {
        const response = await fetch(`${API_URL}/api/messages/${userId}?limit=50`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            messages = await response.json();
            renderMessages(messages);
        }
    } catch (error) {
        console.error('Error cargando mensajes:', error);
    }
}

function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
    
    container.innerHTML = messages.map(m => `
        <div class="message ${m.senderRole === 'admin' ? 'sent' : 'received'}">
            ${m.type === 'image' ? `<img src="${m.content}" alt="Imagen" onclick="window.open('${m.content}', '_blank')">` : `<div>${escapeHtml(m.content)}</div>`}
            <span class="message-time">${new Date(m.timestamp).toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
    `).join('');
    
    scrollToBottom();
}

function addMessageToChat(message) {
    const container = document.getElementById('messagesContainer');
    const isSent = message.senderRole === 'admin';
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'});
    
    let contentHtml = '';
    if (message.type === 'image') {
        contentHtml = `<img src="${message.content}" alt="Imagen" onclick="window.open('${message.content}', '_blank')">`;
    } else {
        contentHtml = `<div>${escapeHtml(message.content)}</div>`;
    }
    
    msgDiv.innerHTML = `
        ${contentHtml}
        <span class="message-time">${time}</span>
    `;
    
    container.appendChild(msgDiv);
    scrollToBottom();
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if (!content || !selectedUserId) return;
    
    try {
        const response = await fetch(`${API_URL}/api/messages/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                content,
                receiverId: selectedUserId,
                type: 'text'
            })
        });
        
        if (response.ok) {
            const message = await response.json();
            addMessageToChat(message);
            input.value = '';
            input.style.height = 'auto';
            // Actualizar preview de conversación
            updateConversationPreview(selectedUserId, message);
        }
    } catch (error) {
        showToast('Error al enviar mensaje', 'error');
    }
}

function updateConversationPreview(userId, message) {
    const conv = conversations.find(c => c.userId === userId);
    if (conv) {
        conv.lastMessage = message.content;
        conv.lastMessageTime = message.timestamp;
        renderConversations(conversations);
    }
}

// ========================================
// ENVÍO DE ARCHIVOS
// ========================================

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Solo se permiten imágenes', 'error');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('La imagen es muy grande. Máximo 5MB', 'error');
        return;
    }
    
    if (!selectedUserId) {
        showToast('Selecciona una conversación primero', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const response = await fetch(`${API_URL}/api/messages/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({
                    content: event.target.result,
                    receiverId: selectedUserId,
                    type: 'image'
                })
            });
            
            if (response.ok) {
                const message = await response.json();
                addMessageToChat(message);
                showToast('📸 Imagen enviada', 'success');
                updateConversationPreview(selectedUserId, message);
            } else {
                const error = await response.json();
                showToast('Error al enviar imagen: ' + (error.error || 'Error desconocido'), 'error');
            }
        } catch (error) {
            console.error('Error enviando imagen:', error);
            showToast('Error de conexión al enviar imagen', 'error');
        }
    };
    reader.readAsDataURL(file);
    
    e.target.value = '';
}

// ========================================
// DEPÓSITO Y RETIRO DESDE ADMIN
// ========================================

async function handleAdminDeposit(e) {
    e.preventDefault();
    
    if (!selectedUserId) {
        showToast('Selecciona un usuario primero', 'error');
        return;
    }
    
    const user = users.find(u => u.id === selectedUserId);
    if (!user) {
        showToast('Usuario no encontrado', 'error');
        return;
    }
    
    const amount = parseFloat(document.getElementById('adminDepositAmount').value);
    const description = document.getElementById('adminDepositDesc').value || 'Depósito desde admin';
    
    if (!amount || amount < 100) {
        showToast('El monto mínimo es $100', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/admin/deposit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                username: user.username,
                amount: amount,
                description: description
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`✅ Depósito de $${amount.toLocaleString()} realizado a ${user.username}`, 'success');
            hideModal('adminDepositModal');
            document.getElementById('adminDepositForm').reset();
            updateUserBalance(user.username);
            await sendSystemMessageToUser(selectedUserId, `💰 Depósito recibido: $${amount.toLocaleString()}`);
        } else {
            showToast(data.error || 'Error al realizar depósito', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

async function handleAdminWithdraw(e) {
    e.preventDefault();
    
    if (!selectedUserId) {
        showToast('Selecciona un usuario primero', 'error');
        return;
    }
    
    const user = users.find(u => u.id === selectedUserId);
    if (!user) {
        showToast('Usuario no encontrado', 'error');
        return;
    }
    
    const amount = parseFloat(document.getElementById('adminWithdrawAmount').value);
    const description = document.getElementById('adminWithdrawDesc').value || 'Retiro desde admin';
    
    if (!amount || amount < 100) {
        showToast('El monto mínimo es $100', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/admin/withdrawal`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                username: user.username,
                amount: amount,
                description: description
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`✅ Retiro de $${amount.toLocaleString()} realizado de ${user.username}`, 'success');
            hideModal('adminWithdrawModal');
            document.getElementById('adminWithdrawForm').reset();
            updateUserBalance(user.username);
            await sendSystemMessageToUser(selectedUserId, `💸 Retiro realizado: $${amount.toLocaleString()}`);
        } else {
            showToast(data.error || 'Error al realizar retiro', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error de conexión', 'error');
    }
}

async function sendSystemMessageToUser(userId, content) {
    try {
        await fetch(`${API_URL}/api/messages/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                content: content,
                receiverId: userId,
                type: 'text'
            })
        });
        if (selectedUserId === userId) {
            loadMessages(userId);
        }
    } catch (error) {
        console.error('Error enviando mensaje de sistema:', error);
    }
}

// ========================================
// BALANCE EN TIEMPO REAL
// ========================================

function startBalanceUpdates(username) {
    updateUserBalance(username);
    
    if (balanceUpdateInterval) {
        clearInterval(balanceUpdateInterval);
    }
    
    balanceUpdateInterval = setInterval(() => {
        if (selectedUserId) {
            const user = users.find(u => u.id === selectedUserId);
            if (user) {
                updateUserBalance(user.username);
            }
        }
    }, 10000);
}

function stopBalanceUpdates() {
    if (balanceUpdateInterval) {
        clearInterval(balanceUpdateInterval);
        balanceUpdateInterval = null;
    }
}

async function updateUserBalance(username) {
    try {
        const response = await fetch(`${API_URL}/api/admin/balance/${username}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const balanceEl = document.getElementById('chatUserBalance');
            if (balanceEl) {
                balanceEl.textContent = `Balance: $${data.balance.toLocaleString()}`;
            }
        }
    } catch (error) {
        console.error('Error actualizando balance:', error);
    }
}

// ========================================
// CHAT EN TIEMPO REAL - POLLING RÁPIDO
// ========================================

function startMessagePolling() {
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
    }
    
    messagePollingInterval = setInterval(() => {
        if (selectedUserId) {
            loadMessages(selectedUserId);
        }
        loadConversations();
    }, 2000);
}

function stopMessagePolling() {
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
        messagePollingInterval = null;
    }
}

// ========================================
// SINCRONIZACIÓN JUGAYGANA
// ========================================

async function loadSyncStatus() {
    try {
        const response = await fetch(`${API_URL}/api/admin/sync-status`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById('syncTotalUsers').textContent = data.totalUsers || 0;
            document.getElementById('syncSyncedUsers').textContent = data.syncedUsers || 0;
            document.getElementById('syncPendingUsers').textContent = data.pendingUsers || 0;
            document.getElementById('syncFailedUsers').textContent = data.failedUsers || 0;
            document.getElementById('syncLastSync').textContent = data.lastSync ? new Date(data.lastSync).toLocaleString('es-AR') : 'Nunca';
        }
    } catch (error) {
        console.error('Error cargando estado de sincronización:', error);
    }
}

async function startFullSync() {
    showToast('Iniciando sincronización completa...', 'info');
    
    try {
        const response = await fetch(`${API_URL}/api/admin/sync-all`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            showToast('Sincronización completada', 'success');
            loadSyncStatus();
            loadUsers();
        } else {
            showToast('Error en sincronización', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

async function syncRecentUsers() {
    showToast('Sincronizando usuarios recientes...', 'info');
    
    try {
        const response = await fetch(`${API_URL}/api/admin/sync-recent`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            showToast('Sincronización completada', 'success');
            loadSyncStatus();
            loadUsers();
        } else {
            showToast('Error en sincronización', 'error');
        }
    } catch (error) {
        showToast('Error de conexión', 'error');
    }
}

// ========================================
// UTILIDADES
// ========================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
