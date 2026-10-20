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
    logo_url: 'assets/logo.svg'
  },

  init(settings = {}) {
    if (settings) {
      this.credentials = { ...this.credentials, ...settings };
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

  // 1. THERMAL POS RECEIPT (80mm)
  renderPosReceipt(order) {
    const cred = this.credentials;
    const items = order.items || [];
    const cashier = order.cashier_name || 'Cashier';
    const customer = order.customer_name || 'Walk-in Customer';

    let itemsHtml = items.map(item => `
      <tr>
        <td style="padding: 4px 0; text-align: left;">
          <div><strong>${this.escape(item.product_name || item.name)}</strong></div>
          <div style="font-size: 10px; color: #555;">${item.quantity} ${item.unit || 'pcs'} x ${this.formatMoney(item.unit_price)}</div>
        </td>
        <td style="padding: 4px 0; text-align: right; vertical-align: bottom;">
          <strong>${this.formatMoney(item.total_price || (item.quantity * item.unit_price))}</strong>
        </td>
      </tr>
    `).join('');

    return `
      <div class="receipt-paper-80mm">
        <div class="receipt-header">
          <img src="${cred.logo_url || 'assets/logo.svg'}" class="receipt-logo" alt="JENGAKWANZA Logo" onerror="this.style.display='none'">
          <h2>${this.escape(cred.company_name)}</h2>
          <div class="receipt-cred">
            <strong>Tel:</strong> ${this.escape(cred.phone_numbers)}<br>
            <strong>${this.escape(cred.address)}</strong><br>
            <strong>Email:</strong> ${this.escape(cred.email)}
          </div>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-meta-row">
          <span><strong>RECEIPT #:</strong> ${this.escape(order.order_number)}</span>
          <span>${this.formatDate(order.created_at)}</span>
        </div>
        <div class="receipt-meta-row">
          <span><strong>Cashier:</strong> ${this.escape(cashier)}</span>
          <span><strong>Pay Mode:</strong> ${this.escape(order.payment_method || 'CASH')}</span>
        </div>
        <div class="receipt-meta-row">
          <span><strong>Customer:</strong> ${this.escape(customer)}</span>
          <span>${order.customer_phone ? this.escape(order.customer_phone) : ''}</span>
        </div>

        <div class="receipt-divider"></div>

        <table class="receipt-items-table">
          <thead>
            <tr>
              <th style="text-align: left;">ITEM / QTY</th>
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
            <span>TOTAL:</span>
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
              <span>${this.formatMoney((order.amount_paid || order.total) - order.total)}</span>
            </div>
          `}
        </div>

        <div class="receipt-footer-text">
          <p>${this.escape(cred.receipt_footer || 'Thank you for choosing JENGAKWANZA LIMITED!')}</p>
          <p style="font-size: 9px; margin-top: 4px; color: #666;">Generated by JENGAKWANZA POS System</p>
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
        <td style="text-align: center; width: 40px;">${idx + 1}</td>
        <td>
          <strong>${this.escape(item.product_name || item.name)}</strong>
        </td>
        <td style="text-align: center; width: 80px;">${item.unit || 'pcs'}</td>
        <td style="text-align: center; width: 70px;">${item.quantity}</td>
        <td style="text-align: right; width: 110px;">${this.formatMoney(item.unit_price)}</td>
        <td style="text-align: right; width: 120px; font-weight: bold;">${this.formatMoney(item.total_price || (item.quantity * item.unit_price))}</td>
      </tr>
    `).join('');

    return `
      <div class="doc-a4-sheet">
        <div class="doc-header">
          <div class="doc-brand-block">
            <img src="${cred.logo_url || 'assets/logo.svg'}" alt="JENGAKWANZA" onerror="this.style.display='none'">
            <div class="doc-cred-text">
              <strong>${this.escape(cred.company_name)}</strong><br>
              ${this.escape(cred.address)}<br>
              <strong>Tel:</strong> ${this.escape(cred.phone_numbers)}<br>
              <strong>Email:</strong> ${this.escape(cred.email)}
            </div>
          </div>
          <div class="doc-type-badge">
            <h1>${docTitle}</h1>
            <table class="doc-meta-table" style="margin-left: auto;">
              <tr>
                <td><strong>Doc Number:</strong></td>
                <td>${this.escape(order.order_number)}</td>
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
            <h4 style="font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">BILL TO / CLIENT</h4>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a;">${this.escape(customer)}</div>
            ${order.customer_phone ? `<div style="color: #475569; font-size: 12px;"><strong>Phone:</strong> ${this.escape(order.customer_phone)}</div>` : ''}
            ${order.customer_address ? `<div style="color: #475569; font-size: 12px;"><strong>Address:</strong> ${this.escape(order.customer_address)}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <h4 style="font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">PAYMENT DETAILS</h4>
            <div style="font-size: 12px; color: #334155;">
              <div><strong>Payment Method:</strong> ${this.escape(order.payment_method || 'CASH / BANK')}</div>
              <div><strong>Served By:</strong> ${this.escape(order.cashier_name || 'Accounts Desk')}</div>
            </div>
          </div>
        </div>

        <table class="doc-table">
          <thead>
            <tr>
              <th style="text-align: center;">#</th>
              <th>Description / Item Specification</th>
              <th style="text-align: center;">Unit</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Unit Price</th>
              <th style="text-align: right;">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="doc-summary-split">
          <div>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; font-size: 12px;">
              <strong>Terms & Information:</strong>
              <p style="margin-top: 4px; color: #475569;">
                ${isProforma 
                  ? 'This Proforma Invoice is valid for 14 days from issue date. Stock and prices are subject to confirmation upon final purchase order.' 
                  : 'Official Tax Invoice from JENGAKWANZA LIMITED. Goods remain property of the company until fully paid for.'}
              </p>
              ${order.notes ? `<p style="margin-top: 6px; color: #0f172a;"><strong>Notes:</strong> ${this.escape(order.notes)}</p>` : ''}
            </div>
          </div>
          <div>
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12.5px;">
                <span>Subtotal:</span>
                <span>${this.formatMoney(order.subtotal || order.total)}</span>
              </div>
              ${order.discount > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12.5px; color: #dc2626;">
                  <span>Discount:</span>
                  <span>-${this.formatMoney(order.discount)}</span>
                </div>
              ` : ''}
              ${order.tax > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12.5px;">
                  <span>VAT / Tax:</span>
                  <span>${this.formatMoney(order.tax)}</span>
                </div>
              ` : ''}
              <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 2px solid #0f172a; font-size: 15px; font-weight: bold;">
                <span>TOTAL:</span>
                <span style="color: #0d9488;">${this.formatMoney(order.total)}</span>
              </div>
              ${!isProforma ? `
                <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 12.5px;">
                  <span>Paid:</span>
                  <span>${this.formatMoney(order.amount_paid || 0)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 13px; font-weight: bold; color: ${order.balance_due > 0 ? '#dc2626' : '#16a34a'};">
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
        <td style="text-align: center; width: 40px;">${idx + 1}</td>
        <td><strong>${this.escape(item.product_name || item.name)}</strong></td>
        <td style="text-align: center; width: 80px;">${item.unit || 'pcs'}</td>
        <td style="text-align: center; width: 80px; font-weight: bold;">${item.quantity}</td>
        <td>${this.escape(item.notes || 'Good Condition')}</td>
      </tr>
    `).join('') : `
      <tr>
        <td style="text-align: center;">1</td>
        <td><strong>As specified in reference order ${this.escape(dn.order_number || '')}</strong></td>
        <td style="text-align: center;">Lot</td>
        <td style="text-align: center; font-weight: bold;">1</td>
        <td>Delivered intact</td>
      </tr>
    `;

    return `
      <div class="doc-a4-sheet">
        <div class="doc-header">
          <div class="doc-brand-block">
            <img src="${cred.logo_url || 'assets/logo.svg'}" alt="JENGAKWANZA" onerror="this.style.display='none'">
            <div class="doc-cred-text">
              <strong>${this.escape(cred.company_name)}</strong><br>
              ${this.escape(cred.address)}<br>
              <strong>Tel:</strong> ${this.escape(cred.phone_numbers)}<br>
              <strong>Email:</strong> ${this.escape(cred.email)}
            </div>
          </div>
          <div class="doc-type-badge">
            <h1 style="color: #0284c7;">DELIVERY NOTE</h1>
            <table class="doc-meta-table" style="margin-left: auto;">
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
            <h4 style="font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">DELIVERY DESTINATION & RECIPIENT</h4>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a;">${this.escape(dn.customer_name)}</div>
            <div style="color: #334155; font-size: 12.5px; margin-top: 3px;">
              <strong>Delivery Address:</strong> ${this.escape(dn.delivery_address || 'Arusha')}
            </div>
            ${dn.customer_phone ? `<div style="color: #334155; font-size: 12.5px;"><strong>Contact Phone:</strong> ${this.escape(dn.customer_phone)}</div>` : ''}
          </div>
          <div>
            <h4 style="font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">DISPATCH & LOGISTICS INFO</h4>
            <div style="font-size: 12.5px; color: #334155;">
              <div><strong>Transporter / Driver:</strong> ${this.escape(dn.transporter_name || 'Company Logistics')}</div>
              <div><strong>Vehicle Reg No:</strong> ${this.escape(dn.vehicle_number || 'N/A')}</div>
              <div><strong>Dispatched By:</strong> ${this.escape(dn.dispatched_by_name || 'Storekeeper')}</div>
            </div>
          </div>
        </div>

        <table class="doc-table">
          <thead>
            <tr>
              <th style="text-align: center;">#</th>
              <th>Item Description</th>
              <th style="text-align: center;">Unit</th>
              <th style="text-align: center;">Quantity Dispatched</th>
              <th>Condition / Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        ${dn.notes ? `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 6px; font-size: 12px; margin-bottom: 20px;">
            <strong>Special Dispatch Instructions / Notes:</strong> ${this.escape(dn.notes)}
          </div>
        ` : ''}

        <div style="font-size: 12px; color: #475569; margin-top: 14px; padding: 8px 12px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 4px;">
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

  // 4. DEBTOR PAYMENT RECEIPT
  renderDebtorPaymentReceipt(payment, customer) {
    const cred = this.credentials;

    return `
      <div class="receipt-paper-80mm">
        <div class="receipt-header">
          <img src="${cred.logo_url || 'assets/logo.svg'}" class="receipt-logo" alt="JENGAKWANZA Logo" onerror="this.style.display='none'">
          <h2>${this.escape(cred.company_name)}</h2>
          <div class="receipt-cred">
            <strong>Tel:</strong> ${this.escape(cred.phone_numbers)}<br>
            <strong>${this.escape(cred.address)}</strong><br>
            <strong>Email:</strong> ${this.escape(cred.email)}
          </div>
        </div>

        <div class="receipt-divider"></div>

        <div style="text-align: center; font-weight: bold; font-size: 13px; margin: 4px 0;">
          OFFICIAL PAYMENT RECEIPT<br>
          <span style="font-size: 11px; font-weight: normal; color: #555;">(DEBT COLLECTION / CREDIT SETTLEMENT)</span>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-meta-row">
          <span><strong>Receipt #:</strong> ${this.escape(payment.payment_number)}</span>
          <span>${this.formatDate(payment.payment_date || payment.created_at)}</span>
        </div>
        <div class="receipt-meta-row">
          <span><strong>Received From:</strong> ${this.escape(customer.name)}</span>
          <span>${customer.phone ? this.escape(customer.phone) : ''}</span>
        </div>
        <div class="receipt-meta-row">
          <span><strong>Payment Mode:</strong> ${this.escape(payment.payment_method)}</span>
          <span><strong>Officer:</strong> ${this.escape(payment.user_name || 'Cashier')}</span>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-totals" style="margin: 10px 0;">
          <div class="row grand-total" style="font-size: 15px;">
            <span>AMOUNT PAID:</span>
            <span>${this.formatMoney(payment.amount)}</span>
          </div>
          ${payment.notes ? `
            <div class="row" style="font-size: 11px; margin-top: 6px;">
              <span>Remarks:</span>
              <span>${this.escape(payment.notes)}</span>
            </div>
          ` : ''}
          <div class="row" style="font-size: 12px; margin-top: 6px; font-weight: bold; color: #b91c1c;">
            <span>REMAINING BALANCE:</span>
            <span>${this.formatMoney(payment.new_credit_balance || customer.current_credit)}</span>
          </div>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-footer-text">
          <p>Thank you for settling your account with JENGAKWANZA LIMITED!</p>
          <p style="font-size: 9px; margin-top: 4px; color: #666;">Official Computer-Generated Receipt</p>
        </div>
      </div>
    `;
  },

  // 5. PURCHASE ORDER DOCUMENT
  renderA4PurchaseOrder(po) {
    const cred = this.credentials;
    const items = po.items || [];

    let itemsHtml = items.map((item, idx) => `
      <tr>
        <td style="text-align: center; width: 40px;">${idx + 1}</td>
        <td><strong>${this.escape(item.product_name || item.name)}</strong></td>
        <td style="text-align: center; width: 80px;">${item.unit || 'pcs'}</td>
        <td style="text-align: center; width: 80px;">${item.quantity_ordered || item.quantity}</td>
        <td style="text-align: right; width: 110px;">${this.formatMoney(item.cost_price)}</td>
        <td style="text-align: right; width: 120px; font-weight: bold;">${this.formatMoney(item.total_price || (item.quantity_ordered * item.cost_price))}</td>
      </tr>
    `).join('');

    return `
      <div class="doc-a4-sheet">
        <div class="doc-header">
          <div class="doc-brand-block">
            <img src="${cred.logo_url || 'assets/logo.svg'}" alt="JENGAKWANZA" onerror="this.style.display='none'">
            <div class="doc-cred-text">
              <strong>${this.escape(cred.company_name)}</strong><br>
              ${this.escape(cred.address)}<br>
              <strong>Tel:</strong> ${this.escape(cred.phone_numbers)}<br>
              <strong>Email:</strong> ${this.escape(cred.email)}
            </div>
          </div>
          <div class="doc-type-badge">
            <h1 style="color: #7c3aed;">PURCHASE ORDER</h1>
            <table class="doc-meta-table" style="margin-left: auto;">
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
            <h4 style="font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">VENDOR / SUPPLIER</h4>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a;">${this.escape(po.supplier_name || 'Supplier')}</div>
            ${po.supplier_phone ? `<div style="color: #334155; font-size: 12.5px;"><strong>Phone:</strong> ${this.escape(po.supplier_phone)}</div>` : ''}
            ${po.supplier_address ? `<div style="color: #334155; font-size: 12.5px;"><strong>Address:</strong> ${this.escape(po.supplier_address)}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <h4 style="font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">SHIP TO</h4>
            <div style="font-size: 12.5px; color: #334155;">
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
              <th style="text-align: center;">#</th>
              <th>Item / Material Description</th>
              <th style="text-align: center;">Unit</th>
              <th style="text-align: center;">Qty Ordered</th>
              <th style="text-align: right;">Unit Cost</th>
              <th style="text-align: right;">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="doc-summary-split">
          <div>
            ${po.notes ? `
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; font-size: 12px;">
                <strong>Order Instructions:</strong> ${this.escape(po.notes)}
              </div>
            ` : ''}
          </div>
          <div>
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: bold;">
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

  // Modal Print Preview Display & Print Trigger
  showPrintPreview(htmlContent, title = 'Document Preview') {
    let previewModal = document.getElementById('print-preview-modal');
    if (!previewModal) {
      previewModal = document.createElement('div');
      previewModal.id = 'print-preview-modal';
      previewModal.className = 'modal-overlay';
      previewModal.innerHTML = `
        <div class="modal-box xl">
          <div class="modal-header">
            <h3 id="print-modal-title">Print Preview</h3>
            <button class="modal-close-btn" onclick="document.getElementById('print-preview-modal').classList.remove('active')">&times;</button>
          </div>
          <div class="modal-body" style="background: #f1f5f9; display: flex; justify-content: center; padding: 20px;">
            <div id="print-preview-content"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="document.getElementById('print-preview-modal').classList.remove('active')">Close</button>
            <button class="btn btn-primary" onclick="window.print()">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
              Print Now
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(previewModal);
    }

    document.getElementById('print-modal-title').textContent = title;
    document.getElementById('print-preview-content').innerHTML = htmlContent;
    previewModal.classList.add('active');
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
