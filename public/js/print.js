// JENGAKWANZA Printing Engine
// Renders printable Thermal Receipts (80mm / 58mm) and A4 Commercial Documents
// with company logo and mandated business credentials

const Printer = {
  // Company Credentials fallback (always kept up-to-date from settings)
  credentials: {
    company_name: 'JENGAKWANZA LIMITED',
    tagline: 'Building Excellence & Quality Supplies',
    phone_numbers: '0788989889 / 0713550104',
    address: 'P.O.BOX 14991 ARUSHA',
    email: 'jengakwanzaltd@gmail.com',
    currency: 'TZS',
    currency_symbol: 'TSh',
    logo_url: 'assets/logo.jpg'
  },

  init(settings = {}) {
    if (settings) {
      this.credentials = { ...this.credentials, ...settings };
      if (!this.credentials.logo_url) {
        this.credentials.logo_url = 'assets/logo.jpg';
      }
    }
  },

  formatMoney(amount) {
    const val = parseFloat(amount || 0);
    return `${this.credentials.currency_symbol} ${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  },

  formatDate(dateStr) {
    if (!dateStr) return new Date().toLocaleString();
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleString();
  },

  // 1. THERMAL POS RECEIPT (80mm Printable Format)
  renderPosReceipt(order) {
    const cred = this.credentials;
    const items = order.items || [];
    const cashier = order.cashier_name || 'Staff';
    const customer = order.customer_name || 'Walk-in Customer';

    let itemsHtml = items.map(item => `
      <tr>
        <td style="padding: 4px 0; text-align: left; vertical-align: top;">
          <div style="font-weight: bold; font-size: 11.5px; color: #000;">${this.escape(item.product_name || item.name)}</div>
          <div style="font-size: 10px; color: #333;">${item.quantity} ${item.unit || 'pcs'} @ ${this.formatMoney(item.unit_price)}</div>
        </td>
        <td style="padding: 4px 0; text-align: right; vertical-align: top; font-weight: bold; font-size: 11.5px;">
          ${this.formatMoney(item.total_price || (item.quantity * item.unit_price))}
        </td>
      </tr>
    `).join('');

    return `
      <div class="receipt-paper-80mm">
        <div class="receipt-header">
          <img src="${cred.logo_url || 'assets/logo.jpg'}" class="receipt-logo" alt="${this.escape(cred.company_name)}">
          <h2 class="receipt-title">${this.escape(cred.company_name)}</h2>
          <div class="receipt-tagline">${this.escape(cred.tagline || 'Building Excellence & Quality Supplies')}</div>
          <div class="receipt-cred">
            <div>${this.escape(cred.address)}</div>
            <div><strong>Tel:</strong> ${this.escape(cred.phone_numbers)}</div>
            <div><strong>Email:</strong> ${this.escape(cred.email)}</div>
          </div>
        </div>

        <div class="receipt-divider double"></div>

        <div class="receipt-meta-grid">
          <div><span>RECEIPT #:</span> <strong>${this.escape(order.order_number)}</strong></div>
          <div><span>DATE:</span> <strong>${this.formatDate(order.created_at)}</strong></div>
          <div><span>CASHIER:</span> <strong>${this.escape(cashier)}</strong></div>
          <div><span>PAY MODE:</span> <strong>${this.escape(order.payment_method || 'CASH')}</strong></div>
          <div><span>CUSTOMER:</span> <strong>${this.escape(customer)}</strong></div>
          ${order.customer_phone ? `<div><span>PHONE:</span> <strong>${this.escape(order.customer_phone)}</strong></div>` : ''}
        </div>

        <div class="receipt-divider"></div>

        <table class="receipt-items-table">
          <thead>
            <tr>
              <th style="text-align: left;">DESCRIPTION / QTY</th>
              <th style="text-align: right;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="receipt-divider"></div>

        <div class="receipt-totals">
          <div class="row">
            <span>Subtotal:</span>
            <span>${this.formatMoney(order.subtotal || order.total)}</span>
          </div>
          ${order.discount > 0 ? `
            <div class="row" style="color: #c00;">
              <span>Discount:</span>
              <span>-${this.formatMoney(order.discount)}</span>
            </div>
          ` : ''}
          ${order.tax > 0 ? `
            <div class="row">
              <span>VAT / Tax:</span>
              <span>${this.formatMoney(order.tax)}</span>
            </div>
          ` : ''}
          <div class="row grand-total">
            <span>TOTAL AMOUNT:</span>
            <span>${this.formatMoney(order.total)}</span>
          </div>
          <div class="row" style="margin-top: 4px;">
            <span>Amount Paid:</span>
            <span>${this.formatMoney(order.amount_paid || order.total)}</span>
          </div>
          ${(order.balance_due && order.balance_due > 0) ? `
            <div class="row" style="font-weight: bold; color: #b91c1c;">
              <span>BALANCE DUE (CREDIT):</span>
              <span>${this.formatMoney(order.balance_due)}</span>
            </div>
          ` : `
            <div class="row">
              <span>Change Tendered:</span>
              <span>${this.formatMoney(Math.max(0, (order.amount_paid || order.total) - order.total))}</span>
            </div>
          `}
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-barcode-box">
          <div class="simulated-barcode">||| || | | |||| || | || ||||| ||| | |||</div>
          <div class="barcode-text">*${this.escape(order.order_number)}*</div>
        </div>

        <div class="receipt-footer-text">
          <p><strong>${this.escape(cred.receipt_footer || 'Thank you for choosing JENGAKWANZA LIMITED!')}</strong></p>
          <p style="font-size: 9.5px; margin-top: 4px; color: #444;">Goods once sold are not returnable without valid receipt.</p>
          <p style="font-size: 8.5px; margin-top: 3px; color: #777;">Powered by JENGAKWANZA System</p>
        </div>
      </div>
    `;
  },

  // 2. A4 COMMERCIAL INVOICE / PROFORMA INVOICE
  renderA4Invoice(order, isProforma = false) {
    const cred = this.credentials;
    const docTitle = isProforma ? 'PROFORMA INVOICE' : 'TAX INVOICE';
    const items = order.items || [];
    const customer = order.customer_name || 'Customer';

    let itemsHtml = items.map((item, idx) => `
      <tr>
        <td style="text-align: center; width: 36px;">${idx + 1}</td>
        <td>
          <div class="doc-item-title">${this.escape(item.product_name || item.name)}</div>
        </td>
        <td style="text-align: center; width: 65px;">${item.unit || 'pcs'}</td>
        <td style="text-align: center; width: 60px; font-weight: bold;">${item.quantity}</td>
        <td style="text-align: right; width: 105px;">${this.formatMoney(item.unit_price)}</td>
        <td style="text-align: right; width: 115px; font-weight: bold;">${this.formatMoney(item.total_price || (item.quantity * item.unit_price))}</td>
      </tr>
    `).join('');

    return `
      <div class="doc-a4-sheet">
        <div class="doc-header">
          <div class="doc-brand-block">
            <img src="${cred.logo_url || 'assets/logo.jpg'}" class="doc-brand-logo" alt="${this.escape(cred.company_name)}">
            <div class="doc-cred-text">
              <h2 class="doc-company-title">${this.escape(cred.company_name)}</h2>
              <div class="doc-company-tagline">${this.escape(cred.tagline || 'Building Excellence & Quality Supplies')}</div>
              <div class="doc-company-contact">
                <div>${this.escape(cred.address)}</div>
                <div><strong>Tel:</strong> ${this.escape(cred.phone_numbers)}</div>
                <div><strong>Email:</strong> ${this.escape(cred.email)}</div>
              </div>
            </div>
          </div>
          <div class="doc-type-badge">
            <h1>${docTitle}</h1>
            <table class="doc-meta-table">
              <tr>
                <td><strong>Doc Number:</strong></td>
                <td><strong>${this.escape(order.order_number)}</strong></td>
              </tr>
              <tr>
                <td><strong>Date:</strong></td>
                <td>${this.formatDate(order.created_at)}</td>
              </tr>
              ${order.due_date ? `
                <tr>
                  <td><strong>Due Date:</strong></td>
                  <td>${this.escape(order.due_date)}</td>
                </tr>
              ` : ''}
              <tr>
                <td><strong>Status:</strong></td>
                <td><span class="badge ${order.payment_status === 'PAID' ? 'badge-success' : 'badge-danger'}">${this.escape(order.payment_status || 'PENDING')}</span></td>
              </tr>
            </table>
          </div>
        </div>

        <div class="doc-billing-grid">
          <div>
            <h4>BILL TO / CLIENT</h4>
            <div class="doc-client-name">${this.escape(customer)}</div>
            ${order.customer_phone ? `<div><strong>Phone:</strong> ${this.escape(order.customer_phone)}</div>` : ''}
            ${order.customer_address ? `<div><strong>Address:</strong> ${this.escape(order.customer_address)}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <h4>PAYMENT DETAILS</h4>
            <div>
              <div><strong>Payment Method:</strong> ${this.escape(order.payment_method || 'CASH / BANK')}</div>
              <div><strong>Served By:</strong> ${this.escape(order.cashier_name || 'Accounts Desk')}</div>
            </div>
          </div>
        </div>

        <table class="doc-table">
          <thead>
            <tr>
              <th style="text-align: center; width: 36px;">#</th>
              <th>Description / Item Specification</th>
              <th style="text-align: center; width: 65px;">Unit</th>
              <th style="text-align: center; width: 60px;">Qty</th>
              <th style="text-align: right; width: 105px;">Unit Price</th>
              <th style="text-align: right; width: 115px;">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="doc-summary-split">
          <div>
            <div class="doc-terms-box">
              <strong>Terms & Information:</strong>
              <p>
                ${isProforma 
                  ? 'This Proforma Invoice is valid for 14 days from issue date. Stock and prices are subject to confirmation upon final purchase order.' 
                  : 'Official Tax Invoice from JENGAKWANZA LIMITED. Goods remain property of the company until fully paid for.'}
              </p>
              ${order.notes ? `<p style="margin-top: 4px; color: #0f172a;"><strong>Notes:</strong> ${this.escape(order.notes)}</p>` : ''}
            </div>
          </div>
          <div>
            <div class="doc-totals-box">
              <div class="row">
                <span>Subtotal:</span>
                <span>${this.formatMoney(order.subtotal || order.total)}</span>
              </div>
              ${order.discount > 0 ? `
                <div class="row" style="color: #dc2626;">
                  <span>Discount:</span>
                  <span>-${this.formatMoney(order.discount)}</span>
                </div>
              ` : ''}
              ${order.tax > 0 ? `
                <div class="row">
                  <span>VAT / Tax:</span>
                  <span>${this.formatMoney(order.tax)}</span>
                </div>
              ` : ''}
              <div class="row grand-total">
                <span>TOTAL:</span>
                <span style="color: #0d9488;">${this.formatMoney(order.total)}</span>
              </div>
              ${!isProforma ? `
                <div class="row" style="margin-top: 3px;">
                  <span>Paid:</span>
                  <span>${this.formatMoney(order.amount_paid || 0)}</span>
                </div>
                <div class="row" style="margin-top: 2px; font-weight: bold; color: ${order.balance_due > 0 ? '#dc2626' : '#16a34a'};">
                  <span>Balance Due:</span>
                  <span>${this.formatMoney(order.balance_due || 0)}</span>
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        <div class="doc-signature-block">
          <div>
            <div class="signature-line">
              <strong>Prepared / Authorized By</strong><br>
              JENGAKWANZA LIMITED Representative
            </div>
          </div>
          <div>
            <div class="signature-line" style="text-align: right;">
              <strong>Customer Acknowledged & Received</strong><br>
              Signature & Official Stamp
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // 3. A4 DELIVERY NOTE
  renderA4DeliveryNote(dn) {
    const cred = this.credentials;
    const items = dn.items || [];

    let itemsHtml = items.length > 0 ? items.map((item, idx) => `
      <tr>
        <td style="text-align: center; width: 36px;">${idx + 1}</td>
        <td><div class="doc-item-title">${this.escape(item.product_name || item.name)}</div></td>
        <td style="text-align: center; width: 65px;">${item.unit || 'pcs'}</td>
        <td style="text-align: center; width: 65px; font-weight: bold;">${item.quantity}</td>
        <td>${this.escape(item.notes || 'Good Condition')}</td>
      </tr>
    `).join('') : `
      <tr>
        <td style="text-align: center;">1</td>
        <td><div class="doc-item-title">As specified in reference order ${this.escape(dn.order_number || '')}</div></td>
        <td style="text-align: center;">Lot</td>
        <td style="text-align: center; font-weight: bold;">1</td>
        <td>Delivered intact</td>
      </tr>
    `;

    return `
      <div class="doc-a4-sheet">
        <div class="doc-header">
          <div class="doc-brand-block">
            <img src="${cred.logo_url || 'assets/logo.jpg'}" class="doc-brand-logo" alt="${this.escape(cred.company_name)}">
            <div class="doc-cred-text">
              <h2 class="doc-company-title">${this.escape(cred.company_name)}</h2>
              <div class="doc-company-tagline">${this.escape(cred.tagline || 'Building Excellence & Quality Supplies')}</div>
              <div class="doc-company-contact">
                <div>${this.escape(cred.address)}</div>
                <div><strong>Tel:</strong> ${this.escape(cred.phone_numbers)}</div>
                <div><strong>Email:</strong> ${this.escape(cred.email)}</div>
              </div>
            </div>
          </div>
          <div class="doc-type-badge">
            <h1 style="color: #0284c7;">DELIVERY NOTE</h1>
            <table class="doc-meta-table">
              <tr>
                <td><strong>DN Number:</strong></td>
                <td><strong>${this.escape(dn.delivery_number)}</strong></td>
              </tr>
              <tr>
                <td><strong>Date:</strong></td>
                <td>${this.formatDate(dn.delivery_date || dn.created_at)}</td>
              </tr>
              ${dn.order_number ? `
                <tr>
                  <td><strong>Order Ref:</strong></td>
                  <td>${this.escape(dn.order_number)}</td>
                </tr>
              ` : ''}
            </table>
          </div>
        </div>

        <div class="doc-billing-grid">
          <div>
            <h4>DELIVERY DESTINATION & RECIPIENT</h4>
            <div class="doc-client-name">${this.escape(dn.customer_name)}</div>
            <div style="color: #334155; margin-top: 2px;">
              <strong>Delivery Address:</strong> ${this.escape(dn.delivery_address || 'Arusha')}
            </div>
            ${dn.customer_phone ? `<div style="color: #334155;"><strong>Contact Phone:</strong> ${this.escape(dn.customer_phone)}</div>` : ''}
          </div>
          <div>
            <h4>DISPATCH & LOGISTICS INFO</h4>
            <div style="color: #334155;">
              <div><strong>Transporter / Driver:</strong> ${this.escape(dn.transporter_name || 'Company Logistics')}</div>
              <div><strong>Vehicle Reg No:</strong> ${this.escape(dn.vehicle_number || 'N/A')}</div>
              <div><strong>Dispatched By:</strong> ${this.escape(dn.dispatched_by_name || 'Storekeeper')}</div>
            </div>
          </div>
        </div>

        <table class="doc-table">
          <thead>
            <tr>
              <th style="text-align: center; width: 36px;">#</th>
              <th>Item Description</th>
              <th style="text-align: center; width: 65px;">Unit</th>
              <th style="text-align: center; width: 65px;">Qty Dispatched</th>
              <th>Condition / Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        ${dn.notes ? `
          <div class="doc-info-box" style="margin-bottom: 8px;">
            <strong>Special Dispatch Instructions / Notes:</strong> ${this.escape(dn.notes)}
          </div>
        ` : ''}

        <div class="doc-info-box doc-ack-box">
          <strong>Acknowledgment:</strong> Received all above goods in sound condition, correct quantities, and satisfactory specification.
        </div>

        <div class="doc-signature-block">
          <div>
            <div class="signature-line">
              <strong>Dispatched By (Logistics / Warehouse)</strong><br>
              Name & Signature: _________________________
            </div>
          </div>
          <div>
            <div class="signature-line" style="text-align: right;">
              <strong>Received In Good Order By (Customer / Agent)</strong><br>
              Name, Signature & Date: _________________________
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // 4. DEBTOR PAYMENT RECEIPT (80mm Thermal Format)
  renderDebtorPaymentReceipt(payment, customer) {
    const cred = this.credentials;

    return `
      <div class="receipt-paper-80mm">
        <div class="receipt-header">
          <img src="${cred.logo_url || 'assets/logo.jpg'}" class="receipt-logo" alt="${this.escape(cred.company_name)}">
          <h2 class="receipt-title">${this.escape(cred.company_name)}</h2>
          <div class="receipt-tagline">${this.escape(cred.tagline || 'Building Excellence & Quality Supplies')}</div>
          <div class="receipt-cred">
            <div>${this.escape(cred.address)}</div>
            <div><strong>Tel:</strong> ${this.escape(cred.phone_numbers)}</div>
            <div><strong>Email:</strong> ${this.escape(cred.email)}</div>
          </div>
        </div>

        <div class="receipt-divider double"></div>

        <div style="text-align: center; font-weight: 800; font-size: 12px; margin: 4px 0; text-transform: uppercase;">
          OFFICIAL PAYMENT RECEIPT<br>
          <span style="font-size: 10px; font-weight: normal; color: #444;">(DEBT COLLECTION / CREDIT SETTLEMENT)</span>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-meta-grid">
          <div><span>RECEIPT #:</span> <strong>${this.escape(payment.payment_number)}</strong></div>
          <div><span>DATE:</span> <strong>${this.formatDate(payment.payment_date || payment.created_at)}</strong></div>
          <div><span>RECEIVED FROM:</span> <strong>${this.escape(customer.name)}</strong></div>
          ${customer.phone ? `<div><span>PHONE:</span> <strong>${this.escape(customer.phone)}</strong></div>` : ''}
          <div><span>PAY METHOD:</span> <strong>${this.escape(payment.payment_method)}</strong></div>
          <div><span>OFFICER:</span> <strong>${this.escape(payment.user_name || 'Accounts Desk')}</strong></div>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-totals" style="margin: 8px 0;">
          <div class="row grand-total">
            <span>AMOUNT PAID:</span>
            <span>${this.formatMoney(payment.amount)}</span>
          </div>
          ${payment.notes ? `
            <div class="row" style="font-size: 11px; margin-top: 6px;">
              <span>Remarks / Ref:</span>
              <span>${this.escape(payment.notes)}</span>
            </div>
          ` : ''}
          <div class="row" style="font-size: 11.5px; margin-top: 6px; font-weight: bold; color: #b91c1c;">
            <span>REMAINING DEBT:</span>
            <span>${this.formatMoney(payment.new_credit_balance !== undefined ? payment.new_credit_balance : customer.current_credit)}</span>
          </div>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-barcode-box">
          <div class="simulated-barcode">||| || | | |||| || | || ||||| ||| | |||</div>
          <div class="barcode-text">*${this.escape(payment.payment_number)}*</div>
        </div>

        <div class="receipt-footer-text">
          <p><strong>Thank you for settling your account with JENGAKWANZA LIMITED!</strong></p>
          <p style="font-size: 9px; margin-top: 4px; color: #666;">Official Computer-Generated Receipt</p>
        </div>
      </div>
    `;
  },

  // 5. PURCHASE ORDER DOCUMENT (A4 Format)
  renderA4PurchaseOrder(po) {
    const cred = this.credentials;
    const items = po.items || [];

    let itemsHtml = items.map((item, idx) => `
      <tr>
        <td style="text-align: center; width: 36px;">${idx + 1}</td>
        <td><div class="doc-item-title">${this.escape(item.product_name || item.name)}</div></td>
        <td style="text-align: center; width: 65px;">${item.unit || 'pcs'}</td>
        <td style="text-align: center; width: 65px; font-weight: bold;">${item.quantity_ordered || item.quantity}</td>
        <td style="text-align: right; width: 105px;">${this.formatMoney(item.cost_price)}</td>
        <td style="text-align: right; width: 115px; font-weight: bold;">${this.formatMoney(item.total_price || (item.quantity_ordered * item.cost_price))}</td>
      </tr>
    `).join('');

    return `
      <div class="doc-a4-sheet">
        <div class="doc-header">
          <div class="doc-brand-block">
            <img src="${cred.logo_url || 'assets/logo.jpg'}" class="doc-brand-logo" alt="${this.escape(cred.company_name)}">
            <div class="doc-cred-text">
              <h2 class="doc-company-title">${this.escape(cred.company_name)}</h2>
              <div class="doc-company-tagline">${this.escape(cred.tagline || 'Building Excellence & Quality Supplies')}</div>
              <div class="doc-company-contact">
                <div>${this.escape(cred.address)}</div>
                <div><strong>Tel:</strong> ${this.escape(cred.phone_numbers)}</div>
                <div><strong>Email:</strong> ${this.escape(cred.email)}</div>
              </div>
            </div>
          </div>
          <div class="doc-type-badge">
            <h1 style="color: #7c3aed;">PURCHASE ORDER</h1>
            <table class="doc-meta-table">
              <tr>
                <td><strong>PO Number:</strong></td>
                <td><strong>${this.escape(po.po_number)}</strong></td>
              </tr>
              <tr>
                <td><strong>Date:</strong></td>
                <td>${this.formatDate(po.created_at)}</td>
              </tr>
              ${po.expected_date ? `
                <tr>
                  <td><strong>Expected Delivery:</strong></td>
                  <td>${this.escape(po.expected_date)}</td>
                </tr>
              ` : ''}
              <tr>
                <td><strong>Status:</strong></td>
                <td><span class="badge ${po.status === 'RECEIVED' ? 'badge-success' : 'badge-warning'}">${this.escape(po.status || 'PENDING')}</span></td>
              </tr>
            </table>
          </div>
        </div>

        <div class="doc-billing-grid">
          <div>
            <h4>VENDOR / SUPPLIER</h4>
            <div class="doc-client-name">${this.escape(po.supplier_name || 'Supplier')}</div>
            ${po.supplier_phone ? `<div><strong>Phone:</strong> ${this.escape(po.supplier_phone)}</div>` : ''}
            ${po.supplier_address ? `<div><strong>Address:</strong> ${this.escape(po.supplier_address)}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <h4>SHIP TO</h4>
            <div style="color: #334155;">
              <strong>${this.escape(cred.company_name)}</strong><br>
              Central Store & Warehouse<br>
              ${this.escape(cred.address)}<br>
              Attn: ${this.escape(po.created_by_name || 'Procurement Office')}
            </div>
          </div>
        </div>

        <table class="doc-table">
          <thead>
            <tr>
              <th style="text-align: center; width: 36px;">#</th>
              <th>Item / Material Description</th>
              <th style="text-align: center; width: 65px;">Unit</th>
              <th style="text-align: center; width: 65px;">Qty Ordered</th>
              <th style="text-align: right; width: 105px;">Unit Cost</th>
              <th style="text-align: right; width: 115px;">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="doc-summary-split">
          <div>
            ${po.notes ? `
              <div class="doc-terms-box">
                <strong>Order Instructions:</strong> ${this.escape(po.notes)}
              </div>
            ` : ''}
          </div>
          <div>
            <div class="doc-totals-box">
              <div class="row grand-total" style="border-top: none; padding-top: 0;">
                <span>PO TOTAL:</span>
                <span style="color: #7c3aed;">${this.formatMoney(po.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="doc-signature-block">
          <div>
            <div class="signature-line">
              <strong>Authorized Procurement Officer</strong><br>
              JENGAKWANZA LIMITED
            </div>
          </div>
          <div>
            <div class="signature-line" style="text-align: right;">
              <strong>Supplier Acceptance & Stamp</strong><br>
              Signature & Date: _________________________
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // 6. A4 DAILY FINANCIAL & OPERATIONAL REPORT
  renderA4DailyReport(rep, date) {
    const cred = this.credentials;
    const orders = rep.orders || [];
    const expenses = rep.expenses || [];

    return `
      <div class="doc-a4-sheet">
        <div class="doc-header">
          <div class="doc-brand-block">
            <img src="${cred.logo_url || 'assets/logo.jpg'}" class="doc-brand-logo" alt="${this.escape(cred.company_name)}">
            <div class="doc-cred-text">
              <h2 class="doc-company-title">${this.escape(cred.company_name)}</h2>
              <div class="doc-company-tagline">${this.escape(cred.tagline || 'Building Excellence & Quality Supplies')}</div>
              <div class="doc-company-contact">
                <div>${this.escape(cred.address)}</div>
                <div><strong>Tel:</strong> ${this.escape(cred.phone_numbers)}</div>
                <div><strong>Email:</strong> ${this.escape(cred.email)}</div>
              </div>
            </div>
          </div>
          <div class="doc-type-badge">
            <h1 style="color: #0d9488;">DAILY AUDIT REPORT</h1>
            <table class="doc-meta-table">
              <tr>
                <td><strong>Report Date:</strong></td>
                <td><strong>${this.formatDate(date)}</strong></td>
              </tr>
              <tr>
                <td><strong>Generated:</strong></td>
                <td>${new Date().toLocaleString()}</td>
              </tr>
            </table>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 10px;">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 6px 8px; border-radius: 4px; text-align: center;">
            <div style="font-size: 9.5px; text-transform: uppercase; color: #166534; font-weight: 700;">Total Sales</div>
            <div style="font-size: 15px; font-weight: 900; color: #15803d; margin-top: 2px;">${this.formatMoney(rep.total_sales || 0)}</div>
          </div>
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 6px 8px; border-radius: 4px; text-align: center;">
            <div style="font-size: 9.5px; text-transform: uppercase; color: #991b1b; font-weight: 700;">Total Expenses</div>
            <div style="font-size: 15px; font-weight: 900; color: #b91c1c; margin-top: 2px;">${this.formatMoney(rep.total_expenses || 0)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 8px; border-radius: 4px; text-align: center;">
            <div style="font-size: 9.5px; text-transform: uppercase; color: #334155; font-weight: 700;">Daily Net Result</div>
            <div style="font-size: 15px; font-weight: 900; color: #0f172a; margin-top: 2px;">${this.formatMoney(rep.net_profit || 0)}</div>
          </div>
        </div>

        <h3 style="font-size: 11px; margin: 4px 0 3px; color: #0f172a; text-transform: uppercase; font-weight: 800;">Sales Transactions</h3>
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width: 50px;">Time</th>
              <th>Order #</th>
              <th>Staff / Cashier</th>
              <th>Customer</th>
              <th>Payment Method</th>
              <th style="text-align: right; width: 100px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${orders.length > 0 ? orders.map(o => `
              <tr>
                <td>${new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td><strong>${this.escape(o.order_number)}</strong></td>
                <td>${this.escape(o.worker_name || 'Staff')}</td>
                <td>${this.escape(o.customer_name)}</td>
                <td>${this.escape(o.payment_method)}</td>
                <td style="text-align: right; font-weight: bold;">${this.formatMoney(o.total)}</td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="6" style="text-align: center; color: #64748b; padding: 8px;">No sales transactions recorded on this date.</td>
              </tr>
            `}
          </tbody>
        </table>

        ${expenses.length > 0 ? `
          <h3 style="font-size: 11px; margin: 6px 0 3px; color: #0f172a; text-transform: uppercase; font-weight: 800;">Daily Expenses</h3>
          <table class="doc-table">
            <thead>
              <tr>
                <th style="width: 65px;">Voucher #</th>
                <th>Category</th>
                <th>Description</th>
                <th>Source</th>
                <th style="text-align: right; width: 95px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${expenses.map(e => `
                <tr>
                  <td><strong>${this.escape(e.voucher_number || '-')}</strong></td>
                  <td>${this.escape(e.category)}</td>
                  <td>${this.escape(e.description)}</td>
                  <td>${this.escape(e.payment_source)}</td>
                  <td style="text-align: right; font-weight: bold; color: #b91c1c;">${this.formatMoney(e.amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        <div class="doc-signature-block">
          <div>
            <div class="signature-line">
              <strong>Prepared By (Duty Officer / Cashier)</strong><br>
              Signature & Date: _________________________
            </div>
          </div>
          <div>
            <div class="signature-line" style="text-align: right;">
              <strong>Approved By (Management / Auditor)</strong><br>
              Signature & Official Stamp: _________________________
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // Modal Print Preview Display & Print Trigger
  showPrintPreview(htmlContent, title = 'Document Preview') {
    const isA4 = htmlContent.includes('doc-a4-sheet');
    document.body.setAttribute('data-print-mode', isA4 ? 'a4' : 'receipt');
    document.body.classList.toggle('printing-a4', isA4);
    document.body.classList.toggle('printing-receipt', !isA4);

    let previewModal = document.getElementById('print-preview-modal');
    if (!previewModal) {
      previewModal = document.createElement('div');
      previewModal.id = 'print-preview-modal';
      previewModal.className = 'modal-overlay';
      previewModal.innerHTML = `
        <div class="modal-box xl">
          <div class="modal-header">
            <h3 id="print-modal-title">Print Preview</h3>
            <button class="modal-close-btn" onclick="Printer.closePrintPreview()">&times;</button>
          </div>
          <div class="modal-body" style="background: #f1f5f9; display: flex; justify-content: center; padding: 16px; overflow-y: auto;">
            <div id="print-preview-content"></div>
          </div>
          <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 12px; color: #475569;" id="print-paper-indicator">
              ${isA4 ? '📄 Formatted to fit on 1 A4 Page' : '🧾 Thermal Receipt Format (80mm)'}
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" onclick="Printer.closePrintPreview()">Close</button>
              <button class="btn btn-primary" onclick="window.print()">
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                Print Document
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(previewModal);
    } else {
      const ind = document.getElementById('print-paper-indicator');
      if (ind) {
        ind.textContent = isA4 ? '📄 Formatted to fit on 1 A4 Page' : '🧾 Thermal Receipt Format (80mm)';
      }
    }

    document.getElementById('print-modal-title').textContent = title;
    document.getElementById('print-preview-content').innerHTML = htmlContent;
    previewModal.classList.add('active');
  },

  closePrintPreview() {
    const modal = document.getElementById('print-preview-modal');
    if (modal) modal.classList.remove('active');
    document.body.removeAttribute('data-print-mode');
    document.body.classList.remove('printing-a4', 'printing-receipt');
  },

  escape(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};
