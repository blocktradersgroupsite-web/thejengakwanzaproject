// JENGAKWANZA Application State & Store
const State = {
  currentUser: null,
  activeShift: null,
  currentRoute: 'dashboard',
  settings: {},
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

  setSettings(settings) {
    this.settings = settings || {};
    Printer.init(this.settings);
  },

  // Cart operations for POS
  addToCart(product, qty = 1) {
    const existing = this.cart.find(item => String(item.product_id) === String(product.id));
    if (existing) {
      existing.quantity += qty;
      existing.total_price = existing.quantity * existing.unit_price;
    } else {
      this.cart.push({
        product_id: product.id,
        product_name: product.name,
        image_url: product.image_url || '',
        unit: product.unit || 'pcs',
        cost_price: parseFloat(product.cost_price || 0),
        unit_price: parseFloat(product.selling_price || 0),
        quantity: qty,
        total_price: qty * parseFloat(product.selling_price || 0)
      });
    }
  },

  updateCartQty(productId, qty) {
    const item = this.cart.find(i => String(i.product_id) === String(productId));
    if (item) {
      item.quantity = Math.max(0.1, parseFloat(qty));
      item.total_price = item.quantity * item.unit_price;
    }
  },

  removeFromCart(productId) {
    this.cart = this.cart.filter(i => String(i.product_id) !== String(productId));
  },

  clearCart() {
    this.cart = [];
    this.cartCustomer = null;
  },

  getCartSubtotal() {
    return this.cart.reduce((sum, item) => sum + (item.total_price || 0), 0);
  },

  formatMoney(amount) {
    const val = parseFloat(amount || 0);
    const sym = this.settings.currency_symbol || 'TSh';
    return `${sym} ${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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
