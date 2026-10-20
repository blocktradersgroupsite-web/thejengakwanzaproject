// JENGAKWANZA Cloud Firestore Adapter
// Integrates Firebase v10/v11 Modular SDK via dynamic ESM imports

const FirebaseAdapter = {
  app: null,
  db: null,
  auth: null,
  isInitialized: false,

  // Check if credentials are present
  hasConfig() {
    const cfg = window.FIREBASE_CONFIG;
    return Boolean(cfg && cfg.apiKey && cfg.projectId && cfg.apiKey.trim() !== "");
  },

  async init(customConfig = null) {
    const config = customConfig || window.FIREBASE_CONFIG;
    if (!config || !config.apiKey || !config.projectId) {
      console.info('Firebase is not yet configured with an API key. Falling back to local/REST storage.');
      return false;
    }

    try {
      // Dynamically import Firebase SDK modules from Google CDN
      const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
      const { 
        getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, 
        query, where, orderBy, limit, writeBatch, serverTimestamp, increment 
      } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

      this.firestoreOps = {
        collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
        query, where, orderBy, limit, writeBatch, serverTimestamp, increment
      };

      const existingApps = getApps();
      this.app = existingApps.length > 0 ? existingApps[0] : initializeApp(config);
      this.db = getFirestore(this.app);
      this.isInitialized = true;
      console.log('✓ Firebase Cloud Firestore initialized successfully for project:', config.projectId);

      // Verify and bootstrap clean initial system settings & Admin profile if first time
      await this.ensureInitialSetup();
      return true;
    } catch (err) {
      console.error('Failed to initialize Firebase SDK:', err);
      return false;
    }
  },

  async ensureInitialSetup() {
    if (!this.db) return;
    try {
      const { doc, getDoc, setDoc } = this.firestoreOps;

      // 1. Settings Document
      const settingsRef = doc(this.db, "settings", "general");
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, {
          company_name: 'JENGAKWANZA LIMITED',
          tagline: 'Building Excellence & Quality Supplies',
          phone_numbers: '0788989889 / 0713550104',
          address: 'P.O.BOX 14991 ARUSHA',
          email: 'jengakwanzaltd@gmail.com',
          currency: 'TZS',
          currency_symbol: 'TSh',
          tax_rate: '0',
          receipt_footer: 'Thank you for choosing JENGAKWANZA LIMITED! Quality Guarantee.',
          cash_balance: 0.0,
          bank_balance: 0.0,
          mobile_money_balance: 0.0,
          updated_at: new Date().toISOString()
        });
        console.log('✓ Initialized JENGAKWANZA Firestore company credentials');
      }

      // 2. Default Admin User if no users exist
      const adminRef = doc(this.db, "users", "admin");
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists()) {
        await setDoc(adminRef, {
          id: "admin",
          username: "admin",
          full_name: "System Administrator",
          role: "Admin",
          phone: "0788989889",
          pin_hash: "admin123",
          active: 1,
          created_at: new Date().toISOString()
        });
        console.log('✓ Initialized default Admin user in Firestore: admin | admin123');
      }
    } catch (e) {
      console.warn('Initial Firestore setup notice:', e);
    }
  },

  // -------------------------------------------------------------
  // FIRESTORE CRUD OPERATIONS
  // -------------------------------------------------------------
  async getSettings() {
    const { doc, getDoc } = this.firestoreOps;
    const snap = await getDoc(doc(this.db, "settings", "general"));
    return { success: true, settings: snap.exists() ? snap.data() : {} };
  },

  async saveSettings(data) {
    const { doc, setDoc } = this.firestoreOps;
    await setDoc(doc(this.db, "settings", "general"), data, { merge: true });
    return { success: true, message: 'Settings saved to Cloud Firestore' };
  },

  async getWorkers() {
    const { collection, getDocs } = this.firestoreOps;
    const snap = await getDocs(collection(this.db, "users"));
    const workers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return { success: true, workers };
  },

  async addWorker(data) {
    const { collection, addDoc } = this.firestoreOps;
    const docRef = await addDoc(collection(this.db, "users"), {
      ...data,
      pin_hash: data.password || '123456',
      active: 1,
      created_at: new Date().toISOString()
    });
    return { success: true, id: docRef.id };
  },

  async updateWorker(id, data) {
    const { doc, updateDoc } = this.firestoreOps;
    await updateDoc(doc(this.db, "users", String(id)), data);
    return { success: true };
  },

  async getShifts(date) {
    const { collection, query, where, getDocs } = this.firestoreOps;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const q = query(collection(this.db, "work_shifts"), where("work_date", "==", targetDate));
    const snap = await getDocs(q);
    const shifts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Attach worker details
    const workersRes = await this.getWorkers();
    const wMap = {};
    (workersRes.workers || []).forEach(w => { wMap[w.id] = w; wMap[w.username] = w; });

    shifts.forEach(s => {
      const w = wMap[s.user_id] || {};
      s.worker_name = s.worker_name || w.full_name || 'Worker';
      s.worker_role = s.worker_role || w.role || 'Staff';
      s.worker_phone = s.worker_phone || w.phone || '';
    });

    return { success: true, date: targetDate, shifts };
  },

  async clockIn(data) {
    const { collection, addDoc } = this.firestoreOps;
    const docRef = await addDoc(collection(this.db, "work_shifts"), {
      ...data,
      clock_in: new Date().toISOString(),
      clock_out: null,
      created_at: new Date().toISOString()
    });
    return { success: true, shift_id: docRef.id };
  },

  async clockOut(data) {
    const { doc, updateDoc, collection, query, where, getDocs } = this.firestoreOps;
    if (data.shift_id) {
      await updateDoc(doc(this.db, "work_shifts", String(data.shift_id)), {
        clock_out: new Date().toISOString(),
        closing_cash: data.closing_cash || 0,
        notes: data.notes || ''
      });
    } else {
      const q = query(
        collection(this.db, "work_shifts"), 
        where("user_id", "==", data.user_id),
        where("clock_out", "==", null)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(async (d) => {
        await updateDoc(d.ref, {
          clock_out: new Date().toISOString(),
          closing_cash: data.closing_cash || 0,
          notes: data.notes || ''
        });
      });
    }
    return { success: true };
  },

  // Products
  async getProducts() {
    const { collection, getDocs } = this.firestoreOps;
    const snap = await getDocs(collection(this.db, "products"));
    const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return { success: true, products };
  },

  async addProduct(data) {
    const { collection, addDoc } = this.firestoreOps;
    const docRef = await addDoc(collection(this.db, "products"), {
      ...data,
      stock_quantity: parseFloat(data.stock_quantity || 0),
      cost_price: parseFloat(data.cost_price || 0),
      selling_price: parseFloat(data.selling_price || 0),
      min_alert_quantity: parseFloat(data.min_alert_quantity || 5),
      created_at: new Date().toISOString()
    });

    if (data.stock_quantity > 0) {
      await addDoc(collection(this.db, "stock_movements"), {
        product_id: docRef.id,
        product_name: data.name,
        movement_type: 'RESTOCK',
        quantity: data.stock_quantity,
        balance_after: data.stock_quantity,
        unit_cost: data.cost_price,
        notes: 'Initial stock setup',
        created_at: new Date().toISOString()
      });
    }

    return { success: true, id: docRef.id, sku: data.sku };
  },

  async updateProduct(id, data) {
    const { doc, updateDoc } = this.firestoreOps;
    await updateDoc(doc(this.db, "products", String(id)), {
      ...data,
      cost_price: parseFloat(data.cost_price || 0),
      selling_price: parseFloat(data.selling_price || 0),
      updated_at: new Date().toISOString()
    });
    return { success: true };
  },

  async deleteProduct(id) {
    const { doc, deleteDoc } = this.firestoreOps;
    await deleteDoc(doc(this.db, "products", String(id)));
    return { success: true };
  },

  async adjustStock(data) {
    const { doc, getDoc, updateDoc, collection, addDoc } = this.firestoreOps;
    const prodRef = doc(this.db, "products", String(data.product_id));
    const snap = await getDoc(prodRef);
    if (!snap.exists()) throw new Error('Product not found in Firestore');

    const prod = snap.data();
    const newBal = Math.max(0, (parseFloat(prod.stock_quantity) || 0) + parseFloat(data.quantity || 0));

    await updateDoc(prodRef, {
      stock_quantity: newBal,
      cost_price: data.unit_cost > 0 ? parseFloat(data.unit_cost) : prod.cost_price,
      updated_at: new Date().toISOString()
    });

    await addDoc(collection(this.db, "stock_movements"), {
      product_id: data.product_id,
      product_name: prod.name,
      movement_type: data.movement_type,
      quantity: data.quantity,
      balance_after: newBal,
      unit_cost: data.unit_cost || prod.cost_price,
      notes: data.notes || '',
      created_at: new Date().toISOString()
    });

    return { success: true, new_balance: newBal };
  },

  async getStockMovements(limitNum = 100) {
    const { collection, getDocs } = this.firestoreOps;
    const snap = await getDocs(collection(this.db, "stock_movements"));
    const movements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    movements.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, movements: movements.slice(0, limitNum) };
  },

  // Customers & Debtors
  async getCustomers() {
    const { collection, getDocs } = this.firestoreOps;
    const snap = await getDocs(collection(this.db, "customers"));
    const customers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return { success: true, customers };
  },

  async addCustomer(data) {
    const { collection, addDoc } = this.firestoreOps;
    const docRef = await addDoc(collection(this.db, "customers"), {
      ...data,
      credit_limit: parseFloat(data.credit_limit || 0),
      current_credit: 0.0,
      created_at: new Date().toISOString()
    });
    return { success: true, id: docRef.id };
  },

  async updateCustomer(id, data) {
    const { doc, updateDoc } = this.firestoreOps;
    await updateDoc(doc(this.db, "customers", String(id)), data);
    return { success: true };
  },

  async getDebtors() {
    const res = await this.getCustomers();
    const debtors = (res.customers || []).filter(c => parseFloat(c.current_credit || 0) > 0.01);
    return { success: true, debtors };
  },

  async payDebtor(data) {
    const { doc, getDoc, updateDoc, collection, addDoc } = this.firestoreOps;
    const custRef = doc(this.db, "customers", String(data.customer_id));
    const snap = await getDoc(custRef);
    if (!snap.exists()) throw new Error('Customer not found');

    const cust = snap.data();
    const newBal = Math.max(0, (parseFloat(cust.current_credit) || 0) - parseFloat(data.amount));

    await updateDoc(custRef, { current_credit: newBal });

    const payNum = `JK-RCT-${Date.now().toString().slice(-6)}`;
    await addDoc(collection(this.db, "debtor_payments"), {
      payment_number: payNum,
      customer_id: data.customer_id,
      customer_name: cust.name,
      amount: parseFloat(data.amount),
      payment_method: data.payment_method,
      payment_date: data.payment_date,
      notes: data.notes || '',
      created_at: new Date().toISOString()
    });

    // Update settings cash balance
    const field = data.payment_method === 'BANK' ? 'bank_balance' : (data.payment_method === 'CASH' ? 'cash_balance' : 'mobile_money_balance');
    const setRef = doc(this.db, "settings", "general");
    const setSnap = await getDoc(setRef);
    if (setSnap.exists()) {
      const cur = parseFloat(setSnap.data()[field] || 0);
      await updateDoc(setRef, { [field]: cur + parseFloat(data.amount) });
    }

    return { success: true, payment_number: payNum, new_credit_balance: newBal };
  },

  // Suppliers & POs
  async getSuppliers() {
    const { collection, getDocs } = this.firestoreOps;
    const snap = await getDocs(collection(this.db, "suppliers"));
    const suppliers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return { success: true, suppliers };
  },

  async addSupplier(data) {
    const { collection, addDoc } = this.firestoreOps;
    const docRef = await addDoc(collection(this.db, "suppliers"), {
      ...data,
      created_at: new Date().toISOString()
    });
    return { success: true, id: docRef.id };
  },

  async getPurchaseOrders() {
    const { collection, getDocs } = this.firestoreOps;
    const snap = await getDocs(collection(this.db, "purchase_orders"));
    const pos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    pos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, purchase_orders: pos };
  },

  async createPurchaseOrder(data) {
    const { collection, addDoc } = this.firestoreOps;
    const poNum = `JK-PO-${Date.now().toString().slice(-6)}`;
    const docRef = await addDoc(collection(this.db, "purchase_orders"), {
      po_number: poNum,
      ...data,
      status: 'PENDING',
      created_at: new Date().toISOString()
    });
    return { success: true, po_id: docRef.id, po_number: poNum };
  },

  async receivePurchaseOrder(poId, userId) {
    const { doc, getDoc, updateDoc, collection, addDoc } = this.firestoreOps;
    const poRef = doc(this.db, "purchase_orders", String(poId));
    const poSnap = await getDoc(poRef);
    if (!poSnap.exists()) throw new Error('PO not found');

    const po = poSnap.data();
    if (po.status === 'RECEIVED') throw new Error('PO already received');

    // Update product stock quantities
    if (po.items && Array.isArray(po.items)) {
      for (const item of po.items) {
        if (item.product_id) {
          const pRef = doc(this.db, "products", String(item.product_id));
          const pSnap = await getDoc(pRef);
          if (pSnap.exists()) {
            const p = pSnap.data();
            const newQty = (parseFloat(p.stock_quantity) || 0) + parseFloat(item.quantity_ordered);
            await updateDoc(pRef, {
              stock_quantity: newQty,
              cost_price: parseFloat(item.cost_price || p.cost_price)
            });
            await addDoc(collection(this.db, "stock_movements"), {
              product_id: item.product_id,
              product_name: p.name,
              movement_type: 'PO_RECEIVE',
              quantity: item.quantity_ordered,
              balance_after: newQty,
              unit_cost: item.cost_price,
              notes: `Received PO ${po.po_number}`,
              created_at: new Date().toISOString()
            });
          }
        }
      }
    }

    await updateDoc(poRef, { status: 'RECEIVED', received_at: new Date().toISOString() });
    return { success: true };
  },

  // Orders: POS, Invoices, Proformas
  async getOrders(type) {
    const { collection, getDocs } = this.firestoreOps;
    const snap = await getDocs(collection(this.db, "orders"));
    let orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (type) orders = orders.filter(o => o.order_type === type);
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, orders };
  },

  async getOrder(id) {
    const { doc, getDoc } = this.firestoreOps;
    const snap = await getDoc(doc(this.db, "orders", String(id)));
    if (!snap.exists()) throw new Error('Order not found');
    return { success: true, order: { id: snap.id, ...snap.data() } };
  },

  async createOrder(data) {
    const { collection, addDoc, doc, getDoc, updateDoc } = this.firestoreOps;
    const prefix = data.order_type === 'POS' ? 'JK-POS' : (data.order_type === 'PROFORMA' ? 'JK-PRO' : 'JK-INV');
    const orderNum = `${prefix}-${Date.now().toString().slice(-6)}`;

    const total = parseFloat(data.total || 0);
    const amountPaid = parseFloat(data.amount_paid || 0);
    let payStatus = 'PAID';
    let balanceDue = 0;

    if (data.order_type === 'PROFORMA') {
      payStatus = 'UNPAID';
      balanceDue = total;
    } else if (amountPaid >= total) {
      payStatus = 'PAID';
      balanceDue = 0;
    } else if (amountPaid > 0) {
      payStatus = 'PARTIAL';
      balanceDue = total - amountPaid;
    } else {
      payStatus = 'UNPAID';
      balanceDue = total;
    }

    const orderData = {
      order_number: orderNum,
      ...data,
      total,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      payment_status: payStatus,
      created_at: new Date().toISOString()
    };

    const docRef = await addDoc(collection(this.db, "orders"), orderData);

    // Deduct stock if not Proforma
    if (data.order_type !== 'PROFORMA' && data.items) {
      for (const item of data.items) {
        if (item.product_id) {
          const pRef = doc(this.db, "products", String(item.product_id));
          const pSnap = await getDoc(pRef);
          if (pSnap.exists()) {
            const p = pSnap.data();
            const newQty = Math.max(0, (parseFloat(p.stock_quantity) || 0) - parseFloat(item.quantity));
            await updateDoc(pRef, { stock_quantity: newQty });
            await addDoc(collection(this.db, "stock_movements"), {
              product_id: item.product_id,
              product_name: p.name,
              movement_type: 'SALE',
              quantity: -item.quantity,
              balance_after: newQty,
              unit_cost: p.cost_price,
              notes: `Sale Order ${orderNum}`,
              created_at: new Date().toISOString()
            });
          }
        }
      }

      // Add to debtor balance if on credit
      if (balanceDue > 0 && data.customer_id) {
        const cRef = doc(this.db, "customers", String(data.customer_id));
        const cSnap = await getDoc(cRef);
        if (cSnap.exists()) {
          const c = cSnap.data();
          await updateDoc(cRef, { current_credit: (parseFloat(c.current_credit) || 0) + balanceDue });
        }
      }

      // Add to liquid balance if payment made
      if (amountPaid > 0) {
        const field = data.payment_method === 'BANK' ? 'bank_balance' : (data.payment_method === 'CASH' ? 'cash_balance' : 'mobile_money_balance');
        const setRef = doc(this.db, "settings", "general");
        const setSnap = await getDoc(setRef);
        if (setSnap.exists()) {
          const cur = parseFloat(setSnap.data()[field] || 0);
          await updateDoc(setRef, { [field]: cur + amountPaid });
        }
      }
    }

    return {
      success: true,
      order_id: docRef.id,
      order_number: orderNum,
      total,
      balance_due: balanceDue,
      payment_status: payStatus
    };
  },

  async convertProforma(id, targetType, userId) {
    const { doc, getDoc } = this.firestoreOps;
    const snap = await getDoc(doc(this.db, "orders", String(id)));
    if (!snap.exists()) throw new Error('Proforma not found');

    const pro = snap.data();
    return await this.createOrder({
      ...pro,
      order_type: targetType,
      amount_paid: 0,
      notes: `Converted from Proforma ${pro.order_number}`
    });
  },

  // Delivery Notes
  async getDeliveryNotes() {
    const { collection, getDocs } = this.firestoreOps;
    const snap = await getDocs(collection(this.db, "delivery_notes"));
    const delivery_notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    delivery_notes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, delivery_notes };
  },

  async createDeliveryNote(data) {
    const { collection, addDoc } = this.firestoreOps;
    const dnNum = `JK-DN-${Date.now().toString().slice(-6)}`;
    const docRef = await addDoc(collection(this.db, "delivery_notes"), {
      delivery_number: dnNum,
      ...data,
      created_at: new Date().toISOString()
    });
    return { success: true, id: docRef.id, delivery_number: dnNum };
  },

  // Expenses
  async getExpenses(date) {
    const { collection, getDocs } = this.firestoreOps;
    const snap = await getDocs(collection(this.db, "expenses"));
    let expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (date) expenses = expenses.filter(e => e.expense_date === date);
    expenses.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, expenses };
  },

  async createExpense(data) {
    const { collection, addDoc, doc, getDoc, updateDoc } = this.firestoreOps;
    const expNum = `JK-EXP-${Date.now().toString().slice(-6)}`;
    const docRef = await addDoc(collection(this.db, "expenses"), {
      expense_number: expNum,
      ...data,
      amount: parseFloat(data.amount || 0),
      created_at: new Date().toISOString()
    });

    // Deduct from setting cash balances
    const field = data.payment_method === 'BANK' ? 'bank_balance' : (data.payment_method === 'CASH' ? 'cash_balance' : 'mobile_money_balance');
    const setRef = doc(this.db, "settings", "general");
    const setSnap = await getDoc(setRef);
    if (setSnap.exists()) {
      const cur = parseFloat(setSnap.data()[field] || 0);
      await updateDoc(setRef, { [field]: cur - parseFloat(data.amount) });
    }

    return { success: true, id: docRef.id, expense_number: expNum };
  },

  async deleteExpense(id) {
    const { doc, deleteDoc } = this.firestoreOps;
    await deleteDoc(doc(this.db, "expenses", String(id)));
    return { success: true };
  },

  // Capital & Dashboard
  async getCapital() {
    const sRes = await this.getSettings();
    const s = sRes.settings || {};
    const cash = parseFloat(s.cash_balance || 0);
    const bank = parseFloat(s.bank_balance || 0);
    const mobile = parseFloat(s.mobile_money_balance || 0);

    const pRes = await this.getProducts();
    const prods = pRes.products || [];
    const stockCost = prods.reduce((sum, p) => sum + ((parseFloat(p.cost_price) || 0) * (parseFloat(p.stock_quantity) || 0)), 0);
    const stockRetail = prods.reduce((sum, p) => sum + ((parseFloat(p.selling_price) || 0) * (parseFloat(p.stock_quantity) || 0)), 0);

    const cRes = await this.getCustomers();
    const debtors = (cRes.customers || []).reduce((sum, c) => sum + (parseFloat(c.current_credit) || 0), 0);

    const totalLiquid = cash + bank + mobile;
    const netCapital = totalLiquid + stockCost + debtors;

    const { collection, getDocs } = this.firestoreOps;
    const lSnap = await getDocs(collection(this.db, "capital_ledger"));
    const ledger = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return {
      success: true,
      capital: {
        cash, bank, mobile_money: mobile,
        total_liquid: totalLiquid,
        stock_cost_valuation: stockCost,
        stock_retail_valuation: stockRetail,
        debtors_total: debtors,
        total_estimated_net_capital: netCapital
      },
      ledger
    };
  },

  async recordCapitalAdjustment(data) {
    const { collection, addDoc, doc, getDoc, updateDoc } = this.firestoreOps;
    await addDoc(collection(this.db, "capital_ledger"), {
      ...data,
      amount: parseFloat(data.amount),
      created_at: new Date().toISOString()
    });

    const field = data.account === 'BANK' ? 'bank_balance' : (data.account === 'MOBILE_MONEY' ? 'mobile_money_balance' : 'cash_balance');
    const setRef = doc(this.db, "settings", "general");
    const setSnap = await getDoc(setRef);
    if (setSnap.exists()) {
      const cur = parseFloat(setSnap.data()[field] || 0);
      const mult = data.entry_type === 'OWNER_DRAWING' ? -1 : 1;
      await updateDoc(setRef, { [field]: cur + (mult * parseFloat(data.amount)) });
    }

    return { success: true };
  },

  async getDashboardReport() {
    const today = new Date().toISOString().split('T')[0];
    const [ordersRes, expRes, capRes, shiftsRes, prodsRes] = await Promise.all([
      this.getOrders(),
      this.getExpenses(today),
      this.getCapital(),
      this.getShifts(today),
      this.getProducts()
    ]);

    const todayOrders = (ordersRes.orders || []).filter(o => o.created_at?.startsWith(today) && o.order_type !== 'PROFORMA');
    const todaySales = todayOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
    const todayExp = (expRes.expenses || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const lowStock = (prodsRes.products || []).filter(p => parseFloat(p.stock_quantity || 0) <= parseFloat(p.min_alert_quantity || 5)).length;

    return {
      success: true,
      dashboard: {
        today_sales: todaySales,
        today_orders_count: todayOrders.length,
        today_expenses: todayExp,
        net_today: todaySales - todayExp,
        active_workers_count: (shiftsRes.shifts || []).filter(s => !s.clock_out).length,
        low_stock_count: lowStock,
        debtors_total: capRes.capital.debtors_total,
        capital_available: capRes.capital.total_liquid,
        cash_in_hand: capRes.capital.cash,
        bank_balance: capRes.capital.bank,
        mobile_balance: capRes.capital.mobile_money
      }
    };
  },

  async getDailyReport(date, workerId) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const [oRes, eRes, sRes] = await Promise.all([
      this.getOrders(),
      this.getExpenses(targetDate),
      this.getShifts(targetDate)
    ]);

    let dayOrders = (oRes.orders || []).filter(o => o.created_at?.startsWith(targetDate));
    let dayExpenses = eRes.expenses || [];

    if (workerId) {
      dayOrders = dayOrders.filter(o => o.user_id == workerId);
      dayExpenses = dayExpenses.filter(e => e.user_id == workerId);
    }

    const totalSales = dayOrders.filter(o => o.order_type !== 'PROFORMA').reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
    const totalExp = dayExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    return {
      success: true,
      date: targetDate,
      total_sales: totalSales,
      total_expenses: totalExp,
      net_profit: totalSales - totalExp,
      orders: dayOrders,
      expenses: dayExpenses,
      shifts: sRes.shifts || []
    };
  }
};
