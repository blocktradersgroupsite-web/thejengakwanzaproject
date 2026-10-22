// JENGAKWANZA Universal Backend Connector
// Routes automatically between:
// 1. Firebase Cloud Firestore (When deployed on Vercel or configured in Settings)
// 2. Local Ruby + SQLite REST server (When running ./start.sh)
// 3. Client Storage Fallback (When running standalone offline)

const API = {
  baseUrl: '/api',
  useFirebase: false,

  async checkFirebaseInit() {
    if (typeof FirebaseAdapter !== 'undefined' && FirebaseAdapter.hasConfig()) {
      if (!FirebaseAdapter.isInitialized) {
        const ok = await FirebaseAdapter.init();
        this.useFirebase = ok;
      } else {
        this.useFirebase = true;
      }
    } else {
      this.useFirebase = false;
    }
    return this.useFirebase;
  },

  async request(endpoint, options = {}) {
    // If running on Vercel or cloud static hosting without local Ruby backend
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalhost && !this.useFirebase) {
      return this.localFallback(endpoint, options);
    }

    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    options.headers = { ...defaultHeaders, ...options.headers };

    try {
      const res = await fetch(`${this.baseUrl}/${endpoint}`, options);
      const contentType = res.headers.get('content-type') || '';

      // If server returned HTML (e.g. Vercel SPA rewrite fallback returning index.html)
      if (contentType.includes('text/html')) {
        return this.localFallback(endpoint, options);
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `Request failed with status ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      return this.localFallback(endpoint, options);
    }
  },

  // Auth
  async login(username, password) {
    const cleanUser = (username || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    if (!cleanUser || !cleanPass) {
      throw new Error('Please enter both username and password.');
    }

    if (await this.checkFirebaseInit()) {
      try {
        // 1. Check local cache first
        let res = await FirebaseAdapter.getWorkers();
        let workers = res.workers || [];
        let u = workers.find(w => 
          w.username && w.username.trim().toLowerCase() === cleanUser && 
          (String(w.pin_hash || '').trim() === cleanPass || String(w.password || '').trim() === cleanPass)
        );

        // 2. If not found in cache and network is online, fetch fresh users from Firebase cloud
        if (!u && navigator.onLine) {
          try {
            const fresh = await FirebaseAdapter.rawFetch('users', 'GET', null, 3500);
            if (fresh) {
              FirebaseAdapter.setCache('users', fresh);
              workers = Array.isArray(fresh) ? fresh : Object.keys(fresh).map(k => ({ id: k, ...fresh[k] }));
              u = workers.find(w => 
                w.username && w.username.trim().toLowerCase() === cleanUser && 
                (String(w.pin_hash || '').trim() === cleanPass || String(w.password || '').trim() === cleanPass)
              );
            }
          } catch (fetchErr) {
            console.warn('Direct user cloud fetch note:', fetchErr.message);
          }
        }

        // 3. Initial Admin bootstrap if user document not yet written
        if (!u && cleanUser === 'admin' && (cleanPass === 'admin123' || cleanPass === 'admin')) {
          u = {
            id: 'admin',
            username: 'admin',
            full_name: 'System Administrator',
            role: 'Admin',
            phone: '0788989889',
            active: 1
          };
          FirebaseAdapter.addWorker(u).catch(() => {});
        }

        if (u) return { success: true, user: u };
      } catch (e) {
        console.warn('Firebase login attempt failed, falling back to local:', e);
      }
    }

    return this.localFallback('auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: cleanUser, password: cleanPass })
    });
  },

  // Settings
  async getSettings() {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getSettings();
    return this.request('settings');
  },

  async saveSettings(settingsData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.saveSettings(settingsData);
    return this.request('settings', {
      method: 'POST',
      body: JSON.stringify(settingsData)
    });
  },

  // Branches / Shops
  async getBranches() {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getBranches();
    return this.request('branches');
  },

  async addBranch(data) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.addBranch(data);
    return this.request('branches', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateBranch(id, data) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.updateBranch(id, data);
    return this.request(`branches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteBranch(id) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.deleteBranch(id);
    return this.request(`branches/${id}`, { method: 'DELETE' });
  },

  // Workers & Profiles
  async getWorkers() {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getWorkers();
    return this.request('workers');
  },

  async addWorker(workerData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.addWorker(workerData);
    return this.request('workers', {
      method: 'POST',
      body: JSON.stringify(workerData)
    });
  },

  async updateWorker(id, workerData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.updateWorker(id, workerData);
    return this.request(`workers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(workerData)
    });
  },

  async updateProfile(userId, profileData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.updateProfile(userId, profileData);
    return this.request(`workers/${userId}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(profileData)
    });
  },

  async deleteWorker(id) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.deleteWorker(id);
    return this.request(`workers/${id}`, { method: 'DELETE' });
  },

  // Shifts
  async getShifts(date, branchId) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getShifts(date, branchId);
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request(`shifts${q}`);
  },

  async clockIn(data) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.clockIn(data);
    return this.request('shifts/clock-in', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async clockOut(data) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.clockOut(data);
    return this.request('shifts/clock-out', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Products
  async getProducts(branchId) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getProducts(branchId);
    return this.request('products');
  },

  async addProduct(productData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.addProduct(productData);
    return this.request('products', {
      method: 'POST',
      body: JSON.stringify(productData)
    });
  },

  async bulkAddProducts(productsList) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.bulkAddProducts(productsList);
    for (const p of productsList) {
      await this.addProduct(p);
    }
    return { success: true, count: productsList.length };
  },

  async updateProduct(id, productData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.updateProduct(id, productData);
    return this.request(`products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(productData)
    });
  },

  async deleteProduct(id) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.deleteProduct(id);
    return this.request(`products/${id}`, { method: 'DELETE' });
  },

  async adjustStock(adjustData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.adjustStock(adjustData);
    return this.request('stock/adjust', {
      method: 'POST',
      body: JSON.stringify(adjustData)
    });
  },

  async getStockMovements(limit = 100) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getStockMovements(limit);
    return this.request(`stock/movements?limit=${limit}`);
  },

  async deleteStockMovement(id) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.deleteStockMovement(id);
    return this.request(`stock/movements/${id}`, { method: 'DELETE' });
  },

  async clearProductStock(productId, userId) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.clearProductStock(productId, userId);
    return this.request(`products/${productId}/clear-stock`, { method: 'POST' });
  },

  // Customers & Debtors
  async getCustomers() {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getCustomers();
    return this.request('customers');
  },

  async addCustomer(customerData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.addCustomer(customerData);
    return this.request('customers', {
      method: 'POST',
      body: JSON.stringify(customerData)
    });
  },

  async updateCustomer(id, customerData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.updateCustomer(id, customerData);
    return this.request(`customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(customerData)
    });
  },

  async deleteCustomer(id) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.deleteCustomer(id);
    return this.request(`customers/${id}`, { method: 'DELETE' });
  },

  async getDebtors() {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getDebtors();
    return this.request('debtors');
  },

  async payDebtor(paymentData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.payDebtor(paymentData);
    return this.request('debtors/pay', {
      method: 'POST',
      body: JSON.stringify(paymentData)
    });
  },

  // Suppliers & POs
  async getSuppliers() {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getSuppliers();
    return this.request('suppliers');
  },

  async addSupplier(supplierData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.addSupplier(supplierData);
    return this.request('suppliers', {
      method: 'POST',
      body: JSON.stringify(supplierData)
    });
  },

  async deleteSupplier(id) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.deleteSupplier(id);
    return this.request(`suppliers/${id}`, { method: 'DELETE' });
  },

  async getPurchaseOrders() {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getPurchaseOrders();
    return this.request('purchase-orders');
  },

  async createPurchaseOrder(poData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.createPurchaseOrder(poData);
    return this.request('purchase-orders', {
      method: 'POST',
      body: JSON.stringify(poData)
    });
  },

  async receivePurchaseOrder(poId, userId) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.receivePurchaseOrder(poId, userId);
    return this.request(`purchase-orders/${poId}/receive`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
  },

  async deletePurchaseOrder(id) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.deletePurchaseOrder(id);
    return this.request(`purchase-orders/${id}`, { method: 'DELETE' });
  },

  // Orders
  async getOrders(type, branchId) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getOrders(type, branchId);
    const q = type ? `?type=${encodeURIComponent(type)}` : '';
    return this.request(`orders${q}`);
  },

  async getOrder(id) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getOrder(id);
    return this.request(`orders/${id}`);
  },

  async createOrder(orderData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.createOrder(orderData);
    return this.request('orders', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
  },

  async deleteOrder(id) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.deleteOrder(id);
    return this.request(`orders/${id}`, { method: 'DELETE' });
  },

  async convertProforma(id, targetType, userId) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.convertProforma(id, targetType, userId);
    return this.request(`proforma/${id}/convert`, {
      method: 'POST',
      body: JSON.stringify({ target_type: targetType, user_id: userId })
    });
  },

  // Delivery Notes
  async getDeliveryNotes() {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getDeliveryNotes();
    return this.request('delivery-notes');
  },

  async createDeliveryNote(dnData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.createDeliveryNote(dnData);
    return this.request('delivery-notes', {
      method: 'POST',
      body: JSON.stringify(dnData)
    });
  },

  async deleteDeliveryNote(id) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.deleteDeliveryNote(id);
    return this.request(`delivery-notes/${id}`, { method: 'DELETE' });
  },

  // Expenses
  async getExpenses(date, branchId) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getExpenses(date, branchId);
    const q = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request(`expenses${q}`);
  },

  async createExpense(expenseData) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.createExpense(expenseData);
    return this.request('expenses', {
      method: 'POST',
      body: JSON.stringify(expenseData)
    });
  },

  async deleteExpense(id) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.deleteExpense(id);
    return this.request(`expenses/${id}`, { method: 'DELETE' });
  },

  // Capital
  async getCapital(branchId) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getCapital(branchId);
    return this.request('capital');
  },

  async recordCapitalAdjustment(data) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.recordCapitalAdjustment(data);
    return this.request('capital/adjust', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async deleteCapitalAdjustment(id) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.deleteCapitalAdjustment(id);
    return this.request(`capital/adjust/${id}`, { method: 'DELETE' });
  },

  async resetCapital(options = {}) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.resetCapital(options);
    return this.request('capital/reset', { method: 'POST', body: JSON.stringify(options) });
  },

  // Reports
  async getDashboardReport(branchId) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getDashboardReport(branchId);
    return this.request('reports/dashboard');
  },

  async getDailyReport(date, workerId) {
    if (await this.checkFirebaseInit()) return FirebaseAdapter.getDailyReport(date, workerId);
    let q = `?date=${encodeURIComponent(date || '')}`;
    if (workerId) q += `&worker_id=${encodeURIComponent(workerId)}`;
    return this.request(`reports/daily${q}`);
  },

  async exportBackup() {
    if (await this.checkFirebaseInit()) {
      const [settings, workers, products, customers, suppliers, orders, expenses, deliveryNotes, purchaseOrders, movements] = await Promise.all([
        this.getSettings(), this.getWorkers(), this.getProducts(), this.getCustomers(),
        this.getSuppliers(), this.getOrders(), this.getExpenses(), this.getDeliveryNotes(),
        this.getPurchaseOrders(), this.getStockMovements()
      ]);
      return {
        app: 'JENGAKWANZA',
        source: 'Firebase Cloud Firestore',
        exported_at: new Date().toISOString(),
        version: '1.0.0',
        data: {
          settings: settings.settings, workers: workers.workers, products: products.products,
          customers: customers.customers, suppliers: suppliers.suppliers, orders: orders.orders,
          expenses: expenses.expenses, delivery_notes: deliveryNotes.delivery_notes,
          purchase_orders: purchaseOrders.purchase_orders, movements: movements.movements
        }
      };
    }
    return this.request('backup/export');
  },

  // -------------------------------------------------------------
  // STANDALONE / OFFLINE FALLBACK
  // -------------------------------------------------------------
  localFallback(endpoint, options) {
    const keyPrefix = 'jengakwanza_';
    const getItem = (k, defaultVal) => {
      const data = localStorage.getItem(keyPrefix + k);
      return data ? JSON.parse(data) : defaultVal;
    };
    const setItem = (k, val) => {
      localStorage.setItem(keyPrefix + k, JSON.stringify(val));
    };

    let settings = getItem('settings', null);
    if (!settings) {
      settings = {
        company_name: 'JENGAKWANZA LIMITED',
        tagline: 'Building Excellence & Quality Supplies',
        phone_numbers: '0788989889 / 0713550104',
        address: 'P.O.BOX 14991 ARUSHA',
        email: 'jengakwanzaltd@gmail.com',
        currency: 'TZS',
        currency_symbol: 'TSh',
        tax_rate: '0',
        receipt_footer: 'Thank you for choosing JENGAKWANZA LIMITED! Quality Guarantee.',
        cash_balance: '0.0',
        bank_balance: '0.0',
        mobile_money_balance: '0.0'
      };
      setItem('settings', settings);
    }

    let workers = getItem('workers', null);
    if (!workers) {
      workers = [{
        id: 1,
        username: 'admin',
        full_name: 'System Administrator',
        role: 'Admin',
        phone: '0788989889',
        active: 1,
        pin_hash: 'admin123'
      }];
      setItem('workers', workers);
    }

    let products = getItem('products', []);
    let customers = getItem('customers', []);
    let suppliers = getItem('suppliers', []);
    let orders = getItem('orders', []);
    let expenses = getItem('expenses', []);
    let shifts = getItem('shifts', []);
    let deliveryNotes = getItem('delivery_notes', []);
    let purchaseOrders = getItem('purchase_orders', []);
    let movements = getItem('movements', []);
    let capitalLedger = getItem('capital_ledger', []);

    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};

    if (endpoint === 'auth/login') {
      const inputUser = (body.username || '').trim().toLowerCase();
      const inputPass = (body.password || body.pin || '').trim();

      // Check both local storage stores for maximum offline compatibility
      let allWorkers = Array.isArray(workers) ? [...workers] : [];
      try {
        const raw = localStorage.getItem('jk_cache_users');
        if (raw) {
          const parsed = JSON.parse(raw);
          const list = Array.isArray(parsed) ? parsed : Object.values(parsed);
          allWorkers = allWorkers.concat(list);
        }
      } catch (e) {}

      const u = allWorkers.find(w => 
        w && w.username && w.username.trim().toLowerCase() === inputUser && 
        (String(w.pin_hash || '').trim() === inputPass || String(w.password || '').trim() === inputPass)
      );
      if (u) return { success: true, user: u };

      // Emergency fallback for default Admin on initial launch
      if (inputUser === 'admin' && (inputPass === 'admin123' || inputPass === 'admin')) {
        const defaultAdmin = {
          id: 'admin',
          username: 'admin',
          full_name: 'System Administrator',
          role: 'Admin',
          phone: '0788989889',
          active: 1
        };
        return { success: true, user: defaultAdmin };
      }

      throw new Error('Invalid username or password');
    }

    if (endpoint === 'settings') {
      if (method === 'POST') {
        settings = { ...settings, ...body };
        setItem('settings', settings);
        return { success: true, message: 'Settings saved' };
      }
      return { success: true, settings };
    }

    if (endpoint === 'workers') {
      if (method === 'POST') {
        const id = Date.now();
        const w = { id, ...body, pin_hash: body.password || '123456', active: 1, created_at: new Date().toISOString() };
        workers.push(w);
        setItem('workers', workers);
        return { success: true, id };
      }
      return { success: true, workers };
    }

    if (endpoint.startsWith('workers/')) {
      const id = parseInt(endpoint.split('/')[1]);
      const idx = workers.findIndex(w => w.id === id);
      if (idx !== -1) {
        workers[idx] = { ...workers[idx], ...body };
        setItem('workers', workers);
        return { success: true };
      }
    }

    if (endpoint.startsWith('shifts')) {
      if (endpoint === 'shifts/clock-in') {
        const s = { id: Date.now(), ...body, clock_in: new Date().toISOString(), clock_out: null };
        shifts.push(s);
        setItem('shifts', shifts);
        return { success: true, shift_id: s.id };
      }
      if (endpoint === 'shifts/clock-out') {
        const s = shifts.find(x => x.user_id == body.user_id && !x.clock_out);
        if (s) {
          s.clock_out = new Date().toISOString();
          s.closing_cash = body.closing_cash;
          setItem('shifts', shifts);
        }
        return { success: true };
      }
      const date = new URLSearchParams(endpoint.split('?')[1] || '').get('date') || new Date().toISOString().split('T')[0];
      const filtered = shifts.filter(s => s.work_date === date).map(s => {
        const u = workers.find(w => w.id == s.user_id) || {};
        return { ...s, worker_name: u.full_name, worker_role: u.role, worker_phone: u.phone };
      });
      return { success: true, date, shifts: filtered };
    }

    if (endpoint === 'products') {
      if (method === 'POST') {
        const id = Date.now();
        const p = { id, ...body, stock_quantity: parseFloat(body.stock_quantity || 0) };
        products.push(p);
        setItem('products', products);
        return { success: true, id };
      }
      return { success: true, products };
    }

    if (endpoint.startsWith('products/')) {
      const id = parseInt(endpoint.split('/')[1]);
      if (method === 'DELETE') {
        products = products.filter(p => p.id !== id);
        setItem('products', products);
        return { success: true };
      }
      const idx = products.findIndex(p => p.id === id);
      if (idx !== -1) {
        products[idx] = { ...products[idx], ...body };
        setItem('products', products);
        return { success: true };
      }
    }

    if (endpoint === 'stock/adjust') {
      const prod = products.find(p => p.id == body.product_id);
      if (prod) {
        prod.stock_quantity = Math.max(0, parseFloat(prod.stock_quantity || 0) + parseFloat(body.quantity || 0));
        setItem('products', products);
        movements.unshift({
          id: Date.now(),
          product_name: prod.name,
          movement_type: body.movement_type,
          quantity: body.quantity,
          balance_after: prod.stock_quantity,
          created_at: new Date().toISOString(),
          notes: body.notes
        });
        setItem('movements', movements);
        return { success: true, new_balance: prod.stock_quantity };
      }
    }

    if (endpoint.startsWith('stock/movements')) {
      return { success: true, movements };
    }

    if (endpoint === 'customers') {
      if (method === 'POST') {
        const id = Date.now();
        const c = { id, ...body, current_credit: 0.0 };
        customers.push(c);
        setItem('customers', customers);
        return { success: true, id };
      }
      return { success: true, customers };
    }

    if (endpoint === 'debtors') {
      return { success: true, debtors: customers.filter(c => parseFloat(c.current_credit || 0) > 0.01) };
    }

    if (endpoint === 'debtors/pay') {
      const cust = customers.find(c => c.id == body.customer_id);
      if (cust) {
        cust.current_credit = Math.max(0, parseFloat(cust.current_credit || 0) - parseFloat(body.amount));
        setItem('customers', customers);
        settings.cash_balance = (parseFloat(settings.cash_balance || 0) + parseFloat(body.amount)).toString();
        setItem('settings', settings);
        return { success: true, payment_number: `JK-RCT-${Date.now().toString().slice(-6)}`, new_credit_balance: cust.current_credit };
      }
    }

    if (endpoint === 'suppliers') {
      if (method === 'POST') {
        const id = Date.now();
        suppliers.push({ id, ...body });
        setItem('suppliers', suppliers);
        return { success: true, id };
      }
      return { success: true, suppliers };
    }

    if (endpoint === 'purchase-orders') {
      if (method === 'POST') {
        const po = { id: Date.now(), po_number: `JK-PO-${Date.now().toString().slice(-6)}`, ...body, status: 'PENDING', created_at: new Date().toISOString() };
        purchaseOrders.unshift(po);
        setItem('purchase_orders', purchaseOrders);
        return { success: true, po_id: po.id, po_number: po.po_number };
      }
      return { success: true, purchase_orders: purchaseOrders };
    }

    if (endpoint.includes('/receive')) {
      const id = parseInt(endpoint.split('/')[1]);
      const po = purchaseOrders.find(p => p.id === id);
      if (po) {
        po.status = 'RECEIVED';
        po.items?.forEach(it => {
          const prod = products.find(p => p.id == it.product_id);
          if (prod) {
            prod.stock_quantity = parseFloat(prod.stock_quantity || 0) + parseFloat(it.quantity_ordered);
            prod.cost_price = parseFloat(it.cost_price);
          }
        });
        setItem('products', products);
        setItem('purchase_orders', purchaseOrders);
        return { success: true };
      }
    }

    if (endpoint.startsWith('orders')) {
      if (method === 'POST') {
        const id = Date.now();
        const prefix = body.order_type === 'POS' ? 'JK-POS' : (body.order_type === 'PROFORMA' ? 'JK-PRO' : 'JK-INV');
        const num = `${prefix}-${Date.now().toString().slice(-6)}`;
        const order = { id, order_number: num, ...body, created_at: new Date().toISOString() };

        if (body.order_type !== 'PROFORMA') {
          body.items?.forEach(it => {
            const p = products.find(prod => prod.id == it.product_id);
            if (p) p.stock_quantity = Math.max(0, parseFloat(p.stock_quantity || 0) - parseFloat(it.quantity));
          });
          setItem('products', products);

          if (order.balance_due > 0 && order.customer_id) {
            const cust = customers.find(c => c.id == order.customer_id);
            if (cust) cust.current_credit = parseFloat(cust.current_credit || 0) + order.balance_due;
            setItem('customers', customers);
          }

          if (order.amount_paid > 0) {
            settings.cash_balance = (parseFloat(settings.cash_balance || 0) + parseFloat(order.amount_paid)).toString();
            setItem('settings', settings);
          }
        }

        orders.unshift(order);
        setItem('orders', orders);
        return { success: true, order_id: id, order_number: num, total: order.total, balance_due: order.balance_due };
      }
      return { success: true, orders };
    }

    if (endpoint === 'delivery-notes') {
      if (method === 'POST') {
        const dn = { id: Date.now(), delivery_number: `JK-DN-${Date.now().toString().slice(-6)}`, ...body, created_at: new Date().toISOString() };
        deliveryNotes.unshift(dn);
        setItem('delivery_notes', deliveryNotes);
        return { success: true, id: dn.id, delivery_number: dn.delivery_number };
      }
      return { success: true, delivery_notes: deliveryNotes };
    }

    if (endpoint.startsWith('expenses')) {
      if (method === 'POST') {
        const exp = { id: Date.now(), expense_number: `JK-EXP-${Date.now().toString().slice(-6)}`, ...body, created_at: new Date().toISOString() };
        expenses.unshift(exp);
        setItem('expenses', expenses);
        settings.cash_balance = (parseFloat(settings.cash_balance || 0) - parseFloat(exp.amount)).toString();
        setItem('settings', settings);
        return { success: true, id: exp.id, expense_number: exp.expense_number };
      }
      return { success: true, expenses };
    }

    if (endpoint === 'capital') {
      const cash = parseFloat(settings.cash_balance || 0);
      const bank = parseFloat(settings.bank_balance || 0);
      const mobile = parseFloat(settings.mobile_money_balance || 0);
      const stockCost = products.reduce((acc, p) => acc + (parseFloat(p.cost_price || 0) * parseFloat(p.stock_quantity || 0)), 0);
      const stockRetail = products.reduce((acc, p) => acc + (parseFloat(p.selling_price || 0) * parseFloat(p.stock_quantity || 0)), 0);
      const debtors = customers.reduce((acc, c) => acc + parseFloat(c.current_credit || 0), 0);

      return {
        success: true,
        capital: {
          cash, bank, mobile_money: mobile,
          total_liquid: cash + bank + mobile,
          stock_cost_valuation: stockCost,
          stock_retail_valuation: stockRetail,
          debtors_total: debtors,
          total_estimated_net_capital: cash + bank + mobile + stockCost + debtors
        },
        ledger: capitalLedger
      };
    }

    if (endpoint === 'reports/dashboard') {
      const today = new Date().toISOString().split('T')[0];
      const todayOrders = orders.filter(o => o.created_at?.startsWith(today) && o.order_type !== 'PROFORMA');
      const todaySales = todayOrders.reduce((acc, o) => acc + parseFloat(o.total || 0), 0);
      const todayExp = expenses.filter(e => e.expense_date === today).reduce((acc, e) => acc + parseFloat(e.amount || 0), 0);
      const lowStock = products.filter(p => parseFloat(p.stock_quantity || 0) <= parseFloat(p.min_alert_quantity || 5)).length;
      const debtors = customers.reduce((acc, c) => acc + parseFloat(c.current_credit || 0), 0);
      const cash = parseFloat(settings.cash_balance || 0);
      const bank = parseFloat(settings.bank_balance || 0);
      const mobile = parseFloat(settings.mobile_money_balance || 0);

      return {
        success: true,
        dashboard: {
          today_sales: todaySales,
          today_orders_count: todayOrders.length,
          today_expenses: todayExp,
          net_today: todaySales - todayExp,
          active_workers_count: shifts.filter(s => s.work_date === today && !s.clock_out).length,
          low_stock_count: lowStock,
          debtors_total: debtors,
          capital_available: cash + bank + mobile,
          cash_in_hand: cash,
          bank_balance: bank,
          mobile_balance: mobile
        }
      };
    }

    if (endpoint.startsWith('reports/daily')) {
      const today = new Date().toISOString().split('T')[0];
      const dayOrders = orders.filter(o => o.created_at?.startsWith(today));
      const dayExpenses = expenses.filter(e => e.expense_date === today);
      return {
        success: true,
        date: today,
        total_sales: dayOrders.reduce((a, o) => a + parseFloat(o.total || 0), 0),
        total_expenses: dayExpenses.reduce((a, e) => a + parseFloat(e.amount || 0), 0),
        orders: dayOrders,
        expenses: dayExpenses,
        shifts: shifts.filter(s => s.work_date === today)
      };
    }

    if (endpoint === 'backup/export') {
      return {
        app: 'JENGAKWANZA',
        exported_at: new Date().toISOString(),
        version: '1.0.0',
        data: { settings, workers, products, customers, suppliers, orders, expenses, shifts, deliveryNotes, purchaseOrders, movements, capitalLedger }
      };
    }

    return { success: true };
  }
};
