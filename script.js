// Aura Vault — Core Logic (Live + Admin)

class VaultManager {
    constructor() {
        this.items = [];
        this.user = JSON.parse(localStorage.getItem('vault_user_session')) || null;
        this.isUnlocked = !!this.user;
        this.authMode = 'login';
        this.currentCategory = 'all';
        this.resetTargetUserId = null;

        this.initElements();
        this.initEvents();
        this.updateAuthUI();

        if (this.isUnlocked) {
            this.unlock(this.user);
        }
    }

    initElements() {
        this.loginScreen       = document.getElementById('login-screen');
        this.vaultScreen       = document.getElementById('vault-screen');
        this.loginForm         = document.getElementById('login-form');
        this.userInput         = document.getElementById('vault-user');
        this.passInput         = document.getElementById('master-password');
        this.authTitle         = document.getElementById('auth-title');
        this.authSubtitle      = document.getElementById('auth-subtitle');
        this.authSubmitBtn     = document.getElementById('auth-submit-btn');
        this.authSwitchLink    = document.getElementById('auth-switch-link');
        this.authSwitchText    = document.getElementById('auth-switch-text');

        this.vaultGrid         = document.getElementById('vault-grid');
        this.addItemForm       = document.getElementById('add-item-form');
        this.itemTypeSelect    = document.getElementById('item-type');
        this.passwordFields    = document.getElementById('password-fields');
        this.linkFields        = document.getElementById('link-fields');

        this.modalOverlay      = document.getElementById('modal-overlay');
        this.addBtn            = document.getElementById('add-btn');
        this.closeModalBtn     = document.getElementById('close-modal');
        this.searchBar         = document.getElementById('search-bar');
        this.itemCountLabel    = document.getElementById('item-count');
        this.genPassBtn        = document.getElementById('gen-password');
        this.logoutBtn         = document.getElementById('logout-btn');

        this.displayUsername   = document.getElementById('vault-username-display');
        this.userAvatar        = document.getElementById('user-avatar');
        this.userRoleLabel     = document.getElementById('user-role-label');

        this.navBtns = {
            all:      document.getElementById('nav-all'),
            password: document.getElementById('nav-passwords'),
            link:     document.getElementById('nav-links'),
            favorite: document.getElementById('nav-favorites'),
            settings: document.getElementById('nav-settings'),
            admin:    document.getElementById('nav-admin'),
        };
        this.navAdminLi        = document.getElementById('nav-admin-li');

        this.gridContainer     = document.getElementById('vault-grid-container');
        this.settingsPanel     = document.getElementById('settings-panel');
        this.adminPanel        = document.getElementById('admin-panel');
        this.viewTitle         = document.getElementById('view-title');

        this.exportBtn         = document.getElementById('export-btn');
        this.importBtn         = document.getElementById('import-btn');
        this.importFile        = document.getElementById('import-file');
        this.wipeBtn           = document.getElementById('wipe-btn');
        this.changePassForm    = document.getElementById('change-pass-form');

        this.statPasswords     = document.getElementById('stat-passwords');
        this.statLinks         = document.getElementById('stat-links');

        // Admin elements
        this.adminUsersTbody   = document.getElementById('admin-users-tbody');
        this.refreshUsersBtn   = document.getElementById('refresh-users-btn');

        // Reset password modal
        this.resetModal        = document.getElementById('reset-modal');
        this.closeResetModal   = document.getElementById('close-reset-modal');
        this.resetNewPassword  = document.getElementById('reset-new-password');
        this.confirmResetBtn   = document.getElementById('confirm-reset-btn');
        this.resetModalUsername= document.getElementById('reset-modal-username');
    }

