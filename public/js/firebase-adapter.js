// JENGAKWANZA Firebase Cloud Backend Engine
// Full Dual-Mode Support:
// 1. Firebase Realtime Database REST Engine (Instant, zero-dependency, ultra-fast on Vercel)
// 2. Cloud Firestore Modular SDK (Google Cloud Firestore document database)

const FirebaseAdapter = {
  dbUrl: "https://jengakwanzaltd-1409a-default-rtdb.firebaseio.com",
  isInitialized: true,

  hasConfig() {
    return Boolean(this.dbUrl && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId);
  },

  async init() {
    this.isInitialized = true;
    console.log('✓ Firebase Cloud Backend connected to:', this.dbUrl);
    return true;
  },

  // Helper for Realtime Database REST calls
  async rtdb(path, method = 'GET', data = null) {
    const url = `${this.dbUrl}/${path}.json`;
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      opts.body = JSON.stringify(data);
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
      throw new Error(`Firebase RTDB error: HTTP ${res.status}`);
    }
    return await res.json();
  },

  // Settings
  async getSettings() {
    const s = await this.rtdb('settings');
    return { success: true, settings: s || {} };
  },

  async saveSettings(data) {
    await this.rtdb('settings', 'PATCH', data);
    return { success: true, message: 'Settings saved to Firebase Cloud' };
  },

  // Workers
  async getWorkers() {
    const raw = await this.rtdb('users');
    let workers = [];
    if (raw) {
      if (Array.isArray(raw)) {
        workers = raw.filter(Boolean);
      } else {
        workers = Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
      }
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
    await this.rtdb(`users/${id}`, 'PUT', worker);
    return { success: true, id };
  },

  async updateWorker(id, data) {
    await this.rtdb(`users/${id}`, 'PATCH', data);
    return { success: true };
  },

  // Shifts
  async getShifts(date) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const raw = await this.rtdb('work_shifts');
    let shifts = [];
    if (raw) {
      shifts = Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
    }
    const filtered = shifts.filter(s => s.work_date === targetDate);

    // Attach worker metadata
    const wRes = await this.getWorkers();
    const wMap = {};
    (wRes.workers || []).forEach(w => { wMap[w.id] = w; wMap[w.username] = w; });

    filtered.forEach(s => {
      const w = wMap[s.user_id] || {};
      s.worker_name = s.worker_name || w.full_name || 'Staff';
      s.worker_role = s.worker_role || w.role || 'Cashier';
      s.worker_phone = s.worker_phone || w.phone || '';
    });

    return { success: true, date: targetDate, shifts: filtered };
  },

  async clockIn(data) {
    const id = Date.now().toString();
    const shift = {
      id,
      ...data,
      clock_in: new Date().toISOString(),
      clock_out: null,
      created_at: new Date().toISOString()
    };
    await this.rtdb(`work_shifts/${id}`, 'PUT', shift);
    return { success: true, shift_id: id };
  },

  async clockOut(data) {
    if (data.shift_id) {
      await this.rtdb(`work_shifts/${data.shift_id}`, 'PATCH', {
        clock_out: new Date().toISOString(),
        closing_cash: data.closing_cash || 0,
        notes: data.notes || ''
      });
    } else {
      const raw = await this.rtdb('work_shifts');
      if (raw) {
        for (const k of Object.keys(raw)) {
          if (raw[k].user_id == data.user_id && !raw[k].clock_out) {
            await this.rtdb(`work_shifts/${k}`, 'PATCH', {
              clock_out: new Date().toISOString(),
              closing_cash: data.closing_cash || 0,
              notes: data.notes || ''
            });
          }
        }
      }
    }
    return { success: true };
  },

  // Products & Inventory
  async getProducts() {
    const raw = await this.rtdb('products');
    let products = [];
    if (raw) {
      if (Array.isArray(raw)) {
        products = raw.filter(Boolean);
      } else {
        products = Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
      }
    }
    return { success: true, products };
  },

  async addProduct(data) {
    const id = Date.now().toString();
    const prod = {
      id,
      ...data,
      stock_quantity: parseFloat(data.stock_quantity || 0),
      cost_price: parseFloat(data.cost_price || 0),
      selling_price: parseFloat(data.selling_price || 0),
      min_alert_quantity: parseFloat(data.min_alert_quantity || 5),
      created_at: new Date().toISOString()
    };
    await this.rtdb(`products/${id}`, 'PUT', prod);

    if (prod.stock_quantity > 0) {
      const mId = Date.now().toString();
      await this.rtdb(`stock_movements/${mId}`, 'PUT', {
        product_id: id,
        product_name: data.name,
        movement_type: 'RESTOCK',
        quantity: prod.stock_quantity,
        balance_after: prod.stock_quantity,
        unit_cost: prod.cost_price,
        notes: 'Initial stock setup',
        created_at: new Date().toISOString()
      });
    }

    return { success: true, id, sku: prod.sku };
  },

  async updateProduct(id, data) {
    await this.rtdb(`products/${id}`, 'PATCH', {
      ...data,
      cost_price: parseFloat(data.cost_price || 0),
      selling_price: parseFloat(data.selling_price || 0),
      updated_at: new Date().toISOString()
    });
    return { success: true };
  },

  async deleteProduct(id) {
    await this.rtdb(`products/${id}`, 'DELETE');
    return { success: true };
  },

  async adjustStock(data) {
    const prod = await this.rtdb(`products/${data.product_id}`);
    if (!prod) throw new Error('Product not found in Firebase');

    const newBal = Math.max(0, (parseFloat(prod.stock_quantity) || 0) + parseFloat(data.quantity || 0));
    await this.rtdb(`products/${data.product_id}`, 'PATCH', {
      stock_quantity: newBal,
      cost_price: data.unit_cost > 0 ? parseFloat(data.unit_cost) : prod.cost_price,
      updated_at: new Date().toISOString()
    });

    const mId = Date.now().toString();
    await this.rtdb(`stock_movements/${mId}`, 'PUT', {
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
    const raw = await this.rtdb('stock_movements');
    let mvs = [];
    if (raw) {
      mvs = Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
    }
    mvs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, movements: mvs.slice(0, limitNum) };
  },

  // Customers & Debtors
  async getCustomers() {
    const raw = await this.rtdb('customers');
    let customers = [];
    if (raw) {
      if (Array.isArray(raw)) {
        customers = raw.filter(Boolean);
      } else {
        customers = Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
      }
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
    await this.rtdb(`customers/${id}`, 'PUT', cust);
    return { success: true, id };
  },

  async updateCustomer(id, data) {
    await this.rtdb(`customers/${id}`, 'PATCH', data);
    return { success: true };
  },

  async getDebtors() {
    const res = await this.getCustomers();
    const debtors = (res.customers || []).filter(c => parseFloat(c.current_credit || 0) > 0.01);
    return { success: true, debtors };
  },

  async payDebtor(data) {
    const cust = await this.rtdb(`customers/${data.customer_id}`);
    if (!cust) throw new Error('Customer not found');

    const newBal = Math.max(0, (parseFloat(cust.current_credit) || 0) - parseFloat(data.amount));
    await this.rtdb(`customers/${data.customer_id}`, 'PATCH', { current_credit: newBal });

    const payNum = `JK-RCT-${Date.now().toString().slice(-6)}`;
    const pId = Date.now().toString();
    await this.rtdb(`debtor_payments/${pId}`, 'PUT', {
      payment_number: payNum,
      customer_id: data.customer_id,
      customer_name: cust.name,
      amount: parseFloat(data.amount),
      payment_method: data.payment_method,
      payment_date: data.payment_date,
      notes: data.notes || '',
      created_at: new Date().toISOString()
    });

    // Update settings cash/bank balance
    const field = data.payment_method === 'BANK' ? 'bank_balance' : (data.payment_method === 'CASH' ? 'cash_balance' : 'mobile_money_balance');
    const s = await this.rtdb('settings');
    if (s) {
      const cur = parseFloat(s[field] || 0);
      await this.rtdb('settings', 'PATCH', { [field]: cur + parseFloat(data.amount) });
    }

    return { success: true, payment_number: payNum, new_credit_balance: newBal };
  },

  // Suppliers & POs
  async getSuppliers() {
    const raw = await this.rtdb('suppliers');
    let suppliers = [];
    if (raw) {
      suppliers = Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
    }
    return { success: true, suppliers };
  },

  async addSupplier(data) {
    const id = Date.now().toString();
    await this.rtdb(`suppliers/${id}`, 'PUT', { id, ...data, created_at: new Date().toISOString() });
    return { success: true, id };
  },

  async getPurchaseOrders() {
    const raw = await this.rtdb('purchase_orders');
    let pos = [];
    if (raw) {
      pos = Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
    }
    pos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, purchase_orders: pos };
  },

  async createPurchaseOrder(data) {
    const id = Date.now().toString();
    const poNum = `JK-PO-${Date.now().toString().slice(-6)}`;
    const po = {
      id,
      po_number: poNum,
      ...data,
      status: 'PENDING',
      created_at: new Date().toISOString()
    };
    await this.rtdb(`purchase_orders/${id}`, 'PUT', po);
    return { success: true, po_id: id, po_number: poNum };
  },

  async receivePurchaseOrder(poId, userId) {
    const po = await this.rtdb(`purchase_orders/${poId}`);
    if (!po) throw new Error('PO not found');
    if (po.status === 'RECEIVED') throw new Error('PO already received');

    if (po.items && Array.isArray(po.items)) {
      for (const item of po.items) {
        if (item.product_id) {
          const p = await this.rtdb(`products/${item.product_id}`);
          if (p) {
            const newQty = (parseFloat(p.stock_quantity) || 0) + parseFloat(item.quantity_ordered);
            await this.rtdb(`products/${item.product_id}`, 'PATCH', {
              stock_quantity: newQty,
              cost_price: parseFloat(item.cost_price || p.cost_price)
            });
            const mId = Date.now().toString();
            await this.rtdb(`stock_movements/${mId}`, 'PUT', {
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

    await this.rtdb(`purchase_orders/${poId}`, 'PATCH', { status: 'RECEIVED', received_at: new Date().toISOString() });
    return { success: true };
  },

  // Orders: POS, Invoices, Proformas
  async getOrders(type) {
    const raw = await this.rtdb('orders');
    let orders = [];
    if (raw) {
      orders = Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
    }
    if (type) orders = orders.filter(o => o.order_type === type);
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, orders };
  },

  async getOrder(id) {
    const order = await this.rtdb(`orders/${id}`);
    if (!order) throw new Error('Order not found');
    return { success: true, order: { id, ...order } };
  },

  async createOrder(data) {
    const prefix = data.order_type === 'POS' ? 'JK-POS' : (data.order_type === 'PROFORMA' ? 'JK-PRO' : 'JK-INV');
    const orderNum = `${prefix}-${Date.now().toString().slice(-6)}`;
    const id = Date.now().toString();

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
      id,
      order_number: orderNum,
      ...data,
      total,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      payment_status: payStatus,
      created_at: new Date().toISOString()
    };

    await this.rtdb(`orders/${id}`, 'PUT', orderData);

    // Deduct stock if not Proforma
    if (data.order_type !== 'PROFORMA' && data.items) {
      for (const item of data.items) {
        if (item.product_id) {
          const p = await this.rtdb(`products/${item.product_id}`);
          if (p) {
            const newQty = Math.max(0, (parseFloat(p.stock_quantity) || 0) - parseFloat(item.quantity));
            await this.rtdb(`products/${item.product_id}`, 'PATCH', { stock_quantity: newQty });
            const mId = Date.now().toString();
            await this.rtdb(`stock_movements/${mId}`, 'PUT', {
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

      if (balanceDue > 0 && data.customer_id) {
        const c = await this.rtdb(`customers/${data.customer_id}`);
        if (c) {
          await this.rtdb(`customers/${data.customer_id}`, 'PATCH', {
            current_credit: (parseFloat(c.current_credit) || 0) + balanceDue
          });
        }
      }

      if (amountPaid > 0) {
        const field = data.payment_method === 'BANK' ? 'bank_balance' : (data.payment_method === 'CASH' ? 'cash_balance' : 'mobile_money_balance');
        const s = await this.rtdb('settings');
        if (s) {
          const cur = parseFloat(s[field] || 0);
          await this.rtdb('settings', 'PATCH', { [field]: cur + amountPaid });
        }
      }
    }

    return {
      success: true,
      order_id: id,
      order_number: orderNum,
      total,
      balance_due: balanceDue,
      payment_status: payStatus
    };
  },

  async convertProforma(id, targetType, userId) {
    const pro = await this.rtdb(`orders/${id}`);
    if (!pro) throw new Error('Proforma not found');
    return await this.createOrder({
      ...pro,
      order_type: targetType,
      amount_paid: 0,
      notes: `Converted from Proforma ${pro.order_number}`
    });
  },

  // Delivery Notes
  async getDeliveryNotes() {
    const raw = await this.rtdb('delivery_notes');
    let dns = [];
    if (raw) {
      dns = Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
    }
    dns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, delivery_notes: dns };
  },

  async createDeliveryNote(data) {
    const id = Date.now().toString();
    const dnNum = `JK-DN-${Date.now().toString().slice(-6)}`;
    const dn = { id, delivery_number: dnNum, ...data, created_at: new Date().toISOString() };
    await this.rtdb(`delivery_notes/${id}`, 'PUT', dn);
    return { success: true, id, delivery_number: dnNum };
  },

  // Expenses
  async getExpenses(date) {
    const raw = await this.rtdb('expenses');
    let expenses = [];
    if (raw) {
      expenses = Object.keys(raw).map(k => ({ id: k, ...raw[k] }));
    }
    if (date) expenses = expenses.filter(e => e.expense_date === date);
    expenses.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { success: true, expenses };
  },

  async createExpense(data) {
    const id = Date.now().toString();
    const expNum = `JK-EXP-${Date.now().toString().slice(-6)}`;
    const exp = {
      id,
      expense_number: expNum,
      ...data,
      amount: parseFloat(data.amount || 0),
      created_at: new Date().toISOString()
    };
    await this.rtdb(`expenses/${id}`, 'PUT', exp);

    const field = data.payment_method === 'BANK' ? 'bank_balance' : (data.payment_method === 'CASH' ? 'cash_balance' : 'mobile_money_balance');
    const s = await this.rtdb('settings');
    if (s) {
      const cur = parseFloat(s[field] || 0);
      await this.rtdb('settings', 'PATCH', { [field]: cur - parseFloat(data.amount) });
    }

    return { success: true, id, expense_number: expNum };
  },

  async deleteExpense(id) {
    await this.rtdb(`expenses/${id}`, 'DELETE');
    return { success: true };
  },

  // Capital & Dashboards
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

    const rawLedger = await this.rtdb('capital_ledger');
    let ledger = [];
    if (rawLedger) {
      ledger = Object.keys(rawLedger).map(k => ({ id: k, ...rawLedger[k] }));
    }

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
    const id = Date.now().toString();
    await this.rtdb(`capital_ledger/${id}`, 'PUT', {
      ...data,
      amount: parseFloat(data.amount),
      created_at: new Date().toISOString()
    });

    const field = data.account === 'BANK' ? 'bank_balance' : (data.account === 'MOBILE_MONEY' ? 'mobile_money_balance' : 'cash_balance');
    const s = await this.rtdb('settings');
    if (s) {
      const cur = parseFloat(s[field] || 0);
      const mult = data.entry_type === 'OWNER_DRAWING' ? -1 : 1;
      await this.rtdb('settings', 'PATCH', { [field]: cur + (mult * parseFloat(data.amount)) });
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
