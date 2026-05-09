// Aura Vault — Enhanced UI Script

class VaultManager {
    constructor() {
        this.items = [];
        this.user = JSON.parse(localStorage.getItem('vault_user_session')) || null;
        this.authMode = 'login';
        this.currentCategory = 'all';
        this.resetTargetUserId = null;
        this.initElements();
        this.initEvents();
        this.updateAuthUI();
        if (this.user) this.unlock(this.user);
    }

    initElements() {
        this.loginScreen    = document.getElementById('login-screen');
        this.vaultScreen    = document.getElementById('vault-screen');
        this.loginForm      = document.getElementById('login-form');
        this.userInput      = document.getElementById('vault-user');
        this.passInput      = document.getElementById('master-password');
        this.authTitle      = document.getElementById('auth-title');
        this.authSubtitle   = document.getElementById('auth-subtitle');
        this.authSubmitBtn  = document.getElementById('auth-submit-btn');
        this.authSwitchLink = document.getElementById('auth-switch-link');
        this.authSwitchText = document.getElementById('auth-switch-text');

        this.vaultGrid      = document.getElementById('vault-grid');
        this.addItemForm    = document.getElementById('add-item-form');
        this.itemTypeSelect = document.getElementById('item-type');
        this.passwordFields = document.getElementById('password-fields');
        this.linkFields     = document.getElementById('link-fields');
        this.modalOverlay   = document.getElementById('modal-overlay');
        this.addBtn         = document.getElementById('add-btn');
        this.closeModalBtn  = document.getElementById('close-modal');
        this.searchBar      = document.getElementById('search-bar');
        this.itemCountLabel = document.getElementById('item-count');
        this.genPassBtn     = document.getElementById('gen-password');
        this.logoutBtn      = document.getElementById('logout-btn');
        this.displayUsername= document.getElementById('vault-username-display');
        this.userAvatar     = document.getElementById('user-avatar');
        this.userRoleLabel  = document.getElementById('user-role-label');
        this.navAdminLi     = document.getElementById('nav-admin-li');

        this.gridContainer  = document.getElementById('vault-grid-container');
        this.settingsPanel  = document.getElementById('settings-panel');
        this.adminPanel     = document.getElementById('admin-panel');
        this.viewTitle      = document.getElementById('view-title');

        this.exportBtn      = document.getElementById('export-btn');
        this.importBtn      = document.getElementById('import-btn');
        this.importFile     = document.getElementById('import-file');
        this.wipeBtn        = document.getElementById('wipe-btn');
        this.changePassForm = document.getElementById('change-pass-form');
        this.statPasswords  = document.getElementById('stat-passwords');
        this.statLinks      = document.getElementById('stat-links');

        // Sidebar sidebar stats
        this.sbStatPasswords = document.getElementById('sb-stat-passwords');
        this.sbStatLinks     = document.getElementById('sb-stat-links');
        this.sbStatFavs      = document.getElementById('sb-stat-favs');
        this.navBadgePasswords = document.getElementById('nav-badge-passwords');
        this.navBadgeLinks     = document.getElementById('nav-badge-links');

        // Admin
        this.adminUsersTbody = document.getElementById('admin-users-tbody');
        this.refreshUsersBtn = document.getElementById('refresh-users-btn');
        this.resetModal      = document.getElementById('reset-modal');
        this.closeResetModal = document.getElementById('close-reset-modal');
        this.resetNewPassword= document.getElementById('reset-new-password');
        this.confirmResetBtn = document.getElementById('confirm-reset-btn');
        this.resetModalUsername = document.getElementById('reset-modal-username');

        // Mobile
        this.sidebar        = document.getElementById('sidebar');
        this.drawerBackdrop = document.getElementById('drawer-backdrop');
        this.mobMenuBtn     = document.getElementById('mob-menu-btn');
        this.mobAddBtn      = document.getElementById('mob-add-btn');
        this.sidebarCloseBtn= document.getElementById('sidebar-close-btn');
    }