    initEvents() {
        this.loginForm.addEventListener('submit', (e) => this.handleAuth(e));
        this.authSwitchLink.addEventListener('click', (e) => { e.preventDefault(); this.toggleAuthMode(); });

        this.addItemForm.addEventListener('submit', (e) => this.handleAddItem(e));
        this.itemTypeSelect.addEventListener('change', () => this.toggleFormFields());
        this.addBtn.addEventListener('click', () => this.toggleModal(true));
        this.closeModalBtn.addEventListener('click', () => this.toggleModal(false));
        this.searchBar.addEventListener('input', (e) => this.renderItems(e.target.value));
        this.genPassBtn.addEventListener('click', () => this.generatePassword());
        this.logoutBtn.addEventListener('click', () => this.logout());

        this.modalOverlay.addEventListener('click', (e) => { if (e.target === this.modalOverlay) this.toggleModal(false); });

        Object.entries(this.navBtns).forEach(([cat, btn]) => {
            if (btn) btn.addEventListener('click', () => this.setCategory(cat));
        });

        // Settings events
        this.exportBtn.addEventListener('click', () => this.handleExport());
        this.importBtn.addEventListener('click', () => this.importFile.click());
        this.importFile.addEventListener('change', (e) => this.handleImport(e));
        this.wipeBtn.addEventListener('click', () => this.handleWipe());
        this.changePassForm.addEventListener('submit', (e) => this.handleChangePassword(e));

        // Admin events
        this.refreshUsersBtn.addEventListener('click', () => this.loadAdminData());
        this.closeResetModal.addEventListener('click', () => this.toggleResetModal(false));
        this.resetModal.addEventListener('click', (e) => { if (e.target === this.resetModal) this.toggleResetModal(false); });
        this.confirmResetBtn.addEventListener('click', () => this.confirmResetPassword());
    }

