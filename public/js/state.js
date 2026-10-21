// JENGAKWANZA Application State & Store
const State = {
  currentUser: null,
  activeShift: null,
  currentRoute: 'dashboard',
  settings: {},
  branches: [],
  currentBranch: localStorage.getItem('jengakwanza_current_branch') || 'all',
  cart: [],
  cartCustomer: null,
  selectedReportDate: new Date().toISOString().split('T')[0],

  init() {
    // Load stored user session if any
    const savedUser = localStorage.getItem('jengakwanza_auth_user');
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
      } catch (e) {
        localStorage.removeItem('jengakwanza_auth_user');
      }
    }
    const savedBranch = localStorage.getItem('jengakwanza_current_branch');
    if (savedBranch) {
      this.currentBranch = savedBranch;
    }
  },

  setUser(user) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem('jengakwanza_auth_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('jengakwanza_auth_user');
      this.activeShift = null;
    }
  },

  setBranches(branches) {
    this.branches = Array.isArray(branches) ? branches : [];
  },

  setCurrentBranch(branchId) {
    this.currentBranch = branchId || 'all';
    localStorage.setItem('jengakwanza_current_branch', this.currentBranch);
  },

  getBranches() {
    return Array.isArray(this.branches) ? this.branches : [];
  },

  getCurrentBranch() {
    if (!this.currentBranch || this.currentBranch === 'all') return null;
    return this.branches.find(b => String(b.id) === String(this.currentBranch)) || null;
  },

  getCurrentBranchName() {
    if (!this.currentBranch || this.currentBranch === 'all') return 'All Branches (Consolidated)';
    const b = this.branches.find(x => String(x.id) === String(this.currentBranch));
    return b ? b.name : 'Main Shop';
  },

  isAdmin() {
    if (!this.currentUser) return false;
    const role = String(this.currentUser.role || '').toLowerCase();
    const user = String(this.currentUser.username || '').toLowerCase();
    return user === 'admin' || role === 'admin' || role === 'manager' || role === 'owner';
  },

  setSettings(settings) {
    this.settings = settings || {};
    Printer.init(this.settings);
  },

  escape(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Cart operations for POS
  addToCart(product, qty = 1) {
    if (!this.cart || !Array.isArray(this.cart)) {
      this.cart = [];
    }
    const targetId = String(product.id !== undefined && product.id !== null ? product.id : '');
    const existing = this.cart.find(item => String(item.product_id) === targetId);
    const quantity = parseFloat(qty) || 1;
    const unitPrice = parseFloat(product.selling_price || product.unit_price || 0) || 0;
    const costPrice = parseFloat(product.cost_price || 0) || 0;

    if (existing) {
      existing.quantity = Math.round((existing.quantity + quantity) * 100) / 100;
      existing.total_price = existing.quantity * existing.unit_price;
    } else {
      this.cart.push({
        product_id: product.id,
        product_name: product.name || 'Product',
        image_url: product.image_url || '',
        unit: product.unit || 'pcs',
        cost_price: costPrice,
        unit_price: unitPrice,
        quantity: quantity,
        total_price: quantity * unitPrice
      });
    }
  },

  updateCartQty(productId, qty) {
    if (!this.cart) this.cart = [];
    const item = this.cart.find(i => String(i.product_id) === String(productId));
    if (item) {
      item.quantity = Math.max(0.1, parseFloat(qty) || 1);
      item.total_price = item.quantity * item.unit_price;
    }
  },

  removeFromCart(productId) {
    if (!this.cart) this.cart = [];
    this.cart = this.cart.filter(i => String(i.product_id) !== String(productId));
  },

  clearCart() {
    this.cart = [];
    this.cartCustomer = null;
  },

  getCartSubtotal() {
    if (!this.cart || !Array.isArray(this.cart)) return 0;
    return this.cart.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);
  },

  formatMoney(amount) {
    const val = parseFloat(amount || 0);
    const sym = (this.settings && this.settings.currency_symbol) || 'TSh';
    const safeVal = isNaN(val) ? 0 : val;
    return `${sym} ${safeVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-GB');
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleString('en-GB');
  },

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : (type === 'error' ? '⚠' : 'ℹ')}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
};

State.init();
