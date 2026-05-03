// Aura Vault - Core Logic (Live Version with Neon/Render)

class VaultManager {
    constructor() {
        this.items = [];
        this.user = JSON.parse(localStorage.getItem('vault_user_session')) || null;
        this.isUnlocked = !!this.user;
        this.authMode = 'login';
        this.currentCategory = 'all';

        this.initElements();
        this.initEvents();
        this.updateAuthUI();
        
        if (this.isUnlocked) {
            this.unlock(this.user);
        }
    }

    initElements() {
        this.loginScreen = document.getElementById('login-screen');
        this.vaultScreen = document.getElementById('vault-screen');
        this.loginForm = document.getElementById('login-form');
        this.userInput = document.getElementById('vault-user');
        this.passInput = document.getElementById('master-password');
        this.authTitle = document.getElementById('auth-title');
        this.authSubtitle = document.getElementById('auth-subtitle');
        this.authSubmitBtn = document.getElementById('auth-submit-btn');
        this.authSwitchLink = document.getElementById('auth-switch-link');
        this.authSwitchText = document.getElementById('auth-switch-text');
        
        this.vaultGrid = document.getElementById('vault-grid');
        this.addItemForm = document.getElementById('add-item-form');
        this.itemTypeSelect = document.getElementById('item-type');
        this.passwordFields = document.getElementById('password-fields');
        this.linkFields = document.getElementById('link-fields');
        
        this.modalOverlay = document.getElementById('modal-overlay');
        this.addBtn = document.getElementById('add-btn');
        this.closeModalBtn = document.getElementById('close-modal');
        this.searchBar = document.getElementById('search-bar');
        this.itemCountLabel = document.getElementById('item-count');
        this.genPassBtn = document.getElementById('gen-password');
        this.logoutBtn = document.getElementById('logout-btn');
        
        this.displayUsername = document.getElementById('vault-username-display');
        this.userAvatar = document.getElementById('user-avatar');
        
        this.navBtns = {
            all: document.getElementById('nav-all'),
            password: document.getElementById('nav-passwords'),
            link: document.getElementById('nav-links'),
            favorite: document.getElementById('nav-favorites'),
            admin: document.getElementById('nav-admin')
        };
        
        this.gridContainer = document.getElementById('vault-grid-container');
        this.adminPanel = document.getElementById('admin-panel');
        this.viewTitle = document.getElementById('view-title');
        
        this.exportBtn = document.getElementById('export-btn');
        this.importBtn = document.getElementById('import-btn');
        this.importFile = document.getElementById('import-file');
        this.wipeBtn = document.getElementById('wipe-btn');
        this.changePassForm = document.getElementById('change-pass-form');
        
        this.statPasswords = document.getElementById('stat-passwords');
        this.statLinks = document.getElementById('stat-links');
    }