    // ── API Helper ──────────────────────────────
    async api(endpoint, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'user-id': this.user ? this.user.id : ''
            }
        };
        if (body) options.body = JSON.stringify(body);
        try {
            const response = await fetch(`/api${endpoint}`, options);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'API Error');
            return data;
        } catch (err) {
            this.showToast(err.message, 'error');
            return null;
        }
    }

    // ── Auth ────────────────────────────────────
    updateAuthUI() {
        if (this.authMode === 'register') {
            this.authTitle.textContent = 'Create Your Vault';
            this.authSubtitle.textContent = 'Choose a username and master password';
            this.authSubmitBtn.innerHTML = 'Create Account <i data-lucide="user-plus"></i>';
            this.authSwitchText.textContent = 'Already have an account?';
            this.authSwitchLink.textContent = 'Login Here';
        } else {
            this.authTitle.textContent = 'Welcome Back';
            this.authSubtitle.textContent = 'Enter your credentials to unlock the vault';
            this.authSubmitBtn.innerHTML = 'Unlock Vault <i data-lucide="unlock"></i>';
            this.authSwitchText.textContent = 'New here?';
            this.authSwitchLink.textContent = 'Create Account';
        }
        lucide.createIcons();
    }

    toggleAuthMode() {
        this.authMode = this.authMode === 'login' ? 'register' : 'login';
        this.updateAuthUI();
    }

    async handleAuth(e) {
        e.preventDefault();
        const username = this.userInput.value.trim();
        const password = this.passInput.value;
        const endpoint = this.authMode === 'register' ? '/auth/register' : '/auth/login';
        const userData = await this.api(endpoint, 'POST', { username, password });
        if (userData) this.unlock(userData);
    }

    async unlock(userData) {
        this.user = userData;
        localStorage.setItem('vault_user_session', JSON.stringify(userData));
        this.isUnlocked = true;
        this.loginScreen.classList.add('hidden');
        this.vaultScreen.classList.add('active');
        this.addBtn.classList.remove('hidden');

        this.displayUsername.textContent = this.user.username;
        this.userAvatar.textContent = this.user.username[0].toUpperCase();

        if (this.user.is_admin) {
            this.navAdminLi.style.display = 'block';
            this.userRoleLabel.innerHTML = '<span style="color:var(--accent-primary);font-weight:600;">⚙ Admin</span>';
            this.userAvatar.style.background = 'linear-gradient(135deg, #8b5cf6, #ec4899)';
        } else {
            this.navAdminLi.style.display = 'none';
            this.userRoleLabel.textContent = 'Secure Session';
        }

        await this.fetchItems();
        lucide.createIcons();
    }

    logout() {
        this.user = null;
        localStorage.removeItem('vault_user_session');
        this.isUnlocked = false;
        this.loginScreen.classList.remove('hidden');
        this.vaultScreen.classList.remove('active');
        this.addBtn.classList.add('hidden');
        this.passInput.value = '';
        this.authMode = 'login';
        this.updateAuthUI();
    }

    // ── Navigation ──────────────────────────────
    setCategory(cat) {
        this.currentCategory = cat;
        Object.values(this.navBtns).forEach(btn => btn?.classList.remove('active'));
        this.navBtns[cat]?.classList.add('active');

        this.gridContainer.classList.add('hidden');
        this.settingsPanel.classList.add('hidden');
        this.adminPanel.classList.add('hidden');
        this.addBtn.classList.remove('hidden');

        if (cat === 'settings') {
            this.settingsPanel.classList.remove('hidden');
            this.addBtn.classList.add('hidden');
            this.updateStats();
        } else if (cat === 'admin') {
            this.adminPanel.classList.remove('hidden');
            this.addBtn.classList.add('hidden');
            this.loadAdminData();
        } else {
            this.gridContainer.classList.remove('hidden');
            const titles = { all: 'All Items', password: 'Passwords', link: 'Links', favorite: 'Favorites' };
            this.viewTitle.textContent = titles[cat] || 'Vault';
            this.renderItems(this.searchBar.value);
        }
    }

    // ── Vault Items ─────────────────────────────
    async fetchItems() {
        const data = await this.api('/items');
        if (data) {
            this.items = data.map(item => ({
                ...item,
                siteName: item.site_name,
                createdAt: item.created_at
            }));
            this.renderItems();
        }
    }

    toggleFormFields() {
        const type = this.itemTypeSelect.value;
        if (type === 'password') {
            this.passwordFields.classList.remove('hidden');
            this.linkFields.classList.add('hidden');
        } else {
            this.passwordFields.classList.add('hidden');
            this.linkFields.classList.remove('hidden');
        }
    }

    toggleModal(show) {
        if (show) {
            this.modalOverlay.classList.add('active');
        } else {
            this.modalOverlay.classList.remove('active');
            this.addItemForm.reset();
            this.passwordFields.classList.remove('hidden');
            this.linkFields.classList.add('hidden');
        }
    }

    async handleAddItem(e) {
        e.preventDefault();
        const type = this.itemTypeSelect.value;
        const newItem = {
            type,
            site_name: document.getElementById('site-name').value,
            url: document.getElementById('site-url').value,
            username: document.getElementById('username').value || null,
            password: document.getElementById('password').value || null,
            description: document.getElementById('description').value || null
        };
        const savedItem = await this.api('/items', 'POST', newItem);
        if (savedItem) {
            await this.fetchItems();
            this.toggleModal(false);
            this.showToast('Item saved to vault!');
        }
    }

    renderItems(filter = '') {
        let filtered = this.items;

        if (this.currentCategory === 'favorite') {
            filtered = filtered.filter(i => i.favorite === true);
        } else if (this.currentCategory !== 'all') {
            filtered = filtered.filter(i => i.type === this.currentCategory);
        }

        filtered = filtered.filter(i =>
            i.siteName.toLowerCase().includes(filter.toLowerCase()) ||
            (i.username && i.username.toLowerCase().includes(filter.toLowerCase())) ||
            (i.description && i.description.toLowerCase().includes(filter.toLowerCase()))
        );

        this.itemCountLabel.textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''} found`;

        if (filtered.length === 0) {
            this.vaultGrid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:5rem 0;">
                    <i data-lucide="archive" style="width:48px;height:48px;color:var(--panel-border);margin-bottom:1rem;"></i>
                    <p style="color:var(--text-dim);">No items found in this category.</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        this.vaultGrid.innerHTML = filtered.map(item => {
            const favColor = item.favorite ? '#fbbf24' : 'var(--text-dim)';
            const favFill  = item.favorite ? '#fbbf24' : 'none';

            if (item.type === 'link') {
                return `
                <div class="vault-card" data-id="${item.id}">
                    <div class="card-header">
                        <div class="site-icon" style="background:rgba(59,130,246,0.1);color:var(--accent-secondary);">
                            <i data-lucide="link" size="20"></i>
                        </div>
                        <div>
                            <div class="card-title">${this.escHtml(item.siteName)}</div>
                            <div class="card-subtitle">Quick Link</div>
                        </div>
                        <div style="margin-left:auto;display:flex;gap:0.5rem;">
                            <button class="icon-btn" onclick="vault.toggleFavorite(${item.id})" title="Favorite" style="color:${favColor};">
                                <i data-lucide="star" fill="${favFill}" size="18"></i>
                            </button>
                            <button class="icon-btn danger" onclick="vault.deleteItem(${item.id})" title="Delete">
                                <i data-lucide="trash-2" size="18"></i>
                            </button>
                        </div>
                    </div>
                    <div class="field-group">
                        <div class="field-label">Description</div>
                        <div style="font-size:0.85rem;color:var(--text-dim);margin-bottom:1rem;">${this.escHtml(item.description || 'No description provided')}</div>
                    </div>
                    ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="btn btn-primary" style="padding:0.6rem;font-size:0.8rem;text-decoration:none;">Open Link <i data-lucide="external-link" size="14"></i></a>` : ''}
                </div>`;
            }

            return `
            <div class="vault-card" data-id="${item.id}">
                <div class="card-header">
                    <div class="site-icon">${item.siteName[0].toUpperCase()}</div>
                    <div>
                        <div class="card-title">${this.escHtml(item.siteName)}</div>
                        <div class="card-subtitle">${this.getDomain(item.url)}</div>
                    </div>
                    <div style="margin-left:auto;display:flex;gap:0.5rem;">
                        <button class="icon-btn" onclick="vault.toggleFavorite(${item.id})" title="Favorite" style="color:${favColor};">
                            <i data-lucide="star" fill="${favFill}" size="18"></i>
                        </button>
                        <button class="icon-btn danger" onclick="vault.deleteItem(${item.id})" title="Delete">
                            <i data-lucide="trash-2" size="18"></i>
                        </button>
                    </div>
                </div>
                <div class="field-group">
                    <div class="field-label">Username</div>
                    <div class="field-value">
                        <span>${this.escHtml(item.username || '—')}</span>
                        <button class="copy-btn" onclick="vault.copy('${this.escAttr(item.username || '')}')"><i data-lucide="copy" size="14"></i></button>
                    </div>
                </div>
                <div class="field-group">
                    <div class="field-label">Password</div>
                    <div class="field-value">
                        <span class="masked-pass">••••••••</span>
                        <div style="display:flex;gap:0.5rem;">
                            <button class="copy-btn" onclick="vault.togglePass(this, '${this.escAttr(item.password || '')}')"><i data-lucide="eye" size="14"></i></button>
                            <button class="copy-btn" onclick="vault.copy('${this.escAttr(item.password || '')}')"><i data-lucide="copy" size="14"></i></button>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        lucide.createIcons();
    }

    // ── Vault Actions ───────────────────────────
    async toggleFavorite(id) {
        const item = this.items.find(i => i.id === id);
        if (item) {
            const updated = await this.api(`/items/${id}`, 'PUT', { favorite: !item.favorite });
            if (updated) { await this.fetchItems(); }
        }
    }

    async deleteItem(id) {
        if (confirm('Delete this item from your vault?')) {
            const success = await this.api(`/items/${id}`, 'DELETE');
            if (success) { await this.fetchItems(); this.showToast('Item deleted.'); }
        }
    }

    copy(text) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => this.showToast('Copied to clipboard!'));
    }

    togglePass(btn, pass) {
        const span = btn.closest('.field-value').querySelector('.masked-pass');
        if (span.textContent === '••••••••') {
            span.textContent = pass;
            btn.innerHTML = '<i data-lucide="eye-off" size="14"></i>';
        } else {
            span.textContent = '••••••••';
            btn.innerHTML = '<i data-lucide="eye" size="14"></i>';
        }
        lucide.createIcons();
    }

    generatePassword() {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
        let pw = '';
        for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
        document.getElementById('password').value = pw;
    }

    getDomain(url) {
        if (!url) return 'Local Item';
        try { return new URL(url).hostname; } catch { return url; }
    }

    escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    escAttr(str) {
        if (!str) return '';
        return String(str).replace(/'/g, "\\'");
    }

    // ── Settings ────────────────────────────────
    updateStats() {
        this.statPasswords.textContent = this.items.filter(i => i.type === 'password').length;
        this.statLinks.textContent     = this.items.filter(i => i.type === 'link').length;
    }

    handleExport() {
        const data = { user: this.user.username, items: this.items, exportedAt: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `aura_vault_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    }

    async handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.items && Array.isArray(data.items)) {
                    if (confirm(`Import ${data.items.length} items?`)) {
                        for (const item of data.items) {
                            await this.api('/items', 'POST', {
                                type: item.type,
                                site_name: item.siteName || item.site_name,
                                url: item.url, username: item.username,
                                password: item.password, description: item.description
                            });
                        }
                        await this.fetchItems();
                        this.showToast('Import successful!');
                    }
                }
            } catch { this.showToast('Error reading file.', 'error'); }
        };
        reader.readAsText(file);
    }

    async handleWipe() {
        if (confirm('⚠️ This will permanently delete ALL vault items. Are you sure?')) {
            const ok = await this.api('/items/wipe', 'DELETE');
            if (ok) { await this.fetchItems(); this.showToast('Vault wiped.', 'error'); }
        }
    }

    async handleChangePassword(e) {
        e.preventDefault();
        const newPass = document.getElementById('new-master-pass').value;
        if (!newPass) return;
        const ok = await this.api('/auth/change-password', 'POST', { new_password: newPass });
        if (ok) {
            this.showToast('Password updated!');
            document.getElementById('new-master-pass').value = '';
        }
    }

    // ── Admin Panel ─────────────────────────────
    async loadAdminData() {
        this.adminUsersTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-dim);padding:2rem;">Loading...</td></tr>';

        const [stats, users] = await Promise.all([
            this.api('/admin/stats'),
            this.api('/admin/users')
        ]);

        if (stats) {
            document.getElementById('admin-stat-users').textContent     = stats.total_users;
            document.getElementById('admin-stat-items').textContent     = stats.total_items;
            document.getElementById('admin-stat-passwords').textContent = stats.total_passwords;
            document.getElementById('admin-stat-links').textContent     = stats.total_links;
        }

        if (users) {
            if (users.length === 0) {
                this.adminUsersTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-dim);padding:2rem;">No users found.</td></tr>';
                return;
            }
            this.adminUsersTbody.innerHTML = users.map(u => {
                const isMe = u.id === this.user.id;
                const joinDate = new Date(u.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
                const roleBadge = u.is_admin
                    ? `<span class="role-badge admin-badge-sm">Admin</span>`
                    : `<span class="role-badge user-badge-sm">User</span>`;
                const actions = isMe
                    ? `<span style="color:var(--text-dim);font-size:0.75rem;">(You)</span>`
                    : `
                        <button class="tbl-btn" onclick="vault.openResetModal(${u.id}, '${this.escAttr(u.username)}')" title="Reset Password">
                            <i data-lucide="key" size="13"></i>
                        </button>
                        <button class="tbl-btn" onclick="vault.toggleUserAdmin(${u.id})" title="${u.is_admin ? 'Revoke Admin' : 'Grant Admin'}">
                            <i data-lucide="${u.is_admin ? 'shield-off' : 'shield-check'}" size="13"></i>
                        </button>
                        <button class="tbl-btn danger" onclick="vault.deleteUser(${u.id}, '${this.escAttr(u.username)}')" title="Delete User">
                            <i data-lucide="trash-2" size="13"></i>
                        </button>`;
                return `
                <tr>
                    <td style="color:var(--text-dim);">#${u.id}</td>
                    <td><strong>${this.escHtml(u.username)}</strong></td>
                    <td>${roleBadge}</td>
                    <td>${u.passwords}</td>
                    <td>${u.links}</td>
                    <td>${u.total_items}</td>
                    <td style="color:var(--text-dim);font-size:0.8rem;">${joinDate}</td>
                    <td>
                        <div style="display:flex;gap:0.4rem;align-items:center;">${actions}</div>
                    </td>
                </tr>`;
            }).join('');
            lucide.createIcons();
        }
    }

    async deleteUser(id, username) {
        if (confirm(`Delete user "${username}" and all their vault data? This cannot be undone.`)) {
            const ok = await this.api(`/admin/users/${id}`, 'DELETE');
            if (ok) { this.showToast(`User "${username}" deleted.`); this.loadAdminData(); }
        }
    }

    async toggleUserAdmin(id) {
        const ok = await this.api(`/admin/users/${id}/toggle-admin`, 'PATCH');
        if (ok) {
            const action = ok.is_admin ? 'granted admin' : 'revoked admin from';
            this.showToast(`Successfully ${action} "${ok.username}".`);
            this.loadAdminData();
        }
    }

    openResetModal(id, username) {
        this.resetTargetUserId = id;
        this.resetModalUsername.textContent = `Resetting password for: ${username}`;
        this.resetNewPassword.value = '';
        this.toggleResetModal(true);
    }

    toggleResetModal(show) {
        if (show) {
            this.resetModal.classList.add('active');
        } else {
            this.resetModal.classList.remove('active');
            this.resetTargetUserId = null;
        }
    }

    async confirmResetPassword() {
        const newPw = this.resetNewPassword.value;
        if (!newPw) { this.showToast('Enter a new password.', 'error'); return; }
        const ok = await this.api(`/admin/users/${this.resetTargetUserId}/reset-password`, 'PATCH', { new_password: newPw });
        if (ok) { this.showToast(ok.message); this.toggleResetModal(false); }
    }

    // ── Toast ───────────────────────────────────
    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.cssText = `
            position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);
            background:${type === 'error' ? 'var(--danger)' : 'var(--success)'};
            color:white;padding:0.6rem 1.8rem;border-radius:20px;
            font-size:0.85rem;z-index:10000;font-weight:500;
            animation:slideUp 0.3s ease;`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }
}

const vault = new VaultManager();
window.vault = vault;
