// JENGAKWANZA Business Management System Main Application Logic
// Complete implementation with NO dummy data

const App = {
  productsCache: [],
  customersCache: [],
  suppliersCache: [],

  escape(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  init() {
    // 1. Instant zero-latency authentication check & route activation (0ms delay)
    if (!State.currentUser) {
      this.showAuthPage();
    } else {
      this.hideAuthPage();
      this.checkShiftStatus();
      this.renderApp();
    }

    // 2. Fetch System Settings in background (never blocks UI or app loading)
    API.getSettings().then(settingsRes => {
      if (settingsRes && settingsRes.settings) {
        State.setSettings(settingsRes.settings);
      }
    }).catch(e => console.warn('Background settings load note:', e));

    this.updateConnectionStatusUI();

    // 3. Register Service Worker with automatic updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        reg.update().catch(() => {});
        console.log('✓ JENGAKWANZA PWA Service Worker active:', reg.scope);
      }).catch((err) => {
        console.warn('Service Worker registration skipped:', err);
      });
    }
  },

  updateConnectionStatusUI() {
    const pill = document.getElementById('connection-status-pill');
    const dot = document.getElementById('connection-dot');
    const text = document.getElementById('connection-text');
    if (!pill || !dot || !text) return;

    const isOnline = typeof FirebaseAdapter !== 'undefined' ? FirebaseAdapter.isOnline : navigator.onLine;
    const isSyncing = typeof FirebaseAdapter !== 'undefined' ? FirebaseAdapter.syncInProgress : false;
    const queue = typeof FirebaseAdapter !== 'undefined' ? FirebaseAdapter.getOfflineQueue() : [];

    if (isSyncing) {
      pill.className = 'connection-status-pill syncing';
      dot.className = 'status-dot active';
      text.textContent = 'Syncing...';
    } else if (!isOnline || queue.length > 0) {
      pill.className = 'connection-status-pill offline';
      dot.className = 'status-dot inactive';
      text.textContent = queue.length > 0 ? `Offline (${queue.length} pending)` : 'Offline Mode';
    } else {
      pill.className = 'connection-status-pill online';
      dot.className = 'status-dot active';
      text.textContent = 'Cloud Synced';
    }
  },

  async triggerManualSync() {
    if (!navigator.onLine) {
      State.showToast('You are currently offline. Local changes will sync when connected.', 'warning');
      return;
    }
    if (typeof FirebaseAdapter !== 'undefined') {
      State.showToast('Syncing local data with Firebase Cloud...', 'info');
      await FirebaseAdapter.processOfflineQueue();
      this.updateConnectionStatusUI();
    }
  },

  // -------------------------------------------------------------
  // AUTHENTICATION & WORKER SESSIONS
  // -------------------------------------------------------------
  showAuthPage() {
    document.documentElement.classList.remove('app-logged-in');
    document.documentElement.classList.add('app-logged-out');

    const authPage = document.getElementById('auth-page');
    const appLayout = document.getElementById('app-layout');
    if (authPage) authPage.style.display = 'flex';
    if (appLayout) appLayout.style.display = 'none';

    const errAlert = document.getElementById('auth-error-alert');
    if (errAlert) {
      errAlert.style.display = 'none';
      errAlert.textContent = '';
    }

    const uInput = document.getElementById('login-username');
    if (uInput) {
      uInput.value = '';
      setTimeout(() => uInput.focus(), 100);
    }
    const pInput = document.getElementById('login-password');
    if (pInput) pInput.value = '';
  },

  hideAuthPage() {
    document.documentElement.classList.remove('app-logged-out');
    document.documentElement.classList.add('app-logged-in');

    const authPage = document.getElementById('auth-page');
    const appLayout = document.getElementById('app-layout');
    if (authPage) authPage.style.display = 'none';
    if (appLayout) appLayout.style.display = 'flex';
  },

  togglePasswordVisibility() {
    const pInput = document.getElementById('login-password');
    if (!pInput) return;
    pInput.type = pInput.type === 'password' ? 'text' : 'password';
  },

  async handleLogin(e) {
    e.preventDefault();
    const uInput = document.getElementById('login-username');
    const pInput = document.getElementById('login-password');
    const btn = document.getElementById('auth-submit-btn');
    const errAlert = document.getElementById('auth-error-alert');

    const username = (uInput?.value || '').trim();
    const password = (pInput?.value || '').trim();

    if (!username || !password) {
      if (errAlert) {
        errAlert.textContent = 'Please enter both username and password.';
        errAlert.style.display = 'block';
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span> Signing in...`;
    }
    if (errAlert) errAlert.style.display = 'none';

    try {
      const res = await API.login(username, password);
      if (res && res.success && res.user) {
        State.setUser(res.user);
        this.hideAuthPage();
        State.showToast(`Welcome back, ${res.user.full_name || res.user.username}!`, 'success');
        
        try {
          await this.checkShiftStatus();
          this.renderApp();
        } catch (renderErr) {
          console.warn('Post-login setup note:', renderErr);
          this.navigate('dashboard');
        }
      } else {
        throw new Error((res && res.message) || 'Invalid username or password. Please try again.');
      }
    } catch (err) {
      if (errAlert) {
        errAlert.textContent = err.message || 'Invalid username or password. Please try again.';
        errAlert.style.display = 'block';
      }
      State.showToast(err.message || 'Authentication failed', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>Sign In</span><svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
      }
    }
  },

  handleLogout() {
    if (confirm('Are you sure you want to log out?')) {
      State.setUser(null);
      this.showAuthPage();
    }
  },

  async checkShiftStatus() {
    if (!State.currentUser) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await API.getShifts(today);
      if (res && res.shifts) {
        const myActive = res.shifts.find(s => s.user_id == State.currentUser.id && !s.clock_out);
        State.activeShift = myActive || null;
      }
    } catch (e) {
      console.warn('Shift check error:', e);
    }
    this.updateShiftUI();
  },

  updateShiftUI() {
    const dot = document.getElementById('header-shift-dot');
    const label = document.getElementById('header-shift-text');
    const btn = document.getElementById('header-shift-btn');

    if (!dot || !label || !btn) return;

    if (State.activeShift) {
      dot.className = 'status-dot active';
      label.textContent = `On Duty (Since ${new Date(State.activeShift.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
      btn.textContent = 'Clock Out';
      btn.className = 'btn btn-sm btn-danger';
      btn.onclick = () => App.showClockOutModal();
    } else {
      dot.className = 'status-dot inactive';
      label.textContent = 'Off Duty';
      btn.textContent = 'Clock In Today';
      btn.className = 'btn btn-sm btn-success';
      btn.onclick = () => App.showClockInModal();
    }

    // Update User Profile in sidebar & header
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');
    const avatarEl = document.getElementById('sidebar-user-avatar');
    const headerNameEl = document.getElementById('header-user-name');
    const headerAvatarEl = document.getElementById('header-user-avatar');

    if (State.currentUser) {
      if (nameEl) nameEl.textContent = State.currentUser.full_name;
      if (roleEl) roleEl.textContent = `${State.currentUser.role} • ${State.currentUser.username}`;
      if (headerNameEl) headerNameEl.textContent = State.currentUser.full_name.split(' ')[0] || State.currentUser.username;

      const photoHtml = State.currentUser.photo_url 
        ? `<img src="${State.currentUser.photo_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
        : State.currentUser.full_name.charAt(0).toUpperCase();

      if (avatarEl) avatarEl.innerHTML = photoHtml;
      if (headerAvatarEl) headerAvatarEl.innerHTML = photoHtml;
    }

    // Restrict Admin-only views if user is not Admin (hide Capital, Workers, Settings, Branches from normal users)
    const adminItems = document.querySelectorAll('.admin-only');
    const isAdmin = State.isAdmin();
    adminItems.forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });

    this.updateBranchSelectorUI();
  },

  async updateBranchSelectorUI() {
    try {
      const res = await API.getBranches();
      const branches = res.branches || [];
      State.setBranches(branches);

      const sel = document.getElementById('header-branch-select');
      if (sel) {
        sel.innerHTML = `
          <option value="all">🏪 All Branches (Consolidated)</option>
          ${branches.map(b => `
            <option value="${b.id}" ${b.id === State.currentBranch ? 'selected' : ''}>
              🏪 ${this.escape(b.name)}
            </option>
          `).join('')}
        `;
        sel.value = State.currentBranch || 'all';
      }
    } catch (e) {
      console.warn('Branch selector load:', e);
    }
  },

  showClockInModal() {
    const modal = document.getElementById('clock-modal');
    document.getElementById('clock-modal-title').textContent = 'Clock In for Today';
    document.getElementById('clock-modal-body').innerHTML = `
      <form id="clock-in-form" onsubmit="App.submitClockIn(event)">
        <div class="form-group">
          <label class="form-label">Worker Name</label>
          <input type="text" class="form-input" value="${State.currentUser.full_name} (${State.currentUser.role})" disabled>
        </div>
        <div class="form-group">
          <label class="form-label">Opening Cash in Drawer (${State.settings.currency_symbol || 'TSh'})</label>
          <input type="number" id="clock-opening-cash" class="form-input" step="any" value="0.00" required>
        </div>
        <div class="form-group">
          <label class="form-label">Shift Notes / Comments</label>
          <input type="text" id="clock-notes" class="form-input" placeholder="e.g. Morning Shift, POS counter 1">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Confirm Clock In</button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitClockIn(e) {
    e.preventDefault();
    const openingCash = parseFloat(document.getElementById('clock-opening-cash').value) || 0;
    const notes = document.getElementById('clock-notes').value.trim();

    try {
      const res = await API.clockIn({
        user_id: State.currentUser.id,
        work_date: new Date().toISOString().split('T')[0],
        opening_cash: openingCash,
        notes: notes
      });
      if (res && res.success) {
        State.showToast('You are clocked in. Shift active!', 'success');
        document.getElementById('clock-modal').classList.remove('active');
        await this.checkShiftStatus();
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  showClockOutModal() {
    const modal = document.getElementById('clock-modal');
    document.getElementById('clock-modal-title').textContent = 'Clock Out & Close Shift';
    document.getElementById('clock-modal-body').innerHTML = `
      <form id="clock-out-form" onsubmit="App.submitClockOut(event)">
        <div class="form-group">
          <label class="form-label">Worker Name</label>
          <input type="text" class="form-input" value="${State.currentUser.full_name}" disabled>
        </div>
        <div class="form-group">
          <label class="form-label">Closing Cash Handed Over (${State.settings.currency_symbol || 'TSh'})</label>
          <input type="number" id="clock-closing-cash" class="form-input" step="any" placeholder="Total cash in hand" required>
        </div>
        <div class="form-group">
          <label class="form-label">End of Shift Notes / Handover</label>
          <input type="text" id="clock-out-notes" class="form-input" placeholder="e.g. Balanced drawer, handed over to evening cashier">
        </div>
        <button type="submit" class="btn btn-danger" style="width: 100%;">Confirm Clock Out</button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitClockOut(e) {
    e.preventDefault();
    const closingCash = parseFloat(document.getElementById('clock-closing-cash').value) || 0;
    const notes = document.getElementById('clock-out-notes').value.trim();

    try {
      const res = await API.clockOut({
        user_id: State.currentUser.id,
        shift_id: State.activeShift?.id,
        closing_cash: closingCash,
        notes: notes
      });
      if (res && res.success) {
        State.showToast('Clocked out successfully. Have a great day!', 'info');
        document.getElementById('clock-modal').classList.remove('active');
        State.activeShift = null;
        this.updateShiftUI();
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  // -------------------------------------------------------------
  // ROUTING & VIEW NAVIGATION & MOBILE RESPONSIVENESS
  // -------------------------------------------------------------
  toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;
    if (sidebar.classList.contains('sidebar-open')) {
      this.closeMobileSidebar();
    } else {
      sidebar.classList.add('sidebar-open');
      if (backdrop) backdrop.classList.add('active');
    }
  },

  closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('sidebar-open');
    if (backdrop) backdrop.classList.remove('active');
  },

  navigate(route) {
    State.currentRoute = route;
    this.closeMobileSidebar();

    // Update active nav link in sidebar
    document.querySelectorAll('.nav-item').forEach(el => {
      if (el.dataset.route === route) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Update active nav item in mobile bottom bar
    document.querySelectorAll('.bottom-nav-item').forEach(el => {
      if (el.dataset.route === route) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    const titleEl = document.getElementById('page-title');
    const subEl = document.getElementById('page-subtitle');
    const container = document.getElementById('content-area');

    switch (route) {
      case 'dashboard':
        titleEl.textContent = 'Dashboard & Business Overview';
        subEl.textContent = 'Live financial metrics, active workers, capital, and quick actions';
        this.renderDashboard(container);
        break;
      case 'pos':
        titleEl.textContent = 'Point of Sale (POS)';
        subEl.textContent = 'Fast checkout, thermal receipt printing, cash and mobile money';
        this.renderPOS(container);
        break;
      case 'invoices':
        titleEl.textContent = 'Sales Invoices';
        subEl.textContent = 'Commercial tax invoices, customer billing, payment status';
        this.renderInvoices(container);
        break;
      case 'proforma':
        titleEl.textContent = 'Proforma Invoices (Quotations)';
        subEl.textContent = 'Generate quotations, customer pricing, convert to invoice with 1 click';
        this.renderProforma(container);
        break;
      case 'delivery-notes':
        titleEl.textContent = 'Delivery Notes';
        subEl.textContent = 'Dispatch tracking, transporters, customer destination and signatures';
        this.renderDeliveryNotes(container);
        break;
      case 'inventory':
        titleEl.textContent = 'Inventory & Stock Management';
        subEl.textContent = 'Real-time stock on hand, valuation, restock, and movement audit log';
        this.renderInventory(container);
        break;
      case 'debtors':
        titleEl.textContent = 'Customers & Debtors Ledger';
        subEl.textContent = 'Track customer debt, credit sales, record debt repayments and receipts';
        this.renderDebtors(container);
        break;
      case 'suppliers':
        titleEl.textContent = 'Suppliers & Purchase Orders (POs)';
        subEl.textContent = 'Vendor directory, issue POs, and receive stock into warehouse';
        this.renderSuppliers(container);
        break;
      case 'expenses':
        titleEl.textContent = 'Daily Business Expenses';
        subEl.textContent = 'Track daily operational costs, rent, transport, wages, and utilities';
        this.renderExpenses(container);
        break;
      case 'capital':
        if (!State.isAdmin()) {
          State.showToast('Access restricted: Capital and business financials are only visible to Administrators', 'error');
          this.navigate('dashboard');
          return;
        }
        titleEl.textContent = 'Capital Available & Financial Health';
        subEl.textContent = 'Cash in register, bank, mobile money, and total net business capital';
        this.renderCapital(container);
        break;
      case 'workers':
        if (!State.isAdmin()) {
          State.showToast('Access restricted: Only administrators can access staff accounts and shift logs', 'error');
          this.navigate('dashboard');
          return;
        }
        titleEl.textContent = 'Admin: Workers & Daily Shift Logs';
        subEl.textContent = 'Worker directory, assign roles, and see who was working on any specific day';
        this.renderWorkers(container);
        break;
      case 'reports':
        titleEl.textContent = 'Daily Sales & Financial Reports';
        subEl.textContent = 'Audit sales by worker, daily profit & loss, and transaction history';
        this.renderReports(container);
        break;
      case 'settings':
        if (!State.isAdmin()) {
          State.showToast('Access restricted: Only administrators can access company settings', 'error');
          this.navigate('dashboard');
          return;
        }
        titleEl.textContent = 'Company Profile & System Settings';
        subEl.textContent = 'Business credentials, logo, thermal printer format, and backup';
        this.renderSettings(container);
        break;
      case 'branches':
        if (!State.isAdmin()) {
          State.showToast('Access restricted: Only administrators can manage shops and branches', 'error');
          this.navigate('dashboard');
          return;
        }
        titleEl.textContent = 'Multi-Shop & Branch Management';
        subEl.textContent = 'Add and manage multiple business shops with isolated stock and calculations';
        this.renderBranches(container);
        break;
      default:
        this.renderDashboard(container);
    }
  },

  renderApp() {
    this.updateShiftUI();
    this.navigate(State.currentRoute || 'dashboard');
  },

  // -------------------------------------------------------------
  // 1. DASHBOARD VIEW
  // -------------------------------------------------------------
  async renderDashboard(container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading Dashboard...</div>`;
    try {
      const res = await API.getDashboardReport(State.currentBranch);
      const d = res.dashboard || res || {};
      const activeBranchName = State.getCurrentBranchName();

      container.innerHTML = `
        <!-- Active Branch Context Indicator -->
        <div class="branch-context-card">
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; letter-spacing: 0.5px;">ACTIVE SHOP VIEW</div>
            <div style="font-size: 16px; font-weight: 800; color: var(--text-main); margin-top: 2px;">
              🏪 ${this.escape(activeBranchName)}
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <span class="badge ${State.currentBranch === 'all' ? 'badge-neutral' : 'badge-success'}">
              ${State.currentBranch === 'all' ? 'All Shops Combined' : 'Isolated Branch Numbers'}
            </span>
            <button class="btn btn-sm btn-outline admin-only" onclick="App.navigate('branches')">Manage Shops</button>
          </div>
        </div>

        <!-- Top Metrics Cards -->
        <div class="metrics-grid">
          ${State.isAdmin() ? `
            <div class="metric-card">
              <div class="metric-card-top">
                <span class="metric-title">Total Capital</span>
                <div class="metric-icon teal">
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
              </div>
              <div class="metric-data">
                <div class="metric-value" style="color: var(--primary);">${State.formatMoney(d.total_capital || d.net_capital || ((parseFloat(d.stock_value) || 0) + (parseFloat(d.capital_available) || 0)))}</div>
                <div class="metric-sub">Stock: ${State.formatMoney(d.stock_value || 0)} • Liquid: ${State.formatMoney(d.capital_available || 0)}</div>
              </div>
            </div>
          ` : `
            <div class="metric-card">
              <div class="metric-card-top">
                <span class="metric-title">Shift Status</span>
                <div class="metric-icon teal">
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                </div>
              </div>
              <div class="metric-data">
                <div class="metric-value" style="color: var(--primary); font-size: 18px;">${State.activeShift ? 'Clocked In' : 'Not Clocked In'}</div>
                <div class="metric-sub">${State.currentUser?.role || 'Staff'} • ${State.getCurrentBranchName()}</div>
              </div>
            </div>
          `}

          <div class="metric-card">
            <div class="metric-card-top">
              <span class="metric-title">Today's Sales</span>
              <div class="metric-icon green">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
              </div>
            </div>
            <div class="metric-data">
              <div class="metric-value" style="color: var(--success);">${State.formatMoney(d.today_sales)}</div>
              <div class="metric-sub">${d.today_orders_count || 0} completed orders today</div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-card-top">
              <span class="metric-title">Today's Expenses</span>
              <div class="metric-icon red">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
            </div>
            <div class="metric-data">
              <div class="metric-value" style="color: var(--danger);">${State.formatMoney(d.today_expenses)}</div>
              <div class="metric-sub">Net Today: ${State.formatMoney(d.net_today)}</div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-card-top">
              <span class="metric-title">Debtors Due</span>
              <div class="metric-icon amber">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"></path></svg>
              </div>
            </div>
            <div class="metric-data">
              <div class="metric-value" style="color: #b45309;">${State.formatMoney(d.debtors_total)}</div>
              <div class="metric-sub">Accounts Receivable</div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-card-top">
              <span class="metric-title">Staff On Duty</span>
              <div class="metric-icon blue">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              </div>
            </div>
            <div class="metric-data">
              <div class="metric-value" style="color: var(--secondary);">${d.active_workers_count} Active</div>
              <div class="metric-sub"><a href="javascript:void(0)" onclick="App.navigate('workers')" style="color: var(--secondary); text-decoration: underline;">View shifts roster</a></div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-card-top">
              <span class="metric-title">Stock Alerts</span>
              <div class="metric-icon purple">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
              </div>
            </div>
            <div class="metric-data">
              <div class="metric-value" style="color: ${d.low_stock_count > 0 ? 'var(--danger)' : '#475569'};">${d.low_stock_count} Low Items</div>
              <div class="metric-sub"><a href="javascript:void(0)" onclick="App.navigate('inventory')" style="color: var(--primary); text-decoration: underline;">Open inventory</a></div>
            </div>
          </div>
        </div>

        <!-- Quick Launch Action Icons Grid -->
        <div class="quick-actions-card">
          <div class="quick-actions-title">Quick Business Operations</div>
          <div class="quick-actions-grid">
            <div class="quick-action-item" onclick="App.navigate('pos')">
              <div class="action-icon-circle bg-teal">
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
              </div>
              <span class="action-label">POS Sale</span>
            </div>

            <div class="quick-action-item" onclick="App.navigate('invoices')">
              <div class="action-icon-circle bg-blue">
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              </div>
              <span class="action-label">Invoices</span>
            </div>

            <div class="quick-action-item" onclick="App.navigate('inventory')">
              <div class="action-icon-circle bg-emerald">
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
              </div>
              <span class="action-label">Stock</span>
            </div>

            <div class="quick-action-item" onclick="App.navigate('expenses')">
              <div class="action-icon-circle bg-rose">
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <span class="action-label">Expenses</span>
            </div>

            <div class="quick-action-item" onclick="App.navigate('delivery-notes')">
              <div class="action-icon-circle bg-amber">
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"></path></svg>
              </div>
              <span class="action-label">Delivery</span>
            </div>

            <div class="quick-action-item" onclick="App.navigate('proforma')">
              <div class="action-icon-circle bg-indigo">
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
              </div>
              <span class="action-label">Proforma</span>
            </div>

            <div class="quick-action-item" onclick="App.navigate('debtors')">
              <div class="action-icon-circle bg-violet">
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              </div>
              <span class="action-label">Debtors</span>
            </div>

            <div class="quick-action-item" onclick="App.navigate('reports')">
              <div class="action-icon-circle bg-slate">
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
              </div>
              <span class="action-label">Reports</span>
            </div>
          </div>
        </div>

        <!-- Recent Transactions Grid -->
        <div class="dashboard-split-grid">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Recent Sales & Invoices</h3>
              <button class="btn btn-sm btn-secondary" onclick="App.navigate('invoices')">View All</button>
            </div>
            <div id="dashboard-recent-orders">Loading recent sales...</div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Today's Staff On Duty</h3>
              <button class="btn btn-sm btn-secondary" onclick="App.navigate('workers')">Shift Details</button>
            </div>
            <div id="dashboard-shift-list">Loading shifts...</div>
          </div>
        </div>
      `;

      // Load Recent Orders
      const ordRes = await API.getOrders();
      const recentOrders = (ordRes.orders || []).slice(0, 6);
      const ordersContainer = document.getElementById('dashboard-recent-orders');

      if (recentOrders.length === 0) {
        ordersContainer.innerHTML = `
          <div class="empty-state">
            <p>No transactions yet. Start by adding products in Inventory and making your first sale in POS!</p>
            <button class="btn btn-sm btn-primary" onclick="App.navigate('pos')">Open POS Terminal</button>
          </div>
        `;
      } else {
        ordersContainer.innerHTML = `
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${recentOrders.map(o => `
                  <tr>
                    <td><strong>${o.order_number}</strong></td>
                    <td>${o.customer_name}</td>
                    <td><span class="badge ${o.order_type === 'POS' ? 'badge-info' : 'badge-neutral'}">${o.order_type}</span></td>
                    <td><strong>${State.formatMoney(o.total)}</strong></td>
                    <td><span class="badge ${o.payment_status === 'PAID' ? 'badge-success' : 'badge-danger'}">${o.payment_status}</span></td>
                    <td>
                      <div style="display: flex; gap: 4px;">
                        <button class="btn btn-sm btn-secondary" onclick="App.viewAndPrintOrder(${o.id}, '${o.order_type}')">
                          Print
                        </button>
                        ${State.isAdmin() ? `
                          <button class="btn btn-sm btn-danger" onclick="App.deleteOrderAction('${o.id}')">
                            Delete
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      // Load Shifts on Duty Today
      const today = new Date().toISOString().split('T')[0];
      const shiftRes = await API.getShifts(today);
      const shifts = shiftRes.shifts || [];
      const shiftContainer = document.getElementById('dashboard-shift-list');

      if (shifts.length === 0) {
        shiftContainer.innerHTML = `
          <div class="empty-state" style="padding: 24px 10px;">
            <p>No workers clocked in yet today.</p>
            <button class="btn btn-sm btn-primary" onclick="App.showClockInModal()">Clock In Now</button>
          </div>
        `;
      } else {
        shiftContainer.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${shifts.map(s => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: #f8fafc; border: 1px solid var(--border); border-radius: 6px;">
                <div>
                  <div style="font-weight: 600; font-size: 13px;">${s.worker_name}</div>
                  <div style="font-size: 11px; color: var(--text-muted);">${s.worker_role} • In: ${new Date(s.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div>
                  <span class="badge ${s.clock_out ? 'badge-neutral' : 'badge-success'}">
                    ${s.clock_out ? 'Signed Out' : 'Active On Duty'}
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }

    } catch (e) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Failed to load dashboard: ${e.message}</div>`;
    }
  },

  // -------------------------------------------------------------
  // 2. POINT OF SALE (POS)
  // -------------------------------------------------------------
  switchPOSTab(tab) {
    const productsPanel = document.querySelector('.pos-products-panel');
    const cartPanel = document.querySelector('.pos-cart-panel');
    const prodTab = document.getElementById('pos-tab-products');
    const cartTab = document.getElementById('pos-tab-cart');
    const floatBar = document.getElementById('pos-mobile-floating-bar');

    if (tab === 'cart') {
      if (productsPanel) productsPanel.classList.add('pos-mobile-hide');
      if (cartPanel) cartPanel.classList.remove('pos-mobile-hide');
      if (prodTab) prodTab.classList.remove('active');
      if (cartTab) cartTab.classList.add('active');
      if (floatBar) floatBar.style.display = 'none';
      const cartEl = document.querySelector('.pos-cart-panel');
      if (cartEl) cartEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      if (productsPanel) productsPanel.classList.remove('pos-mobile-hide');
      if (cartPanel) cartPanel.classList.add('pos-mobile-hide');
      if (prodTab) prodTab.classList.add('active');
      if (cartTab) cartTab.classList.remove('active');
      const totalQty = (State.cart || []).reduce((acc, it) => acc + (parseFloat(it.quantity) || 0), 0);
      if (floatBar && totalQty > 0) {
        floatBar.style.display = 'flex';
      }
    }
  },

  async renderPOS(container) {
    container.innerHTML = `
      <!-- Mobile POS Tab Navigation -->
      <div class="pos-mobile-nav">
        <button type="button" id="pos-tab-products" class="pos-mobile-tab active" onclick="App.switchPOSTab('products')">
          📦 Products Catalog
        </button>
        <button type="button" id="pos-tab-cart" class="pos-mobile-tab" onclick="App.switchPOSTab('cart')">
          🛒 Current Cart <span id="pos-mobile-cart-badge" class="badge badge-info" style="font-size: 11px; padding: 2px 7px;">0</span>
        </button>
      </div>

      <div class="pos-container">
        <!-- Products Grid Panel -->
        <div class="pos-products-panel">
          <div class="pos-search-bar">
            <input type="text" id="pos-search-input" class="form-input" placeholder="Search product by name, SKU or barcode..." oninput="App.filterPOSProducts()">
            <select id="pos-category-filter" class="form-select" style="max-width: 170px;" onchange="App.filterPOSProducts()">
              <option value="">All Categories</option>
            </select>
            ${State.isAdmin() ? `
              <button class="btn btn-primary" onclick="App.showNewProductModal()">+ Add Product</button>
              <button class="btn btn-secondary" onclick="App.showStockImportModal()" title="Import stock from CSV / Excel file">📁 Import File</button>
            ` : ''}
          </div>
          <div id="pos-products-list" class="pos-product-grid">
            <div style="grid-column: 1/-1; text-align: center; padding: 40px;">Loading inventory products...</div>
          </div>
        </div>

        <!-- POS Cart Panel -->
        <div class="pos-cart-panel pos-mobile-hide">
          <button type="button" class="btn btn-sm btn-secondary pos-mobile-back-btn" onclick="App.switchPOSTab('products')" style="display: none; margin-bottom: 12px; width: 100%; font-weight: 600;">
            &larr; Back to Products Catalog
          </button>
          <div class="pos-cart-header">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <h3 style="font-size: 15px; font-weight: 700;">Current Cart</h3>
              <button class="btn btn-sm btn-secondary" onclick="App.clearCartConfirm()">Clear</button>
            </div>
            <!-- Customer Picker -->
            <div style="display: flex; gap: 8px;">
              <select id="pos-customer-select" class="form-select" onchange="App.onPOSCustomerSelect(this.value)">
                <option value="">Walk-in Customer</option>
              </select>
              <button class="btn btn-sm btn-secondary" title="Add Customer" onclick="App.showNewCustomerModal()">+</button>
            </div>
            <div id="pos-customer-credit-alert" style="display: none; margin-top: 6px; font-size: 11.5px; color: #b45309; background: #fef3c7; padding: 4px 8px; border-radius: 4px;"></div>
          </div>

          <div id="pos-cart-items" class="pos-cart-items">
            <!-- Cart items dynamically inserted here -->
          </div>

          <div class="pos-cart-summary">
            <div class="summary-row">
              <span>Subtotal:</span>
              <span id="pos-subtotal">TSh 0</span>
            </div>
            <div class="summary-row" style="align-items: center;">
              <span>Discount (${State.settings.currency_symbol || 'TSh'}):</span>
              <input type="number" id="pos-discount" class="form-input" style="width: 100px; padding: 2px 6px; text-align: right; height: 26px;" value="0" min="0" oninput="App.updatePOSSummary()">
            </div>
            <div class="summary-row total">
              <span>Total Payable:</span>
              <span id="pos-total-amount" style="color: var(--primary);">TSh 0</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px;">
              <button class="btn btn-secondary" onclick="App.saveAsProformaFromPOS()">Save as Proforma</button>
              <button class="btn btn-primary" id="pos-pay-btn" onclick="App.showPOSPaymentModal()" style="font-size: 15px;">Pay & Print Receipt</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Mobile Floating Checkout Bar -->
      <div id="pos-mobile-floating-bar" class="pos-mobile-floating-cart" onclick="App.switchPOSTab('cart')">
        <div class="pos-float-info">
          <span class="pos-float-count">🛒 <span id="pos-float-items-count">0</span> items in cart</span>
          <span class="pos-float-total" id="pos-float-total">TSh 0</span>
        </div>
        <button type="button" class="btn btn-sm btn-primary" style="pointer-events: none; border-radius: 20px; font-weight: 700; padding: 6px 14px;">
          View Cart &rarr;
        </button>
      </div>
    `;

    // Fetch products & customers
    try {
      const [pRes, cRes] = await Promise.all([API.getProducts(), API.getCustomers()]);
      this.productsCache = (pRes.products || []).map((p, idx) => ({
        ...p,
        id: String(p.id !== undefined && p.id !== null ? p.id : `prod_${idx}`),
        selling_price: parseFloat(p.selling_price || 0),
        cost_price: parseFloat(p.cost_price || 0),
        stock_quantity: parseFloat(p.stock_quantity || 0)
      }));
      this.customersCache = cRes.customers || [];

      // Populate category filter
      const catSelect = document.getElementById('pos-category-filter');
      const cats = Array.from(new Set(this.productsCache.map(p => p.category).filter(Boolean)));
      cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        catSelect.appendChild(opt);
      });

      // Populate customer select
      const custSelect = document.getElementById('pos-customer-select');
      this.customersCache.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (${c.phone || 'No phone'})`;
        custSelect.appendChild(opt);
      });

      this.filterPOSProducts();
      this.renderCartUI();
    } catch (e) {
      console.error('POS data fetch error:', e);
    }
  },

  filterPOSProducts() {
    const query = (document.getElementById('pos-search-input')?.value || '').toLowerCase().trim();
    const category = document.getElementById('pos-category-filter')?.value || '';
    const container = document.getElementById('pos-products-list');
    if (!container) return;

    const filtered = (this.productsCache || []).filter(p => {
      const name = (p.name || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const barcode = (p.barcode || '').toLowerCase();
      const matchesQ = !query || name.includes(query) || sku.includes(query) || barcode.includes(query);
      const matchesC = !category || p.category === category;
      return matchesQ && matchesC;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <h3>No products found</h3>
          <p>Add products to your inventory or import from a file to start selling.</p>
          ${State.isAdmin() ? `
            <div style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
              <button class="btn btn-primary" onclick="App.showNewProductModal()">+ Add New Product</button>
              <button class="btn btn-secondary" onclick="App.showStockImportModal()">📁 Import Stock from File</button>
            </div>
          ` : '<p style="color: var(--text-muted); font-size: 13px; margin-top: 8px;">Please ask your manager or store admin to add stock items.</p>'}
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(p => {
      const stock = parseFloat(p.stock_quantity || 0);
      const minAlert = parseFloat(p.min_alert_quantity || 5);
      const isLow = stock <= minAlert;
      const isOut = stock <= 0;
      const hasImage = Boolean(p.image_url);
      const safeId = this.escape(String(p.id));
      const safeName = this.escape(p.name || 'Product');
      const safeSku = this.escape(p.sku || '');
      const safeCategory = this.escape(p.category || 'General');
      const safeUnit = this.escape(p.unit || 'pcs');

      return `
        <div class="pos-product-card" onclick="App.addProductToPOSCart('${safeId}')">
          <div class="pos-product-thumb-wrap">
            ${hasImage 
              ? `<img src="${p.image_url}" alt="${safeName}" class="pos-product-img" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'pos-product-no-img\\'>📦</div>';">` 
              : `<div class="pos-product-no-img">📦</div>`
            }
          </div>
          <div>
            <div class="pos-product-name" title="${safeName}">${safeName}</div>
            <div class="pos-product-sku">${safeSku ? safeSku + ' • ' : ''}${safeCategory}</div>
          </div>
          <div class="pos-product-meta">
            <div class="pos-product-price">${State.formatMoney(p.selling_price)}</div>
            <div class="pos-product-stock ${isOut ? 'out' : (isLow ? 'low' : '')}">
              ${stock} ${safeUnit}
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-primary pos-add-cart-btn" onclick="event.stopPropagation(); App.addProductToPOSCart('${safeId}')">
            + Add to Cart
          </button>
        </div>
      `;
    }).join('');
  },

  addProductToPOSCart(productId) {
    if (!this.productsCache || this.productsCache.length === 0) {
      State.showToast('Product catalog is loading, please try in a moment', 'warning');
      return;
    }
    const targetId = String(productId);
    const prod = this.productsCache.find(p => String(p.id) === targetId);
    if (!prod) {
      State.showToast('Product not found in catalog', 'warning');
      return;
    }
    State.addToCart(prod, 1);
    this.renderCartUI();
    State.showToast(`Added "${prod.name || 'Product'}" to cart`, 'success');
  },

  renderCartUI() {
    const container = document.getElementById('pos-cart-items');
    if (!container) return;

    if (!State.cart || State.cart.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 40px 10px;">
          <p>Cart is empty.<br>Click items on the left or press "+ Add to Cart".</p>
        </div>
      `;
      this.updatePOSSummary();
      return;
    }

    container.innerHTML = State.cart.map(item => {
      const safeId = this.escape(String(item.product_id));
      const safeName = this.escape(item.product_name || 'Product');
      const safeUnit = this.escape(item.unit || 'pcs');

      return `
        <div class="pos-cart-item">
          ${item.image_url ? `<img src="${item.image_url}" class="cart-item-thumb" alt="${safeName}" onerror="this.style.display='none'">` : ''}
          <div class="cart-item-info">
            <div class="cart-item-title">${safeName}</div>
            <div class="cart-item-price">${State.formatMoney(item.unit_price)} / ${safeUnit}</div>
          </div>
          <div class="cart-item-controls">
            <button class="qty-btn" type="button" onclick="App.adjustCartItemQty('${safeId}', -1)">-</button>
            <input type="number" class="qty-input" value="${item.quantity}" min="0.1" step="any" onchange="App.setCartItemQty('${safeId}', this.value)">
            <button class="qty-btn" type="button" onclick="App.adjustCartItemQty('${safeId}', 1)">+</button>
            <div style="font-weight: 700; min-width: 65px; text-align: right; font-size: 13px;">${State.formatMoney(item.total_price)}</div>
            <button style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 2px 6px; font-size: 14px; font-weight: bold;" title="Remove" onclick="App.removeCartItem('${safeId}')">✕</button>
          </div>
        </div>
      `;
    }).join('');

    this.updatePOSSummary();
  },

  adjustCartItemQty(productId, delta) {
    const targetId = String(productId);
    const item = (State.cart || []).find(i => String(i.product_id) === targetId);
    if (item) {
      const newQty = Math.round((item.quantity + delta) * 100) / 100;
      if (newQty <= 0) {
        State.removeFromCart(targetId);
      } else {
        State.updateCartQty(targetId, newQty);
      }
      this.renderCartUI();
    }
  },

  setCartItemQty(productId, val) {
    const targetId = String(productId);
    const qty = parseFloat(val);
    if (isNaN(qty) || qty <= 0) {
      State.removeFromCart(targetId);
    } else {
      State.updateCartQty(targetId, qty);
    }
    this.renderCartUI();
  },

  removeCartItem(productId) {
    State.removeFromCart(String(productId));
    this.renderCartUI();
  },

  clearCartConfirm() {
    if (State.cart.length > 0 && confirm('Are you sure you want to clear the cart?')) {
      State.clearCart();
      this.renderCartUI();
    }
  },

  onPOSCustomerSelect(customerId) {
    const alertBox = document.getElementById('pos-customer-credit-alert');
    if (!customerId) {
      State.cartCustomer = null;
      if (alertBox) alertBox.style.display = 'none';
      return;
    }

    const cust = this.customersCache.find(c => c.id == customerId);
    State.cartCustomer = cust || null;

    if (alertBox && cust) {
      if (cust.current_credit > 0) {
        alertBox.style.display = 'block';
        alertBox.innerHTML = `⚠️ <strong>Debtor Warning:</strong> This customer currently owes <strong>${State.formatMoney(cust.current_credit)}</strong>.`;
      } else {
        alertBox.style.display = 'none';
      }
    }
  },

  updatePOSSummary() {
    const subtotal = State.getCartSubtotal();
    const discount = parseFloat(document.getElementById('pos-discount')?.value || 0) || 0;
    const total = Math.max(0, subtotal - discount);

    const subtotalEl = document.getElementById('pos-subtotal');
    const totalEl = document.getElementById('pos-total-amount');

    if (subtotalEl) subtotalEl.textContent = State.formatMoney(subtotal);
    if (totalEl) totalEl.textContent = State.formatMoney(total);

    // Update Mobile Cart Indicators
    const totalQty = (State.cart || []).reduce((acc, it) => acc + (parseFloat(it.quantity) || 0), 0);
    const cartBadge = document.getElementById('pos-mobile-cart-badge');
    if (cartBadge) cartBadge.textContent = totalQty;

    const floatCount = document.getElementById('pos-float-items-count');
    const floatTotal = document.getElementById('pos-float-total');
    const floatBar = document.getElementById('pos-mobile-floating-bar');

    if (floatCount) floatCount.textContent = totalQty;
    if (floatTotal) floatTotal.textContent = State.formatMoney(total);

    if (floatBar) {
      const prodPanel = document.querySelector('.pos-products-panel');
      const isProdActive = prodPanel && !prodPanel.classList.contains('pos-mobile-hide');
      if (totalQty > 0 && isProdActive) {
        floatBar.style.display = 'flex';
      } else {
        floatBar.style.display = 'none';
      }
    }
  },

  showPOSPaymentModal() {
    if (State.cart.length === 0) {
      State.showToast('Cart is empty. Add products first.', 'error');
      return;
    }

    const subtotal = State.getCartSubtotal();
    const discount = parseFloat(document.getElementById('pos-discount')?.value || 0) || 0;
    const total = Math.max(0, subtotal - discount);

    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = 'Complete Payment & Checkout';
    document.getElementById('general-modal-body').innerHTML = `
      <form id="pos-checkout-form" onsubmit="App.submitPOSCheckout(event, ${subtotal}, ${discount}, ${total})">
        <div style="background: #f8fafc; padding: 14px; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 16px; text-align: center;">
          <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Total Amount Due</div>
          <div style="font-size: 28px; font-weight: 800; color: var(--primary);">${State.formatMoney(total)}</div>
        </div>

        <div class="form-group">
          <label class="form-label">Payment Method</label>
          <select id="checkout-payment-method" class="form-select" onchange="App.onPaymentMethodChange(this.value, ${total})">
            <option value="CASH">Cash in Drawer</option>
            <option value="MPESA">M-Pesa</option>
            <option value="TIGO_PESA">Tigo Pesa</option>
            <option value="AIRTEL_MONEY">Airtel Money</option>
            <option value="BANK">Bank Transfer / CRDB / NMB</option>
            <option value="CREDIT">On Credit (Debtor Account)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Amount Tendered / Paid</label>
          <input type="number" id="checkout-amount-paid" class="form-input" step="any" value="${total}" oninput="App.calculatePOSChange(${total})" required>
        </div>

        <div id="checkout-change-row" style="display: flex; justify-content: space-between; padding: 8px 12px; background: #f1f5f9; border-radius: 4px; margin-bottom: 16px; font-size: 13px;">
          <span>Change to Return:</span>
          <strong id="checkout-change-amount" style="color: var(--success);">${State.formatMoney(0)}</strong>
        </div>

        <div class="form-group">
          <label class="form-label">Order Notes / Reference (Optional)</label>
          <input type="text" id="checkout-notes" class="form-input" placeholder="e.g. M-Pesa ref code, customer memo">
        </div>

        <button type="submit" class="btn btn-primary btn-lg" style="width: 100%;">Confirm & Print Receipt</button>
      </form>
    `;
    modal.classList.add('active');
  },

  onPaymentMethodChange(method, total) {
    const amountInput = document.getElementById('checkout-amount-paid');
    const changeRow = document.getElementById('checkout-change-row');
    if (method === 'CREDIT') {
      if (!State.cartCustomer) {
        State.showToast('Please select a registered customer to sell on credit', 'error');
        document.getElementById('checkout-payment-method').value = 'CASH';
        return;
      }
      amountInput.value = 0;
      if (changeRow) changeRow.style.display = 'none';
    } else {
      amountInput.value = total;
      if (changeRow) changeRow.style.display = 'flex';
      this.calculatePOSChange(total);
    }
  },

  calculatePOSChange(total) {
    const paid = parseFloat(document.getElementById('checkout-amount-paid')?.value || 0) || 0;
    const change = Math.max(0, paid - total);
    const changeEl = document.getElementById('checkout-change-amount');
    if (changeEl) changeEl.textContent = State.formatMoney(change);
  },

  async submitPOSCheckout(e, subtotal, discount, total) {
    e.preventDefault();
    const payMethod = document.getElementById('checkout-payment-method').value;
    const amountPaid = parseFloat(document.getElementById('checkout-amount-paid').value) || 0;
    const notes = document.getElementById('checkout-notes').value.trim();

    const orderData = {
      order_type: 'POS',
      user_id: State.currentUser ? State.currentUser.id : 1,
      customer_id: State.cartCustomer ? State.cartCustomer.id : null,
      customer_name: State.cartCustomer ? State.cartCustomer.name : 'Walk-in Customer',
      customer_phone: State.cartCustomer ? State.cartCustomer.phone : null,
      subtotal: subtotal,
      discount: discount,
      tax: 0,
      total: total,
      payment_method: payMethod,
      amount_paid: amountPaid,
      notes: notes,
      items: State.cart
    };

    try {
      const res = await API.createOrder(orderData);
      if (res && res.success) {
        document.getElementById('general-modal').classList.remove('active');
        State.showToast('Sale completed successfully!', 'success');

        // Prepare order object for instant thermal receipt
        const receiptOrder = {
          ...orderData,
          order_number: res.order_number,
          id: res.order_id,
          cashier_name: State.currentUser?.full_name || 'Cashier',
          created_at: new Date().toISOString(),
          balance_due: res.balance_due
        };

        // Clear cart
        State.clearCart();
        this.renderCartUI();

        // Trigger Receipt Print Preview
        const receiptHtml = Printer.renderPosReceipt(receiptOrder);
        Printer.showPrintPreview(receiptHtml, `POS Receipt - ${res.order_number}`);
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  async saveAsProformaFromPOS() {
    if (State.cart.length === 0) {
      State.showToast('Cart is empty. Add products first.', 'error');
      return;
    }
    const subtotal = State.getCartSubtotal();
    const discount = parseFloat(document.getElementById('pos-discount')?.value || 0) || 0;
    const total = Math.max(0, subtotal - discount);

    const proformaData = {
      order_type: 'PROFORMA',
      user_id: State.currentUser ? State.currentUser.id : 1,
      customer_id: State.cartCustomer ? State.cartCustomer.id : null,
      customer_name: State.cartCustomer ? State.cartCustomer.name : 'Client Quote',
      customer_phone: State.cartCustomer ? State.cartCustomer.phone : null,
      subtotal: subtotal,
      discount: discount,
      tax: 0,
      total: total,
      payment_method: 'CASH',
      amount_paid: 0,
      notes: 'Proforma quote created from POS terminal',
      items: State.cart
    };

    try {
      const res = await API.createOrder(proformaData);
      if (res && res.success) {
        State.showToast('Proforma Invoice saved successfully!', 'success');
        State.clearCart();
        this.renderCartUI();
        this.navigate('proforma');
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  // -------------------------------------------------------------
  // 3. INVOICES & PROFORMA & DELIVERY NOTES
  // -------------------------------------------------------------
  async renderInvoices(container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading Invoices...</div>`;
    try {
      const res = await API.getOrders('INVOICE');
      const invoices = res.orders || [];

      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Commercial Sales Invoices</h3>
              <p style="font-size: 12px; color: var(--text-muted);">Manage official customer invoices and payment settlements</p>
            </div>
            <button class="btn btn-primary" onclick="App.showNewInvoiceModal()">+ Create New Invoice</button>
          </div>

          ${invoices.length === 0 ? `
            <div class="empty-state">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              <h3>No Invoices Yet</h3>
              <p>Create official invoices for your clients and track payment receipts.</p>
              <button class="btn btn-primary" onclick="App.showNewInvoiceModal()">Create First Invoice</button>
            </div>
          ` : `
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Date</th>
                    <th>Client / Customer</th>
                    <th>Subtotal</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance Due</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${invoices.map(inv => `
                    <tr>
                      <td><strong>${inv.order_number}</strong></td>
                      <td>${State.formatDate(inv.created_at)}</td>
                      <td><strong>${inv.customer_name}</strong></td>
                      <td>${State.formatMoney(inv.subtotal)}</td>
                      <td><strong>${State.formatMoney(inv.total)}</strong></td>
                      <td style="color: var(--success);">${State.formatMoney(inv.amount_paid)}</td>
                      <td style="color: ${inv.balance_due > 0 ? 'var(--danger)' : 'inherit'}; font-weight: bold;">
                        ${State.formatMoney(inv.balance_due)}
                      </td>
                      <td>
                        <span class="badge ${inv.payment_status === 'PAID' ? 'badge-success' : (inv.payment_status === 'PARTIAL' ? 'badge-warning' : 'badge-danger')}">
                          ${inv.payment_status}
                        </span>
                      </td>
                      <td>
                        <div style="display: flex; gap: 6px;">
                          <button class="btn btn-sm btn-secondary" onclick="App.viewAndPrintOrder(${inv.id}, 'INVOICE')">
                            Print A4
                          </button>
                          <button class="btn btn-sm btn-secondary" onclick="App.showDeliveryNoteModalFromInvoice(${inv.id})">
                            Delivery Note
                          </button>
                          ${State.isAdmin() ? `
                            <button class="btn btn-sm btn-danger" onclick="App.deleteOrderAction('${inv.id}')">
                              Delete
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Error loading invoices: ${e.message}</div>`;
    }
  },

  async renderProforma(container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading Proforma Invoices...</div>`;
    try {
      const res = await API.getOrders('PROFORMA');
      const proformas = res.orders || [];

      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Proforma Invoices & Quotations</h3>
              <p style="font-size: 12px; color: var(--text-muted);">Issue price quotations to prospective clients. Convert to sale upon confirmation.</p>
            </div>
            <button class="btn btn-primary" onclick="App.showNewInvoiceModal(true)">+ Create Proforma Invoice</button>
          </div>

          ${proformas.length === 0 ? `
            <div class="empty-state">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
              <h3>No Proforma Invoices</h3>
              <p>Issue quotation sheets to customers with 14-day validity terms.</p>
              <button class="btn btn-primary" onclick="App.showNewInvoiceModal(true)">Create First Proforma</button>
            </div>
          ` : `
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Proforma #</th>
                    <th>Date</th>
                    <th>Customer Name</th>
                    <th>Total Quote</th>
                    <th>Validity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${proformas.map(p => `
                    <tr>
                      <td><strong>${p.order_number}</strong></td>
                      <td>${State.formatDate(p.created_at)}</td>
                      <td><strong>${p.customer_name}</strong></td>
                      <td><strong>${State.formatMoney(p.total)}</strong></td>
                      <td>14 Days from date</td>
                      <td>
                        <div style="display: flex; gap: 6px;">
                          <button class="btn btn-sm btn-secondary" onclick="App.viewAndPrintOrder(${p.id}, 'PROFORMA')">
                            Print Proforma
                          </button>
                          <button class="btn btn-sm btn-primary" onclick="App.convertProformaAction(${p.id})">
                            Convert to Invoice
                          </button>
                          ${State.isAdmin() ? `
                            <button class="btn btn-sm btn-danger" onclick="App.deleteOrderAction('${p.id}')">
                              Delete
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Error loading proformas: ${e.message}</div>`;
    }
  },

  async convertProformaAction(proformaId) {
    if (confirm('Convert this Proforma Invoice to a confirmed Sales Invoice? This will deduct the inventory items from stock.')) {
      try {
        const res = await API.convertProforma(proformaId, 'INVOICE', State.currentUser?.id);
        if (res && res.success) {
          State.showToast('Proforma converted to Invoice successfully!', 'success');
          this.navigate('invoices');
        }
      } catch (err) {
        State.showToast(err.message, 'error');
      }
    }
  },

  async renderDeliveryNotes(container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading Delivery Notes...</div>`;
    try {
      const res = await API.getDeliveryNotes();
      const dns = res.delivery_notes || [];

      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Delivery Notes & Dispatch Records</h3>
              <p style="font-size: 12px; color: var(--text-muted);">Manage goods delivery, transporter details, recipient signatures</p>
            </div>
            <button class="btn btn-primary" onclick="App.showStandaloneDeliveryNoteModal()">+ Create Delivery Note</button>
          </div>

          ${dns.length === 0 ? `
            <div class="empty-state">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"></path></svg>
              <h3>No Delivery Notes Yet</h3>
              <p>Generate delivery notes with transport and recipient acknowledgement lines.</p>
              <button class="btn btn-primary" onclick="App.showStandaloneDeliveryNoteModal()">Create Delivery Note</button>
            </div>
          ` : `
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>DN Number</th>
                    <th>Date</th>
                    <th>Customer / Destination</th>
                    <th>Transporter / Vehicle</th>
                    <th>Dispatched By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${dns.map(dn => `
                    <tr>
                      <td><strong>${dn.delivery_number}</strong></td>
                      <td>${State.formatDate(dn.delivery_date || dn.created_at)}</td>
                      <td>
                        <strong>${dn.customer_name}</strong><br>
                        <span style="font-size: 11px; color: var(--text-muted);">${dn.delivery_address}</span>
                      </td>
                      <td>${dn.transporter_name || 'Direct'} • ${dn.vehicle_number || 'N/A'}</td>
                      <td>${dn.dispatched_by_name || 'Staff'}</td>
                      <td>
                        <div style="display: flex; gap: 6px;">
                          <button class="btn btn-sm btn-secondary" onclick="App.viewAndPrintDeliveryNote(${JSON.stringify(dn).replace(/"/g, '&quot;')})">
                            Print Note
                          </button>
                          ${State.isAdmin() ? `
                            <button class="btn btn-sm btn-danger" onclick="App.deleteDeliveryNoteAction('${dn.id}')">
                              Delete
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Error loading delivery notes: ${e.message}</div>`;
    }
  },

  async viewAndPrintOrder(orderId, type) {
    try {
      const res = await API.getOrder(orderId);
      if (res && res.order) {
        const order = res.order;
        if (type === 'POS') {
          const html = Printer.renderPosReceipt(order);
          Printer.showPrintPreview(html, `POS Receipt - ${order.order_number}`);
        } else if (type === 'PROFORMA') {
          const html = Printer.renderA4Invoice(order, true);
          Printer.showPrintPreview(html, `Proforma Invoice - ${order.order_number}`);
        } else {
          const html = Printer.renderA4Invoice(order, false);
          Printer.showPrintPreview(html, `Commercial Invoice - ${order.order_number}`);
        }
      }
    } catch (e) {
      State.showToast(e.message, 'error');
    }
  },

  viewAndPrintDeliveryNote(dn) {
    const html = Printer.renderA4DeliveryNote(dn);
    Printer.showPrintPreview(html, `Delivery Note - ${dn.delivery_number}`);
  },

  // -------------------------------------------------------------
  // 4. INVENTORY & STOCK MANAGEMENT
  // -------------------------------------------------------------
  async renderInventory(container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading Stock & Inventory...</div>`;
    try {
      const [pRes, capRes] = await Promise.all([API.getProducts(), API.getCapital()]);
      const products = pRes.products || [];
      const cap = capRes.capital || {};

      container.innerHTML = `
        <!-- Inventory Valuation Metrics -->
        <div class="metrics-grid">
          ${State.isAdmin() ? `
            <div class="metric-card">
              <div class="metric-data">
                <h4>Total Stock Asset Value (Cost)</h4>
                <div class="metric-value" style="color: var(--primary);">${State.formatMoney(cap.stock_cost_valuation)}</div>
                <div class="metric-sub">Capital invested in physical stock</div>
              </div>
              <div class="metric-icon teal">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-data">
                <h4>Estimated Retail Valuation</h4>
                <div class="metric-value" style="color: var(--secondary);">${State.formatMoney(cap.stock_retail_valuation)}</div>
                <div class="metric-sub">Total value at selling price</div>
              </div>
              <div class="metric-icon blue">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
            </div>
          ` : `
            <div class="metric-card">
              <div class="metric-data">
                <h4>Active Stock Items</h4>
                <div class="metric-value" style="color: var(--success);">${products.filter(p => p.stock_quantity > 0).length} Available</div>
                <div class="metric-sub">In stock ready to sell</div>
              </div>
              <div class="metric-icon green">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-data">
                <h4>Total Items in Catalog</h4>
                <div class="metric-value" style="color: var(--primary);">${products.length} Products</div>
                <div class="metric-sub">Registered catalog inventory</div>
              </div>
              <div class="metric-icon teal">
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
              </div>
            </div>
          `}

          <div class="metric-card">
            <div class="metric-data">
              <h4>${State.isAdmin() ? 'Product Catalog Count' : 'Stock Alerts'}</h4>
              <div class="metric-value" style="${products.filter(p => p.stock_quantity <= p.min_alert_quantity).length > 0 ? 'color: #d97706;' : ''}">${products.filter(p => p.stock_quantity <= p.min_alert_quantity).length} Low Stock</div>
              <div class="metric-sub">Items requiring restock soon</div>
            </div>
            <div class="metric-icon purple">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Stock Available & Products</h3>
              <p style="font-size: 12px; color: var(--text-muted);">${State.isAdmin() ? 'Real-time inventory levels, buying costs, and selling prices' : 'Current stock quantities and product selling prices'}</p>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${State.isAdmin() ? `
                <button class="btn btn-secondary" onclick="App.showStockImportModal()">📁 Import Stock from File</button>
                <button class="btn btn-secondary" onclick="App.showStockMovementsModal()">Stock Movement History</button>
                <button class="btn btn-primary" onclick="App.showNewProductModal()">+ Add New Product</button>
              ` : `
                <button class="btn btn-secondary" onclick="App.showStockMovementsModal()">Stock Movement History</button>
              `}
            </div>
          </div>

          <!-- Product Filters -->
          <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
            <input type="text" id="inventory-search" class="form-input" placeholder="Search by name, SKU or barcode..." style="max-width: 320px;" oninput="App.filterInventoryTable()">
            <select id="inventory-stock-filter" class="form-select" style="max-width: 200px;" onchange="App.filterInventoryTable()">
              <option value="ALL">All Stock Levels</option>
              <option value="LOW">Low Stock Alerts Only</option>
              <option value="OUT">Out of Stock Only</option>
            </select>
          </div>

          ${products.length === 0 ? `
            <div class="empty-state">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
              <h3>Inventory is currently empty</h3>
              <p>Add your products, materials, or import a stock file to start tracking stock quantities and sales.</p>
              <div style="display: flex; gap: 10px; justify-content: center; margin-top: 12px;">
                <button class="btn btn-primary" onclick="App.showNewProductModal()">+ Add Your First Product</button>
                <button class="btn btn-secondary" onclick="App.showStockImportModal()">📁 Import Stock from File</button>
              </div>
            </div>
          ` : `
            <div class="table-container">
              <table class="data-table" id="inventory-table">
                <thead>
                  <tr>
                    <th style="width: 50px;">Image</th>
                    <th>SKU / Code</th>
                    <th>Product / Material Name</th>
                    <th>Category</th>
                    <th>Stock on Hand</th>
                    <th>Unit</th>
                    ${State.isAdmin() ? '<th>Buying Cost</th>' : ''}
                    <th>Selling Price</th>
                    ${State.isAdmin() ? '<th>Stock Value (Cost)</th>' : ''}
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="inventory-tbody">
                  ${this.renderInventoryRows(products)}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
      this.productsCache = products;
    } catch (e) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Error loading inventory: ${e.message}</div>`;
    }
  },

  renderInventoryRows(products) {
    return products.map(p => {
      const isLow = p.stock_quantity <= p.min_alert_quantity;
      const isOut = p.stock_quantity <= 0;
      const hasImg = Boolean(p.image_url);
      return `
        <tr>
          <td>
            ${hasImg 
              ? `<img src="${p.image_url}" class="inventory-product-thumb" alt="${this.escape(p.name)}" onerror="this.onerror=null; this.outerHTML='<div class=\\'inventory-product-thumb-placeholder\\'>📦</div>';">` 
              : `<div class="inventory-product-thumb-placeholder">📦</div>`
            }
          </td>
          <td><code>${this.escape(p.sku || 'N/A')}</code></td>
          <td><strong>${this.escape(p.name)}</strong></td>
          <td>${this.escape(p.category || 'General')}</td>
          <td style="font-size: 14px; font-weight: bold; color: ${isOut ? 'var(--danger)' : (isLow ? '#d97706' : 'var(--text-main)')};">
            ${p.stock_quantity}
          </td>
          <td>${this.escape(p.unit || 'pcs')}</td>
          ${State.isAdmin() ? `<td>${State.formatMoney(p.cost_price)}</td>` : ''}
          <td><strong>${State.formatMoney(p.selling_price)}</strong></td>
          ${State.isAdmin() ? `<td><strong>${State.formatMoney(p.cost_price * p.stock_quantity)}</strong></td>` : ''}
          <td>
            <span class="badge ${isOut ? 'badge-danger' : (isLow ? 'badge-warning' : 'badge-success')}">
              ${isOut ? 'Out of Stock' : (isLow ? 'Low Stock Alert' : 'In Stock')}
            </span>
          </td>
          <td>
            ${State.isAdmin() ? `
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button class="btn btn-sm btn-secondary" title="Restock or Adjust" onclick="App.showStockAdjustModal('${p.id}')">
                  Adjust
                </button>
                <button class="btn btn-sm btn-secondary" title="Edit Product" onclick="App.showEditProductModal('${p.id}')">
                  Edit
                </button>
                <button class="btn btn-sm btn-danger" style="background: #991b1b;" title="Clear and Reset Recorded Stock to 0" onclick="App.clearStockAction('${p.id}')">
                  Clear Stock
                </button>
                <button class="btn btn-sm btn-danger" title="Delete Product" onclick="App.deleteProductAction('${p.id}')">
                  Delete
                </button>
              </div>
            ` : `
              <span class="badge badge-neutral" style="font-size: 11px;">View Only</span>
            `}
          </td>
        </tr>
      `;
    }).join('');
  },

  filterInventoryTable() {
    const q = (document.getElementById('inventory-search')?.value || '').toLowerCase();
    const filter = document.getElementById('inventory-stock-filter')?.value || 'ALL';

    const filtered = this.productsCache.filter(p => {
      const matchesQ = p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q)) || (p.category && p.category.toLowerCase().includes(q));
      let matchesF = true;
      if (filter === 'LOW') matchesF = p.stock_quantity <= p.min_alert_quantity;
      if (filter === 'OUT') matchesF = p.stock_quantity <= 0;
      return matchesQ && matchesF;
    });

    const tbody = document.getElementById('inventory-tbody');
    if (tbody) tbody.innerHTML = this.renderInventoryRows(filtered);
  },

  showStockAdjustModal(productId) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can add or adjust stock', 'error');
      return;
    }
    const p = this.productsCache.find(x => String(x.id) === String(productId));
    if (!p) return;

    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = `Adjust Stock for: ${p.name}`;
    document.getElementById('general-modal-body').innerHTML = `
      <form id="stock-adjust-form" onsubmit="App.submitStockAdjust(event, '${p.id}')">
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 14px;">
          <div>Current Stock: <strong>${p.stock_quantity} ${p.unit}</strong></div>
          ${State.isAdmin() ? `<div>Buying Cost: <strong>${State.formatMoney(p.cost_price)}</strong></div>` : ''}
        </div>

        <div class="form-group">
          <label class="form-label">Adjustment Type</label>
          <select id="adjust-type" class="form-select" required>
            <option value="RESTOCK">Restock / Received New Goods (+)</option>
            <option value="RETURN">Customer Return (+)</option>
            <option value="DAMAGED">Damaged / Expired / Loss (-)</option>
            <option value="ADJUSTMENT">Inventory Audit Adjustment (+/-)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Quantity</label>
          <input type="number" id="adjust-qty" class="form-input" step="any" placeholder="Enter quantity" required>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Enter positive number for additions, or negative for write-offs</div>
        </div>

        ${State.isAdmin() ? `
          <div class="form-group">
            <label class="form-label">Unit Cost Price (${State.settings.currency_symbol || 'TSh'})</label>
            <input type="number" id="adjust-cost" class="form-input" step="any" value="${p.cost_price}">
          </div>
        ` : `
          <input type="hidden" id="adjust-cost" value="${p.cost_price}">
        `}

        <div class="form-group">
          <label class="form-label">Notes / Reason</label>
          <input type="text" id="adjust-notes" class="form-input" placeholder="e.g. Stock delivery invoice #554, annual count">
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%;">Save Stock Adjustment</button>
        <button type="button" class="btn btn-danger" style="width: 100%; margin-top: 8px; background: #991b1b;" onclick="App.clearStockAction('${p.id}')">
          🗑️ Clear & Reset Recorded Stock to Zero (0)
        </button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitStockAdjust(e, productId) {
    e.preventDefault();
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can add or adjust stock', 'error');
      return;
    }
    const type = document.getElementById('adjust-type').value;
    let qty = parseFloat(document.getElementById('adjust-qty').value) || 0;
    const cost = parseFloat(document.getElementById('adjust-cost').value) || 0;
    const notes = document.getElementById('adjust-notes').value.trim();

    if (type === 'DAMAGED' && qty > 0) {
      qty = -qty; // Deduct for damaged
    }

    try {
      const res = await API.adjustStock({
        product_id: productId,
        movement_type: type,
        quantity: qty,
        unit_cost: cost,
        user_id: State.currentUser?.id,
        notes: notes
      });
      if (res && res.success) {
        State.showToast('Stock updated successfully', 'success');
        document.getElementById('general-modal').classList.remove('active');
        this.renderInventory(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  async showStockMovementsModal() {
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = 'Stock Movement & Audit Trail';
    document.getElementById('general-modal-body').innerHTML = `<div style="text-align: center; padding: 30px;">Loading audit movements...</div>`;
    modal.classList.add('active');

    try {
      const res = await API.getStockMovements(80);
      const mvs = res.movements || [];

      document.getElementById('general-modal-body').innerHTML = `
        ${mvs.length === 0 ? `
          <div class="empty-state">No stock movements logged yet.</div>
        ` : `
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Balance After</th>
                  <th>Logged By</th>
                  <th>Notes</th>
                  ${State.isAdmin() ? '<th>Actions</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${mvs.map(m => `
                  <tr>
                    <td>${State.formatDateTime(m.created_at)}</td>
                    <td><strong>${m.product_name}</strong></td>
                    <td><span class="badge ${m.quantity > 0 ? 'badge-success' : 'badge-danger'}">${m.movement_type}</span></td>
                    <td style="font-weight: bold; color: ${m.quantity > 0 ? 'var(--success)' : 'var(--danger)'};">
                      ${m.quantity > 0 ? `+${m.quantity}` : m.quantity} ${m.product_unit || 'pcs'}
                    </td>
                    <td><strong>${m.balance_after}</strong></td>
                    <td>${m.user_name || 'System'}</td>
                    <td>${m.notes || ''}</td>
                    ${State.isAdmin() ? `
                      <td>
                        <button class="btn btn-sm btn-danger" onclick="App.deleteStockMovementAction('${m.id}')" title="Delete this recorded stock entry and reverse product balance">
                          Delete / Revert
                        </button>
                      </td>
                    ` : ''}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      `;
    } catch (e) {
      document.getElementById('general-modal-body').innerHTML = `<div style="color: var(--danger);">${e.message}</div>`;
    }
  },

  // -------------------------------------------------------------
  // 5. CUSTOMERS & DEBTORS (CREDIT SALES TRACKING)
  // -------------------------------------------------------------
  async renderDebtors(container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading Debtors & Customers...</div>`;
    try {
      const [cRes, dRes] = await Promise.all([API.getCustomers(), API.getDebtors()]);
      const customers = cRes.customers || [];
      const debtors = dRes.debtors || [];
      const totalDebt = debtors.reduce((sum, d) => sum + (parseFloat(d.current_credit) || 0), 0);

      container.innerHTML = `
        <!-- Debtors Overview Card -->
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-data">
              <h4>Total Outstanding Debt (Receivables)</h4>
              <div class="metric-value" style="color: var(--danger);">${State.formatMoney(totalDebt)}</div>
              <div class="metric-sub">${debtors.length} customers with unpaid credit</div>
            </div>
            <div class="metric-icon red">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-data">
              <h4>Total Registered Customers</h4>
              <div class="metric-value">${customers.length} Clients</div>
              <div class="metric-sub">Commercial and retail client base</div>
            </div>
            <div class="metric-icon blue">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            </div>
          </div>
        </div>

        <!-- Debtors Table -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title" style="color: #991b1b;">⚠️ Debtors Ledger (Owing JENGAKWANZA)</h3>
              <p style="font-size: 12px; color: var(--text-muted);">List of all customers who purchased on credit and owe balance</p>
            </div>
          </div>

          ${debtors.length === 0 ? `
            <div class="empty-state" style="padding: 24px;">
              <p>🎉 Excellent! No outstanding debtor balances at the moment.</p>
            </div>
          ` : `
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Credit Limit</th>
                    <th>Current Debt Owed</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${debtors.map(d => `
                    <tr>
                      <td><strong>${d.name}</strong></td>
                      <td>${d.phone || 'N/A'}</td>
                      <td>${d.address || 'Arusha'}</td>
                      <td>${State.formatMoney(d.credit_limit)}</td>
                      <td style="color: var(--danger); font-size: 14px; font-weight: bold;">
                        ${State.formatMoney(d.current_credit)}
                      </td>
                      <td>
                        <button class="btn btn-sm btn-success" onclick="App.showDebtPaymentModal(${d.id})">
                          Collect Payment
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <!-- All Customers Directory -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Customer Directory</h3>
              <p style="font-size: 12px; color: var(--text-muted);">Manage client accounts, credit limits and contact info</p>
            </div>
            <button class="btn btn-primary" onclick="App.showNewCustomerModal()">+ Add New Customer</button>
          </div>

          ${customers.length === 0 ? `
            <div class="empty-state">
              <h3>No customers added yet</h3>
              <p>Add your regular clients and business debtors to manage invoices and credit limits.</p>
              <button class="btn btn-primary" onclick="App.showNewCustomerModal()">+ Add Customer</button>
            </div>
          ` : `
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Address</th>
                    <th>Credit Limit</th>
                    <th>Current Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${customers.map(c => `
                    <tr>
                      <td><strong>${c.name}</strong></td>
                      <td>${c.phone || '-'}</td>
                      <td>${c.email || '-'}</td>
                      <td>${c.address || '-'}</td>
                      <td>${State.formatMoney(c.credit_limit)}</td>
                      <td style="font-weight: bold; color: ${c.current_credit > 0 ? 'var(--danger)' : 'var(--success)'};">
                        ${State.formatMoney(c.current_credit)}
                      </td>
                      <td>
                        <div style="display: flex; gap: 6px;">
                          ${c.current_credit > 0 ? `
                            <button class="btn btn-sm btn-success" onclick="App.showDebtPaymentModal(${c.id})">
                              Pay
                            </button>
                          ` : ''}
                          <button class="btn btn-sm btn-secondary" onclick="App.showEditCustomerModal(${c.id})">
                            Edit
                          </button>
                          <button class="btn btn-sm btn-danger" onclick="App.deleteCustomerAction('${c.id}')">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
      this.customersCache = customers;
    } catch (e) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Error loading debtors: ${e.message}</div>`;
    }
  },

  showDebtPaymentModal(customerId) {
    const cust = this.customersCache.find(c => c.id === customerId);
    if (!cust) return;

    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = `Record Debt Repayment: ${cust.name}`;
    document.getElementById('general-modal-body').innerHTML = `
      <form id="debt-payment-form" onsubmit="App.submitDebtPayment(event, ${cust.id})">
        <div style="background: #fef2f2; border: 1px solid #fee2e2; padding: 12px; border-radius: 6px; margin-bottom: 14px;">
          <div>Customer: <strong>${cust.name}</strong></div>
          <div style="font-size: 14px; margin-top: 4px;">Outstanding Balance: <strong style="color: var(--danger);">${State.formatMoney(cust.current_credit)}</strong></div>
        </div>

        <div class="form-group">
          <label class="form-label">Repayment Amount (${State.settings.currency_symbol || 'TSh'})</label>
          <input type="number" id="pay-amount" class="form-input" step="any" max="${cust.current_credit}" value="${cust.current_credit}" required>
        </div>

        <div class="form-group">
          <label class="form-label">Payment Received In</label>
          <select id="pay-method" class="form-select" required>
            <option value="CASH">Cash in Hand / Drawer</option>
            <option value="MPESA">M-Pesa</option>
            <option value="TIGO_PESA">Tigo Pesa</option>
            <option value="BANK">Bank Deposit / CRDB / NMB</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Payment Date</label>
          <input type="date" id="pay-date" class="form-input" value="${new Date().toISOString().split('T')[0]}" required>
        </div>

        <div class="form-group">
          <label class="form-label">Receipt Remarks / Transaction Ref</label>
          <input type="text" id="pay-notes" class="form-input" placeholder="e.g. M-Pesa transaction ID, bank slip #">
        </div>

        <button type="submit" class="btn btn-success" style="width: 100%;">Record Repayment & Print Receipt</button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitDebtPayment(e, customerId) {
    e.preventDefault();
    const cust = this.customersCache.find(c => c.id === customerId);
    const amount = parseFloat(document.getElementById('pay-amount').value) || 0;
    const method = document.getElementById('pay-method').value;
    const date = document.getElementById('pay-date').value;
    const notes = document.getElementById('pay-notes').value.trim();

    try {
      const res = await API.payDebtor({
        customer_id: customerId,
        amount: amount,
        payment_method: method,
        payment_date: date,
        notes: notes,
        user_id: State.currentUser?.id
      });
      if (res && res.success) {
        State.showToast(`Payment of ${State.formatMoney(amount)} recorded!`, 'success');
        document.getElementById('general-modal').classList.remove('active');

        // Print official debt payment receipt with company logo & credentials
        const receiptPayment = {
          payment_number: res.payment_number,
          amount: amount,
          payment_method: method,
          payment_date: date,
          notes: notes,
          new_credit_balance: res.new_credit_balance,
          user_name: State.currentUser?.full_name || 'Accounts Desk'
        };

        const receiptHtml = Printer.renderDebtorPaymentReceipt(receiptPayment, cust);
        Printer.showPrintPreview(receiptHtml, `Payment Receipt - ${res.payment_number}`);

        this.renderDebtors(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  // -------------------------------------------------------------
  // 6. SUPPLIERS & PURCHASE ORDERS (POs)
  // -------------------------------------------------------------
  async renderSuppliers(container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading Suppliers & POs...</div>`;
    try {
      const [sRes, poRes] = await Promise.all([API.getSuppliers(), API.getPurchaseOrders()]);
      const suppliers = sRes.suppliers || [];
      const pos = poRes.purchase_orders || [];

      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Purchase Orders (POs)</h3>
              <p style="font-size: 12px; color: var(--text-muted);">Issue orders to suppliers and automatically update warehouse stock on receipt</p>
            </div>
            <button class="btn btn-primary" onclick="App.showNewPOModal()">+ Create Purchase Order</button>
          </div>

          ${pos.length === 0 ? `
            <div class="empty-state">
              <h3>No Purchase Orders yet</h3>
              <p>Issue purchase orders to suppliers for stock restocking and track delivery status.</p>
              <button class="btn btn-primary" onclick="App.showNewPOModal()">Create First PO</button>
            </div>
          ` : `
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>Total Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${pos.map(po => `
                    <tr>
                      <td><strong>${po.po_number}</strong></td>
                      <td>${State.formatDate(po.created_at)}</td>
                      <td><strong>${po.supplier_name}</strong></td>
                      <td><strong>${State.formatMoney(po.total_amount)}</strong></td>
                      <td>
                        <span class="badge ${po.status === 'RECEIVED' ? 'badge-success' : (po.status === 'APPROVED' ? 'badge-info' : 'badge-warning')}">
                          ${po.status}
                        </span>
                      </td>
                      <td>
                        <div style="display: flex; gap: 6px;">
                          <button class="btn btn-sm btn-secondary" onclick="App.viewAndPrintPO(${po.id})">
                            Print PO
                          </button>
                          ${po.status !== 'RECEIVED' ? `
                            <button class="btn btn-sm btn-success" onclick="App.receivePOStock(${po.id})">
                              Receive Stock
                            </button>
                          ` : ''}
                          ${State.isAdmin() ? `
                            <button class="btn btn-sm btn-danger" onclick="App.deletePurchaseOrderAction('${po.id}')">
                              Delete
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Suppliers Directory</h3>
              <p style="font-size: 12px; color: var(--text-muted);">Vendors and manufacturers for building supplies and materials</p>
            </div>
            <button class="btn btn-secondary" onclick="App.showNewSupplierModal()">+ Add Supplier</button>
          </div>

          ${suppliers.length === 0 ? `
            <div class="empty-state">
              <p>No suppliers added yet.</p>
              <button class="btn btn-primary" onclick="App.showNewSupplierModal()">+ Add Supplier</button>
            </div>
          ` : `
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Supplier Name</th>
                    <th>Contact Person</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Address</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${suppliers.map(s => `
                    <tr>
                      <td><strong>${s.name}</strong></td>
                      <td>${s.contact_person || '-'}</td>
                      <td>${s.phone || '-'}</td>
                      <td>${s.email || '-'}</td>
                      <td>${s.address || '-'}</td>
                      <td>
                        <div style="display: flex; gap: 6px;">
                          <button class="btn btn-sm btn-secondary" onclick="App.showEditSupplierModal(${s.id})">Edit</button>
                          <button class="btn btn-sm btn-danger" onclick="App.deleteSupplierAction('${s.id}')">Delete</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
      this.suppliersCache = suppliers;
    } catch (e) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Error loading suppliers: ${e.message}</div>`;
    }
  },

  async viewAndPrintPO(poId) {
    try {
      const res = await API.getPurchaseOrders();
      const po = (res.purchase_orders || []).find(p => p.id === poId);
      if (po) {
        const html = Printer.renderA4PurchaseOrder(po);
        Printer.showPrintPreview(html, `Purchase Order - ${po.po_number}`);
      }
    } catch (e) {
      State.showToast(e.message, 'error');
    }
  },

  async receivePOStock(poId) {
    if (confirm('Receive this Purchase Order into warehouse? This will automatically increase physical stock and update product buying cost.')) {
      try {
        const res = await API.receivePurchaseOrder(poId, State.currentUser?.id);
        if (res && res.success) {
          State.showToast('PO received! Inventory successfully updated.', 'success');
          this.renderSuppliers(document.getElementById('content-area'));
        }
      } catch (err) {
        State.showToast(err.message, 'error');
      }
    }
  },

  // -------------------------------------------------------------
  // 7. DAILY BUSINESS EXPENSES
  // -------------------------------------------------------------
  async renderExpenses(container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading Expenses...</div>`;
    const today = new Date().toISOString().split('T')[0];

    try {
      const res = await API.getExpenses();
      const expenses = res.expenses || [];
      const todayTotal = expenses.filter(e => e.expense_date === today).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const overallTotal = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

      container.innerHTML = `
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-data">
              <h4>Today's Total Expenses</h4>
              <div class="metric-value" style="color: var(--danger);">${State.formatMoney(todayTotal)}</div>
              <div class="metric-sub">${State.formatDate(today)}</div>
            </div>
            <div class="metric-icon red">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-data">
              <h4>Total Recorded Expenses</h4>
              <div class="metric-value">${State.formatMoney(overallTotal)}</div>
              <div class="metric-sub">${expenses.length} expense entries recorded</div>
            </div>
            <div class="metric-icon amber">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Daily Expense Vouchers</h3>
              <p style="font-size: 12px; color: var(--text-muted);">Record day-to-day operations costs (Rent, Wages, Fuel, Transport, Supplies)</p>
            </div>
            <button class="btn btn-primary" onclick="App.showNewExpenseModal()">+ Record New Expense</button>
          </div>

          ${expenses.length === 0 ? `
            <div class="empty-state">
              <h3>No expenses recorded</h3>
              <p>Record your company's operational expenses to keep accurate net profit figures.</p>
              <button class="btn btn-primary" onclick="App.showNewExpenseModal()">Record Expense</button>
            </div>
          ` : `
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Voucher #</th>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Payment Mode</th>
                    <th>Amount</th>
                    <th>Recorded By</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${expenses.map(exp => `
                    <tr>
                      <td><strong>${exp.expense_number}</strong></td>
                      <td>${State.formatDate(exp.expense_date)}</td>
                      <td><span class="badge badge-neutral">${exp.category}</span></td>
                      <td>${exp.description}</td>
                      <td>${exp.payment_method}</td>
                      <td style="color: var(--danger); font-weight: bold; font-size: 13.5px;">
                        ${State.formatMoney(exp.amount)}
                      </td>
                      <td>${exp.recorded_by_name || 'Staff'}</td>
                      <td>
                        ${State.isAdmin() ? `
                          <button class="btn btn-sm btn-danger" onclick="App.deleteExpenseAction(${exp.id})">Delete</button>
                        ` : '<span style="color: var(--text-muted); font-size: 11px;">Locked</span>'}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Error loading expenses: ${e.message}</div>`;
    }
  },

  showNewExpenseModal() {
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = 'Record Daily Business Expense';
    document.getElementById('general-modal-body').innerHTML = `
      <form id="new-expense-form" onsubmit="App.submitNewExpense(event)">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Expense Date</label>
            <input type="date" id="exp-date" class="form-input" value="${new Date().toISOString().split('T')[0]}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <select id="exp-category" class="form-select" required>
              <option value="Transport & Logistics">Transport & Logistics</option>
              <option value="Casual Wages & Labor">Casual Wages & Labor</option>
              <option value="Rent & Premises">Rent & Premises</option>
              <option value="Utilities & Electricity">Utilities & Electricity / Water</option>
              <option value="Fuel & Generator">Fuel & Vehicle / Generator</option>
              <option value="Store Supplies & Stationery">Store Supplies & Stationery</option>
              <option value="Repairs & Maintenance">Repairs & Maintenance</option>
              <option value="Meals & Refreshment">Staff Meals & Refreshment</option>
              <option value="Miscellaneous">Miscellaneous</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Amount (${State.settings.currency_symbol || 'TSh'})</label>
            <input type="number" id="exp-amount" class="form-input" step="any" placeholder="0.00" required>
          </div>
          <div class="form-group">
            <label class="form-label">Paid From Account</label>
            <select id="exp-payment-method" class="form-select" required>
              <option value="CASH">Cash in Drawer</option>
              <option value="MPESA">M-Pesa Account</option>
              <option value="TIGO_PESA">Tigo Pesa</option>
              <option value="BANK">Bank Account</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Description / Purpose</label>
          <input type="text" id="exp-desc" class="form-input" placeholder="e.g. Offloading truck, purchase receipt books" required>
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%;">Record & Deduct from Cash</button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitNewExpense(e) {
    e.preventDefault();
    const date = document.getElementById('exp-date').value;
    const cat = document.getElementById('exp-category').value;
    const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
    const method = document.getElementById('exp-payment-method').value;
    const desc = document.getElementById('exp-desc').value.trim();

    try {
      const res = await API.createExpense({
        expense_date: date,
        category: cat,
        amount: amount,
        payment_method: method,
        description: desc,
        user_id: State.currentUser?.id
      });
      if (res && res.success) {
        State.showToast('Expense recorded successfully', 'success');
        document.getElementById('general-modal').classList.remove('active');
        this.renderExpenses(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  async deleteExpenseAction(id) {
    if (confirm('Delete this expense record?')) {
      try {
        await API.deleteExpense(id);
        State.showToast('Expense deleted', 'info');
        this.renderExpenses(document.getElementById('content-area'));
      } catch (err) {
        State.showToast(err.message, 'error');
      }
    }
  },

  // -------------------------------------------------------------
  // 8. CAPITAL AVAILABLE & FINANCIAL HEALTH
  // -------------------------------------------------------------
  async renderCapital(container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading Capital & Cashflow...</div>`;
    try {
      const res = await API.getCapital();
      const cap = res.capital || {};
      const ledger = res.ledger || [];

      container.innerHTML = `
        <div class="card" style="background: linear-gradient(135deg, #0f172a, #1e293b); color: #ffffff; border-left: 5px solid var(--primary);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
            <div>
              <div style="font-size: 13px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px;">TOTAL BUSINESS CAPITAL (STOCK + LIQUID + INVESTMENTS)</div>
              <div style="font-size: 34px; font-weight: 900; color: #38bdf8; margin: 4px 0;">
                ${State.formatMoney(cap.total_estimated_net_capital)}
              </div>
              <div style="font-size: 13px; color: #cbd5e1;">
                Available Stock at Cost: <strong>${State.formatMoney(cap.stock_cost_valuation)}</strong> | Liquid Cash/Bank: <strong>${State.formatMoney(cap.total_liquid)}</strong> | Debtors: <strong>${State.formatMoney(cap.debtors_total)}</strong>
              </div>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn btn-primary" onclick="App.showCapitalAdjustModal('CAPITAL_INJECTION')">
                + Add Capital / Money In
              </button>
              <button class="btn btn-secondary" onclick="App.showCapitalAdjustModal('OWNER_DRAWING')">
                - Owner Drawing
              </button>
              <button class="btn btn-danger" onclick="App.showResetCapitalModal()" title="Reset all capital records to 0 and start afresh">
                🔄 Reset & Start Afresh
              </button>
            </div>
          </div>
        </div>

        <!-- Capital Breakdown Cards: Stock Value + Cash + Bank + Float -->
        <div class="metrics-grid">
          <div class="metric-card" style="border-top: 4px solid var(--primary);">
            <div class="metric-data">
              <h4>Money Invested in Available Stock</h4>
              <div class="metric-value" style="color: var(--primary);">${State.formatMoney(cap.stock_cost_valuation)}</div>
              <div class="metric-sub">${cap.total_units_in_stock || 0} units in inventory (Valuation at Cost)</div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Expected Retail Revenue: ${State.formatMoney(cap.stock_retail_valuation)}</div>
            </div>
            <div class="metric-icon teal">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-data">
              <h4>Cash in Register / Drawer</h4>
              <div class="metric-value" style="color: var(--success);">${State.formatMoney(cap.cash)}</div>
              <div class="metric-sub">Physical cash available in Arusha shop</div>
            </div>
            <div class="metric-icon green">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-data">
              <h4>Bank Account Balance</h4>
              <div class="metric-value" style="color: var(--secondary);">${State.formatMoney(cap.bank)}</div>
              <div class="metric-sub">CRDB / NMB Commercial Account</div>
            </div>
            <div class="metric-icon blue">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"></path></svg>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-data">
              <h4>Mobile Money Float</h4>
              <div class="metric-value" style="color: var(--warning);">${State.formatMoney(cap.mobile_money)}</div>
              <div class="metric-sub">M-Pesa / Tigo Pesa Lipa Namba</div>
            </div>
            <div class="metric-icon amber">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-data">
              <h4>Total Invested Owner Capital</h4>
              <div class="metric-value" style="color: #6366f1;">${State.formatMoney(cap.total_injected_capital)}</div>
              <div class="metric-sub">Net after drawings: ${State.formatMoney(cap.net_injected_capital)}</div>
            </div>
            <div class="metric-icon purple">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-data">
              <h4>Customer Credit / Debtors</h4>
              <div class="metric-value" style="color: #ec4899;">${State.formatMoney(cap.debtors_total)}</div>
              <div class="metric-sub">Uncollected customer credit</div>
            </div>
            <div class="metric-icon red">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
          </div>
        </div>

        <!-- Capital Transactions Ledger -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Capital Adjustments & Owner Transactions</h3>
          </div>

          ${ledger.length === 0 ? `
            <div class="empty-state">
              <p>No capital injections or drawings recorded yet.</p>
              <button class="btn btn-primary" onclick="App.showCapitalAdjustModal('CAPITAL_INJECTION')">Record Initial Capital</button>
            </div>
          ` : `
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Account</th>
                    <th>Amount</th>
                    <th>Description</th>
                    <th>Recorded By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${ledger.map(l => `
                    <tr>
                      <td>${State.formatDate(l.entry_date || l.created_at)}</td>
                      <td>
                        <span class="badge ${l.entry_type === 'CAPITAL_INJECTION' ? 'badge-success' : 'badge-danger'}">
                          ${l.entry_type === 'CAPITAL_INJECTION' ? 'Injection / Inflow' : 'Owner Drawing'}
                        </span>
                      </td>
                      <td>${l.account}</td>
                      <td style="font-weight: bold; color: ${l.entry_type === 'CAPITAL_INJECTION' ? 'var(--success)' : 'var(--danger)'};">
                        ${l.entry_type === 'CAPITAL_INJECTION' ? '+' : '-'}${State.formatMoney(l.amount)}
                      </td>
                      <td>${l.description}</td>
                      <td>${l.user_name || 'Admin'}</td>
                      <td>
                        <button class="btn btn-sm btn-danger" onclick="App.deleteCapitalEntryAction('${l.id}')">Delete</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Error loading capital: ${e.message}</div>`;
    }
  },

  showCapitalAdjustModal(type) {
    const isInject = type === 'CAPITAL_INJECTION';
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = isInject ? 'Add Capital / Inject Funds' : 'Owner Drawing / Cash Withdrawal';
    document.getElementById('general-modal-body').innerHTML = `
      <form id="capital-form" onsubmit="App.submitCapitalAdjust(event, '${type}')">
        <div class="form-group">
          <label class="form-label">Transaction Type</label>
          <input type="text" class="form-input" value="${isInject ? 'Capital Injection (+)' : 'Owner Drawing (-)'}" disabled>
        </div>

        <div class="form-group">
          <label class="form-label">Amount (${State.settings.currency_symbol || 'TSh'})</label>
          <input type="number" id="cap-amount" class="form-input" step="any" placeholder="0.00" required>
        </div>

        <div class="form-group">
          <label class="form-label">Target Account</label>
          <select id="cap-account" class="form-select" required>
            <option value="CASH">Physical Cash Drawer</option>
            <option value="BANK">Bank Account (CRDB/NMB)</option>
            <option value="MOBILE_MONEY">Mobile Money (M-Pesa)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Description / Source</label>
          <input type="text" id="cap-desc" class="form-input" placeholder="e.g. Owner capital deposit, monthly profit drawing" required>
        </div>

        <button type="submit" class="btn ${isInject ? 'btn-primary' : 'btn-danger'}" style="width: 100%;">
          Confirm ${isInject ? 'Capital Inflow' : 'Drawing'}
        </button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitCapitalAdjust(e, type) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('cap-amount').value) || 0;
    const account = document.getElementById('cap-account').value;
    const desc = document.getElementById('cap-desc').value.trim();

    try {
      const res = await API.recordCapitalAdjustment({
        entry_type: type,
        amount: amount,
        account: account,
        description: desc,
        user_id: State.currentUser?.id,
        entry_date: new Date().toISOString().split('T')[0]
      });
      if (res && res.success) {
        State.showToast('Capital transaction updated', 'success');
        document.getElementById('general-modal').classList.remove('active');
        this.renderCapital(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  // -------------------------------------------------------------
  // 9. ADMIN: WORKERS & DAILY SHIFT TRACKING
  // "know who was working in that specific day"
  // -------------------------------------------------------------
  async renderWorkers(container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading Workers & Shifts...</div>`;
    const selectedDate = State.selectedReportDate || new Date().toISOString().split('T')[0];

    try {
      const [wRes, sRes, bRes] = await Promise.all([
        API.getWorkers(),
        API.getShifts(selectedDate),
        API.getBranches()
      ]);
      const workers = wRes.workers || [];
      const shifts = sRes.shifts || [];
      const branches = bRes.branches || [];
      State.setBranches(branches);

      const branchMap = {};
      branches.forEach(b => { branchMap[b.id] = b.name; });

      const workerMap = {};
      workers.forEach(w => { workerMap[w.id] = w; });

      container.innerHTML = `
        <!-- DAILY ATTENDANCE & SHIFT LOG SECTION -->
        <div class="card" style="border-top: 4px solid var(--primary);">
          <div class="card-header">
            <div>
              <h3 class="card-title">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                Who Was Working on That Specific Day?
              </h3>
              <p style="font-size: 12px; color: var(--text-muted);">See exactly which workers were on duty, their photo ID, national ID (NIDA), assigned branch, hours, and sales handled</p>
            </div>
            <!-- Date Filter Picker -->
            <div style="display: flex; align-items: center; gap: 8px;">
              <label style="font-size: 12px; font-weight: 600;">Select Date:</label>
              <input type="date" id="shift-date-picker" class="form-input" style="width: 160px; padding: 6px 10px;" value="${selectedDate}" onchange="App.onShiftDateChange(this.value)">
            </div>
          </div>

          <div style="background: #f8fafc; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <strong>Date Selected:</strong> ${State.formatDate(selectedDate)}
            </div>
            <div>
              <strong>Total Staff on Duty:</strong> <span class="badge badge-info">${shifts.length} Workers</span>
            </div>
          </div>

          ${shifts.length === 0 ? `
            <div class="empty-state" style="padding: 32px 20px;">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <h3>No shift records for ${State.formatDate(selectedDate)}</h3>
              <p>No workers clocked in on this specific date.</p>
            </div>
          ` : `
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Worker on Duty</th>
                    <th>Branch / Shop</th>
                    <th>Role</th>
                    <th>Phone</th>
                    <th>Clock In Time</th>
                    <th>Clock Out Time</th>
                    <th>Opening Cash</th>
                    <th>Closing Cash</th>
                    <th>Sales Made</th>
                    <th>Total Sold</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${shifts.map(s => {
                    const w = workerMap[s.worker_id] || {};
                    const photo = s.photo_url || w.photo_url || '';
                    const nationalId = s.national_id || w.national_id || '';
                    const branchName = branchMap[s.branch_id || w.branch_id] || 'Main Shop';
                    const initial = (s.worker_name || 'W').charAt(0).toUpperCase();
                    return `
                      <tr>
                        <td>
                          <div style="display: flex; align-items: center; gap: 10px;">
                            ${photo 
                              ? `<img src="${photo}" class="worker-table-avatar" alt="${this.escape(s.worker_name)}">`
                              : `<div class="worker-table-avatar" style="display: flex; align-items: center; justify-content: center; background: #e2e8f0; font-weight: 700; color: #475569;">${initial}</div>`
                            }
                            <div>
                              <strong>${this.escape(s.worker_name)}</strong>
                              ${nationalId ? `<div style="font-size: 11px; color: var(--text-muted);">NIDA: <code>${this.escape(nationalId)}</code></div>` : ''}
                            </div>
                          </div>
                        </td>
                        <td><span class="badge badge-info">${this.escape(branchName)}</span></td>
                        <td><span class="badge badge-neutral">${this.escape(s.worker_role || w.role || 'Staff')}</span></td>
                        <td>${this.escape(s.worker_phone || w.phone || '-')}</td>
                        <td><strong>${new Date(s.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></td>
                        <td>${s.clock_out ? `<strong>${new Date(s.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>` : '<span style="color: var(--success); font-weight: 600;">Active On Duty</span>'}</td>
                        <td>${State.formatMoney(s.opening_cash)}</td>
                        <td>${s.closing_cash !== null ? State.formatMoney(s.closing_cash) : '-'}</td>
                        <td><strong>${s.sales_count || 0}</strong> orders</td>
                        <td style="color: var(--primary); font-weight: bold;">${State.formatMoney(s.total_sales || 0)}</td>
                        <td>
                          <span class="badge ${s.clock_out ? 'badge-neutral' : 'badge-success'}">
                            ${s.clock_out ? 'Clocked Out' : 'Active On Duty'}
                          </span>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <!-- ADMIN WORKERS DIRECTORY -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Staff & Worker Accounts Management</h3>
              <p style="font-size: 12px; color: var(--text-muted);">Admin profile: Add new workers, assign branches, verify National ID (NIDA), photos, and roles</p>
            </div>
            <button class="btn btn-primary" onclick="App.showNewWorkerModal()">+ Add New Worker</button>
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Worker Profile</th>
                  <th>National ID (NIDA)</th>
                  <th>Address</th>
                  <th>Assigned Branch</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Phone Number</th>
                  <th>Account Status</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${workers.map(w => {
                  const initial = (w.full_name || w.username || 'W').charAt(0).toUpperCase();
                  const bName = branchMap[w.branch_id] || 'All / Main Shop';
                  return `
                    <tr>
                      <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                          ${w.photo_url 
                            ? `<img src="${w.photo_url}" class="worker-table-avatar" alt="${this.escape(w.full_name)}">`
                            : `<div class="worker-table-avatar" style="display: flex; align-items: center; justify-content: center; background: #e2e8f0; font-weight: 700; color: #475569;">${initial}</div>`
                          }
                          <div>
                            <strong>${this.escape(w.full_name)}</strong>
                            <div style="font-size: 11px; color: var(--text-muted);">${w.username === 'admin' ? 'Primary Admin' : 'Worker'}</div>
                          </div>
                        </div>
                      </td>
                      <td>${w.national_id ? `<code>${this.escape(w.national_id)}</code>` : '<span style="color: var(--text-muted); font-size: 12px;">Not set</span>'}</td>
                      <td style="font-size: 12px; max-width: 140px;">${this.escape(w.address || '-')}</td>
                      <td><span class="badge badge-info">${this.escape(bName)}</span></td>
                      <td><code>${this.escape(w.username)}</code></td>
                      <td><span class="badge ${w.role === 'Admin' ? 'badge-info' : 'badge-neutral'}">${w.role}</span></td>
                      <td>${this.escape(w.phone || '-')}</td>
                      <td>
                        <span class="badge ${w.active ? 'badge-success' : 'badge-danger'}">
                          ${w.active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td>${State.formatDate(w.created_at)}</td>
                      <td>
                        <div style="display: flex; gap: 6px;">
                          <button class="btn btn-sm btn-secondary" onclick="App.showEditWorkerModal('${w.id}')">
                            Edit
                          </button>
                          ${w.username !== 'admin' && String(w.id) !== String(State.currentUser?.id) ? `
                            <button class="btn btn-sm btn-danger" onclick="App.deleteWorkerAction('${w.id}')">
                              Delete
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Error loading workers: ${e.message}</div>`;
    }
  },

  onShiftDateChange(date) {
    State.selectedReportDate = date;
    this.renderWorkers(document.getElementById('content-area'));
  },

  async showNewWorkerModal() {
    if (!State.isAdmin()) {
      State.showToast('Access restricted: Only administrators can add new workers', 'error');
      return;
    }
    let branches = [];
    try {
      branches = (typeof State.getBranches === 'function' ? State.getBranches() : null) || [];
      if (branches.length === 0 && API && API.getBranches) {
        const bRes = await API.getBranches();
        branches = bRes.branches || [];
      }
    } catch (e) {
      console.warn('Branch fetch error:', e);
    }
    if (!branches || branches.length === 0) {
      branches = [{ id: 'branch-main', name: 'Main Shop - Arusha', code: 'MAIN' }];
    }
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = 'Add New Worker / Staff Member';
    document.getElementById('general-modal-body').innerHTML = `
      <form id="new-worker-form" onsubmit="App.submitNewWorker(event)">
        <!-- Photo Upload Section -->
        <div style="display: flex; align-items: center; gap: 16px; background: #f8fafc; padding: 14px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border); flex-wrap: wrap;">
          <div id="w-photo-preview-wrap">
            <div id="w-photo-preview" class="worker-table-avatar" style="width: 70px; height: 70px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; color: #475569; border: 2px solid var(--primary);">👤</div>
          </div>
          <div style="flex: 1; min-width: 200px;">
            <label class="form-label" style="margin-bottom: 4px; font-weight: 700;">Worker Profile Photo / ID Badge</label>
            <input type="file" id="w-photo-file" class="form-input" accept="image/*" onchange="App.handleWorkerPhotoSelect(event, 'w-photo-preview-wrap', 'w-photo-base64')" style="padding: 5px;">
            <input type="hidden" id="w-photo-base64" value="">
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">Attach worker photo for on-duty identification and daily logs</div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input type="text" id="w-name" class="form-input" placeholder="e.g. Baraka John Mussa" required>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">National ID (NIDA Number)</label>
            <input type="text" id="w-nida" class="form-input" placeholder="e.g. 19900101-12345-00001-20">
          </div>
          <div class="form-group">
            <label class="form-label">Physical Address / Residence</label>
            <input type="text" id="w-address" class="form-input" placeholder="e.g. Sakina, Arusha">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Username (for Login) *</label>
            <input type="text" id="w-user" class="form-input" placeholder="e.g. baraka" required>
          </div>
          <div class="form-group">
            <label class="form-label">Assigned Shop / Branch</label>
            <select id="w-branch" class="form-select">
              <option value="">All / Floating Staff</option>
              ${branches.map(b => `<option value="${b.id}">${this.escape(b.name)} (${this.escape(b.code || 'Shop')})</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Assigned Role *</label>
            <select id="w-role" class="form-select" required>
              <option value="Cashier">Cashier (POS & Sales)</option>
              <option value="Storekeeper">Storekeeper (Inventory & Receiving)</option>
              <option value="Manager">Manager (Operations & Approvals)</option>
              <option value="Accountant">Accountant (Invoices & Capital)</option>
              <option value="Admin">Admin (Full System Access)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number *</label>
            <input type="text" id="w-phone" class="form-input" placeholder="07xxxxxxxx" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Login Password / PIN *</label>
          <input type="password" id="w-pass" class="form-input" placeholder="Minimum 6 characters" required>
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%;">Create Worker Profile</button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitNewWorker(e) {
    e.preventDefault();
    if (!State.isAdmin()) {
      State.showToast('Access restricted: Only administrators can add new workers', 'error');
      return;
    }
    const name = document.getElementById('w-name').value.trim();
    const photoUrl = (document.getElementById('w-photo-base64')?.value || '').trim();
    const nationalId = document.getElementById('w-nida').value.trim();
    const address = document.getElementById('w-address').value.trim();
    const branchId = document.getElementById('w-branch').value;
    const username = document.getElementById('w-user').value.trim();
    const role = document.getElementById('w-role').value;
    const phone = document.getElementById('w-phone').value.trim();
    const password = document.getElementById('w-pass').value.trim();

    try {
      const res = await API.addWorker({
        full_name: name,
        photo_url: photoUrl,
        national_id: nationalId,
        address: address,
        branch_id: branchId,
        username: username,
        role: role,
        phone: phone,
        password: password
      });
      if (res && res.success) {
        State.showToast(`Worker ${name} added successfully!`, 'success');
        document.getElementById('general-modal').classList.remove('active');
        this.renderWorkers(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  async showEditWorkerModal(workerId) {
    if (!State.isAdmin()) {
      State.showToast('Access restricted: Only administrators can edit workers', 'error');
      return;
    }
    let w = null;
    let branches = [];
    try {
      const [wRes, bRes] = await Promise.all([API.getWorkers(), API.getBranches()]);
      w = (wRes.workers || []).find(x => String(x.id) === String(workerId));
      branches = bRes.branches || [];
    } catch (e) {
      console.warn('Worker modal fetch error:', e);
    }
    if (!w) {
      State.showToast('Worker profile not found', 'error');
      return;
    }
    if (!branches || branches.length === 0) {
      branches = (typeof State.getBranches === 'function' ? State.getBranches() : null) || [{ id: 'branch-main', name: 'Main Shop - Arusha' }];
    }

    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = `Edit Worker: ${w.full_name}`;
    document.getElementById('general-modal-body').innerHTML = `
      <form id="edit-worker-form" onsubmit="App.submitEditWorker(event, '${w.id}')">
        <!-- Photo Upload Section -->
        <div style="display: flex; align-items: center; gap: 16px; background: #f8fafc; padding: 14px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border); flex-wrap: wrap;">
          <div id="ew-photo-preview-wrap">
            ${w.photo_url 
              ? `<img id="ew-photo-preview" src="${w.photo_url}" class="worker-table-avatar" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary);" alt="Avatar">`
              : `<div id="ew-photo-preview" class="worker-table-avatar" style="width: 70px; height: 70px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; color: #475569; border: 2px solid var(--primary);">${(w.full_name || 'W').charAt(0).toUpperCase()}</div>`
            }
          </div>
          <div style="flex: 1; min-width: 200px;">
            <label class="form-label" style="margin-bottom: 4px; font-weight: 700;">Worker Profile Photo / ID Badge</label>
            <input type="file" id="ew-photo-file" class="form-input" accept="image/*" onchange="App.handleWorkerPhotoSelect(event, 'ew-photo-preview-wrap', 'ew-photo-base64')" style="padding: 5px;">
            <input type="hidden" id="ew-photo-base64" value="${w.photo_url || ''}">
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">Update worker photo for daily shift roster identification</div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input type="text" id="ew-name" class="form-input" value="${this.escape(w.full_name)}" required>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">National ID (NIDA)</label>
            <input type="text" id="ew-nida" class="form-input" value="${this.escape(w.national_id || '')}" placeholder="NIDA Number">
          </div>
          <div class="form-group">
            <label class="form-label">Physical Address</label>
            <input type="text" id="ew-address" class="form-input" value="${this.escape(w.address || '')}" placeholder="Residence address">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Assigned Shop / Branch</label>
            <select id="ew-branch" class="form-select">
              <option value="">All / Floating Staff</option>
              ${branches.map(b => `<option value="${b.id}" ${w.branch_id === b.id ? 'selected' : ''}>${this.escape(b.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Role</label>
            <select id="ew-role" class="form-select" required>
              <option value="Cashier" ${w.role === 'Cashier' ? 'selected' : ''}>Cashier</option>
              <option value="Storekeeper" ${w.role === 'Storekeeper' ? 'selected' : ''}>Storekeeper</option>
              <option value="Manager" ${w.role === 'Manager' ? 'selected' : ''}>Manager</option>
              <option value="Accountant" ${w.role === 'Accountant' ? 'selected' : ''}>Accountant</option>
              <option value="Admin" ${w.role === 'Admin' ? 'selected' : ''}>Admin</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="text" id="ew-phone" class="form-input" value="${this.escape(w.phone || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Reset Password / PIN (Leave blank to keep unchanged)</label>
            <input type="password" id="ew-pass" class="form-input" placeholder="New password if resetting">
          </div>
        </div>

        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="ew-active" ${w.active ? 'checked' : ''}>
            <span>Active Worker (Can log in to system)</span>
          </label>
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%;">Save Changes</button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitEditWorker(e, workerId) {
    e.preventDefault();
    if (!State.isAdmin()) {
      State.showToast('Access restricted: Only administrators can edit workers', 'error');
      return;
    }
    const name = document.getElementById('ew-name').value.trim();
    const photoUrl = (document.getElementById('ew-photo-base64')?.value || '').trim();
    const nationalId = document.getElementById('ew-nida').value.trim();
    const address = document.getElementById('ew-address').value.trim();
    const branchId = document.getElementById('ew-branch').value;
    const role = document.getElementById('ew-role').value;
    const phone = document.getElementById('ew-phone').value.trim();
    const password = document.getElementById('ew-pass').value.trim();
    const active = document.getElementById('ew-active').checked;

    try {
      const res = await API.updateWorker(workerId, {
        full_name: name,
        photo_url: photoUrl,
        national_id: nationalId,
        address: address,
        branch_id: branchId,
        role: role,
        phone: phone,
        password: password,
        active: active
      });
      if (res && res.success) {
        State.showToast('Worker details updated', 'success');
        document.getElementById('general-modal').classList.remove('active');
        this.renderWorkers(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  // -------------------------------------------------------------
  // 10. DAILY REPORTS & WORKER AUDIT
  // -------------------------------------------------------------
  async renderReports(container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading Reports...</div>`;
    const date = State.selectedReportDate || new Date().toISOString().split('T')[0];

    try {
      const [wRes, rRes] = await Promise.all([API.getWorkers(), API.getDailyReport(date)]);
      const workers = wRes.workers || [];
      const rep = rRes || {};
      const orders = rep.orders || [];
      const expenses = rep.expenses || [];

      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Daily Business & Worker Activity Report</h3>
              <p style="font-size: 12px; color: var(--text-muted);">Comprehensive financial report and audit trail for any day</p>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
              <input type="date" id="report-date-picker" class="form-input" style="width: 160px; padding: 6px 10px;" value="${date}" onchange="App.onReportDateChange(this.value)">
              <button class="btn btn-secondary" onclick="App.printDailyReport()">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                Print Report
              </button>
            </div>
          </div>

          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-data">
                <h4>Total Sales on ${State.formatDate(date)}</h4>
                <div class="metric-value" style="color: var(--success);">${State.formatMoney(rep.total_sales)}</div>
              </div>
            </div>
            <div class="metric-card">
              <div class="metric-data">
                <h4>Total Expenses on ${State.formatDate(date)}</h4>
                <div class="metric-value" style="color: var(--danger);">${State.formatMoney(rep.total_expenses)}</div>
              </div>
            </div>
            <div class="metric-card">
              <div class="metric-data">
                <h4>Daily Net Profit</h4>
                <div class="metric-value" style="color: ${rep.net_profit >= 0 ? 'var(--primary)' : 'var(--danger)'};">
                  ${State.formatMoney(rep.net_profit)}
                </div>
              </div>
            </div>
          </div>

          <h4 style="margin: 20px 0 10px; font-size: 15px; font-weight: 700;">Sales Transactions on this Day</h4>
          ${orders.length === 0 ? `
            <p style="color: var(--text-muted); padding: 12px 0;">No sales transactions on this date.</p>
          ` : `
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Order #</th>
                    <th>Cashier / Worker</th>
                    <th>Customer</th>
                    <th>Method</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${orders.map(o => `
                    <tr>
                      <td>${new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td><strong>${o.order_number}</strong></td>
                      <td>${o.worker_name || 'Staff'}</td>
                      <td>${o.customer_name}</td>
                      <td>${o.payment_method}</td>
                      <td><strong>${State.formatMoney(o.total)}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Error loading report: ${e.message}</div>`;
    }
  },

  onReportDateChange(date) {
    State.selectedReportDate = date;
    this.renderReports(document.getElementById('content-area'));
  },

  async printDailyReport() {
    const date = State.selectedReportDate || new Date().toISOString().split('T')[0];
    try {
      const rep = await API.getDailyReport(date);
      const html = Printer.renderA4DailyReport(rep, date);
      Printer.showPrintPreview(html, `Daily Business Report - ${date}`);
    } catch (e) {
      State.showToast(e.message || 'Error generating report printout', 'error');
    }
  },

  // -------------------------------------------------------------
  // 11. COMPANY PROFILE & SYSTEM SETTINGS
  // -------------------------------------------------------------
  async renderSettings(container) {
    const s = State.settings || {};

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Company Profile & Branding Credentials</h3>
            <p style="font-size: 12px; color: var(--text-muted);">These credentials appear on all printed POS receipts, Invoices, Delivery Notes, and Quotations</p>
          </div>
        </div>

        <form id="settings-form" onsubmit="App.saveCompanySettings(event)">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Company / Business Name</label>
              <input type="text" id="set-company-name" class="form-input" value="${s.company_name || 'JENGAKWANZA LIMITED'}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Tagline / Business Description</label>
              <input type="text" id="set-tagline" class="form-input" value="${s.tagline || 'Building Excellence & Quality Supplies'}">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Official Phone Numbers (Appears on receipts)</label>
              <input type="text" id="set-phones" class="form-input" value="${s.phone_numbers || '0788989889 / 0713550104'}" required>
            </div>
            <div class="form-group">
              <label class="form-label">P.O. Box & Physical Address</label>
              <input type="text" id="set-address" class="form-input" value="${s.address || 'P.O.BOX 14991 ARUSHA'}" required>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Official Email Address</label>
              <input type="email" id="set-email" class="form-input" value="${s.email || 'jengakwanzaltd@gmail.com'}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Currency Symbol</label>
              <input type="text" id="set-currency" class="form-input" value="${s.currency_symbol || 'TSh'}" required>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Receipt Footer Note</label>
            <textarea id="set-receipt-footer" class="form-textarea" rows="2">${s.receipt_footer || 'Thank you for choosing JENGAKWANZA LIMITED! Goods once sold are not returnable without valid receipt.'}</textarea>
          </div>

          <button type="submit" class="btn btn-primary">Save Company Credentials</button>
        </form>
      </div>

      <!-- Backup and Database Management -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Full Database Backup & Data Portability</h3>
            <p style="font-size: 12px; color: var(--text-muted);">Download a complete, secure JSON export of your business data at any time</p>
          </div>
          <button class="btn btn-primary" onclick="App.downloadFullBackup()">Download Backup JSON</button>
        </div>
      </div>
    `;
  },

  async saveCompanySettings(e) {
    e.preventDefault();
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can change company settings', 'error');
      return;
    }
    const data = {
      company_name: document.getElementById('set-company-name').value.trim(),
      tagline: document.getElementById('set-tagline').value.trim(),
      phone_numbers: document.getElementById('set-phones').value.trim(),
      address: document.getElementById('set-address').value.trim(),
      email: document.getElementById('set-email').value.trim(),
      currency_symbol: document.getElementById('set-currency').value.trim(),
      receipt_footer: document.getElementById('set-receipt-footer').value.trim()
    };

    try {
      await API.saveSettings(data);
      State.setSettings({ ...State.settings, ...data });
      State.showToast('Settings and company credentials updated!', 'success');
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  async saveFirebaseConfig(e) {
    e.preventDefault();
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can modify cloud configuration', 'error');
      return;
    }
    const config = {
      apiKey: document.getElementById('fb-api-key').value.trim(),
      projectId: document.getElementById('fb-project-id').value.trim(),
      authDomain: document.getElementById('fb-auth-domain').value.trim(),
      storageBucket: document.getElementById('fb-storage-bucket').value.trim(),
      messagingSenderId: document.getElementById('fb-sender-id').value.trim(),
      appId: document.getElementById('fb-app-id').value.trim()
    };

    if (!config.apiKey || !config.projectId) {
      State.showToast('Please enter at least Firebase API Key and Project ID', 'error');
      return;
    }

    try {
      localStorage.setItem('jengakwanza_firebase_config', JSON.stringify(config));
      window.FIREBASE_CONFIG = config;
      State.showToast('Connecting to Cloud Firestore...', 'info');

      const ok = await FirebaseAdapter.init(config);
      if (ok) {
        State.showToast('✓ Connected to Firebase Cloud Firestore!', 'success');
        this.renderSettings(document.getElementById('content-area'));
      } else {
        State.showToast('Firebase initialization failed. Please check config.', 'error');
      }
    } catch (err) {
      State.showToast(`Firebase error: ${err.message}`, 'error');
    }
  },

  async testFirebaseConnection() {
    State.showToast('Testing Firebase Cloud connection...', 'info');
    try {
      const ok = await FirebaseAdapter.init();
      if (ok) {
        State.showToast('✓ Cloud Firestore is connected and ready!', 'success');
      } else {
        State.showToast('Please enter your Firebase configuration keys first', 'warning');
      }
    } catch (err) {
      State.showToast(`Connection failed: ${err.message}`, 'error');
    }
  },

  async downloadFullBackup() {
    try {
      const backup = await API.exportBackup();
      const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", str);
      downloadAnchor.setAttribute("download", `JENGAKWANZA_Backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      State.showToast('Backup file downloaded', 'success');
    } catch (e) {
      State.showToast(e.message, 'error');
    }
  },

  // -------------------------------------------------------------
  // PRODUCT IMAGE HANDLING & PREVIEW
  // -------------------------------------------------------------
  handleProductImageFile(e, prefix) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2.5 * 1024 * 1024) {
      State.showToast('Image file too large (max 2.5MB)', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      if (prefix === 'np') {
        this.newProductImageBase64 = dataUrl;
      } else {
        this.editProductImageBase64 = dataUrl;
      }
      this.updateImagePreviewUI(prefix, dataUrl);
    };
    reader.readAsDataURL(file);
  },

  previewImageUrl(prefix, url) {
    const trimmed = (url || '').trim();
    if (prefix === 'np') {
      this.newProductImageBase64 = trimmed;
    } else {
      this.editProductImageBase64 = trimmed;
    }
    this.updateImagePreviewUI(prefix, trimmed);
  },

  clearProductImage(prefix) {
    if (prefix === 'np') {
      this.newProductImageBase64 = '';
    } else {
      this.editProductImageBase64 = '';
    }
    const urlInput = document.getElementById(`${prefix}-image-url`);
    if (urlInput) urlInput.value = '';
    const fileInput = document.getElementById(`${prefix}-image-file`);
    if (fileInput) fileInput.value = '';
    this.updateImagePreviewUI(prefix, '');
  },

  updateImagePreviewUI(prefix, src) {
    const imgTag = document.getElementById(`${prefix}-img-tag`);
    const placeholder = document.getElementById(`${prefix}-preview-placeholder`);
    const clearBtn = document.getElementById(`${prefix}-clear-img-btn`);
    if (!imgTag || !placeholder) return;

    if (src) {
      imgTag.src = src;
      imgTag.style.display = 'block';
      placeholder.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'inline-block';
    } else {
      imgTag.src = '';
      imgTag.style.display = 'none';
      placeholder.style.display = 'block';
      if (clearBtn) clearBtn.style.display = 'none';
    }
  },

  // -------------------------------------------------------------
  // COMMON MODAL BUILDERS (Products, Customers, Suppliers, Invoices)
  // -------------------------------------------------------------
  showNewProductModal() {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can add new products', 'error');
      return;
    }
    this.newProductImageBase64 = '';
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = 'Add New Inventory Product';
    document.getElementById('general-modal-body').innerHTML = `
      <form id="new-prod-form" onsubmit="App.submitNewProduct(event)">
        <!-- Product Image Section -->
        <div class="product-image-upload-section">
          <label class="form-label" style="font-weight: 700; margin-bottom: 8px;">Product Image (Optional)</label>
          <div style="display: flex; gap: 16px; align-items: center;">
            <div id="np-img-preview-box" class="product-image-preview-box">
              <span id="np-preview-placeholder" style="color: #94a3b8; font-size: 11px; text-align: center; padding: 4px;">No Image</span>
              <img id="np-img-tag" src="" style="display: none; width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">
            </div>
            <div style="flex: 1;">
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <label class="btn btn-sm btn-secondary" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                  <span>Upload Image File</span>
                  <input type="file" id="np-image-file" accept="image/*" style="display: none;" onchange="App.handleProductImageFile(event, 'np')">
                </label>
                <button type="button" class="btn btn-sm btn-secondary" id="np-clear-img-btn" style="display: none;" onclick="App.clearProductImage('np')">Remove</button>
              </div>
              <input type="url" id="np-image-url" class="form-input" placeholder="Or enter image URL (https://...)" oninput="App.previewImageUrl('np', this.value)">
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Displays on POS cards and Inventory catalog</div>
            </div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Product / Material Name</label>
            <input type="text" id="np-name" class="form-input" placeholder="e.g. Cement Simba 32.5R" required autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <input type="text" id="np-category" class="form-input" placeholder="e.g. Cement, Steel, Timber, Paints" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">SKU / Item Code</label>
            <input type="text" id="np-sku" class="form-input" placeholder="Auto-generated if blank">
          </div>
          <div class="form-group">
            <label class="form-label">Barcode (Optional)</label>
            <input type="text" id="np-barcode" class="form-input" placeholder="Scan barcode">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Buying / Cost Price (${State.settings.currency_symbol || 'TSh'})</label>
            <input type="number" id="np-cost" class="form-input" step="any" placeholder="0.00" required>
          </div>
          <div class="form-group">
            <label class="form-label">Selling Price (${State.settings.currency_symbol || 'TSh'})</label>
            <input type="number" id="np-price" class="form-input" step="any" placeholder="0.00" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Initial Quantity in Stock</label>
            <input type="number" id="np-stock" class="form-input" step="any" value="0" required>
          </div>
          <div class="form-group">
            <label class="form-label">Unit of Measure</label>
            <select id="np-unit" class="form-select">
              <option value="pcs">Pieces (pcs)</option>
              <option value="bags">Bags</option>
              <option value="kg">Kilograms (kg)</option>
              <option value="ton">Ton</option>
              <option value="meters">Meters</option>
              <option value="rolls">Rolls</option>
              <option value="boxes">Boxes</option>
              <option value="litres">Litres</option>
              <option value="trips">Trips</option>
              <option value="sheets">Sheets</option>
              <option value="bundles">Bundles</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Low Stock Alert Threshold</label>
            <input type="number" id="np-alert" class="form-input" value="5">
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-lg" style="width: 100%; margin-top: 6px;">Save Product to Inventory</button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitNewProduct(e) {
    e.preventDefault();
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can add new products', 'error');
      return;
    }
    const data = {
      name: document.getElementById('np-name').value.trim(),
      category: document.getElementById('np-category').value.trim() || 'General',
      sku: document.getElementById('np-sku').value.trim(),
      barcode: document.getElementById('np-barcode').value.trim(),
      cost_price: parseFloat(document.getElementById('np-cost').value) || 0,
      selling_price: parseFloat(document.getElementById('np-price').value) || 0,
      stock_quantity: parseFloat(document.getElementById('np-stock').value) || 0,
      unit: document.getElementById('np-unit').value,
      min_alert_quantity: parseFloat(document.getElementById('np-alert').value) || 5,
      image_url: this.newProductImageBase64 || '',
      user_id: State.currentUser?.id
    };

    try {
      const res = await API.addProduct(data);
      if (res && res.success) {
        State.showToast(`Product "${data.name}" added successfully!`, 'success');
        document.getElementById('general-modal').classList.remove('active');
        if (State.currentRoute === 'inventory') {
          this.renderInventory(document.getElementById('content-area'));
        } else if (State.currentRoute === 'pos') {
          this.renderPOS(document.getElementById('content-area'));
        }
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  showEditProductModal(productId) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can edit products', 'error');
      return;
    }
    const p = this.productsCache.find(x => String(x.id) === String(productId));
    if (!p) return;

    this.editProductImageBase64 = p.image_url || '';
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = `Edit Product: ${p.name}`;
    document.getElementById('general-modal-body').innerHTML = `
      <form id="edit-prod-form" onsubmit="App.submitEditProduct(event, '${p.id}')">
        <!-- Product Image Section -->
        <div class="product-image-upload-section">
          <label class="form-label" style="font-weight: 700; margin-bottom: 8px;">Product Image</label>
          <div style="display: flex; gap: 16px; align-items: center;">
            <div id="ep-img-preview-box" class="product-image-preview-box">
              <span id="ep-preview-placeholder" style="${p.image_url ? 'display: none;' : ''} color: #94a3b8; font-size: 11px; text-align: center; padding: 4px;">No Image</span>
              <img id="ep-img-tag" src="${p.image_url || ''}" style="${p.image_url ? 'display: block;' : 'display: none;'} width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">
            </div>
            <div style="flex: 1;">
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <label class="btn btn-sm btn-secondary" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                  <span>Change Image File</span>
                  <input type="file" id="ep-image-file" accept="image/*" style="display: none;" onchange="App.handleProductImageFile(event, 'ep')">
                </label>
                <button type="button" class="btn btn-sm btn-secondary" id="ep-clear-img-btn" style="${p.image_url ? 'display: inline-block;' : 'display: none;'}" onclick="App.clearProductImage('ep')">Remove</button>
              </div>
              <input type="url" id="ep-image-url" class="form-input" placeholder="Or enter image URL (https://...)" value="${p.image_url || ''}" oninput="App.previewImageUrl('ep', this.value)">
            </div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Product Name</label>
            <input type="text" id="ep-name" class="form-input" value="${this.escape(p.name)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <input type="text" id="ep-category" class="form-input" value="${this.escape(p.category || 'General')}" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">SKU</label>
            <input type="text" id="ep-sku" class="form-input" value="${this.escape(p.sku || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <input type="text" id="ep-unit" class="form-input" value="${this.escape(p.unit || 'pcs')}">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Buying Cost Price</label>
            <input type="number" id="ep-cost" class="form-input" step="any" value="${p.cost_price}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Selling Price</label>
            <input type="number" id="ep-price" class="form-input" step="any" value="${p.selling_price}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Min Alert Threshold</label>
            <input type="number" id="ep-alert" class="form-input" value="${p.min_alert_quantity}">
          </div>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 14px;">
          <button type="submit" class="btn btn-primary" style="flex: 2;">Save Product Changes</button>
          <button type="button" class="btn btn-danger" style="flex: 1;" onclick="document.getElementById('general-modal').classList.remove('active'); App.deleteProductAction('${p.id}');">Delete Product</button>
        </div>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitEditProduct(e, productId) {
    e.preventDefault();
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can edit products', 'error');
      return;
    }
    const data = {
      name: document.getElementById('ep-name').value.trim(),
      category: document.getElementById('ep-category').value.trim(),
      sku: document.getElementById('ep-sku').value.trim(),
      unit: document.getElementById('ep-unit').value.trim(),
      cost_price: parseFloat(document.getElementById('ep-cost').value) || 0,
      selling_price: parseFloat(document.getElementById('ep-price').value) || 0,
      min_alert_quantity: parseFloat(document.getElementById('ep-alert').value) || 5,
      image_url: this.editProductImageBase64 || ''
    };

    try {
      await API.updateProduct(productId, data);
      State.showToast('Product updated successfully', 'success');
      document.getElementById('general-modal').classList.remove('active');
      if (State.currentRoute === 'inventory') {
        this.renderInventory(document.getElementById('content-area'));
      } else if (State.currentRoute === 'pos') {
        this.renderPOS(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  // -------------------------------------------------------------
  // STOCK FILE IMPORT (CSV / EXCEL SPREADSHEET)
  // -------------------------------------------------------------
  showStockImportModal() {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can import stock', 'error');
      return;
    }
    this.importedStockProducts = [];
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = 'Import Stock & Products from File';
    document.getElementById('general-modal-body').innerHTML = `
      <div style="margin-bottom: 14px;">
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">
          Upload a stock CSV, Excel, or text file to add multiple products into your inventory at once.
        </p>

        <!-- Template Download Box -->
        <div class="import-template-box">
          <div>
            <strong>Need a template?</strong>
            <div style="font-size: 11.5px; color: var(--text-muted);">Download a pre-formatted sample CSV file ready for Excel or Google Sheets.</div>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" onclick="App.downloadStockTemplate()">
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Download Sample CSV
          </button>
        </div>

        <!-- Drag & Drop Zone -->
        <div class="file-import-dropzone" onclick="document.getElementById('stock-file-input').click()" ondragover="event.preventDefault(); this.style.borderColor='#0f766e';" ondragleave="this.style.borderColor='#0d9488';" ondrop="App.handleStockFileDrop(event)">
          <input type="file" id="stock-file-input" accept=".csv, .tsv, .txt, .json" style="display: none;" onchange="App.handleStockFileSelected(event)">
          <svg width="40" height="40" fill="none" stroke="#0d9488" viewBox="0 0 24 24" style="margin: 0 auto 8px auto; display: block;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">Click to browse or drag and drop your stock file here</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Supports .CSV, .TSV, .TXT, and .JSON formats</div>
        </div>

        <div id="stock-import-preview-area" style="display: none;"></div>
      </div>
    `;
    modal.classList.add('active');
  },

  downloadStockTemplate() {
    const csvContent = 
`Product Name,Category,SKU,Barcode,Cost Price,Selling Price,Stock Quantity,Unit,Min Alert Threshold,Image URL
Simba Cement 32.5R,Cement,SIMBA-325,012345678901,17500,21000,100,bags,10,
Steel Deformed Bars 12mm,Steel,ST-12MM,012345678902,28000,34000,50,pcs,5,
White Primer Paint 20L,Paints,PNT-W20L,012345678903,65000,78000,20,buckets,2,
PVC Pipe 4 Inch Class B,Plumbing,PVC-4IN,012345678904,18000,24000,30,pcs,5,
Corrugated Iron Sheets Gauge 28,Roofing,SHT-G28,012345678905,31000,38000,80,sheets,15,`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'jengakwanza_stock_import_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    State.showToast('Sample template downloaded', 'success');
  },

  handleStockFileDrop(e) {
    e.preventDefault();
    e.currentTarget.style.borderColor = '#0d9488';
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      this.readAndParseStockFile(files[0]);
    }
  },

  handleStockFileSelected(e) {
    const file = e.target.files?.[0];
    if (file) {
      this.readAndParseStockFile(file);
    }
  },

  readAndParseStockFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      let parsed = [];
      if (file.name.endsWith('.json')) {
        try {
          const json = JSON.parse(content);
          parsed = Array.isArray(json) ? json : (json.products || []);
        } catch (err) {
          State.showToast('Invalid JSON file format', 'error');
          return;
        }
      } else {
        parsed = this.parseStockCSV(content);
      }

      if (!parsed || parsed.length === 0) {
        State.showToast('No valid products detected in file. Please check column headers.', 'error');
        return;
      }

      this.importedStockProducts = parsed;
      this.renderStockImportPreview(parsed, file.name);
    };
    reader.readAsText(file);
  },

  parseStockCSV(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return [];

    const parseLine = (line, delimiter) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          inQuotes = !inQuotes;
        } else if (c === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += c;
        }
      }
      result.push(current.trim());
      return result;
    };

    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : (firstLine.includes(';') ? ';' : ',');
    const headers = parseLine(firstLine, delimiter).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));

    const getField = (row, candidates) => {
      for (const cand of candidates) {
        const idx = headers.findIndex(h => h === cand || h.includes(cand));
        if (idx !== -1 && row[idx] !== undefined) return row[idx];
      }
      return '';
    };

    const products = [];
    for (let i = 1; i < lines.length; i++) {
      const row = parseLine(lines[i], delimiter);
      if (row.length === 0 || row.every(c => c === '')) continue;

      const name = getField(row, ['name', 'product_name', 'item', 'description', 'title']);
      if (!name) continue;

      const category = getField(row, ['category', 'group', 'type']) || 'General';
      const sku = getField(row, ['sku', 'code', 'item_code']);
      const barcode = getField(row, ['barcode', 'upc', 'ean']);
      const cost_price = parseFloat(getField(row, ['cost_price', 'buying_price', 'cost', 'purchase_price']) || 0) || 0;
      const selling_price = parseFloat(getField(row, ['selling_price', 'price', 'retail_price', 'unit_price']) || 0) || 0;
      const stock_quantity = parseFloat(getField(row, ['stock_quantity', 'quantity', 'stock', 'qty', 'initial_stock']) || 0) || 0;
      const unit = getField(row, ['unit', 'uom', 'measure']) || 'pcs';
      const min_alert_quantity = parseFloat(getField(row, ['min_alert_quantity', 'alert', 'min_stock', 'threshold']) || 5) || 5;
      const image_url = getField(row, ['image_url', 'image', 'img', 'photo']);

      products.push({
        name,
        category,
        sku,
        barcode,
        cost_price,
        selling_price,
        stock_quantity,
        unit,
        min_alert_quantity,
        image_url
      });
    }

    return products;
  },

  renderStockImportPreview(products, filename) {
    const area = document.getElementById('stock-import-preview-area');
    if (!area) return;

    const totalQty = products.reduce((sum, p) => sum + (parseFloat(p.stock_quantity) || 0), 0);
    const totalCost = products.reduce((sum, p) => sum + ((parseFloat(p.stock_quantity) || 0) * (parseFloat(p.cost_price) || 0)), 0);

    area.style.display = 'block';
    area.innerHTML = `
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px 14px; border-radius: 6px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <strong style="color: #166534; font-size: 13.5px;">✓ File "${this.escape(filename)}" parsed successfully!</strong>
            <div style="font-size: 12px; color: #15803d; margin-top: 2px;">
              <strong>${products.length}</strong> products detected • <strong>${totalQty.toLocaleString()}</strong> total items • Asset Value: <strong>${State.formatMoney(totalCost)}</strong>
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('stock-file-input').click()">Choose Another File</button>
        </div>
      </div>

      <div class="import-preview-box">
        <table class="data-table" style="font-size: 11.5px;">
          <thead>
            <tr>
              <th>#</th>
              <th>Product Name</th>
              <th>Category</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Cost Price</th>
              <th>Selling Price</th>
            </tr>
          </thead>
          <tbody>
            ${products.slice(0, 50).map((p, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${this.escape(p.name)}</strong></td>
                <td>${this.escape(p.category || 'General')}</td>
                <td><code>${this.escape(p.sku || 'Auto')}</code></td>
                <td><strong>${p.stock_quantity}</strong></td>
                <td>${this.escape(p.unit || 'pcs')}</td>
                <td>${State.formatMoney(p.cost_price)}</td>
                <td style="color: var(--primary); font-weight: 700;">${State.formatMoney(p.selling_price)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${products.length > 50 ? `<div style="padding: 8px; text-align: center; font-size: 11px; color: var(--text-muted); background: #f8fafc;">Showing first 50 of ${products.length} products</div>` : ''}
      </div>

      <button type="button" id="execute-import-btn" class="btn btn-primary btn-lg" style="width: 100%;" onclick="App.executeStockImport()">
        🚀 Import All ${products.length} Products into Stock
      </button>
    `;
  },

  async executeStockImport() {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can import stock', 'error');
      return;
    }
    if (!this.importedStockProducts || this.importedStockProducts.length === 0) {
      State.showToast('No products to import', 'warning');
      return;
    }

    const btn = document.getElementById('execute-import-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width: 18px; height: 18px; border-width: 2px;"></span> Importing ${this.importedStockProducts.length} products to database...`;
    }

    try {
      const res = await API.bulkAddProducts(this.importedStockProducts);
      if (res && res.success) {
        State.showToast(`Successfully imported ${this.importedStockProducts.length} products into inventory!`, 'success');
        document.getElementById('general-modal').classList.remove('active');
        if (State.currentRoute === 'inventory') {
          this.renderInventory(document.getElementById('content-area'));
        } else if (State.currentRoute === 'pos') {
          this.renderPOS(document.getElementById('content-area'));
        }
      }
    } catch (err) {
      State.showToast(err.message || 'Error during bulk stock import', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `🚀 Retry Import`;
      }
    }
  },

  showNewCustomerModal() {
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = 'Add New Customer';
    document.getElementById('general-modal-body').innerHTML = `
      <form id="new-cust-form" onsubmit="App.submitNewCustomer(event)">
        <div class="form-group">
          <label class="form-label">Full Customer / Company Name</label>
          <input type="text" id="nc-name" class="form-input" placeholder="e.g. Serengeti Builders Ltd" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="text" id="nc-phone" class="form-input" placeholder="e.g. 07xxxxxxxx" required>
          </div>
          <div class="form-group">
            <label class="form-label">Email (Optional)</label>
            <input type="email" id="nc-email" class="form-input" placeholder="client@example.com">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Physical Address / Site Location</label>
            <input type="text" id="nc-address" class="form-input" placeholder="e.g. Njiro, Arusha">
          </div>
          <div class="form-group">
            <label class="form-label">Allowed Credit Limit (${State.settings.currency_symbol || 'TSh'})</label>
            <input type="number" id="nc-credit" class="form-input" step="any" value="0">
          </div>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Create Customer</button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitNewCustomer(e) {
    e.preventDefault();
    const data = {
      name: document.getElementById('nc-name').value.trim(),
      phone: document.getElementById('nc-phone').value.trim(),
      email: document.getElementById('nc-email').value.trim(),
      address: document.getElementById('nc-address').value.trim(),
      credit_limit: parseFloat(document.getElementById('nc-credit').value) || 0
    };

    try {
      const res = await API.addCustomer(data);
      if (res && res.success) {
        State.showToast('Customer created successfully', 'success');
        document.getElementById('general-modal').classList.remove('active');
        if (State.currentRoute === 'debtors') {
          this.renderDebtors(document.getElementById('content-area'));
        } else if (State.currentRoute === 'pos') {
          this.renderPOS(document.getElementById('content-area'));
        }
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  showNewSupplierModal() {
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = 'Add Supplier';
    document.getElementById('general-modal-body').innerHTML = `
      <form id="new-sup-form" onsubmit="App.submitNewSupplier(event)">
        <div class="form-group">
          <label class="form-label">Supplier / Company Name</label>
          <input type="text" id="ns-name" class="form-input" placeholder="e.g. Simba Cement Industries" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Contact Person</label>
            <input type="text" id="ns-contact" class="form-input" placeholder="e.g. Sales Manager">
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="text" id="ns-phone" class="form-input" placeholder="07xxxxxxxx" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Address / Location</label>
          <input type="text" id="ns-address" class="form-input" placeholder="Tanga / Arusha">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Save Supplier</button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitNewSupplier(e) {
    e.preventDefault();
    const data = {
      name: document.getElementById('ns-name').value.trim(),
      contact_person: document.getElementById('ns-contact').value.trim(),
      phone: document.getElementById('ns-phone').value.trim(),
      address: document.getElementById('ns-address').value.trim()
    };

    try {
      const res = await API.addSupplier(data);
      if (res && res.success) {
        State.showToast('Supplier added successfully', 'success');
        document.getElementById('general-modal').classList.remove('active');
        this.renderSuppliers(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  showNewPOModal() {
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = 'Create New Purchase Order (PO)';
    document.getElementById('general-modal-body').innerHTML = `
      <form id="new-po-form" onsubmit="App.submitNewPO(event)">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Select Supplier</label>
            <select id="po-supplier" class="form-select" required>
              <option value="">-- Choose Supplier --</option>
              ${this.suppliersCache.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Expected Delivery Date</label>
            <input type="date" id="po-date" class="form-input" value="${new Date().toISOString().split('T')[0]}" required>
          </div>
        </div>

        <div style="font-weight: 700; margin: 12px 0 6px;">Order Items:</div>
        <div id="po-items-rows">
          <div class="form-row po-row" style="margin-bottom: 8px;">
            <select class="form-select po-item-prod" style="flex: 2;" required>
              <option value="">-- Choose Inventory Product --</option>
              ${this.productsCache.map(p => `<option value="${p.id}" data-cost="${p.cost_price}" data-unit="${p.unit}">${p.name} (Cost: ${p.cost_price})</option>`).join('')}
            </select>
            <input type="number" class="form-input po-item-qty" placeholder="Qty" style="flex: 1;" step="any" min="1" value="10" required>
            <input type="number" class="form-input po-item-cost" placeholder="Unit Cost" style="flex: 1;" step="any" required>
          </div>
        </div>

        <div class="form-group" style="margin-top: 14px;">
          <label class="form-label">Purchase Order Notes / Instructions</label>
          <input type="text" id="po-notes" class="form-input" placeholder="e.g. Standard delivery to Arusha warehouse">
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%;">Generate Purchase Order</button>
      </form>
    `;

    // Hook auto cost fill on select change
    const prodSelect = document.querySelector('.po-item-prod');
    const costInput = document.querySelector('.po-item-cost');
    prodSelect?.addEventListener('change', () => {
      const selected = prodSelect.options[prodSelect.selectedIndex];
      if (selected && selected.dataset.cost) {
        costInput.value = selected.dataset.cost;
      }
    });

    modal.classList.add('active');
  },

  async submitNewPO(e) {
    e.preventDefault();
    const supId = document.getElementById('po-supplier').value;
    const expDate = document.getElementById('po-date').value;
    const notes = document.getElementById('po-notes').value.trim();

    const prodSelect = document.querySelector('.po-item-prod');
    const qty = parseFloat(document.querySelector('.po-item-qty').value) || 0;
    const cost = parseFloat(document.querySelector('.po-item-cost').value) || 0;
    const selected = prodSelect.options[prodSelect.selectedIndex];

    const items = [{
      product_id: parseInt(prodSelect.value),
      product_name: selected.text.split(' (Cost:')[0],
      unit: selected.dataset.unit || 'pcs',
      quantity_ordered: qty,
      cost_price: cost,
      total_price: qty * cost
    }];

    try {
      const res = await API.createPurchaseOrder({
        supplier_id: supId,
        user_id: State.currentUser?.id,
        subtotal: qty * cost,
        total_amount: qty * cost,
        expected_date: expDate,
        notes: notes,
        items: items
      });
      if (res && res.success) {
        State.showToast('Purchase Order created!', 'success');
        document.getElementById('general-modal').classList.remove('active');
        this.renderSuppliers(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  showNewInvoiceModal(isProforma = false) {
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = isProforma ? 'Create Proforma Invoice (Quotation)' : 'Create Official Sales Invoice';
    document.getElementById('general-modal-body').innerHTML = `
      <form id="new-inv-form" onsubmit="App.submitNewInvoice(event, ${isProforma})">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Client / Customer</label>
            <select id="inv-customer" class="form-select" required>
              <option value="">-- Select Customer --</option>
              ${this.customersCache.map(c => `<option value="${c.id}" data-name="${c.name}" data-phone="${c.phone || ''}">${c.name} (${c.phone || 'No phone'})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Due Date</label>
            <input type="date" id="inv-due-date" class="form-input" value="${new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]}">
          </div>
        </div>

        <div style="font-weight: 700; margin: 12px 0 6px;">Select Product & Billing:</div>
        <div class="form-row" style="margin-bottom: 8px;">
          <select id="inv-prod" class="form-select" style="flex: 2;" required>
            <option value="">-- Choose Product --</option>
            ${this.productsCache.map(p => `<option value="${p.id}" data-price="${p.selling_price}" data-unit="${p.unit}">${p.name} (${State.formatMoney(p.selling_price)})</option>`).join('')}
          </select>
          <input type="number" id="inv-qty" class="form-input" placeholder="Quantity" style="flex: 1;" step="any" min="1" value="1" required>
          <input type="number" id="inv-price" class="form-input" placeholder="Unit Price" style="flex: 1;" step="any" required>
        </div>

        ${!isProforma ? `
          <div class="form-row" style="margin-top: 10px;">
            <div class="form-group">
              <label class="form-label">Amount Paid Upfront</label>
              <input type="number" id="inv-amount-paid" class="form-input" step="any" value="0">
            </div>
            <div class="form-group">
              <label class="form-label">Payment Method</label>
              <select id="inv-pay-method" class="form-select">
                <option value="BANK">Bank Deposit / CRDB</option>
                <option value="CASH">Cash in Drawer</option>
                <option value="MPESA">M-Pesa</option>
                <option value="CREDIT">On Credit (Debtor)</option>
              </select>
            </div>
          </div>
        ` : ''}

        <div class="form-group">
          <label class="form-label">Invoice Notes</label>
          <input type="text" id="inv-notes" class="form-input" placeholder="e.g. Deliver to site upon payment">
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%;">
          ${isProforma ? 'Generate Proforma Quote' : 'Issue Commercial Invoice'}
        </button>
      </form>
    `;

    const pSelect = document.getElementById('inv-prod');
    const pPrice = document.getElementById('inv-price');
    pSelect?.addEventListener('change', () => {
      const opt = pSelect.options[pSelect.selectedIndex];
      if (opt && opt.dataset.price) pPrice.value = opt.dataset.price;
    });

    modal.classList.add('active');
  },

  async submitNewInvoice(e, isProforma) {
    e.preventDefault();
    const custSelect = document.getElementById('inv-customer');
    const custId = custSelect.value;
    const custOpt = custSelect.options[custSelect.selectedIndex];
    const dueDate = document.getElementById('inv-due-date')?.value;
    const notes = document.getElementById('inv-notes')?.value.trim();

    const pSelect = document.getElementById('inv-prod');
    const pOpt = pSelect.options[pSelect.selectedIndex];
    const qty = parseFloat(document.getElementById('inv-qty').value) || 1;
    const price = parseFloat(document.getElementById('inv-price').value) || 0;
    const amountPaid = isProforma ? 0 : (parseFloat(document.getElementById('inv-amount-paid')?.value || 0) || 0);
    const payMethod = isProforma ? 'CASH' : (document.getElementById('inv-pay-method')?.value || 'BANK');

    const total = qty * price;
    const orderData = {
      order_type: isProforma ? 'PROFORMA' : 'INVOICE',
      user_id: State.currentUser?.id,
      customer_id: custId ? parseInt(custId) : null,
      customer_name: custOpt.dataset.name,
      customer_phone: custOpt.dataset.phone,
      subtotal: total,
      discount: 0,
      tax: 0,
      total: total,
      amount_paid: amountPaid,
      payment_method: payMethod,
      due_date: dueDate,
      notes: notes,
      items: [{
        product_id: parseInt(pSelect.value),
        product_name: pOpt.text.split(' (')[0],
        unit: pOpt.dataset.unit || 'pcs',
        quantity: qty,
        unit_price: price,
        total_price: total
      }]
    };

    try {
      const res = await API.createOrder(orderData);
      if (res && res.success) {
        State.showToast(`${isProforma ? 'Proforma' : 'Invoice'} created successfully!`, 'success');
        document.getElementById('general-modal').classList.remove('active');
        if (isProforma) {
          this.navigate('proforma');
        } else {
          this.navigate('invoices');
        }
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  showStandaloneDeliveryNoteModal() {
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = 'Generate Delivery Note';
    document.getElementById('general-modal-body').innerHTML = `
      <form id="standalone-dn-form" onsubmit="App.submitDeliveryNote(event)">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Customer / Recipient Name</label>
            <input type="text" id="dn-cust-name" class="form-input" placeholder="e.g. Serengeti Builders" required>
          </div>
          <div class="form-group">
            <label class="form-label">Recipient Phone</label>
            <input type="text" id="dn-cust-phone" class="form-input" placeholder="07xxxxxxxx">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Delivery Destination Address</label>
          <input type="text" id="dn-address" class="form-input" placeholder="e.g. Plot 44, Sakina Area, Arusha" required>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Transporter / Driver Name</label>
            <input type="text" id="dn-transporter" class="form-input" placeholder="e.g. Peter Mushi">
          </div>
          <div class="form-group">
            <label class="form-label">Vehicle Registration No.</label>
            <input type="text" id="dn-vehicle" class="form-input" placeholder="e.g. T 421 DXB">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Special Delivery Remarks / Instructions</label>
          <input type="text" id="dn-notes" class="form-input" placeholder="e.g. Offloading at rear entrance">
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%;">Issue Delivery Note</button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitDeliveryNote(e) {
    e.preventDefault();
    const data = {
      customer_name: document.getElementById('dn-cust-name').value.trim(),
      customer_phone: document.getElementById('dn-cust-phone').value.trim(),
      delivery_address: document.getElementById('dn-address').value.trim(),
      transporter_name: document.getElementById('dn-transporter').value.trim(),
      vehicle_number: document.getElementById('dn-vehicle').value.trim(),
      notes: document.getElementById('dn-notes').value.trim(),
      dispatched_by: State.currentUser?.id
    };

    try {
      const res = await API.createDeliveryNote(data);
      if (res && res.success) {
        State.showToast('Delivery Note created', 'success');
        document.getElementById('general-modal').classList.remove('active');
        this.navigate('delivery-notes');
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  async showDeliveryNoteModalFromInvoice(orderId) {
    try {
      const res = await API.getOrder(orderId);
      const ord = res.order;
      if (!ord) return;

      const modal = document.getElementById('general-modal');
      document.getElementById('general-modal-title').textContent = `Generate Delivery Note for Invoice ${ord.order_number}`;
      document.getElementById('general-modal-body').innerHTML = `
        <form id="inv-dn-form" onsubmit="App.submitDeliveryNoteFromInvoice(event, ${ord.id})">
          <div class="form-group">
            <label class="form-label">Recipient Customer</label>
            <input type="text" id="idn-cust" class="form-input" value="${ord.customer_name}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Delivery Destination Address</label>
            <input type="text" id="idn-address" class="form-input" placeholder="Physical site address in Arusha" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Transporter / Driver Name</label>
              <input type="text" id="idn-transporter" class="form-input" placeholder="Driver name">
            </div>
            <div class="form-group">
              <label class="form-label">Vehicle Registration No</label>
              <input type="text" id="idn-vehicle" class="form-input" placeholder="e.g. T 123 ABC">
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;">Create & Print Delivery Note</button>
        </form>
      `;
      modal.classList.add('active');
    } catch (e) {
      State.showToast(e.message, 'error');
    }
  },

  async submitDeliveryNoteFromInvoice(e, orderId) {
    e.preventDefault();
    const data = {
      order_id: orderId,
      customer_name: document.getElementById('idn-cust').value.trim(),
      delivery_address: document.getElementById('idn-address').value.trim(),
      transporter_name: document.getElementById('idn-transporter').value.trim(),
      vehicle_number: document.getElementById('idn-vehicle').value.trim(),
      dispatched_by: State.currentUser?.id
    };

    try {
      const res = await API.createDeliveryNote(data);
      if (res && res.success) {
        State.showToast('Delivery note created', 'success');
        document.getElementById('general-modal').classList.remove('active');
        this.navigate('delivery-notes');
      }
    } catch (err) {
      State.showToast(err.message, 'error');
    }
  },

  // -------------------------------------------------------------
  // UNIVERSAL DELETE & MUTATION ACTIONS (ADMIN-RESTRICTED)
  // -------------------------------------------------------------
  async deleteProductAction(id) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can delete products', 'error');
      return;
    }
    if (!confirm('Are you sure you want to permanently delete this product? This action cannot be undone.')) return;
    try {
      const res = await API.deleteProduct(id);
      if (res && res.success) {
        State.showToast('Product deleted successfully', 'success');
        if (State.currentView === 'inventory') {
          this.renderInventory(document.getElementById('content-area'));
        } else if (State.currentView === 'pos') {
          this.renderPOS(document.getElementById('content-area'));
        } else {
          this.navigate(State.currentView);
        }
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to delete product', 'error');
    }
  },

  async deleteCustomerAction(id) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can delete customers', 'error');
      return;
    }
    if (!confirm('Are you sure you want to delete this customer record?')) return;
    try {
      const res = await API.deleteCustomer(id);
      if (res && res.success) {
        State.showToast('Customer deleted successfully', 'success');
        this.renderDebtors(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to delete customer', 'error');
    }
  },

  async deleteSupplierAction(id) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can delete suppliers', 'error');
      return;
    }
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    try {
      const res = await API.deleteSupplier(id);
      if (res && res.success) {
        State.showToast('Supplier deleted successfully', 'success');
        this.renderSuppliers(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to delete supplier', 'error');
    }
  },

  async deleteOrderAction(id) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can delete sales or invoices', 'error');
      return;
    }
    if (!confirm('Are you sure you want to permanently delete this order / invoice record?')) return;
    try {
      const res = await API.deleteOrder(id);
      if (res && res.success) {
        State.showToast('Order / invoice deleted successfully', 'success');
        if (State.currentView === 'dashboard') {
          this.renderDashboard(document.getElementById('content-area'));
        } else if (State.currentView === 'invoices') {
          this.renderInvoices(document.getElementById('content-area'));
        } else if (State.currentView === 'proforma') {
          this.renderProforma(document.getElementById('content-area'));
        } else {
          this.navigate(State.currentView);
        }
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to delete order', 'error');
    }
  },

  async deleteDeliveryNoteAction(id) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can delete delivery notes', 'error');
      return;
    }
    if (!confirm('Are you sure you want to delete this delivery note?')) return;
    try {
      const res = await API.deleteDeliveryNote(id);
      if (res && res.success) {
        State.showToast('Delivery note deleted successfully', 'success');
        this.renderDeliveryNotes(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to delete delivery note', 'error');
    }
  },

  async deletePurchaseOrderAction(id) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can delete purchase orders', 'error');
      return;
    }
    if (!confirm('Are you sure you want to delete this purchase order?')) return;
    try {
      const res = await API.deletePurchaseOrder(id);
      if (res && res.success) {
        State.showToast('Purchase order deleted successfully', 'success');
        this.renderSuppliers(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to delete purchase order', 'error');
    }
  },

  async deleteWorkerAction(id) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can delete staff accounts', 'error');
      return;
    }
    if (!confirm('Are you sure you want to delete this staff account? They will no longer be able to log in.')) return;
    try {
      const res = await API.deleteWorker(id);
      if (res && res.success) {
        State.showToast('Staff account deleted successfully', 'success');
        this.renderWorkers(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to delete worker', 'error');
    }
  },

  async deleteCapitalEntryAction(id) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can delete capital adjustments', 'error');
      return;
    }
    if (!confirm('Are you sure you want to delete this capital adjustment entry?')) return;
    try {
      const res = await API.deleteCapitalAdjustment(id);
      if (res && res.success) {
        State.showToast('Capital transaction deleted successfully', 'success');
        this.renderCapital(document.getElementById('content-area'));
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to delete capital entry', 'error');
    }
  },

  showResetCapitalModal() {
    if (!State.isAdmin()) {
      State.showToast('Access restricted: Only administrators can reset capital records', 'error');
      return;
    }
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = '🔄 Reset Business Capital & Start Afresh';
    document.getElementById('general-modal-body').innerHTML = `
      <div style="padding: 6px 0;">
        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 14px; border-radius: 6px; margin-bottom: 16px;">
          <div style="font-weight: 700; color: #991b1b; font-size: 14px; margin-bottom: 4px;">⚠️ Start Fresh Capital Setup</div>
          <div style="font-size: 13px; color: #7f1d1d; line-height: 1.4;">
            This action wipes previous capital ledger records and sets your liquid funds (cash, bank, and mobile float) to <strong>TSh 0</strong> so you can start completely fresh.
          </div>
        </div>

        <div style="margin-bottom: 18px;">
          <label style="font-weight: 700; font-size: 13px; display: block; margin-bottom: 8px; color: var(--text-main);">Choose Reset Scope:</label>
          
          <label style="display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; margin-bottom: 10px; cursor: pointer; background: #ffffff;">
            <input type="radio" name="jk_reset_scope" value="liquid_only" checked style="margin-top: 3px;">
            <div>
              <div style="font-weight: 700; color: #0f172a; font-size: 13.5px;">Option 1: Reset Liquid Funds & Ledger Only</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                Sets Cash, Bank balance, and Mobile money to <strong>TSh 0</strong>, and clears all capital injection/drawing records. <em>Product stock quantities remain intact.</em>
              </div>
            </div>
          </label>

          <label style="display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1.5px solid #fca5a5; border-radius: 8px; cursor: pointer; background: #fff5f5;">
            <input type="radio" name="jk_reset_scope" value="all" style="margin-top: 3px;">
            <div>
              <div style="font-weight: 700; color: #991b1b; font-size: 13.5px;">Option 2: 100% Total Reset (Liquid + Stock Valuation = TSh 0)</div>
              <div style="font-size: 12px; color: #7f1d1d; margin-top: 2px;">
                Sets Liquid balances to <strong>TSh 0</strong>, clears ledger, AND resets all product stock quantities to <strong>0</strong>. Total Business Capital on the dashboard will start at <strong>TSh 0.00</strong>!
              </div>
            </div>
          </label>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
          <button class="btn btn-secondary" onclick="App.closeGeneralModal()">Cancel</button>
          <button class="btn btn-danger" onclick="App.confirmResetCapital()">
            Confirm & Wipe to 0
          </button>
        </div>
      </div>
    `;
    modal.classList.add('active');
  },

  async confirmResetCapital() {
    const scopeRadio = document.querySelector('input[name="jk_reset_scope"]:checked');
    const resetStock = scopeRadio && scopeRadio.value === 'all';
    
    try {
      State.showToast('Resetting capital records...', 'info');
      const res = await API.resetCapital({ resetStock });
      if (res && res.success) {
        this.closeGeneralModal();
        State.showToast(resetStock 
          ? 'Total Capital and product stock quantities reset to 0! Starting completely fresh.' 
          : 'Liquid balances and capital ledger reset to 0!', 'success');
        if (State.currentRoute === 'capital') {
          this.renderCapital(document.getElementById('content-area'));
        } else if (State.currentRoute === 'products') {
          this.renderProducts(document.getElementById('content-area'));
        } else {
          this.renderDashboard(document.getElementById('content-area'));
        }
      }
    } catch (err) {
      State.showToast(err.message || 'Error resetting capital', 'error');
    }
  },

  async resetCapitalAction() {
    this.showResetCapitalModal();
  },

  // -------------------------------------------------------------
  // STOCK AUDIT & REMOVAL / DELETION ACTIONS
  // -------------------------------------------------------------
  async deleteStockMovementAction(id) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can delete stock movements', 'error');
      return;
    }
    if (!confirm('Are you sure you want to delete this recorded stock entry? The product stock quantity balance will automatically be reversed.')) return;
    try {
      const res = await API.deleteStockMovement(id);
      if (res && res.success) {
        State.showToast('Recorded stock entry deleted and inventory balance restored', 'success');
        await this.showStockMovementsModal();
        if (State.currentView === 'inventory') {
          this.renderInventory(document.getElementById('content-area'));
        }
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to delete stock movement', 'error');
    }
  },

  async clearStockAction(productId) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can clear or delete stock', 'error');
      return;
    }
    const p = (this.productsCache || []).find(x => String(x.id) === String(productId));
    const name = p ? p.name : 'this item';
    if (!confirm(`Are you sure you want to CLEAR and reset recorded stock for "${name}" to ZERO (0)? This action will be logged in the audit trail.`)) return;
    try {
      const res = await API.clearProductStock(productId);
      if (res && res.success) {
        State.showToast(`Stock for ${name} has been reset to 0`, 'success');
        const modal = document.getElementById('general-modal');
        if (modal && modal.classList.contains('active')) {
          modal.classList.remove('active');
        }
        if (State.currentView === 'inventory') {
          this.renderInventory(document.getElementById('content-area'));
        }
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to clear product stock', 'error');
    }
  },

  // -------------------------------------------------------------
  // USER PROFILE SELF-MANAGEMENT
  // -------------------------------------------------------------
  showMyProfileModal() {
    const user = State.currentUser;
    if (!user) return;
    const branches = State.getBranches();
    const branchMap = {};
    branches.forEach(b => { branchMap[b.id] = b.name; });
    const bName = branchMap[user.branch_id] || 'All Shops / Floating';

    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = 'My Worker Profile & Security';
    document.getElementById('general-modal-body').innerHTML = `
      <form id="my-profile-form" onsubmit="App.submitMyProfile(event)">
        <div style="display: flex; align-items: center; gap: 20px; background: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid var(--border); flex-wrap: wrap;">
          <div id="profile-photo-preview-wrap">
            ${user.photo_url 
              ? `<img id="profile-photo-preview" src="${user.photo_url}" class="worker-table-avatar" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid var(--primary);" alt="Avatar">`
              : `<div id="profile-photo-preview" class="worker-table-avatar" style="width: 80px; height: 80px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; color: #475569; border: 3px solid var(--primary);">${(user.full_name || user.username || 'U').charAt(0).toUpperCase()}</div>`
            }
          </div>
          <div style="flex: 1; min-width: 220px;">
            <label class="form-label" style="margin-bottom: 4px; font-weight: 700;">Profile Photo / Badge</label>
            <input type="file" id="profile-photo-input" class="form-input" accept="image/*" onchange="App.handleProfilePhotoSelect(event)" style="padding: 6px;">
            <input type="hidden" id="profile-photo-base64" value="${user.photo_url || ''}">
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Attach your photo so admin can identify who is on duty.</div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input type="text" id="my-fullname" class="form-input" value="${this.escape(user.full_name || '')}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number *</label>
            <input type="text" id="my-phone" class="form-input" value="${this.escape(user.phone || '')}" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">National ID (NIDA) *</label>
            <input type="text" id="my-nida" class="form-input" value="${this.escape(user.national_id || '')}" placeholder="e.g. 19900101-12345-00001-20" required>
            <div style="font-size: 11px; color: var(--text-muted);">Required for official duty audit logs</div>
          </div>
          <div class="form-group">
            <label class="form-label">Physical Address / Residence *</label>
            <input type="text" id="my-address" class="form-input" value="${this.escape(user.address || '')}" placeholder="e.g. Sakina, Arusha" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">System Role</label>
            <input type="text" class="form-input" value="${this.escape(user.role)}" disabled style="background: #f1f5f9;">
          </div>
          <div class="form-group">
            <label class="form-label">Assigned Shop</label>
            <input type="text" class="form-input" value="${this.escape(bName)}" disabled style="background: #f1f5f9;">
          </div>
        </div>

        <div class="form-group" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border);">
          <label class="form-label">Change Password / PIN (Leave empty to keep current password)</label>
          <input type="password" id="my-new-pass" class="form-input" placeholder="New login password or PIN">
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 16px; padding: 12px; font-weight: 700;">
          Save Profile Information
        </button>
      </form>
    `;
    modal.classList.add('active');
  },

  compressImage(file, maxDim, quality, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        callback(compressed);
      };
      img.onerror = () => {
        callback(e.target.result);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  handleWorkerPhotoSelect(event, previewWrapId, hiddenInputId) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    this.compressImage(file, 260, 0.82, (dataUrl) => {
      const hiddenInput = document.getElementById(hiddenInputId);
      if (hiddenInput) hiddenInput.value = dataUrl;
      const previewWrap = document.getElementById(previewWrapId);
      if (previewWrap) {
        previewWrap.innerHTML = `<img src="${dataUrl}" class="worker-table-avatar" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary);" alt="Avatar">`;
      }
    });
  },

  handleProfilePhotoSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    this.compressImage(file, 260, 0.82, (dataUrl) => {
      const hiddenInput = document.getElementById('profile-photo-base64');
      if (hiddenInput) hiddenInput.value = dataUrl;
      const previewWrap = document.getElementById('profile-photo-preview-wrap');
      if (previewWrap) {
        previewWrap.innerHTML = `<img id="profile-photo-preview" src="${dataUrl}" class="worker-table-avatar" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid var(--primary);" alt="Avatar">`;
      }
    });
  },

  async submitMyProfile(e) {
    e.preventDefault();
    const user = State.currentUser;
    if (!user) return;

    const fullName = document.getElementById('my-fullname').value.trim();
    const phone = document.getElementById('my-phone').value.trim();
    const nationalId = document.getElementById('my-nida').value.trim();
    const address = document.getElementById('my-address').value.trim();
    const photoUrl = document.getElementById('profile-photo-base64').value;
    const newPass = document.getElementById('my-new-pass').value.trim();

    try {
      const payload = {
        full_name: fullName,
        phone: phone,
        national_id: nationalId,
        address: address,
        photo_url: photoUrl
      };
      if (newPass) {
        payload.password = newPass;
      }

      const res = await API.updateProfile(user.id, payload);
      if (res && res.success) {
        State.showToast('Profile updated successfully!', 'success');
        document.getElementById('general-modal').classList.remove('active');
        this.updateShiftUI();
        if (State.currentView === 'workers') {
          this.renderWorkers(document.getElementById('content-area'));
        }
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to update profile', 'error');
    }
  },

  // -------------------------------------------------------------
  // MULTI-BRANCH (MULTIPLE SHOPS) MANAGEMENT & SWITCHING
  // -------------------------------------------------------------
  onBranchChange(branchId) {
    State.setCurrentBranch(branchId);
    this.updateBranchSelectorUI();
    State.showToast(`Switched shop context to: ${State.getCurrentBranchName()}`, 'info');
    this.navigate(State.currentView);
  },

  showManageBranchesModal() {
    this.navigate('branches');
  },

  async renderBranches(container) {
    container.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading Shops & Branches...</div>`;

    try {
      const res = await API.getBranches();
      const branches = res.branches || [];
      State.setBranches(branches);

      // Fetch consolidated and branch-specific summaries
      const branchStats = await Promise.all(branches.map(async b => {
        try {
          const cap = await API.getCapital(b.id);
          const rep = await API.getDailyReport(new Date().toISOString().split('T')[0], b.id);
          const todayOrders = rep.orders || [];
          const todaySales = todayOrders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
          return {
            ...b,
            inventory_value: cap.stock_inventory_value || 0,
            active_products: cap.products_count || 0,
            today_sales: todaySales
          };
        } catch (err) {
          return { ...b, inventory_value: 0, active_products: 0, today_sales: 0 };
        }
      }));

      container.innerHTML = `
        <div class="card" style="border-top: 4px solid var(--primary);">
          <div class="card-header">
            <div>
              <h3 class="card-title">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                Multi-Branch & Multiple Shops Management
              </h3>
              <p style="font-size: 12px; color: var(--text-muted);">
                Each shop operates with separate stock, cash balances, sales, expenses, and staff records without error or collision.
              </p>
            </div>
            <button class="btn btn-primary" onclick="App.showNewBranchModal()">+ Add Another Shop / Branch</button>
          </div>

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <span style="font-size: 12px; color: #1e40af; font-weight: 600; text-transform: uppercase;">Active Shop Working View</span>
              <div style="font-size: 18px; font-weight: 800; color: #1e3a8a;">${State.getCurrentBranchName()}</div>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn btn-sm ${State.currentBranch === 'all' ? 'btn-primary' : 'btn-secondary'}" onclick="App.onBranchChange('all')">
                All Shops Consolidated
              </button>
              ${branches.map(b => `
                <button class="btn btn-sm ${State.currentBranch === b.id ? 'btn-primary' : 'btn-secondary'}" onclick="App.onBranchChange('${b.id}')">
                  ${this.escape(b.name)}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="metrics-grid" style="margin-bottom: 24px;">
            <div class="metric-card">
              <div class="metric-title">Registered Branches</div>
              <div class="metric-value" style="color: var(--primary);">${branches.length} Shops</div>
              <div class="metric-subtitle">Fully isolated operations</div>
            </div>
            <div class="metric-card">
              <div class="metric-title">Total Combined Stock Value</div>
              <div class="metric-value" style="color: var(--success);">${State.formatMoney(branchStats.reduce((s, b) => s + b.inventory_value, 0))}</div>
              <div class="metric-subtitle">Across all branches</div>
            </div>
            <div class="metric-card">
              <div class="metric-title">Total Today's Sales</div>
              <div class="metric-value" style="color: #2563eb;">${State.formatMoney(branchStats.reduce((s, b) => s + b.today_sales, 0))}</div>
              <div class="metric-subtitle">Today's consolidated turnover</div>
            </div>
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Shop / Branch Name</th>
                  <th>Branch Code</th>
                  <th>Location / Address</th>
                  <th>Contact Phone</th>
                  <th>Manager In-Charge</th>
                  <th>Active Products</th>
                  <th>Stock Valuation</th>
                  <th>Today's Sales</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${branchStats.map(b => `
                  <tr style="${State.currentBranch === b.id ? 'background: #f0fdf4;' : ''}">
                    <td>
                      <strong>${this.escape(b.name)}</strong>
                      ${b.is_default ? '<span class="badge badge-info" style="margin-left: 6px;">Headquarters</span>' : ''}
                      ${State.currentBranch === b.id ? '<span class="badge badge-success" style="margin-left: 6px;">Active Context</span>' : ''}
                    </td>
                    <td><code>${this.escape(b.code || 'SHOP')}</code></td>
                    <td>${this.escape(b.location || '-')}</td>
                    <td>${this.escape(b.phone || '-')}</td>
                    <td><strong>${this.escape(b.manager_name || 'Owner / Admin')}</strong></td>
                    <td><strong>${b.active_products}</strong> items</td>
                    <td style="font-weight: 700; color: var(--success);">${State.formatMoney(b.inventory_value)}</td>
                    <td style="font-weight: 700; color: #2563eb;">${State.formatMoney(b.today_sales)}</td>
                    <td>
                      <span class="badge ${b.active !== false ? 'badge-success' : 'badge-danger'}">
                        ${b.active !== false ? 'Operating' : 'Suspended'}
                      </span>
                    </td>
                    <td>
                      <div style="display: flex; gap: 6px;">
                        <button class="btn btn-sm btn-secondary" onclick="App.onBranchChange('${b.id}')" title="Switch to this shop">
                          Switch
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="App.showEditBranchModal('${b.id}')">
                          Edit
                        </button>
                        ${!b.is_default ? `
                          <button class="btn btn-sm btn-danger" onclick="App.deleteBranchAction('${b.id}')">
                            Delete
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div class="card" style="color: var(--danger);">Error loading branches: ${e.message}</div>`;
    }
  },

  showNewBranchModal() {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can create new branches', 'error');
      return;
    }
    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = 'Add New Shop / Branch';
    document.getElementById('general-modal-body').innerHTML = `
      <form id="new-branch-form" onsubmit="App.submitNewBranch(event)">
        <div class="form-group">
          <label class="form-label">Branch / Shop Name *</label>
          <input type="text" id="nb-name" class="form-input" placeholder="e.g. Branch 2 - Moshi Central" required>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Branch Code / Short Tag *</label>
            <input type="text" id="nb-code" class="form-input" placeholder="e.g. MOSHI-01" required>
          </div>
          <div class="form-group">
            <label class="form-label">Phone Contact</label>
            <input type="text" id="nb-phone" class="form-input" placeholder="07xxxxxxxx">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Physical Location / Town / Address *</label>
          <input type="text" id="nb-location" class="form-input" placeholder="e.g. Boma Road, Moshi Kilimanjaro" required>
        </div>

        <div class="form-group">
          <label class="form-label">Manager / Supervisor In-Charge</label>
          <input type="text" id="nb-manager" class="form-input" placeholder="e.g. Baraka John">
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 14px;">Create Shop & Initialize Database</button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitNewBranch(e) {
    e.preventDefault();
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can create new branches', 'error');
      return;
    }
    const name = document.getElementById('nb-name').value.trim();
    const code = document.getElementById('nb-code').value.trim();
    const phone = document.getElementById('nb-phone').value.trim();
    const location = document.getElementById('nb-location').value.trim();
    const manager = document.getElementById('nb-manager').value.trim();

    try {
      const res = await API.addBranch({
        name: name,
        code: code,
        phone: phone,
        location: location,
        manager_name: manager,
        active: true
      });
      if (res && res.success) {
        State.showToast(`Branch "${name}" created successfully!`, 'success');
        document.getElementById('general-modal').classList.remove('active');
        this.updateBranchSelectorUI();
        if (State.currentView === 'branches') {
          this.renderBranches(document.getElementById('content-area'));
        }
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to create branch', 'error');
    }
  },

  async showEditBranchModal(branchId) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can edit branches', 'error');
      return;
    }
    const res = await API.getBranches();
    const b = (res.branches || []).find(x => String(x.id) === String(branchId));
    if (!b) return;

    const modal = document.getElementById('general-modal');
    document.getElementById('general-modal-title').textContent = `Edit Shop: ${b.name}`;
    document.getElementById('general-modal-body').innerHTML = `
      <form id="edit-branch-form" onsubmit="App.submitEditBranch(event, '${b.id}')">
        <div class="form-group">
          <label class="form-label">Branch / Shop Name *</label>
          <input type="text" id="eb-name" class="form-input" value="${this.escape(b.name)}" required>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Branch Code</label>
            <input type="text" id="eb-code" class="form-input" value="${this.escape(b.code || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Phone Contact</label>
            <input type="text" id="eb-phone" class="form-input" value="${this.escape(b.phone || '')}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Location / Address</label>
          <input type="text" id="eb-location" class="form-input" value="${this.escape(b.location || '')}">
        </div>

        <div class="form-group">
          <label class="form-label">Manager In-Charge</label>
          <input type="text" id="eb-manager" class="form-input" value="${this.escape(b.manager_name || '')}">
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 14px;">Save Shop Details</button>
      </form>
    `;
    modal.classList.add('active');
  },

  async submitEditBranch(e, branchId) {
    e.preventDefault();
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can edit branches', 'error');
      return;
    }
    const name = document.getElementById('eb-name').value.trim();
    const code = document.getElementById('eb-code').value.trim();
    const phone = document.getElementById('eb-phone').value.trim();
    const location = document.getElementById('eb-location').value.trim();
    const manager = document.getElementById('eb-manager').value.trim();

    try {
      const res = await API.updateBranch(branchId, {
        name: name,
        code: code,
        phone: phone,
        location: location,
        manager_name: manager
      });
      if (res && res.success) {
        State.showToast('Shop details updated successfully', 'success');
        document.getElementById('general-modal').classList.remove('active');
        this.updateBranchSelectorUI();
        if (State.currentView === 'branches') {
          this.renderBranches(document.getElementById('content-area'));
        }
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to update branch', 'error');
    }
  },

  async deleteBranchAction(branchId) {
    if (!State.isAdmin()) {
      State.showToast('Access denied: Only administrators can delete branches', 'error');
      return;
    }
    if (!confirm('Are you sure you want to delete this shop / branch? All separate records associated with this branch will be removed.')) return;
    try {
      const res = await API.deleteBranch(branchId);
      if (res && res.success) {
        State.showToast('Shop branch removed', 'success');
        if (State.currentBranch === branchId) {
          State.setCurrentBranch('branch-main');
        }
        this.updateBranchSelectorUI();
        if (State.currentView === 'branches') {
          this.renderBranches(document.getElementById('content-area'));
        }
      }
    } catch (err) {
      State.showToast(err.message || 'Failed to delete branch', 'error');
    }
  }
};

// Bootstrap application on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