    initEvents() {
        // Auth
        this.loginForm.addEventListener('submit', e => this.handleAuth(e));
        this.authSwitchLink.addEventListener('click', e => { e.preventDefault(); this.toggleAuthMode(); });

        // Vault form
        this.addItemForm.addEventListener('submit', e => this.handleAddItem(e));
        this.itemTypeSelect.addEventListener('change', () => this.toggleFormFields());
        this.addBtn.addEventListener('click', () => this.toggleModal(true));
        this.closeModalBtn.addEventListener('click', () => this.toggleModal(false));
        this.modalOverlay.addEventListener('click', e => { if (e.target === this.modalOverlay) this.toggleModal(false); });
        this.searchBar.addEventListener('input', e => this.renderItems(e.target.value));
        this.genPassBtn.addEventListener('click', () => this.generatePassword());
        this.logoutBtn.addEventListener('click', () => this.logout());

        // Desktop nav
        ['all','passwords','links','favorites','settings','admin'].forEach(id => {
            const btn = document.getElementById('nav-' + id);
            if (btn) btn.addEventListener('click', () => this.setCategory(btn.dataset.cat));
        });


        // Mobile drawer
        this.mobMenuBtn.addEventListener('click', () => this.openDrawer());
        this.sidebarCloseBtn.addEventListener('click', () => this.closeDrawer());
        this.drawerBackdrop.addEventListener('click', () => this.closeDrawer());
        if (this.mobAddBtn) this.mobAddBtn.addEventListener('click', () => this.toggleModal(true));

        // Settings
        this.exportBtn.addEventListener('click', () => this.handleExport());
        this.importBtn.addEventListener('click', () => this.importFile.click());
        this.importFile.addEventListener('change', e => this.handleImport(e));
        this.wipeBtn.addEventListener('click', () => this.handleWipe());
        this.changePassForm.addEventListener('submit', e => this.handleChangePassword(e));

        // Admin
        this.refreshUsersBtn.addEventListener('click', () => this.loadAdminData());
        this.closeResetModal.addEventListener('click', () => this.toggleResetModal(false));
        this.resetModal.addEventListener('click', e => { if (e.target === this.resetModal) this.toggleResetModal(false); });
        this.confirmResetBtn.addEventListener('click', () => this.confirmResetPassword());
        this.adminUsersTbody.addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = btn.dataset.id;
            const username = btn.dataset.username;
            if (btn.classList.contains('btn-reset-pw')) this.openResetModal(id, username);
            if (btn.classList.contains('btn-toggle-admin')) this.toggleUserAdmin(id);
            if (btn.classList.contains('btn-delete-user')) this.deleteUser(id, username);
        });
    }

    // ── Mobile Drawer ─────────────────────────────
    openDrawer() {
        this.sidebar.classList.add('open');
        this.drawerBackdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    closeDrawer() {
        this.sidebar.classList.remove('open');
        this.drawerBackdrop.classList.remove('active');
        document.body.style.overflow = '';
    }

    // ── API ───────────────────────────────────────
    async api(endpoint, method = 'GET', body = null) {
        const opts = { method, headers: { 'Content-Type': 'application/json', 'user-id': this.user?.id || '' } };
        if (body) opts.body = JSON.stringify(body);
        try {
            const res = await fetch('/api' + endpoint, opts);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'API Error');
            return data;
        } catch (err) {
            this.showToast(err.message, 'error');
            return null;
        }
    }

    // ── Auth ──────────────────────────────────────
    updateAuthUI() {
        const isReg = this.authMode === 'register';
        this.authTitle.textContent    = isReg ? 'Create Your Vault' : 'Welcome Back';
        this.authSubtitle.textContent = isReg ? 'Choose a username and master password' : 'Enter your credentials to unlock the vault';
        this.authSubmitBtn.innerHTML  = isReg ? 'Create Account <i data-lucide="user-plus"></i>' : 'Unlock Vault <i data-lucide="unlock"></i>';
        this.authSwitchText.textContent = isReg ? 'Already have an account?' : 'New here?';
        this.authSwitchLink.textContent = isReg ? 'Login Here' : 'Create Account';
        lucide.createIcons();
    }

    toggleAuthMode() { this.authMode = this.authMode === 'login' ? 'register' : 'login'; this.updateAuthUI(); }

    async handleAuth(e) {
        e.preventDefault();
        const btn = this.authSubmitBtn;
        btn.disabled = true;
        btn.style.opacity = '0.7';
        const userData = await this.api(
            this.authMode === 'register' ? '/auth/register' : '/auth/login',
            'POST',
            { username: this.userInput.value.trim(), password: this.passInput.value }
        );
        btn.disabled = false;
        btn.style.opacity = '1';
        if (userData) this.unlock(userData);
    }

    async unlock(userData) {
        this.user = userData;
        localStorage.setItem('vault_user_session', JSON.stringify(userData));
        this.loginScreen.classList.add('hidden');
        this.vaultScreen.classList.add('active');
        this.addBtn.classList.remove('hidden');
        this.displayUsername.textContent = userData.username;
        this.userAvatar.textContent = userData.username[0].toUpperCase();
        if (userData.is_admin) {
            this.navAdminLi.style.display = 'block';
            this.userRoleLabel.innerHTML = '<span style="color:var(--accent-primary);font-weight:600;">⚙ Admin</span>';
            this.userAvatar.style.background = 'linear-gradient(135deg,#8b5cf6,#ec4899)';
        } else {
            this.navAdminLi.style.display = 'none';
            this.userRoleLabel.textContent = 'Secure Session';
        }
        await this.fetchItems();
        lucide.createIcons();
    }

    logout() {
        localStorage.removeItem('vault_user_session');
        this.user = null;
        this.loginScreen.classList.remove('hidden');
        this.vaultScreen.classList.remove('active');
        this.addBtn.classList.add('hidden');
        this.passInput.value = '';
        this.authMode = 'login';
        this.updateAuthUI();
    }

    // ── Navigation ────────────────────────────────
    setCategory(cat) {
        this.currentCategory = cat;
        // Desktop nav active
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        const desktopBtn = document.querySelector(`.nav-item[data-cat="${cat}"]`);
        if (desktopBtn) desktopBtn.classList.add('active');

        this.gridContainer.classList.add('hidden');
        this.settingsPanel.classList.add('hidden');
        this.adminPanel.classList.add('hidden');
        this.addBtn.classList.remove('hidden');
        this.closeDrawer();

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

    // ── Items ─────────────────────────────────────
    async fetchItems() {
        const data = await this.api('/items');
        if (data) {
            this.items = data.map(i => ({ ...i, siteName: i.site_name, createdAt: i.created_at }));
            this.renderItems();
            this.updateSidebarStats();
        }
    }

    toggleFormFields() {
        const isPw = this.itemTypeSelect.value === 'password';
        this.passwordFields.classList.toggle('hidden', !isPw);
        this.linkFields.classList.toggle('hidden', isPw);
    }

    toggleModal(show) {
        this.modalOverlay.classList.toggle('active', show);
        if (!show) { this.addItemForm.reset(); this.passwordFields.classList.remove('hidden'); this.linkFields.classList.add('hidden'); }
    }

    async handleAddItem(e) {
        e.preventDefault();
        const type = this.itemTypeSelect.value;
        const passwordInput = document.getElementById('password').value.trim();
        const urlInput = document.getElementById('site-url').value.trim();

        if (type === 'password' && !passwordInput) {
            this.showToast('Please enter or generate a password.', 'error');
            return;
        }
        
        if (urlInput && !urlInput.startsWith('http://') && !urlInput.startsWith('https://')) {
            this.showToast('URL must start with http:// or https://', 'error');
            return;
        }

        const saved = await this.api('/items', 'POST', {
            type, site_name: document.getElementById('site-name').value.trim(),
            url: urlInput,
            username: document.getElementById('username').value.trim() || null,
            password: passwordInput || null,
            description: document.getElementById('description').value.trim() || null
        });
        if (saved) { await this.fetchItems(); this.toggleModal(false); this.showToast('Saved to vault!'); }
    }

    renderItems(filter = '') {
        let list = this.items;
        if (this.currentCategory === 'favorite') list = list.filter(i => i.favorite);
        else if (this.currentCategory !== 'all') list = list.filter(i => i.type === this.currentCategory);
        if (filter) {
            const q = filter.toLowerCase();
            list = list.filter(i =>
                i.siteName.toLowerCase().includes(q) ||
                (i.username && i.username.toLowerCase().includes(q)) ||
                (i.description && i.description.toLowerCase().includes(q))
            );
        }
        this.itemCountLabel.textContent = `${list.length} item${list.length !== 1 ? 's' : ''} found`;

        if (!list.length) {
            this.vaultGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:5rem 0;">
                <i data-lucide="archive" style="width:44px;height:44px;color:var(--panel-border);margin-bottom:1rem;"></i>
                <p style="color:var(--text-dim);">No items in this category.</p></div>`;
            lucide.createIcons(); return;
        }

        this.vaultGrid.innerHTML = list.map(item => {
            const fc = item.favorite ? '#fbbf24' : 'var(--text-dim)';
            const ff = item.favorite ? '#fbbf24' : 'none';
            if (item.type === 'link') return `
                <div class="vault-card" data-id="${item.id}">
                    <div class="card-header">
                        <div class="site-icon" style="background:rgba(59,130,246,0.1);color:var(--accent-secondary);"><i data-lucide="link" size="20"></i></div>
                        <div><div class="card-title">${this.esc(item.siteName)}</div><div class="card-subtitle">Quick Link</div></div>
                        <div style="margin-left:auto;display:flex;gap:.4rem;">
                            <button class="icon-btn" onclick="vault.toggleFavorite(${item.id})" style="color:${fc};" aria-label="Toggle Favorite"><i data-lucide="star" fill="${ff}" size="17"></i></button>
                            <button class="icon-btn danger" onclick="vault.deleteItem(${item.id})" aria-label="Delete Item"><i data-lucide="trash-2" size="17"></i></button>
                        </div>
                    </div>
                    <div class="field-group"><div class="field-label">Description</div>
                        <div style="font-size:.85rem;color:var(--text-dim);">${this.esc(item.description || 'No description')}</div></div>
                    ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="btn btn-primary" style="padding:.6rem;font-size:.8rem;text-decoration:none;margin-top:.5rem;">Open Link <i data-lucide="external-link" size="13"></i></a>` : ''}
                </div>`;
            return `
                <div class="vault-card" data-id="${item.id}">
                    <div class="card-header">
                        <div class="site-icon">${item.siteName[0].toUpperCase()}</div>
                        <div><div class="card-title">${this.esc(item.siteName)}</div><div class="card-subtitle">${this.getDomain(item.url)}</div></div>
                        <div style="margin-left:auto;display:flex;gap:.4rem;">
                            <button class="icon-btn" onclick="vault.toggleFavorite(${item.id})" style="color:${fc};" aria-label="Toggle Favorite"><i data-lucide="star" fill="${ff}" size="17"></i></button>
                            <button class="icon-btn danger" onclick="vault.deleteItem(${item.id})" aria-label="Delete Item"><i data-lucide="trash-2" size="17"></i></button>
                        </div>
                    </div>
                    <div class="field-group"><div class="field-label">Username</div>
                        <div class="field-value"><span>${this.esc(item.username || '—')}</span>
                        <button class="copy-btn" onclick="vault.copy('${this.ea(item.username||'')}')" aria-label="Copy Username"><i data-lucide="copy" size="14"></i></button></div></div>
                    <div class="field-group"><div class="field-label">Password</div>
                        <div class="field-value"><span class="masked-pass">••••••••</span>
                        <div style="display:flex;gap:.4rem;">
                            <button class="copy-btn" onclick="vault.togglePass(this,'${this.ea(item.password||'')}')" aria-label="Show/Hide Password"><i data-lucide="eye" size="14"></i></button>
                            <button class="copy-btn" onclick="vault.copy('${this.ea(item.password||'')}')" aria-label="Copy Password"><i data-lucide="copy" size="14"></i></button>
                        </div></div></div>
                    ${item.url ? `<a href="${item.url}" target="_blank" rel="noopener" class="btn btn-primary" style="padding:.6rem;font-size:.8rem;text-decoration:none;margin-top:.5rem;">Open Link <i data-lucide="external-link" size="13"></i></a>` : ''}
                </div>`;
        }).join('');
        lucide.createIcons();
    }

    // ── Sidebar Stats ─────────────────────────────
    updateSidebarStats() {
        const pw = this.items.filter(i => i.type === 'password').length;
        const lk = this.items.filter(i => i.type === 'link').length;
        const fv = this.items.filter(i => i.favorite).length;
        if (this.sbStatPasswords) this.sbStatPasswords.textContent = pw;
        if (this.sbStatLinks) this.sbStatLinks.textContent = lk;
        if (this.sbStatFavs) this.sbStatFavs.textContent = fv;
        if (this.navBadgePasswords) this.navBadgePasswords.textContent = pw;
        if (this.navBadgeLinks) this.navBadgeLinks.textContent = lk;
    }

    updateStats() {
        if (this.statPasswords) this.statPasswords.textContent = this.items.filter(i => i.type === 'password').length;
        if (this.statLinks) this.statLinks.textContent = this.items.filter(i => i.type === 'link').length;
    }

    // ── Item Actions ──────────────────────────────
    async toggleFavorite(id) {
        const item = this.items.find(i => i.id === id);
        if (item) { const r = await this.api(`/items/${id}`, 'PUT', { favorite: !item.favorite }); if (r) await this.fetchItems(); }
    }

    async deleteItem(id) {
        if (confirm('Delete this item?')) {
            const r = await this.api(`/items/${id}`, 'DELETE');
            if (r) { await this.fetchItems(); this.showToast('Item deleted.'); }
        }
    }

    copy(text) { if (!text) return; navigator.clipboard.writeText(text).then(() => this.showToast('Copied!')); }

    togglePass(btn, pass) {
        const span = btn.closest('.field-value').querySelector('.masked-pass');
        if (span.textContent === '••••••••') { span.textContent = pass; btn.innerHTML = '<i data-lucide="eye-off" size="14"></i>'; }
        else { span.textContent = '••••••••'; btn.innerHTML = '<i data-lucide="eye" size="14"></i>'; }
        lucide.createIcons();
    }

    generatePassword() {
        const c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
        document.getElementById('password').value = Array.from({length:16}, () => c[Math.floor(Math.random()*c.length)]).join('');
    }

    getDomain(url) { try { return new URL(url).hostname; } catch { return url || 'Local Item'; } }
    esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    ea(s) { return String(s||'').replace(/'/g,"\\'"); }

    // ── Settings ──────────────────────────────────
    handleExport() {
        const blob = new Blob([JSON.stringify({ user: this.user.username, items: this.items, exportedAt: new Date().toISOString() }, null, 2)]);
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `aura_vault_backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
    }

    async handleImport(e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async ev => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.items?.length && confirm(`Import ${data.items.length} items?`)) {
                    await Promise.all(data.items.map(item => this.api('/items', 'POST', { type:item.type, site_name:item.siteName||item.site_name, url:item.url, username:item.username, password:item.password, description:item.description })));
                    await this.fetchItems(); this.showToast('Imported successfully!');
                }
            } catch { this.showToast('Invalid file.', 'error'); }
        };
        reader.readAsText(file);
    }

    async handleWipe() {
        if (confirm('⚠️ Delete ALL vault items permanently?')) {
            const r = await this.api('/items/wipe', 'DELETE');
            if (r) { await this.fetchItems(); this.showToast('Vault wiped.', 'error'); }
        }
    }

    async handleChangePassword(e) {
        e.preventDefault();
        const np = document.getElementById('new-master-pass').value;
        if (!np) return;
        const r = await this.api('/auth/change-password', 'POST', { new_password: np });
        if (r) { this.showToast('Password updated!'); document.getElementById('new-master-pass').value = ''; }
    }

    // ── Admin ─────────────────────────────────────
    async loadAdminData() {
        this.adminUsersTbody.innerHTML = '<tr><td colspan="8" class="table-empty">Loading...</td></tr>';
        const [stats, users] = await Promise.all([this.api('/admin/stats'), this.api('/admin/users')]);
        if (stats) {
            document.getElementById('admin-stat-users').textContent     = stats.total_users;
            document.getElementById('admin-stat-items').textContent     = stats.total_items;
            document.getElementById('admin-stat-passwords').textContent = stats.total_passwords;
            document.getElementById('admin-stat-links').textContent     = stats.total_links;
        }
        if (users?.length) {
            this.adminUsersTbody.innerHTML = users.map(u => {
                const isMe = u.id === this.user.id;
                const joined = new Date(u.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
                const role = u.is_admin ? '<span class="role-badge admin-badge-sm">Admin</span>' : '<span class="role-badge user-badge-sm">User</span>';
                const actions = isMe ? '<span style="color:var(--text-dim);font-size:.75rem;">(You)</span>' : `
                    <button class="tbl-btn btn-reset-pw" data-id="${u.id}" data-username="${this.esc(u.username)}" title="Reset Password"><i data-lucide="key" size="13"></i></button>
                    <button class="tbl-btn btn-toggle-admin" data-id="${u.id}" title="Toggle Admin"><i data-lucide="${u.is_admin?'shield-off':'shield-check'}" size="13"></i></button>
                    <button class="tbl-btn danger btn-delete-user" data-id="${u.id}" data-username="${this.esc(u.username)}" title="Delete"><i data-lucide="trash-2" size="13"></i></button>`;
                return `<tr>
                    <td style="color:var(--text-dim);">#${u.id}</td>
                    <td><strong>${this.esc(u.username)}</strong></td>
                    <td>${role}</td><td>${u.passwords}</td><td>${u.links}</td><td>${u.total_items}</td>
                    <td style="color:var(--text-dim);font-size:.8rem;">${joined}</td>
                    <td><div style="display:flex;gap:.35rem;align-items:center;">${actions}</div></td>
                </tr>`;
            }).join('');
            lucide.createIcons();
        } else if (users) {
            this.adminUsersTbody.innerHTML = '<tr><td colspan="8" class="table-empty">No users found.</td></tr>';
        }
    }

    async deleteUser(id, username) {
        if (confirm(`Delete "${username}" and all their data?`)) {
            const r = await this.api(`/admin/users/${id}`, 'DELETE');
            if (r) { this.showToast(`"${username}" deleted.`); this.loadAdminData(); }
        }
    }

    async toggleUserAdmin(id) {
        const r = await this.api(`/admin/users/${id}/toggle-admin`, 'PATCH');
        if (r) { this.showToast(`${r.is_admin ? 'Admin granted' : 'Admin revoked'} for "${r.username}".`); this.loadAdminData(); }
    }

    openResetModal(id, username) {
        this.resetTargetUserId = id;
        this.resetModalUsername.textContent = `Resetting password for: ${username}`;
        this.resetNewPassword.value = '';
        this.toggleResetModal(true);
    }

    toggleResetModal(show) { this.resetModal.classList.toggle('active', show); if (!show) this.resetTargetUserId = null; }

    async confirmResetPassword() {
        const pw = this.resetNewPassword.value;
        if (!pw) { this.showToast('Enter a new password.', 'error'); return; }
        const r = await this.api(`/admin/users/${this.resetTargetUserId}/reset-password`, 'PATCH', { new_password: pw });
        if (r) { this.showToast(r.message); this.toggleResetModal(false); }
    }

    // ── Toast ─────────────────────────────────────
    showToast(msg, type = 'success') {
        const t = document.createElement('div');
        t.style.cssText = `position:fixed;bottom:2rem;left:50%;
            transform:translateX(-50%);background:${type==='error'?'var(--danger)':'var(--success)'};
            color:white;padding:.55rem 1.6rem;border-radius:20px;font-size:.85rem;
            z-index:10000;font-weight:500;animation:slideUp .3s ease;white-space:nowrap;
            box-shadow:0 8px 20px rgba(0,0,0,.3);`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2500);
    }
}

const vault = new VaultManager();
window.vault = vault;
