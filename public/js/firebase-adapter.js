// JENGAKWANZA High-Performance Offline & Firebase Cloud Engine
// Ultra-fast Local Cache + Automatic Background Cloud Sync + Offline Queue

const FirebaseAdapter = {
  dbUrl: "https://jengakwanzaltd-1409a-default-rtdb.firebaseio.com",
  isInitialized: false,
  isOnline: navigator.onLine,
  syncInProgress: false,
  memoryCache: {},
  CACHE_PREFIX: 'jk_cache_',
  QUEUE_KEY: 'jk_offline_queue',

  hasConfig() {
    return Boolean(this.dbUrl && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId);
  },

  init() {
    if (this.isInitialized) return true;
    this.isInitialized = true;
    this.loadAllCaches();
    this.setupNetworkListeners();
    console.log('✓ JENGAKWANZA Offline Engine & Cloud Sync initialized');

    // Attempt initial queue sync if online
    if (this.isOnline) {
      setTimeout(() => this.processOfflineQueue(), 1000);
    }
    return true;
  },

  setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('🌐 Network connected: Online mode active');
      this.updateStatusUI();
      this.processOfflineQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📡 Network disconnected: Offline local mode active');
      this.updateStatusUI();
    });

    // Periodic queue check every 15 seconds
    setInterval(() => {
      if (navigator.onLine && !this.syncInProgress) {
        this.processOfflineQueue();
      }
    }, 15000);
  },

  updateStatusUI() {
    if (typeof App !== 'undefined' && App.updateConnectionStatusUI) {
      App.updateConnectionStatusUI();
    }
  },

  // -------------------------------------------------------------
  // CACHE & STORAGE SUBSYSTEM
  // -------------------------------------------------------------
  loadAllCaches() {
    const collections = ['settings', 'users', 'products', 'customers', 'orders', 'expenses', 'work_shifts', 'delivery_notes', 'purchase_orders', 'debtor_payments', 'capital_ledger', 'stock_movements', 'branches'];
    collections.forEach(col => {
      try {
        const stored = localStorage.getItem(this.CACHE_PREFIX + col);
        if (stored) {
          this.memoryCache[col] = JSON.parse(stored);
        }
      } catch (e) {
        console.warn(`Failed loading cache for ${col}:`, e);
      }
    });

    // Provide baseline company settings if none cached
    if (!this.memoryCache.settings) {
      this.memoryCache.settings = {
        company_name: 'JENGAKWANZA LIMITED',
        tagline: 'Building Excellence & Quality Supplies',
        phone_numbers: '0788989889 / 0713550104',
        address: 'P.O.BOX 14991 ARUSHA',
        email: 'jengakwanzaltd@gmail.com',
        currency: 'TZS',
        currency_symbol: 'TSh',
        logo_url: 'assets/logo.jpg',
        tax_rate: '0',
        receipt_footer: 'Thank you for choosing JENGAKWANZA LIMITED! Goods once sold are not returnable without valid receipt.',
        cash_balance: 0.0,
        bank_balance: 0.0,
        mobile_money_balance: 0.0
      };
      this.setCache('settings', this.memoryCache.settings);
    }

    // Default primary branch if none cached
    if (!this.memoryCache.branches || Object.keys(this.memoryCache.branches).length === 0) {
      const defaultBranch = {
        id: 'branch-main',
        name: 'Main Shop - Arusha',
        location: 'P.O.BOX 14991 Arusha',
        phone: '0788989889 / 0713550104',
        is_default: true,
        created_at: new Date().toISOString()
      };
      this.memoryCache.branches = { 'branch-main': defaultBranch };
      this.setCache('branches', this.memoryCache.branches);
    }
  },

  getCache(collection) {
    if (this.memoryCache[collection] !== undefined) {
      return this.memoryCache[collection];
    }
    try {
      const stored = localStorage.getItem(this.CACHE_PREFIX + collection);
      if (stored) {
        this.memoryCache[collection] = JSON.parse(stored);
        return this.memoryCache[collection];
      }
    } catch (e) {}
    return null;
  },

  setCache(collection, data) {
    this.memoryCache[collection] = data;
    try {
      localStorage.setItem(this.CACHE_PREFIX + collection, JSON.stringify(data));
    } catch (e) {
      console.warn(`LocalStorage quota exceeded for ${collection}:`, e);
    }
  },

  getOfflineQueue() {
    try {
      const q = localStorage.getItem(this.QUEUE_KEY);
      return q ? JSON.parse(q) : [];
    } catch (e) {
      return [];
    }
  },

  saveOfflineQueue(queue) {
    try {
      localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {}
    this.updateStatusUI();
  },

  queueMutation(path, method, data, description = '') {
    const queue = this.getOfflineQueue();
    queue.push({
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      path,
      method,
      data,
      description,
      createdAt: new Date().toISOString()
    });
    this.saveOfflineQueue(queue);
    console.log(`📦 Queued offline action [${description}]: ${queue.length} pending items`);
  },

  async processOfflineQueue() {
    if (this.syncInProgress || !navigator.onLine) return;
    const queue = this.getOfflineQueue();
    if (queue.length === 0) {
      this.isOnline = true;
      this.updateStatusUI();
      return;
    }

    this.syncInProgress = true;
    this.updateStatusUI();
    console.log(`🔄 Flushing offline queue (${queue.length} pending operations)...`);

    const remaining = [];
    for (const item of queue) {
      try {
        await this.rawFetch(item.path, item.method, item.data, 6000);
      } catch (err) {
        console.warn(`Failed syncing queue item [${item.description}], will retry:`, err.message);
        remaining.push(item);
        // If network error, stop flushing this cycle
        if (!navigator.onLine || err.name === 'AbortError' || err.message.includes('fetch')) {
          this.isOnline = false;
          break;
        }
      }
    }

    this.saveOfflineQueue(remaining);
    this.syncInProgress = false;
    this.isOnline = navigator.onLine;
    this.updateStatusUI();

    if (remaining.length === 0) {
      console.log('✓ All offline data synchronized with Firebase Cloud successfully!');
      if (typeof State !== 'undefined' && State.showToast) {
        State.showToast('Offline changes synchronized with Cloud!', 'success');
      }
    }
  },

  // Direct fetch with timeout
  async rawFetch(path, method = 'GET', data = null, timeoutMs = 4500) {
    const url = `${this.dbUrl}/${path}.json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    };
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      opts.body = JSON.stringify(data);
    }

    try {
      const res = await fetch(url, opts);
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`Firebase RTDB HTTP ${res.status}`);
      }
      this.isOnline = true;
      return await res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      this.isOnline = false;
      throw err;
    }
  },

  // Universal RTDB helper that falls back gracefully
  async rtdb(path, method = 'GET', data = null) {
    try {
      if (!navigator.onLine) {
        throw new Error('Offline (Network disconnected)');
      }
      return await this.rawFetch(path, method, data, 4500);
    } catch (err) {
      this.isOnline = false;
      this.updateStatusUI();
      // For mutation operations while offline, queue for sync
      if (method !== 'GET') {
        this.queueMutation(path, method, data, `${method} ${path}`);
        return { success: true, offline: true };
      }
      throw err;
    }
  },

  // -------------------------------------------------------------
  // 1. SETTINGS
  // -------------------------------------------------------------
  async getSettings() {
    const cached = this.getCache('settings');
    // Background refresh
    if (navigator.onLine) {
      this.rawFetch('settings', 'GET', null, 3000).then(s => {
        if (s) this.setCache('settings', s);
      }).catch(() => {});
    }
    return { success: true, settings: cached || {} };
  },

  async saveSettings(data) {
    const current = this.getCache('settings') || {};
    const updated = { ...current, ...data };
    this.setCache('settings', updated);

    // Sync
    await this.rtdb('settings', 'PATCH', data);
    return { success: true, message: 'Settings saved' };
  },

  // -------------------------------------------------------------
  // 1B. BRANCHES & MULTI-SHOPPING SUBSYSTEM
  // -------------------------------------------------------------
  async getBranches() {
    const cached = this.getCache('branches');
    let branches = [];
    if (cached) {
      branches = Array.isArray(cached) ? cached : Object.keys(cached).map(k => ({ id: k, ...cached[k] }));
    }

    if (navigator.onLine) {
      this.rawFetch('branches', 'GET', null, 2500).then(raw => {
        if (raw) this.setCache('branches', raw);
      }).catch(() => {});
    }

    if (branches.length === 0) {
      branches = [{
        id: 'branch-main',
        name: 'Main Shop - Arusha',
        location: 'P.O.BOX 14991 Arusha',
        phone: '0788989889 / 0713550104',
        is_default: true,
        created_at: new Date().toISOString()
      }];
      this.setCache('branches', { 'branch-main': branches[0] });
    }
    return { success: true, branches };
  },

  async addBranch(data) {
    const id = 'branch-' + Date.now().toString();
    const branch = {
      id,
      name: data.name || 'New Shop Branch',
      location: data.location || '',
      phone: data.phone || '',
      manager: data.manager || '',
      is_default: false,
      created_at: new Date().toISOString()
    };

    const current = this.getCache('branches') || {};
    current[id] = branch;
    this.setCache('branches', current);

    await this.rtdb(`branches/${id}`, 'PUT', branch);
    return { success: true, branch };
  },

  async updateBranch(id, data) {
    const current = this.getCache('branches') || {};
    if (current[id]) {
      current[id] = { ...current[id], ...data };
      this.setCache('branches', current);
    }
    await this.rtdb(`branches/${id}`, 'PATCH', data);
    return { success: true };
  },

  async deleteBranch(id) {
    if (id === 'branch-main') {
      throw new Error('The default Main Branch cannot be deleted.');
    }
    const current = this.getCache('branches') || {};
    delete current[id];
    this.setCache('branches', current);
    await this.rtdb(`branches/${id}`, 'DELETE');
    return { success: true };
  },

  // -------------------------------------------------------------
  // 2. WORKERS & USER PROFILES
  // -------------------------------------------------------------
  async getWorkers() {
    const cached = this.getCache('users');
    let workers = [];
    if (cached) {
      workers = Array.isArray(cached) ? cached : Object.keys(cached).map(k => ({ id: k, ...cached[k] }));
    }

    if (workers.length > 0) {
      if (navigator.onLine) {
        this.rawFetch('users', 'GET', null, 2500).then(raw => {
          if (raw) this.setCache('users', raw);
        }).catch(() => {});
      }
    } else if (navigator.onLine) {
      try {
        const raw = await this.rawFetch('users', 'GET', null, 2500);
        if (raw) {
          this.setCache('users', raw);
          workers = Array.isArray(raw) ? raw : Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
        }
      } catch (e) {}
    }

    // Default admin if nothing stored
    if (workers.length === 0) {
      workers = [{
        id: 'admin',
        username: 'admin',
        full_name: 'System Administrator',
        role: 'Admin',
        phone: '0788989889',
        pin_hash: 'admin123',
        active: 1
      }];
    }
    return { success: true, workers };
  },

  async addWorker(data) {
    const id = Date.now().toString();
    const worker = {
      id,
      ...data,
      pin_hash: data.password || '123456',
      active: 1,
      created_at: new Date().toISOString()
    };

    const current = this.getCache('users') || {};
    current[id] = worker;
    this.setCache('users', current);

    await this.rtdb(`users/${id}`, 'PUT', worker);
    return { success: true, id };
  },

  async updateWorker(id, data) {
    const current = this.getCache('users') || {};
    if (current[id]) {
      current[id] = { ...current[id], ...data };
      this.setCache('users', current);
    }
    await this.rtdb(`users/${id}`, 'PATCH', data);
    return { success: true };
  },

  async updateProfile(userId, data) {
    const current = this.getCache('users') || {};
    const u = current[userId];
    if (!u) throw new Error('Worker profile not found');

    const updateFields = {
      full_name: data.full_name !== undefined ? data.full_name : u.full_name,
      phone: data.phone !== undefined ? data.phone : u.phone,
      address: data.address !== undefined ? data.address : (u.address || ''),
      national_id: data.national_id !== undefined ? data.national_id : (u.national_id || ''),
      photo_url: data.photo_url !== undefined ? data.photo_url : (u.photo_url || ''),
      updated_at: new Date().toISOString()
    };
    if (data.branch_id !== undefined) updateFields.branch_id = data.branch_id;
    if (data.password && data.password.trim()) {
      updateFields.pin_hash = data.password.trim();
      updateFields.password = data.password.trim();
    }

    current[userId] = { ...u, ...updateFields };
    this.setCache('users', current);
    await this.rtdb(`users/${userId}`, 'PATCH', updateFields);
    return { success: true, user: current[userId] };
  },

  async deleteWorker(id) {
    const current = this.getCache('users') || {};
    delete current[id];
    this.setCache('users', current);
    await this.rtdb(`users/${id}`, 'DELETE');
    return { success: true };
  },

  // -------------------------------------------------------------
  // 3. SHIFTS
  // -------------------------------------------------------------
  async getShifts(date) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const cached = this.getCache('work_shifts') || {};
    let shifts = Object.keys(cached).map(k => ({ id: k, ...cached[k] }));

    if (navigator.onLine) {
      this.rawFetch('work_shifts', 'GET', null, 3000).then(raw => {
        if (raw) this.setCache('work_shifts', raw);
      }).catch(() => {});
    }

    const filtered = shifts.filter(s => s.work_date === targetDate);
    const workers = (await this.getWorkers()).workers || [];
    const wMap = {};
    workers.forEach(w => { wMap[w.id] = w; wMap[w.username] = w; });

    filtered.forEach(s => {
      const w = wMap[s.user_id] || {};
      s.worker_name = s.worker_name || w.full_name || 'Staff';
      s.worker_role = s.worker_role || w.role || 'Staff';
      s.worker_phone = s.worker_phone || w.phone || '';
    });
    return { success: true, shifts: filtered };
  },

  async clockIn(data) {
    const id = Date.now().toString();
    const shift = {
      id,
      user_id: data.user_id,
      work_date: new Date().toISOString().split('T')[0],
      clock_in: new Date().toISOString(),
      opening_cash: parseFloat(data.opening_cash || 0),
      notes: data.notes || '',
      created_at: new Date().toISOString()
    };

    const current = this.getCache('work_shifts') || {};
    current[id] = shift;
    this.setCache('work_shifts', current);

    await this.rtdb(`work_shifts/${id}`, 'PUT', shift);
    return { success: true, shift_id: id };
  },

  async clockOut(data) {
    const today = new Date().toISOString().split('T')[0];
    const current = this.getCache('work_shifts') || {};
    let targetKey = null;

    Object.keys(current).forEach(k => {
      const s = current[k];
      if (s.user_id == data.user_id && s.work_date === today && !s.clock_out) {
        targetKey = k;
      }
    });

    if (targetKey) {
      const updateData = {
        clock_out: new Date().toISOString(),
        closing_cash: parseFloat(data.closing_cash || 0),
        closing_notes: data.notes || ''
      };
      current[targetKey] = { ...current[targetKey], ...updateData };
      this.setCache('work_shifts', current);
      await this.rtdb(`work_shifts/${targetKey}`, 'PATCH', updateData);
    }
    return { success: true };
  },

  // -------------------------------------------------------------
  // 4. PRODUCTS & INVENTORY
  // -------------------------------------------------------------
  async getProducts(branchId) {
    let cached = this.getCache('products');
    let products = [];
    if (cached) {
      products = Array.isArray(cached) ? cached.filter(Boolean) : Object.keys(cached).map(k => ({ id: k, ...cached[k] }));
    }

    if (products.length > 0) {
      if (navigator.onLine) {
        this.rawFetch('products', 'GET', null, 2500).then(raw => {
          if (raw) this.setCache('products', raw);
        }).catch(() => {});
      }
    } else if (navigator.onLine) {
      try {
        const raw = await this.rawFetch('products', 'GET', null, 2500);
        if (raw) {
          this.setCache('products', raw);
          products = Array.isArray(raw) ? raw.filter(Boolean) : Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
        }
      } catch (e) {}
    }

    // Ensure all products have id and valid numbers
    products = products.map((p, idx) => ({
      ...p,
      id: String(p.id !== undefined && p.id !== null ? p.id : `prod_${idx}`),
      branch_id: p.branch_id || 'branch-main',
      stock_quantity: parseFloat(p.stock_quantity || 0),
      selling_price: parseFloat(p.selling_price || 0),
      cost_price: parseFloat(p.cost_price || 0)
    }));

    const bId = branchId !== undefined ? branchId : (window.State && window.State.currentBranch);
    if (bId && bId !== 'all') {
      products = products.filter(p => p.branch_id === bId || (!p.branch_id && bId === 'branch-main'));
    }

    return { success: true, products };
  },

  async addProduct(data) {
    const id = Date.now().toString();
    const activeBranch = data.branch_id || (window.State && window.State.currentBranch && window.State.currentBranch !== 'all' ? window.State.currentBranch : 'branch-main');
    const prod = {
      id,
      ...data,
      branch_id: activeBranch,
      stock_quantity: parseFloat(data.stock_quantity || 0),
      cost_price: parseFloat(data.cost_price || 0),
      selling_price: parseFloat(data.selling_price || 0),
      min_alert_quantity: parseFloat(data.min_alert_quantity || 5),
      image_url: data.image_url || '',
      created_at: new Date().toISOString()
    };

    // Update local cache immediately
    const current = this.getCache('products') || {};
    current[id] = prod;
    this.setCache('products', current);

    // Push to RTDB / queue
    await this.rtdb(`products/${id}`, 'PUT', prod);

    if (prod.stock_quantity > 0) {
      const mId = (Date.now() + 1).toString();
      const movement = {
        id: mId,
        product_id: id,
        product_name: data.name,
        branch_id: activeBranch,
        movement_type: 'INITIAL_STOCK',
        quantity: prod.stock_quantity,
        balance_after: prod.stock_quantity,
        unit_cost: prod.cost_price,
        notes: 'Initial stock setup',
        created_at: new Date().toISOString()
      };
      const movs = this.getCache('stock_movements') || {};
      movs[mId] = movement;
      this.setCache('stock_movements', movs);
      await this.rtdb(`stock_movements/${mId}`, 'PUT', movement);
    }

    return { success: true, id, sku: prod.sku };
  },

  async bulkAddProducts(productsList) {
    if (!productsList || productsList.length === 0) return { success: true, count: 0 };
    const patchObj = {};
    const movementPatch = {};
    const nowTs = Date.now();
    const nowIso = new Date().toISOString();

    const currentProds = this.getCache('products') || {};
    const currentMovs = this.getCache('stock_movements') || {};

    productsList.forEach((data, idx) => {
      const id = (nowTs + idx).toString();
      const sku = data.sku || `JKP-${Math.floor(10000 + Math.random() * 90000)}`;
      const prod = {
        id,
        name: data.name || 'Unnamed Product',
        category: data.category || 'General',
        sku,
        barcode: data.barcode || '',
        unit: data.unit || 'pcs',
        cost_price: parseFloat(data.cost_price || 0),
        selling_price: parseFloat(data.selling_price || 0),
        stock_quantity: parseFloat(data.stock_quantity || 0),
        min_alert_quantity: parseFloat(data.min_alert_quantity || 5),
        image_url: data.image_url || '',
        description: data.description || '',
        created_at: nowIso
      };
      patchObj[id] = prod;
      currentProds[id] = prod;

      if (prod.stock_quantity > 0) {
        const mId = (nowTs + idx + 500000).toString();
        const m = {
          id: mId,
          product_id: id,
          product_name: prod.name,
          movement_type: 'INITIAL_STOCK',
          quantity: prod.stock_quantity,
          balance_after: prod.stock_quantity,
          unit_cost: prod.cost_price,
          notes: 'Bulk stock import from file',
          created_at: nowIso
        };
        movementPatch[mId] = m;
        currentMovs[mId] = m;
      }
    });

    // Save locally immediately
    this.setCache('products', currentProds);
    this.setCache('stock_movements', currentMovs);

    // Sync
    await this.rtdb('products', 'PATCH', patchObj);
    if (Object.keys(movementPatch).length > 0) {
      await this.rtdb('stock_movements', 'PATCH', movementPatch);
    }

    return { success: true, count: productsList.length };
  },

  async updateProduct(id, data) {
    const current = this.getCache('products') || {};
    if (current[id]) {
      current[id] = {
        ...current[id],
        ...data,
        cost_price: parseFloat(data.cost_price !== undefined ? data.cost_price : current[id].cost_price),
        selling_price: parseFloat(data.selling_price !== undefined ? data.selling_price : current[id].selling_price),
        min_alert_quantity: parseFloat(data.min_alert_quantity !== undefined ? data.min_alert_quantity : current[id].min_alert_quantity),
        image_url: data.image_url !== undefined ? data.image_url : (current[id].image_url || ''),
        updated_at: new Date().toISOString()
      };
      this.setCache('products', current);
    }
    await this.rtdb(`products/${id}`, 'PATCH', {
      ...data,
      updated_at: new Date().toISOString()
    });
    return { success: true };
  },

  async deleteProduct(id) {
    const current = this.getCache('products') || {};
    delete current[id];
    this.setCache('products', current);
    await this.rtdb(`products/${id}`, 'DELETE');
    return { success: true };
  },

  async adjustStock(data) {
    const { product_id, quantity, movement_type, notes, unit_cost, user_id } = data;
    const current = this.getCache('products') || {};
    const prod = current[product_id];
    if (!prod) throw new Error('Product not found in local catalog');

    const prevQty = prod.stock_quantity || 0;
    const newQty = Math.max(0, prevQty + quantity);
    prod.stock_quantity = newQty;
    if (unit_cost > 0) prod.cost_price = unit_cost;
    current[product_id] = prod;
    this.setCache('products', current);

    // Record movement
    const mId = Date.now().toString();
    const mov = {
      id: mId,
      product_id,
      product_name: prod.name,
      movement_type,
      quantity,
      previous_quantity: prevQty,
      balance_after: newQty,
      unit_cost: unit_cost || prod.cost_price,
      notes: notes || '',
      user_id: user_id || '',
      created_at: new Date().toISOString()
    };
    const movs = this.getCache('stock_movements') || {};
    movs[mId] = mov;
    this.setCache('stock_movements', movs);

    await this.rtdb(`products/${product_id}`, 'PATCH', { stock_quantity: newQty });
    await this.rtdb(`stock_movements/${mId}`, 'PUT', mov);
    return { success: true, new_quantity: newQty };
  },

  async getStockMovements(limitNum = 100) {
    const cached = this.getCache('stock_movements') || {};
    let movs = Object.keys(cached).map(k => ({ id: k, ...cached[k] }));
    movs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, movements: movs.slice(0, limitNum) };
  },

  async deleteStockMovement(id) {
    const currentMovs = this.getCache('stock_movements') || {};
    const mov = currentMovs[id];
    if (!mov) throw new Error('Stock movement record not found');

    const currentProds = this.getCache('products') || {};
    const prod = currentProds[mov.product_id];
    let newQty = 0;
    if (prod) {
      const prevQty = parseFloat(prod.stock_quantity || 0);
      const movedQty = parseFloat(mov.quantity || 0);
      // Reverse: if movement added stock, subtract it. If movement deducted, add it back.
      newQty = Math.max(0, prevQty - movedQty);
      prod.stock_quantity = newQty;
      currentProds[mov.product_id] = prod;
      this.setCache('products', currentProds);
      await this.rtdb(`products/${mov.product_id}`, 'PATCH', { stock_quantity: newQty });
    }

    delete currentMovs[id];
    this.setCache('stock_movements', currentMovs);
    await this.rtdb(`stock_movements/${id}`, 'DELETE');

    return { success: true, new_quantity: newQty };
  },

  async clearProductStock(productId, userId) {
    const currentProds = this.getCache('products') || {};
    const prod = currentProds[productId];
    if (!prod) throw new Error('Product not found in inventory');

    const prevQty = parseFloat(prod.stock_quantity || 0);
    prod.stock_quantity = 0;
    currentProds[productId] = prod;
    this.setCache('products', currentProds);

    const mId = Date.now().toString();
    const mov = {
      id: mId,
      product_id: productId,
      product_name: prod.name,
      movement_type: 'CLEAR_RECORDED_STOCK',
      quantity: -prevQty,
      previous_quantity: prevQty,
      balance_after: 0,
      unit_cost: prod.cost_price || 0,
      notes: 'Recorded stock cleared to 0',
      user_id: userId || '',
      created_at: new Date().toISOString()
    };
    const movs = this.getCache('stock_movements') || {};
    movs[mId] = mov;
    this.setCache('stock_movements', movs);

    await this.rtdb(`products/${productId}`, 'PATCH', { stock_quantity: 0 });
    await this.rtdb(`stock_movements/${mId}`, 'PUT', mov);
    return { success: true };
  },

  // -------------------------------------------------------------
  // 5. CUSTOMERS & DEBTORS
  // -------------------------------------------------------------
  async getCustomers() {
    const cached = this.getCache('customers');
    let customers = [];
    if (cached) {
      customers = Array.isArray(cached) ? cached : Object.keys(cached).map(k => ({ id: k, ...cached[k] }));
    }

    if (customers.length > 0) {
      if (navigator.onLine) {
        this.rawFetch('customers', 'GET', null, 2500).then(raw => {
          if (raw) this.setCache('customers', raw);
        }).catch(() => {});
      }
    } else if (navigator.onLine) {
      try {
        const raw = await this.rawFetch('customers', 'GET', null, 2500);
        if (raw) {
          this.setCache('customers', raw);
          customers = Array.isArray(raw) ? raw : Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
        }
      } catch (e) {}
    }

    return { success: true, customers };
  },

  async addCustomer(data) {
    const id = Date.now().toString();
    const cust = {
      id,
      ...data,
      credit_limit: parseFloat(data.credit_limit || 0),
      current_credit: 0.0,
      created_at: new Date().toISOString()
    };
    const current = this.getCache('customers') || {};
    current[id] = cust;
    this.setCache('customers', current);

    await this.rtdb(`customers/${id}`, 'PUT', cust);
    return { success: true, id };
  },

  async updateCustomer(id, data) {
    const current = this.getCache('customers') || {};
    if (current[id]) {
      current[id] = { ...current[id], ...data };
      this.setCache('customers', current);
    }
    await this.rtdb(`customers/${id}`, 'PATCH', data);
    return { success: true };
  },

  async deleteCustomer(id) {
    const current = this.getCache('customers') || {};
    delete current[id];
    this.setCache('customers', current);
    await this.rtdb(`customers/${id}`, 'DELETE');
    return { success: true };
  },

  async getDebtors() {
    const res = await this.getCustomers();
    const debtors = (res.customers || []).filter(c => parseFloat(c.current_credit || 0) > 0);
    return { success: true, debtors };
  },

  async payDebtor(data) {
    const { customer_id, amount, payment_method, notes, user_id } = data;
    const custs = this.getCache('customers') || {};
    const cust = custs[customer_id];
    if (!cust) throw new Error('Customer not found');

    const payAmount = parseFloat(amount || 0);
    const prevCredit = parseFloat(cust.current_credit || 0);
    const newCredit = Math.max(0, prevCredit - payAmount);
    cust.current_credit = newCredit;
    custs[customer_id] = cust;
    this.setCache('customers', custs);

    // Increase cash balance
    const settings = this.getCache('settings') || {};
    settings.cash_balance = (parseFloat(settings.cash_balance) || 0) + payAmount;
    this.setCache('settings', settings);

    // Save payment receipt
    const pId = Date.now().toString();
    const payment = {
      id: pId,
      customer_id,
      customer_name: cust.name,
      amount: payAmount,
      previous_credit: prevCredit,
      new_credit_balance: newCredit,
      payment_method: payment_method || 'CASH',
      payment_number: `RCP-${Date.now().toString().substr(-6)}`,
      notes: notes || '',
      user_id: user_id || '',
      created_at: new Date().toISOString()
    };
    const payments = this.getCache('debtor_payments') || {};
    payments[pId] = payment;
    this.setCache('debtor_payments', payments);

    await this.rtdb(`customers/${customer_id}`, 'PATCH', { current_credit: newCredit });
    await this.rtdb(`settings`, 'PATCH', { cash_balance: settings.cash_balance });
    await this.rtdb(`debtor_payments/${pId}`, 'PUT', payment);

    return { success: true, payment_number: payment.payment_number, payment };
  },

  // -------------------------------------------------------------
  // 6. ORDERS & POINT OF SALE (POS)
  // -------------------------------------------------------------
  async getOrders(type, branchId) {
    const cached = this.getCache('orders') || {};
    let orders = Object.keys(cached).map(k => ({ id: k, ...cached[k] }));

    if (navigator.onLine) {
      this.rawFetch('orders', 'GET', null, 3000).then(raw => {
        if (raw) this.setCache('orders', raw);
      }).catch(() => {});
    }

    if (type) {
      orders = orders.filter(o => o.order_type === type);
    }
    const bId = branchId !== undefined ? branchId : (window.State && window.State.currentBranch);
    if (bId && bId !== 'all') {
      orders = orders.filter(o => o.branch_id === bId || (!o.branch_id && bId === 'branch-main'));
    }
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, orders };
  },

  async getOrder(id) {
    const cached = this.getCache('orders') || {};
    const order = cached[id] || Object.values(cached).find(o => String(o.id) === String(id) || o.order_number === id);
    if (order) return { success: true, order };
    return { success: false, error: 'Order not found' };
  },

  async createOrder(data) {
    const id = Date.now().toString();
    const prefix = data.order_type === 'PROFORMA' ? 'PRF' : (data.order_type === 'INVOICE' ? 'INV' : 'ORD');
    const orderNumber = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(-4)}`;
    const activeBranch = data.branch_id || (window.State && window.State.currentBranch && window.State.currentBranch !== 'all' ? window.State.currentBranch : 'branch-main');

    const order = {
      id,
      order_number: orderNumber,
      order_type: data.order_type || 'POS',
      branch_id: activeBranch,
      customer_id: data.customer_id || null,
      customer_name: data.customer_name || 'Walk-in Customer',
      customer_phone: data.customer_phone || '',
      cashier_id: data.cashier_id || null,
      cashier_name: data.cashier_name || 'Staff',
      subtotal: parseFloat(data.subtotal || 0),
      discount: parseFloat(data.discount || 0),
      tax: parseFloat(data.tax || 0),
      total: parseFloat(data.total || 0),
      amount_paid: parseFloat(data.amount_paid || data.total || 0),
      balance_due: parseFloat(data.balance_due || 0),
      payment_method: data.payment_method || 'CASH',
      payment_status: data.payment_status || (data.balance_due > 0 ? 'PARTIAL' : 'PAID'),
      items: data.items || [],
      created_at: new Date().toISOString()
    };

    // 1. Save order into local cache
    const currentOrders = this.getCache('orders') || {};
    currentOrders[id] = order;
    this.setCache('orders', currentOrders);

    // 2. Decrement stock quantities locally (POS & Invoices)
    if (order.order_type !== 'PROFORMA' && order.items.length > 0) {
      const currentProds = this.getCache('products') || {};
      const currentMovs = this.getCache('stock_movements') || {};
      const patchProds = {};

      order.items.forEach(it => {
        if (it.product_id && currentProds[it.product_id]) {
          const p = currentProds[it.product_id];
          const newStock = Math.max(0, (p.stock_quantity || 0) - it.quantity);
          p.stock_quantity = newStock;
          currentProds[it.product_id] = p;
          patchProds[it.product_id] = { stock_quantity: newStock };

          // Log movement
          const mId = `${id}_${it.product_id}`;
          currentMovs[mId] = {
            id: mId,
            product_id: it.product_id,
            product_name: it.product_name,
            movement_type: 'SALE',
            quantity: -it.quantity,
            balance_after: newStock,
            unit_cost: p.cost_price,
            reference_id: order.order_number,
            notes: `Sale Order ${order.order_number}`,
            created_at: new Date().toISOString()
          };
        }
      });
      this.setCache('products', currentProds);
      this.setCache('stock_movements', currentMovs);

      // Push product updates in background
      Object.keys(patchProds).forEach(pid => {
        this.rtdb(`products/${pid}`, 'PATCH', patchProds[pid]).catch(() => {});
      });
    }

    // 3. Update customer debt if credit order
    if (order.balance_due > 0 && order.customer_id) {
      const currentCusts = this.getCache('customers') || {};
      if (currentCusts[order.customer_id]) {
        const c = currentCusts[order.customer_id];
        c.current_credit = (parseFloat(c.current_credit) || 0) + order.balance_due;
        currentCusts[order.customer_id] = c;
        this.setCache('customers', currentCusts);
        this.rtdb(`customers/${order.customer_id}`, 'PATCH', { current_credit: c.current_credit }).catch(() => {});
      }
    }

    // 4. Update cash balance in settings
    if (order.amount_paid > 0 && order.order_type !== 'PROFORMA') {
      const settings = this.getCache('settings') || {};
      settings.cash_balance = (parseFloat(settings.cash_balance) || 0) + order.amount_paid;
      this.setCache('settings', settings);
      this.rtdb('settings', 'PATCH', { cash_balance: settings.cash_balance }).catch(() => {});
    }

    // Push order to RTDB / queue
    await this.rtdb(`orders/${id}`, 'PUT', order);

    return {
      success: true,
      order_id: id,
      order_number: order.order_number,
      order,
      offline: !this.isOnline
    };
  },

  async convertProforma(id, targetType, userId) {
    const orders = this.getCache('orders') || {};
    const proforma = orders[id];
    if (!proforma) throw new Error('Proforma invoice not found');

    const res = await this.createOrder({
      ...proforma,
      order_type: targetType || 'INVOICE',
      cashier_id: userId
    });
    return res;
  },

  async deleteOrder(id) {
    const current = this.getCache('orders') || {};
    delete current[id];
    this.setCache('orders', current);
    await this.rtdb(`orders/${id}`, 'DELETE');
    return { success: true };
  },

  // -------------------------------------------------------------
  // 7. DELIVERY NOTES
  // -------------------------------------------------------------
  async getDeliveryNotes() {
    const cached = this.getCache('delivery_notes') || {};
    let dns = Object.keys(cached).map(k => ({ id: k, ...cached[k] }));
    dns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, delivery_notes: dns };
  },

  async createDeliveryNote(data) {
    const id = Date.now().toString();
    const dnNumber = `DN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(-4)}`;
    const dn = {
      id,
      delivery_number: dnNumber,
      ...data,
      created_at: new Date().toISOString()
    };
    const current = this.getCache('delivery_notes') || {};
    current[id] = dn;
    this.setCache('delivery_notes', current);

    await this.rtdb(`delivery_notes/${id}`, 'PUT', dn);
    return { success: true, delivery_number: dnNumber, delivery_note: dn };
  },

  async deleteDeliveryNote(id) {
    const current = this.getCache('delivery_notes') || {};
    delete current[id];
    this.setCache('delivery_notes', current);
    await this.rtdb(`delivery_notes/${id}`, 'DELETE');
    return { success: true };
  },

  // -------------------------------------------------------------
  // 8. EXPENSES
  // -------------------------------------------------------------
  async getExpenses(date, branchId) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const cached = this.getCache('expenses') || {};
    let expenses = Object.keys(cached).map(k => ({ id: k, ...cached[k] }));

    if (navigator.onLine) {
      this.rawFetch('expenses', 'GET', null, 3000).then(raw => {
        if (raw) this.setCache('expenses', raw);
      }).catch(() => {});
    }

    let filtered = expenses.filter(e => (e.expense_date || '').startsWith(targetDate) || (e.created_at || '').startsWith(targetDate));
    const bId = branchId !== undefined ? branchId : (window.State && window.State.currentBranch);
    if (bId && bId !== 'all') {
      filtered = filtered.filter(e => e.branch_id === bId || (!e.branch_id && bId === 'branch-main'));
    }
    return { success: true, expenses: filtered };
  },

  async createExpense(data) {
    const id = Date.now().toString();
    const activeBranch = data.branch_id || (window.State && window.State.currentBranch && window.State.currentBranch !== 'all' ? window.State.currentBranch : 'branch-main');
    const exp = {
      id,
      voucher_number: `EXP-${id.slice(-6)}`,
      branch_id: activeBranch,
      ...data,
      amount: parseFloat(data.amount || 0),
      expense_date: data.expense_date || new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    };

    const current = this.getCache('expenses') || {};
    current[id] = exp;
    this.setCache('expenses', current);

    // Deduct cash from settings
    const settings = this.getCache('settings') || {};
    settings.cash_balance = Math.max(0, (parseFloat(settings.cash_balance) || 0) - exp.amount);
    this.setCache('settings', settings);

    await this.rtdb(`expenses/${id}`, 'PUT', exp);
    await this.rtdb('settings', 'PATCH', { cash_balance: settings.cash_balance });

    return { success: true, id, expense: exp };
  },

  async deleteExpense(id) {
    const current = this.getCache('expenses') || {};
    delete current[id];
    this.setCache('expenses', current);
    await this.rtdb(`expenses/${id}`, 'DELETE');
    return { success: true };
  },

  // -------------------------------------------------------------
  // 9. SUPPLIERS & PURCHASE ORDERS
  // -------------------------------------------------------------
  async getSuppliers() {
    const cached = this.getCache('suppliers') || {};
    let suppliers = Object.keys(cached).map(k => ({ id: k, ...cached[k] }));
    return { success: true, suppliers };
  },

  async addSupplier(data) {
    const id = Date.now().toString();
    const supp = { id, ...data, created_at: new Date().toISOString() };
    const current = this.getCache('suppliers') || {};
    current[id] = supp;
    this.setCache('suppliers', current);
    await this.rtdb(`suppliers/${id}`, 'PUT', supp);
    return { success: true, id };
  },

  async deleteSupplier(id) {
    const current = this.getCache('suppliers') || {};
    delete current[id];
    this.setCache('suppliers', current);
    await this.rtdb(`suppliers/${id}`, 'DELETE');
    return { success: true };
  },

  async getPurchaseOrders() {
    const cached = this.getCache('purchase_orders') || {};
    let pos = Object.keys(cached).map(k => ({ id: k, ...cached[k] }));
    pos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, purchase_orders: pos };
  },

  async createPurchaseOrder(data) {
    const id = Date.now().toString();
    const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(-4)}`;
    const po = {
      id,
      po_number: poNumber,
      status: 'PENDING',
      ...data,
      total_amount: parseFloat(data.total_amount || 0),
      created_at: new Date().toISOString()
    };
    const current = this.getCache('purchase_orders') || {};
    current[id] = po;
    this.setCache('purchase_orders', current);
    await this.rtdb(`purchase_orders/${id}`, 'PUT', po);
    return { success: true, po_number: poNumber, purchase_order: po };
  },

  async receivePurchaseOrder(poId, userId) {
    const current = this.getCache('purchase_orders') || {};
    const po = current[poId];
    if (!po) throw new Error('Purchase order not found');

    po.status = 'RECEIVED';
    po.received_at = new Date().toISOString();
    po.received_by = userId;
    current[poId] = po;
    this.setCache('purchase_orders', current);

    // Increase product stock
    if (po.items && po.items.length > 0) {
      const prods = this.getCache('products') || {};
      po.items.forEach(it => {
        if (it.product_id && prods[it.product_id]) {
          prods[it.product_id].stock_quantity += parseFloat(it.quantity_ordered || it.quantity || 0);
          if (it.cost_price > 0) prods[it.product_id].cost_price = it.cost_price;
        }
      });
      this.setCache('products', prods);
    }

    await this.rtdb(`purchase_orders/${poId}`, 'PATCH', { status: 'RECEIVED', received_at: po.received_at });
    return { success: true };
  },

  async deletePurchaseOrder(id) {
    const current = this.getCache('purchase_orders') || {};
    delete current[id];
    this.setCache('purchase_orders', current);
    await this.rtdb(`purchase_orders/${id}`, 'DELETE');
    return { success: true };
  },

  // -------------------------------------------------------------
  // 10. CAPITAL & FINANCIAL METRICS (INSTANT ZERO-LATENCY ENGINE)
  // -------------------------------------------------------------
  async getCapital(branchId) {
    const bId = branchId !== undefined ? branchId : (window.State && window.State.currentBranch);
    const settings = this.getCache('settings') || {};
    const prodsObj = this.getCache('products') || {};
    let products = Object.values(prodsObj);
    const custsObj = this.getCache('customers') || {};
    let customers = Object.values(custsObj);
    const ledgerObj = this.getCache('capital_ledger') || {};
    let ledger = Object.values(ledgerObj);

    // Filter strictly by branch if specific branch selected
    if (bId && bId !== 'all') {
      products = products.filter(p => p.branch_id === bId || (!p.branch_id && bId === 'branch-main'));
      ledger = ledger.filter(l => l.branch_id === bId || (!l.branch_id && bId === 'branch-main'));
    }

    // 1. Available Stock Valuation at Cost (Total money invested in available goods)
    let stock_cost_val = 0;
    let stock_retail_val = 0;
    let total_stock_items = 0;
    products.forEach(p => {
      const q = parseFloat(p.stock_quantity || 0);
      const cost = parseFloat(p.cost_price || 0);
      const retail = parseFloat(p.selling_price || 0);
      if (q > 0) {
        stock_cost_val += q * cost;
        stock_retail_val += q * retail;
        total_stock_items += q;
      }
    });

    // 2. Total Injected / Invested Capital recorded in ledger
    let total_injected = 0;
    let total_drawn = 0;
    ledger.forEach(l => {
      const amt = parseFloat(l.amount || 0);
      if (l.entry_type === 'CAPITAL_INJECTION' || l.type === 'INJECTION') {
        total_injected += amt;
      } else if (l.entry_type === 'OWNER_DRAWING' || l.type === 'DRAWING') {
        total_drawn += amt;
      }
    });

    // 3. Debtors (Accounts Receivable)
    let debtors_total = 0;
    customers.forEach(c => {
      debtors_total += parseFloat(c.current_credit || 0);
    });

    // 4. Liquid funds
    const cash = parseFloat(settings.cash_balance || 0);
    const bank = parseFloat(settings.bank_balance || 0);
    const mobile = parseFloat(settings.mobile_money_balance || 0);
    const total_liquid = cash + bank + mobile;

    // 5. Total Net Working Capital: Stock Investment + Liquid Cash/Bank + Debtors
    const net_capital = total_liquid + stock_cost_val + debtors_total;

    return {
      success: true,
      capital: {
        cash_balance: cash,
        cash: cash,
        bank_balance: bank,
        bank: bank,
        mobile_money_balance: mobile,
        mobile_money: mobile,
        total_liquid,
        stock_cost_valuation: stock_cost_val,
        stock_valuation: stock_cost_val,
        stock_retail_valuation: stock_retail_val,
        total_stock_items,
        total_debtors: debtors_total,
        debtors_total,
        total_injected,
        total_drawn,
        total_estimated_net_capital: net_capital,
        net_capital
      },
      ledger: ledger.sort((a, b) => new Date(b.created_at || b.entry_date || 0) - new Date(a.created_at || a.entry_date || 0))
    };
  },

  async recordCapitalAdjustment(data) {
    const id = Date.now().toString();
    const activeBranch = data.branch_id || (window.State && window.State.currentBranch && window.State.currentBranch !== 'all' ? window.State.currentBranch : 'branch-main');
    const entry = {
      id,
      branch_id: activeBranch,
      ...data,
      amount: parseFloat(data.amount || 0),
      created_at: new Date().toISOString()
    };

    const settings = this.getCache('settings') || {};
    if (data.entry_type === 'CAPITAL_INJECTION' || data.type === 'INJECTION') {
      settings.cash_balance = (parseFloat(settings.cash_balance) || 0) + entry.amount;
    } else if (data.entry_type === 'OWNER_DRAWING' || data.type === 'DRAWING') {
      settings.cash_balance = Math.max(0, (parseFloat(settings.cash_balance) || 0) - entry.amount);
    }
    this.setCache('settings', settings);

    const ledgers = this.getCache('capital_ledger') || {};
    ledgers[id] = entry;
    this.setCache('capital_ledger', ledgers);

    await this.rtdb(`capital_ledger/${id}`, 'PUT', entry);
    await this.rtdb('settings', 'PATCH', { cash_balance: settings.cash_balance });
    return { success: true, id };
  },

  async deleteCapitalAdjustment(id) {
    const ledgers = this.getCache('capital_ledger') || {};
    const entry = ledgers[id];
    if (entry) {
      const settings = this.getCache('settings') || {};
      const amt = parseFloat(entry.amount || 0);
      if (entry.entry_type === 'CAPITAL_INJECTION' || entry.type === 'INJECTION') {
        settings.cash_balance = Math.max(0, (parseFloat(settings.cash_balance) || 0) - amt);
      } else if (entry.entry_type === 'OWNER_DRAWING' || entry.type === 'DRAWING') {
        settings.cash_balance = (parseFloat(settings.cash_balance) || 0) + amt;
      }
      delete ledgers[id];
      this.setCache('settings', settings);
      this.setCache('capital_ledger', ledgers);
      await this.rtdb(`capital_ledger/${id}`, 'DELETE');
      await this.rtdb('settings', 'PATCH', { cash_balance: settings.cash_balance });
    }
    return { success: true };
  },

  // -------------------------------------------------------------
  // 11. REPORTS (INSTANT RENDERING)
  // -------------------------------------------------------------
  async getDashboardReport(branchId) {
    const bId = branchId !== undefined ? branchId : (window.State && window.State.currentBranch);
    const today = new Date().toISOString().split('T')[0];
    const ordersObj = this.getCache('orders') || {};
    let allOrders = Object.values(ordersObj);
    if (bId && bId !== 'all') {
      allOrders = allOrders.filter(o => o.branch_id === bId || (!o.branch_id && bId === 'branch-main'));
    }
    const todayOrders = allOrders.filter(o => o.order_type !== 'PROFORMA' && (o.created_at || '').startsWith(today));

    let todaySales = 0;
    todayOrders.forEach(o => { todaySales += parseFloat(o.total || 0); });

    const expensesObj = this.getCache('expenses') || {};
    let allExpenses = Object.values(expensesObj);
    if (bId && bId !== 'all') {
      allExpenses = allExpenses.filter(e => e.branch_id === bId || (!e.branch_id && bId === 'branch-main'));
    }
    const todayExpenses = allExpenses.filter(e => (e.expense_date || '').startsWith(today) || (e.created_at || '').startsWith(today));

    let todayExpTotal = 0;
    todayExpenses.forEach(e => { todayExpTotal += parseFloat(e.amount || 0); });

    const capRes = await this.getCapital(bId);
    const cap = (capRes && capRes.capital) || {};
    let prodsObj = this.getCache('products') || {};
    let prodsList = Object.values(prodsObj);
    if (bId && bId !== 'all') {
      prodsList = prodsList.filter(p => p.branch_id === bId || (!p.branch_id && bId === 'branch-main'));
    }
    const lowStock = prodsList.filter(p => (parseFloat(p.stock_quantity) || 0) <= (parseFloat(p.min_alert_quantity) || 5)).length;

    // Active workers on duty today
    const shiftsObj = this.getCache('work_shifts') || {};
    let activeShifts = Object.values(shiftsObj).filter(s => s.work_date === today && !s.clock_out);
    if (bId && bId !== 'all') {
      activeShifts = activeShifts.filter(s => s.branch_id === bId || (!s.branch_id && bId === 'branch-main'));
    }

    const cash = parseFloat(cap.cash_balance || 0);
    const bank = parseFloat(cap.bank_balance || 0);
    const mobile = parseFloat(cap.mobile_money_balance || 0);
    const debtors = parseFloat(cap.total_debtors || 0);
    const stockVal = parseFloat(cap.stock_cost_valuation || 0);
    const totalWorkingCap = (cap.net_capital !== undefined) ? cap.net_capital : (cash + bank + mobile + stockVal + debtors);

    const reportData = {
      total_capital: totalWorkingCap,
      net_capital: totalWorkingCap,
      capital_available: cash + bank + mobile,
      stock_value: stockVal,
      cash_in_hand: cash,
      bank_balance: bank,
      mobile_balance: mobile,
      today_sales: todaySales,
      today_orders_count: todayOrders.length,
      today_expenses: todayExpTotal,
      net_today: todaySales - todayExpTotal,
      debtors_total: debtors,
      low_stock_count: lowStock,
      active_workers_count: activeShifts.length,
      current_branch: bId || 'all'
    };

    return {
      success: true,
      dashboard: reportData,
      ...reportData,
      recent_orders: allOrders.slice(0, 10)
    };
  },

  async getDailyReport(date, workerId) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const ordersObj = this.getCache('orders') || {};
    let orders = Object.values(ordersObj).filter(o => o.order_type !== 'PROFORMA' && (o.created_at || '').startsWith(targetDate));

    if (workerId) {
      orders = orders.filter(o => String(o.cashier_id) === String(workerId));
    }

    let totalSales = 0;
    orders.forEach(o => { totalSales += parseFloat(o.total || 0); });

    const expensesObj = this.getCache('expenses') || {};
    const expenses = Object.values(expensesObj).filter(e => (e.expense_date || '').startsWith(targetDate) || (e.created_at || '').startsWith(targetDate));

    let totalExp = 0;
    expenses.forEach(e => { totalExp += parseFloat(e.amount || 0); });

    return {
      success: true,
      date: targetDate,
      total_sales: totalSales,
      total_expenses: totalExp,
      net_profit: totalSales - totalExp,
      orders,
      expenses
    };
  }
};

// Immediately auto-initialize memory cache and network listeners
FirebaseAdapter.init();