    initEvents() {
        this.loginForm.addEventListener('submit', (e) => this.handleAuth(e));
        this.authSwitchLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleAuthMode();
        });
        
        this.addItemForm.addEventListener('submit', (e) => this.handleAddItem(e));
        this.itemTypeSelect.addEventListener('change', () => this.toggleFormFields());
        this.addBtn.addEventListener('click', () => this.toggleModal(true));
        this.closeModalBtn.addEventListener('click', () => this.toggleModal(false));
        this.searchBar.addEventListener('input', (e) => this.handleSearch(e.target.value));
        this.genPassBtn.addEventListener('click', () => this.generatePassword());
        this.logoutBtn.addEventListener('click', () => this.logout());
        
        Object.entries(this.navBtns).forEach(([cat, btn]) => {
            if (btn) btn.addEventListener('click', () => this.setCategory(cat));
        });

        this.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.modalOverlay) this.toggleModal(false);
        });

        // Admin Events
        this.exportBtn.addEventListener('click', () => this.handleExport());
        this.importBtn.addEventListener('click', () => this.importFile.click());
        this.importFile.addEventListener('change', (e) => this.handleImport(e));
        this.wipeBtn.addEventListener('click', () => this.handleWipe());
    }

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
            console.error('API Error:', err);
            alert(err.message);
            return null;
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

    setCategory(cat) {
        this.currentCategory = cat;
        Object.values(this.navBtns).forEach(btn => btn?.classList.remove('active'));
        this.navBtns[cat]?.classList.add('active');
        
        if (cat === 'admin') {
            this.gridContainer.classList.add('hidden');
            this.adminPanel.classList.remove('hidden');
            this.addBtn.classList.add('hidden');
            this.updateStats();
        } else {
            this.gridContainer.classList.remove('hidden');
            this.adminPanel.classList.add('hidden');
            this.addBtn.classList.remove('hidden');
            
            const titles = { all: 'All Items', password: 'Passwords', link: 'Links', favorite: 'Favorites' };
            this.viewTitle.textContent = titles[cat] || 'Vault';
            
            this.renderItems(this.searchBar.value);
        }
    }

    updateAuthUI() {
        if (this.authMode === 'register') {
            this.authTitle.textContent = "Create Your Vault";
            this.authSubtitle.textContent = "Choose a username and master password";
            this.authSubmitBtn.innerHTML = 'Create Account <i data-lucide="user-plus"></i>';
            this.authSwitchText.textContent = "Already have an account?";
            this.authSwitchLink.textContent = "Login Here";
        } else {
            this.authTitle.textContent = "Welcome Back";
            this.authSubtitle.textContent = "Enter your credentials to unlock the vault";
            this.authSubmitBtn.innerHTML = 'Unlock Vault <i data-lucide="unlock"></i>';
            this.authSwitchText.textContent = "New here?";
            this.authSwitchLink.textContent = "Create Account";
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
        
        if (userData) {
            this.unlock(userData);
        }
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
        
        await this.fetchItems();
        lucide.createIcons();
    }

    async fetchItems() {
        const data = await this.api('/items');
        if (data) {
            this.items = data.map(item => ({
                ...item,
                siteName: item.site_name, // Map database snake_case to frontend camelCase
                createdAt: item.created_at
            }));
            this.renderItems();
        }
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

    toggleModal(show) {
        if (show) {
            this.modalOverlay.classList.add('active');
        } else {
            this.modalOverlay.classList.remove('active');
            this.addItemForm.reset();
        }
    }

    async handleAddItem(e) {
        e.preventDefault();
        const type = this.itemTypeSelect.value;
        const newItem = {
            type: type,
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
        }
    }

    renderItems(filter = '') {
        let filtered = this.items;

        // Category Filter
        if (this.currentCategory === 'favorite') {
            filtered = filtered.filter(item => item.favorite === true);
        } else if (this.currentCategory !== 'all') {
            filtered = filtered.filter(item => item.type === this.currentCategory);
        }

        // Search Filter
        filtered = filtered.filter(item => 
            item.siteName.toLowerCase().includes(filter.toLowerCase()) ||
            (item.username && item.username.toLowerCase().includes(filter.toLowerCase())) ||
            (item.description && item.description.toLowerCase().includes(filter.toLowerCase()))
        );

        this.itemCountLabel.textContent = `${filtered.length} items found`;

        if (filtered.length === 0) {
            this.vaultGrid.innerHTML = `
                <div id="empty-state" style="grid-column: 1/-1; text-align: center; padding: 5rem 0;">
                    <i data-lucide="archive" style="width: 48px; height: 48px; color: var(--panel-border); margin-bottom: 1rem;"></i>
                    <p style="color: var(--text-dim);">No items found in this category.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        this.vaultGrid.innerHTML = filtered.map(item => {
            if (item.type === 'link') {
                return `
                    <div class="vault-card" data-id="${item.id}">
                        <div class="card-header">
                            <div class="site-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--accent-secondary);">
                                <i data-lucide="link" size="20"></i>
                            </div>
                            <div>
                                <div class="card-title">${item.siteName}</div>
                                <div class="card-subtitle">Quick Link</div>
                            </div>
                            <div style="margin-left: auto; display: flex; gap: 0.5rem;">
                                <button class="fav-btn" onclick="vault.toggleFavorite(${item.id})" style="background: none; border: none; color: ${item.favorite ? '#fbbf24' : 'var(--text-dim)'}; cursor: pointer;">
                                    <i data-lucide="star" fill="${item.favorite ? '#fbbf24' : 'none'}" size="18"></i>
                                </button>
                                <button class="delete-btn" onclick="vault.deleteItem(${item.id})" style="background: none; border: none; color: var(--text-dim); cursor: pointer;">
                                    <i data-lucide="trash-2" size="18"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="field-group">
                            <div class="field-label">Description</div>
                            <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 1rem;">
                                ${item.description || 'No description provided'}
                            </div>
                        </div>

                        ${item.url ? `
                            <a href="${item.url}" target="_blank" class="btn btn-primary" style="padding: 0.6rem; font-size: 0.8rem; text-decoration: none;">
                                Open Link <i data-lucide="external-link" size="14"></i>
                            </a>
                        ` : ''}
                    </div>
                `;
            }

            return `
                <div class="vault-card" data-id="${item.id}">
                    <div class="card-header">
                        <div class="site-icon">${item.siteName[0].toUpperCase()}</div>
                        <div>
                            <div class="card-title">${item.siteName}</div>
                            <div class="card-subtitle">${this.getDomain(item.url)}</div>
                        </div>
                        <div style="margin-left: auto; display: flex; gap: 0.5rem;">
                            <button class="fav-btn" onclick="vault.toggleFavorite(${item.id})" style="background: none; border: none; color: ${item.favorite ? '#fbbf24' : 'var(--text-dim)'}; cursor: pointer;">
                                <i data-lucide="star" fill="${item.favorite ? '#fbbf24' : 'none'}" size="18"></i>
                            </button>
                            <button class="delete-btn" onclick="vault.deleteItem(${item.id})" style="background: none; border: none; color: var(--text-dim); cursor: pointer;">
                                <i data-lucide="trash-2" size="18"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="field-group">
                        <div class="field-label">Username</div>
                        <div class="field-value">
                            <span>${item.username || '---'}</span>
                            <button class="copy-btn" onclick="vault.copy('${item.username}')">
                                <i data-lucide="copy" size="14"></i>
                            </button>
                        </div>
                    </div>

                    <div class="field-group">
                        <div class="field-label">Password</div>
                        <div class="field-value">
                            <span class="masked-pass">••••••••</span>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="copy-btn" onclick="vault.togglePass(this, '${item.password}')">
                                    <i data-lucide="eye" size="14"></i>
                                </button>
                                <button class="copy-btn" onclick="vault.copy('${item.password}')">
                                    <i data-lucide="copy" size="14"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        lucide.createIcons();
    }

    handleSearch(query) {
        this.renderItems(query);
    }

    getDomain(url) {
        if (!url) return 'Local Item';
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    }

    copy(text) {
        navigator.clipboard.writeText(text).then(() => {
            const toast = document.createElement('div');
            toast.className = 'toast-notification';
            toast.style.position = 'fixed';
            toast.style.bottom = '2rem';
            toast.style.left = '50%';
            toast.style.transform = 'translateX(-50%)';
            toast.style.background = 'var(--success)';
            toast.style.color = 'white';
            toast.style.padding = '0.5rem 1.5rem';
            toast.style.borderRadius = '20px';
            toast.style.fontSize = '0.8rem';
            toast.style.zIndex = '10000';
            toast.textContent = 'Copied to clipboard!';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        });
    }

    togglePass(btn, pass) {
        const span = btn.closest('.field-value').querySelector('.masked-pass');
        const icon = btn.querySelector('i');
        
        if (span.textContent === '••••••••') {
            span.textContent = pass;
            btn.innerHTML = '<i data-lucide="eye-off" size="14"></i>';
        } else {
            span.textContent = '••••••••';
            btn.innerHTML = '<i data-lucide="eye" size="14"></i>';
        }
        lucide.createIcons();
    }

    async deleteItem(id) {
        if (confirm('Are you sure you want to delete this item?')) {
            const success = await this.api(`/items/${id}`, 'DELETE');
            if (success) {
                await this.fetchItems();
            }
        }
    }

    updateStats() {
        const passwords = this.items.filter(i => i.type === 'password').length;
        const links = this.items.filter(i => i.type === 'link').length;
        this.statPasswords.textContent = passwords;
        this.statLinks.textContent = links;
    }

    handleExport() {
        const data = {
            user: this.user.username,
            items: this.items,
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aura_vault_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    }

    async handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.items && Array.isArray(data.items)) {
                    if (confirm(`Import ${data.items.length} items?`)) {
                        for (const item of data.items) {
                            await this.api('/items', 'POST', {
                                type: item.type,
                                site_name: item.siteName || item.site_name,
                                url: item.url,
                                username: item.username,
                                password: item.password,
                                description: item.description
                            });
                        }
                        await this.fetchItems();
                        alert('Import successful!');
                    }
                }
            } catch (err) {
                alert('Error reading file.');
            }
        };
        reader.readAsText(file);
    }

    async handleWipe() {
        if (confirm('CRITICAL: This will delete ALL your data permanently.')) {
            const success = await this.api('/items/wipe', 'DELETE');
            if (success) {
                await this.fetchItems();
                alert('Vault wiped successfully.');
            }
        }
    }

    async toggleFavorite(id) {
        const item = this.items.find(i => i.id === id);
        if (item) {
            const updated = await this.api(`/items/${id}`, 'PUT', { favorite: !item.favorite });
            if (updated) {
                await this.fetchItems();
            }
        }
    }

    generatePassword() {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
        let retVal = "";
        for (let i = 0; i < 16; ++i) {
            retVal += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        document.getElementById('password').value = retVal;
    }
}

const vault = new VaultManager();
window.vault = vault;
