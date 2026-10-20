#!/usr/bin/env ruby
# JENGAKWANZA Business Management System Backend Server
# Powered by Ruby WEBrick & SQLite3

require 'webrick'
require 'sqlite3'
require 'json'
require 'digest/sha2'
require 'fileutils'
require 'date'

PORT = (ENV['PORT'] || 8080).to_i
DB_PATH = ENV['DB_PATH'] ? File.expand_path(ENV['DB_PATH']) : File.expand_path('../db/jengakwanza.db', __FILE__)
SCHEMA_PATH = File.expand_path('../db/schema.sql', __FILE__)
PUBLIC_DIR = File.expand_path('../public', __FILE__)

# Ensure DB and Public directories exist
FileUtils.mkdir_p(File.dirname(DB_PATH))
FileUtils.mkdir_p(PUBLIC_DIR)

# Initialize Database
def init_database
  db = SQLite3::Database.new(DB_PATH)
  db.results_as_hash = true
  db.execute("PRAGMA foreign_keys = ON;")

  # Run Schema
  schema_sql = File.read(SCHEMA_PATH)
  db.execute_batch(schema_sql)

  # Check and populate essential settings (NO dummy/sample data, only company identity & system config)
  default_settings = {
    'company_name' => 'JENGAKWANZA LIMITED',
    'tagline' => 'Building Excellence & Quality Supplies',
    'phone_numbers' => '0788989889 / 0713550104',
    'address' => 'P.O.BOX 14991 ARUSHA',
    'email' => 'jengakwanzaltd@gmail.com',
    'currency' => 'TZS',
    'currency_symbol' => 'TSh',
    'tax_rate' => '0', # 0 or 18% configurable
    'tax_enabled' => 'false',
    'receipt_footer' => 'Thank you for choosing JENGAKWANZA LIMITED! Quality Guarantee.',
    'pos_printer_type' => '80mm', # 80mm or 58mm or A4
    'cash_balance' => '0.0',
    'bank_balance' => '0.0',
    'mobile_money_balance' => '0.0'
  }

  default_settings.each do |k, v|
    existing = db.get_first_value("SELECT value FROM settings WHERE key = ?", [k])
    if existing.nil?
      db.execute("INSERT INTO settings (key, value) VALUES (?, ?)", [k, v])
    end
  end

  # Create Default Admin if no users exist
  user_count = db.get_first_value("SELECT COUNT(*) FROM users")
  if user_count == 0
    # Password admin123
    pin_hash = Digest::SHA256.hexdigest("admin123")
    db.execute(
      "INSERT INTO users (username, full_name, role, phone, pin_hash, active) VALUES (?, ?, ?, ?, ?, 1)",
      ['admin', 'System Administrator', 'Admin', '0788989889', pin_hash]
    )
    puts "=> Initialized default Admin profile: Username 'admin' | Password 'admin123'"
  end

  begin
    db.execute("ALTER TABLE products ADD COLUMN image_url TEXT")
  rescue => _e
  end

  db.close
end

init_database

def get_db
  db = SQLite3::Database.new(DB_PATH)
  db.results_as_hash = true
  db.execute("PRAGMA foreign_keys = ON;")
  db
end

# WEBrick Server Setup
server = WEBrick::HTTPServer.new(
  Port: PORT,
  DocumentRoot: PUBLIC_DIR,
  AccessLog: [],
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::INFO)
)

# Trap exits
trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }

# Helper to send JSON response
def send_json(res, status_code, data)
  res.status = status_code
  res['Content-Type'] = 'application/json; charset=utf-8'
  res['Access-Control-Allow-Origin'] = '*'
  res['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
  res['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
  res.body = data.to_json
end

# Helper to parse JSON request body
def parse_body(req)
  return {} if req.body.nil? || req.body.strip.empty?
  JSON.parse(req.body)
rescue JSON::ParserError
  {}
end

# API Servlet
class ApiServlet < WEBrick::HTTPServlet::AbstractServlet
  def do_OPTIONS(req, res)
    res.status = 200
    res['Access-Control-Allow-Origin'] = '*'
    res['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    res['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    res.body = ''
  end

  def do_GET(req, res)
    path = req.path.sub(%r{^/api/}, '')
    query = req.query || {}
    db = get_db

    case path
    when 'auth/me'
      user_id = query['user_id']
      if user_id
        user = db.get_first_row("SELECT id, username, full_name, role, phone, active, created_at FROM users WHERE id = ?", [user_id])
        if user
          send_json(res, 200, { success: true, user: user })
        else
          send_json(res, 404, { success: false, error: 'User not found' })
        end
      else
        send_json(res, 400, { success: false, error: 'User ID required' })
      end

    when 'settings'
      rows = db.execute("SELECT key, value FROM settings")
      settings = {}
      rows.each { |r| settings[r['key']] = r['value'] }
      send_json(res, 200, { success: true, settings: settings })

    when 'workers'
      workers = db.execute("SELECT id, username, full_name, role, phone, active, created_at FROM users ORDER BY full_name ASC")
      send_json(res, 200, { success: true, workers: workers })

    when 'shifts'
      date = query['date'] || Date.today.to_s
      shifts = db.execute(
        "SELECT s.*, u.full_name as worker_name, u.role as worker_role, u.phone as worker_phone " \
        "FROM work_shifts s JOIN users u ON s.user_id = u.id " \
        "WHERE s.work_date = ? ORDER BY s.clock_in DESC",
        [date]
      )
      
      # Also fetch summary of actions done on that specific day by each worker
      activity = db.execute(
        "SELECT user_id, COUNT(*) as sales_count, SUM(total) as total_sales " \
        "FROM orders WHERE DATE(created_at) = ? AND order_type != 'PROFORMA' GROUP BY user_id",
        [date]
      )
      act_map = {}
      activity.each { |a| act_map[a['user_id']] = a }

      # Attach activity to shifts
      shifts.each do |s|
        s['sales_count'] = act_map.dig(s['user_id'], 'sales_count') || 0
        s['total_sales'] = act_map.dig(s['user_id'], 'total_sales') || 0.0
      end

      send_json(res, 200, { success: true, date: date, shifts: shifts })

    when 'products'
      products = db.execute("SELECT * FROM products ORDER BY name ASC")
      send_json(res, 200, { success: true, products: products })

    when 'stock/movements'
      limit = (query['limit'] || 100).to_i
      movements = db.execute(
        "SELECT m.*, p.name as product_name, p.unit as product_unit, u.full_name as user_name " \
        "FROM stock_movements m " \
        "JOIN products p ON m.product_id = p.id " \
        "LEFT JOIN users u ON m.user_id = u.id " \
        "ORDER BY m.created_at DESC LIMIT ?",
        [limit]
      )
      send_json(res, 200, { success: true, movements: movements })

    when 'customers'
      customers = db.execute("SELECT * FROM customers ORDER BY name ASC")
      send_json(res, 200, { success: true, customers: customers })

    when 'debtors'
      debtors = db.execute(
        "SELECT * FROM customers WHERE current_credit > 0.001 ORDER BY current_credit DESC"
      )
      send_json(res, 200, { success: true, debtors: debtors })

    when 'debtors/history'
      customer_id = query['customer_id']
      if customer_id
        payments = db.execute(
          "SELECT p.*, u.full_name as user_name FROM debtor_payments p " \
          "LEFT JOIN users u ON p.user_id = u.id " \
          "WHERE p.customer_id = ? ORDER BY p.created_at DESC",
          [customer_id]
        )
        orders = db.execute(
          "SELECT * FROM orders WHERE customer_id = ? AND balance_due > 0 ORDER BY created_at DESC",
          [customer_id]
        )
        send_json(res, 200, { success: true, payments: payments, credit_orders: orders })
      else
        send_json(res, 400, { success: false, error: 'customer_id is required' })
      end

    when 'suppliers'
      suppliers = db.execute("SELECT * FROM suppliers ORDER BY name ASC")
      send_json(res, 200, { success: true, suppliers: suppliers })

    when 'purchase-orders'
      pos = db.execute(
        "SELECT po.*, s.name as supplier_name, s.phone as supplier_phone, u.full_name as created_by_name " \
        "FROM purchase_orders po " \
        "JOIN suppliers s ON po.supplier_id = s.id " \
        "LEFT JOIN users u ON po.user_id = u.id " \
        "ORDER BY po.created_at DESC"
      )
      # Attach items
      pos.each do |po|
        po['items'] = db.execute("SELECT * FROM po_items WHERE po_id = ?", [po['id']])
      end
      send_json(res, 200, { success: true, purchase_orders: pos })

    when 'orders'
      type = query['type'] # POS, INVOICE, PROFORMA or nil
      sql = "SELECT o.*, u.full_name as cashier_name FROM orders o LEFT JOIN users u ON o.user_id = u.id"
      params = []
      if type && !type.empty?
        sql += " WHERE o.order_type = ?"
        params << type
      end
      sql += " ORDER BY o.created_at DESC"
      orders = db.execute(sql, params)
      send_json(res, 200, { success: true, orders: orders })

    when %r{^orders/(\d+)$}
      order_id = $1.to_i
      order = db.get_first_row(
        "SELECT o.*, u.full_name as cashier_name FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ?",
        [order_id]
      )
      if order
        items = db.execute("SELECT * FROM order_items WHERE order_id = ?", [order_id])
        order['items'] = items
        send_json(res, 200, { success: true, order: order })
      else
        send_json(res, 404, { success: false, error: 'Order not found' })
      end

    when 'delivery-notes'
      notes = db.execute(
        "SELECT dn.*, u.full_name as dispatched_by_name FROM delivery_notes dn " \
        "LEFT JOIN users u ON dn.dispatched_by = u.id ORDER BY dn.created_at DESC"
      )
      send_json(res, 200, { success: true, delivery_notes: notes })

    when 'expenses'
      date = query['date']
      if date && !date.empty?
        expenses = db.execute(
          "SELECT e.*, u.full_name as recorded_by_name FROM expenses e " \
          "LEFT JOIN users u ON e.user_id = u.id WHERE e.expense_date = ? ORDER BY e.created_at DESC",
          [date]
        )
      else
        expenses = db.execute(
          "SELECT e.*, u.full_name as recorded_by_name FROM expenses e " \
          "LEFT JOIN users u ON e.user_id = u.id ORDER BY e.created_at DESC LIMIT 200"
        )
      end
      send_json(res, 200, { success: true, expenses: expenses })

    when 'capital'
      cash = (db.get_first_value("SELECT value FROM settings WHERE key = 'cash_balance'") || 0.0).to_f
      bank = (db.get_first_value("SELECT value FROM settings WHERE key = 'bank_balance'") || 0.0).to_f
      mobile = (db.get_first_value("SELECT value FROM settings WHERE key = 'mobile_money_balance'") || 0.0).to_f

      # Stock valuation (Sum of cost_price * stock_quantity)
      stock_cost_val = db.get_first_value("SELECT SUM(cost_price * stock_quantity) FROM products") || 0.0
      stock_retail_val = db.get_first_value("SELECT SUM(selling_price * stock_quantity) FROM products") || 0.0

      # Total debtors (uncollected customer credit)
      debtors_total = db.get_first_value("SELECT SUM(current_credit) FROM customers") || 0.0

      # Ledger records
      ledger = db.execute(
        "SELECT l.*, u.full_name as user_name FROM capital_ledger l " \
        "LEFT JOIN users u ON l.user_id = u.id ORDER BY l.created_at DESC LIMIT 100"
      )

      total_liquid = cash + bank + mobile
      net_worth = total_liquid + stock_cost_val + debtors_total

      send_json(res, 200, {
        success: true,
        capital: {
          cash: cash,
          bank: bank,
          mobile_money: mobile,
          total_liquid: total_liquid,
          stock_cost_valuation: stock_cost_val,
          stock_retail_valuation: stock_retail_val,
          debtors_total: debtors_total,
          total_estimated_net_capital: net_worth
        },
        ledger: ledger
      })

    when 'reports/dashboard'
      today = Date.today.to_s
      today_sales = db.get_first_value(
        "SELECT SUM(total) FROM orders WHERE DATE(created_at) = ? AND order_type != 'PROFORMA'", [today]
      ) || 0.0
      today_orders_count = db.get_first_value(
        "SELECT COUNT(*) FROM orders WHERE DATE(created_at) = ? AND order_type != 'PROFORMA'", [today]
      ) || 0
      today_expenses = db.get_first_value(
        "SELECT SUM(amount) FROM expenses WHERE expense_date = ?", [today]
      ) || 0.0
      active_workers_count = db.get_first_value(
        "SELECT COUNT(DISTINCT user_id) FROM work_shifts WHERE work_date = ? AND clock_out IS NULL", [today]
      ) || 0
      low_stock_count = db.get_first_value(
        "SELECT COUNT(*) FROM products WHERE stock_quantity <= min_alert_quantity"
      ) || 0
      debtors_total = db.get_first_value("SELECT SUM(current_credit) FROM customers") || 0.0

      cash = (db.get_first_value("SELECT value FROM settings WHERE key = 'cash_balance'") || 0.0).to_f
      bank = (db.get_first_value("SELECT value FROM settings WHERE key = 'bank_balance'") || 0.0).to_f
      mobile = (db.get_first_value("SELECT value FROM settings WHERE key = 'mobile_money_balance'") || 0.0).to_f

      send_json(res, 200, {
        success: true,
        dashboard: {
          today_sales: today_sales,
          today_orders_count: today_orders_count,
          today_expenses: today_expenses,
          net_today: today_sales - today_expenses,
          active_workers_count: active_workers_count,
          low_stock_count: low_stock_count,
          debtors_total: debtors_total,
          capital_available: cash + bank + mobile,
          cash_in_hand: cash,
          bank_balance: bank,
          mobile_balance: mobile
        }
      })

    when 'reports/daily'
      date = query['date'] || Date.today.to_s
      worker_id = query['worker_id']

      sql_orders = "SELECT o.*, u.full_name as worker_name FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE DATE(o.created_at) = ?"
      sql_expenses = "SELECT e.*, u.full_name as worker_name FROM expenses e LEFT JOIN users u ON e.user_id = u.id WHERE e.expense_date = ?"
      params_o = [date]
      params_e = [date]

      if worker_id && !worker_id.empty?
        sql_orders += " AND o.user_id = ?"
        sql_expenses += " AND e.user_id = ?"
        params_o << worker_id
        params_e << worker_id
      end

      orders = db.execute(sql_orders, params_o)
      expenses = db.execute(sql_expenses, params_e)

      # Shifts on that day
      shifts = db.execute(
        "SELECT s.*, u.full_name as worker_name, u.role FROM work_shifts s JOIN users u ON s.user_id = u.id WHERE s.work_date = ?",
        [date]
      )

      total_sales = orders.reject { |o| o['order_type'] == 'PROFORMA' }.sum { |o| o['total'] }
      total_expenses = expenses.sum { |e| e['amount'] }

      send_json(res, 200, {
        success: true,
        date: date,
        worker_id: worker_id,
        total_sales: total_sales,
        total_expenses: total_expenses,
        net_profit: total_sales - total_expenses,
        orders: orders,
        expenses: expenses,
        shifts: shifts
      })

    when 'backup/export'
      tables = %w[settings users work_shifts customers suppliers products stock_movements orders order_items delivery_notes purchase_orders po_items expenses debtor_payments capital_ledger]
      backup_data = {
        app: 'JENGAKWANZA',
        exported_at: Time.now.iso8601,
        version: '1.0.0',
        data: {}
      }
      tables.each do |t|
        backup_data[:data][t] = db.execute("SELECT * FROM #{t}")
      end
      send_json(res, 200, backup_data)

    else
      send_json(res, 404, { success: false, error: "Unknown endpoint: #{path}" })
    end
  rescue => e
    puts "Error GET #{path}: #{e.message}\n#{e.backtrace.join("\n")}"
    send_json(res, 500, { success: false, error: e.message })
  ensure
    db.close if db
  end

  def do_POST(req, res)
    path = req.path.sub(%r{^/api/}, '')
    data = parse_body(req)
    db = get_db

    case path
    when 'auth/login'
      username = (data['username'] || '').strip
      pin = (data['password'] || data['pin'] || '').strip
      pin_hash = Digest::SHA256.hexdigest(pin)

      user = db.get_first_row(
        "SELECT id, username, full_name, role, phone, active FROM users WHERE username = ? AND pin_hash = ? AND active = 1",
        [username, pin_hash]
      )
      if user
        send_json(res, 200, { success: true, user: user })
      else
        send_json(res, 401, { success: false, error: 'Invalid username or password' })
      end

    when 'settings'
      # Admin only
      data.each do |k, v|
        db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [k.to_s, v.to_s])
      end
      send_json(res, 200, { success: true, message: 'Settings saved successfully' })

    when 'workers'
      username = (data['username'] || '').strip.downcase
      full_name = (data['full_name'] || '').strip
      role = data['role'] || 'Cashier'
      phone = (data['phone'] || '').strip
      password = (data['password'] || '123456').strip

      if username.empty? || full_name.empty?
        send_json(res, 400, { success: false, error: 'Username and Full Name are required' })
        return
      end

      pin_hash = Digest::SHA256.hexdigest(password)
      begin
        db.execute(
          "INSERT INTO users (username, full_name, role, phone, pin_hash, active) VALUES (?, ?, ?, ?, ?, 1)",
          [username, full_name, role, phone, pin_hash]
        )
        new_id = db.last_insert_row_id
        send_json(res, 201, { success: true, id: new_id, message: "Worker #{full_name} added successfully" })
      rescue SQLite3::ConstraintException
        send_json(res, 409, { success: false, error: "Username '#{username}' already exists" })
      end

    when 'shifts/clock-in'
      user_id = data['user_id']
      work_date = data['work_date'] || Date.today.to_s
      opening_cash = (data['opening_cash'] || 0.0).to_f
      notes = data['notes'] || ''

      # Check if already active shift today
      active = db.get_first_row(
        "SELECT id FROM work_shifts WHERE user_id = ? AND work_date = ? AND clock_out IS NULL",
        [user_id, work_date]
      )
      if active
        send_json(res, 200, { success: true, shift_id: active['id'], message: 'Shift already active' })
      else
        db.execute(
          "INSERT INTO work_shifts (user_id, work_date, clock_in, opening_cash, notes) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)",
          [user_id, work_date, opening_cash, notes]
        )
        shift_id = db.last_insert_row_id
        send_json(res, 201, { success: true, shift_id: shift_id, message: 'Clocked in successfully' })
      end

    when 'shifts/clock-out'
      user_id = data['user_id']
      shift_id = data['shift_id']
      closing_cash = (data['closing_cash'] || 0.0).to_f
      notes = data['notes'] || ''

      if shift_id
        db.execute(
          "UPDATE work_shifts SET clock_out = CURRENT_TIMESTAMP, closing_cash = ?, notes = notes || ' ' || ? WHERE id = ?",
          [closing_cash, notes, shift_id]
        )
      else
        db.execute(
          "UPDATE work_shifts SET clock_out = CURRENT_TIMESTAMP, closing_cash = ?, notes = notes || ' ' || ? WHERE user_id = ? AND clock_out IS NULL",
          [closing_cash, notes, user_id]
        )
      end
      send_json(res, 200, { success: true, message: 'Clocked out successfully' })

    when 'products'
      sku = (data['sku'] || '').strip
      barcode = (data['barcode'] || '').strip
      name = (data['name'] || '').strip
      category = (data['category'] || 'General').strip
      unit = (data['unit'] || 'pcs').strip
      cost_price = (data['cost_price'] || 0.0).to_f
      selling_price = (data['selling_price'] || 0.0).to_f
      stock_quantity = (data['stock_quantity'] || 0.0).to_f
      min_alert_quantity = (data['min_alert_quantity'] || 5.0).to_f
      description = (data['description'] || '').strip
      image_url = data['image_url'] || ''
      user_id = data['user_id']

      if name.empty?
        send_json(res, 400, { success: false, error: 'Product name is required' })
        return
      end

      if sku.empty?
        # Auto generate SKU if empty
        sku = "JKP-#{Time.now.to_i % 100000}"
      end

      db.transaction do
        db.execute(
          "INSERT INTO products (sku, barcode, name, category, unit, cost_price, selling_price, stock_quantity, min_alert_quantity, description, image_url) " \
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [sku, barcode, name, category, unit, cost_price, selling_price, stock_quantity, min_alert_quantity, description, image_url]
        )
        product_id = db.last_insert_row_id

        # If starting with initial stock, log movement
        if stock_quantity > 0
          db.execute(
            "INSERT INTO stock_movements (product_id, user_id, movement_type, quantity, balance_after, unit_cost, notes) " \
            "VALUES (?, ?, 'RESTOCK', ?, ?, ?, 'Initial stock setup')",
            [product_id, user_id, stock_quantity, stock_quantity, cost_price]
          )
        end

        send_json(res, 201, { success: true, id: product_id, sku: sku, message: 'Product created successfully' })
      end

    when 'products/bulk'
      products_list = data['products'] || data || []
      imported_count = 0
      db.transaction do
        products_list.each do |p|
          name = (p['name'] || '').strip
          next if name.empty?
          sku = (p['sku'] || "JKP-#{rand(10000..99999)}").strip
          barcode = (p['barcode'] || '').strip
          category = (p['category'] || 'General').strip
          unit = (p['unit'] || 'pcs').strip
          cost_price = (p['cost_price'] || 0.0).to_f
          selling_price = (p['selling_price'] || 0.0).to_f
          stock_quantity = (p['stock_quantity'] || 0.0).to_f
          min_alert = (p['min_alert_quantity'] || 5.0).to_f
          image_url = p['image_url'] || ''

          db.execute(
            "INSERT INTO products (sku, barcode, name, category, unit, cost_price, selling_price, stock_quantity, min_alert_quantity, image_url) " \
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [sku, barcode, name, category, unit, cost_price, selling_price, stock_quantity, min_alert, image_url]
          )
          pid = db.last_insert_row_id
          if stock_quantity > 0
            db.execute(
              "INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, unit_cost, notes) VALUES (?, 'INITIAL_STOCK', ?, ?, ?, 'Bulk stock import')",
              [pid, stock_quantity, stock_quantity, cost_price]
            )
          end
          imported_count += 1
        end
      end
      send_json(res, 201, { success: true, count: imported_count })

    when 'stock/adjust'
      product_id = data['product_id']
      movement_type = data['movement_type'] || 'ADJUSTMENT' # RESTOCK, ADJUSTMENT, RETURN, DAMAGED
      quantity = (data['quantity'] || 0.0).to_f # Positive for in, negative for out
      user_id = data['user_id']
      unit_cost = (data['unit_cost'] || 0.0).to_f
      notes = data['notes'] || ''

      prod = db.get_first_row("SELECT * FROM products WHERE id = ?", [product_id])
      if prod.nil?
        send_json(res, 404, { success: false, error: 'Product not found' })
        return
      end

      new_balance = prod['stock_quantity'] + quantity
      if new_balance < 0 && movement_type != 'ADJUSTMENT'
        send_json(res, 400, { success: false, error: 'Cannot reduce stock below zero' })
        return
      end

      new_balance = [0, new_balance].max

      db.transaction do
        db.execute(
          "UPDATE products SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [new_balance, product_id]
        )
        db.execute(
          "INSERT INTO stock_movements (product_id, user_id, movement_type, quantity, balance_after, unit_cost, notes) " \
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
          [product_id, user_id, movement_type, quantity, new_balance, unit_cost, notes]
        )
      end

      send_json(res, 200, { success: true, new_balance: new_balance, message: 'Stock adjusted successfully' })

    when 'customers'
      name = (data['name'] || '').strip
      phone = (data['phone'] || '').strip
      email = (data['email'] || '').strip
      address = (data['address'] || '').strip
      credit_limit = (data['credit_limit'] || 0.0).to_f
      notes = data['notes'] || ''

      if name.empty?
        send_json(res, 400, { success: false, error: 'Customer name is required' })
        return
      end

      db.execute(
        "INSERT INTO customers (name, phone, email, address, credit_limit, current_credit, notes) VALUES (?, ?, ?, ?, ?, 0.0, ?)",
        [name, phone, email, address, credit_limit, notes]
      )
      new_id = db.last_insert_row_id
      send_json(res, 201, { success: true, id: new_id, message: 'Customer added successfully' })

    when 'suppliers'
      name = (data['name'] || '').strip
      contact_person = (data['contact_person'] || '').strip
      phone = (data['phone'] || '').strip
      email = (data['email'] || '').strip
      address = (data['address'] || '').strip
      notes = data['notes'] || ''

      if name.empty?
        send_json(res, 400, { success: false, error: 'Supplier name is required' })
        return
      end

      db.execute(
        "INSERT INTO suppliers (name, contact_person, phone, email, address, notes) VALUES (?, ?, ?, ?, ?, ?)",
        [name, contact_person, phone, email, address, notes]
      )
      new_id = db.last_insert_row_id
      send_json(res, 201, { success: true, id: new_id, message: 'Supplier added successfully' })

    when 'orders'
      # POS Sales, Invoices, Proforma Invoices
      order_type = data['order_type'] || 'POS' # POS, INVOICE, PROFORMA
      user_id = data['user_id']
      customer_id = data['customer_id']
      customer_name = (data['customer_name'] || 'Walk-in Customer').strip
      customer_phone = data['customer_phone']
      subtotal = (data['subtotal'] || 0.0).to_f
      discount = (data['discount'] || 0.0).to_f
      tax = (data['tax'] || 0.0).to_f
      total = (data['total'] || 0.0).to_f
      payment_method = data['payment_method'] || 'CASH'
      amount_paid = (data['amount_paid'] || 0.0).to_f
      due_date = data['due_date']
      notes = data['notes'] || ''
      items = data['items'] || []

      if items.empty?
        send_json(res, 400, { success: false, error: 'Cannot create order with empty items' })
        return
      end

      prefix = case order_type
               when 'POS' then 'JK-POS'
               when 'INVOICE' then 'JK-INV'
               when 'PROFORMA' then 'JK-PRO'
               else 'JK-ORD'
               end

      order_number = "#{prefix}-#{Time.now.strftime('%y%m%d')}-#{SecureRandom.hex(2).upcase}"

      # Payment Status & Balance Due
      if order_type == 'PROFORMA'
        payment_status = 'UNPAID'
        balance_due = total
        amount_paid = 0.0
      elsif amount_paid >= total
        payment_status = 'PAID'
        balance_due = 0.0
      elsif amount_paid > 0
        payment_status = 'PARTIAL'
        balance_due = total - amount_paid
      else
        payment_status = 'UNPAID'
        balance_due = total
      end

      db.transaction do
        # Create order
        db.execute(
          "INSERT INTO orders (order_number, order_type, user_id, customer_id, customer_name, customer_phone, " \
          "subtotal, discount, tax, total, payment_method, payment_status, amount_paid, balance_due, due_date, notes) " \
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [order_number, order_type, user_id, customer_id, customer_name, customer_phone,
           subtotal, discount, tax, total, payment_method, payment_status, amount_paid, balance_due, due_date, notes]
        )
        order_id = db.last_insert_row_id

        # Insert Items & Deduct Stock if POS or INVOICE (Proforma does not deduct stock)
        items.each do |item|
          prod_id = item['product_id']
          qty = (item['quantity'] || 1).to_f
          u_price = (item['unit_price'] || 0.0).to_f
          t_price = (item['total_price'] || (qty * u_price)).to_f
          prod_name = item['product_name'] || item['name'] || 'Item'
          unit = item['unit'] || 'pcs'

          c_price = 0.0
          if prod_id
            prod = db.get_first_row("SELECT cost_price, stock_quantity FROM products WHERE id = ?", [prod_id])
            if prod
              c_price = prod['cost_price']
              if order_type != 'PROFORMA'
                new_qty = prod['stock_quantity'] - qty
                db.execute("UPDATE products SET stock_quantity = ? WHERE id = ?", [new_qty, prod_id])
                db.execute(
                  "INSERT INTO stock_movements (product_id, user_id, movement_type, quantity, balance_after, unit_cost, reference_id, notes) " \
                  "VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?)",
                  [prod_id, user_id, -qty, new_qty, c_price, order_number, "Sale Order #{order_number}"]
                )
              end
            end
          end

          db.execute(
            "INSERT INTO order_items (order_id, product_id, product_name, unit, quantity, unit_price, cost_price, total_price) " \
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [order_id, prod_id, prod_name, unit, qty, u_price, c_price, t_price]
          )
        end

        # If credit / debtor balance created
        if balance_due > 0 && customer_id && order_type != 'PROFORMA'
          db.execute(
            "UPDATE customers SET current_credit = current_credit + ? WHERE id = ?",
            [balance_due, customer_id]
          )
        end

        # Update Cash/Bank/Mobile Money balances if amount paid > 0 and not Proforma
        if amount_paid > 0 && order_type != 'PROFORMA'
          account_key = case payment_method
                        when 'BANK' then 'bank_balance'
                        when 'MPESA', 'TIGO_PESA', 'AIRTEL_MONEY' then 'mobile_money_balance'
                        else 'cash_balance'
                        end
          db.execute("UPDATE settings SET value = CAST(value AS REAL) + ? WHERE key = ?", [amount_paid, account_key])
        end

        send_json(res, 201, {
          success: true,
          order_id: order_id,
          order_number: order_number,
          payment_status: payment_status,
          total: total,
          balance_due: balance_due,
          message: "#{order_type} created successfully"
        })
      end

    when 'debtors/pay'
      customer_id = data['customer_id']
      amount = (data['amount'] || 0.0).to_f
      payment_method = data['payment_method'] || 'CASH'
      user_id = data['user_id']
      notes = data['notes'] || 'Debtor payment'
      payment_date = data['payment_date'] || Date.today.to_s

      if customer_id.nil? || amount <= 0
        send_json(res, 400, { success: false, error: 'Valid customer and positive amount required' })
        return
      end

      cust = db.get_first_row("SELECT * FROM customers WHERE id = ?", [customer_id])
      if cust.nil?
        send_json(res, 404, { success: false, error: 'Customer not found' })
        return
      end

      payment_number = "JK-RCT-#{Time.now.strftime('%y%m%d')}-#{SecureRandom.hex(2).upcase}"

      db.transaction do
        # Record payment
        db.execute(
          "INSERT INTO debtor_payments (payment_number, customer_id, user_id, amount, payment_method, payment_date, notes) " \
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
          [payment_number, customer_id, user_id, amount, payment_method, payment_date, notes]
        )

        # Reduce customer debt
        new_credit = [0.0, cust['current_credit'] - amount].max
        db.execute("UPDATE customers SET current_credit = ? WHERE id = ?", [new_credit, customer_id])

        # Also allocate towards unpaid orders if any
        unpaid_orders = db.execute(
          "SELECT id, balance_due, amount_paid, total FROM orders WHERE customer_id = ? AND balance_due > 0 ORDER BY created_at ASC",
          [customer_id]
        )
        remaining_pay = amount
        unpaid_orders.each do |ord|
          break if remaining_pay <= 0
          alloc = [remaining_pay, ord['balance_due']].min
          new_bal = ord['balance_due'] - alloc
          new_paid = ord['amount_paid'] + alloc
          st = new_bal <= 0 ? 'PAID' : 'PARTIAL'
          db.execute("UPDATE orders SET balance_due = ?, amount_paid = ?, payment_status = ? WHERE id = ?", [new_bal, new_paid, st, ord['id']])
          remaining_pay -= alloc
        end

        # Increase liquid cash/bank
        account_key = case payment_method
                      when 'BANK' then 'bank_balance'
                      when 'MPESA', 'TIGO_PESA', 'AIRTEL_MONEY' then 'mobile_money_balance'
                      else 'cash_balance'
                      end
        db.execute("UPDATE settings SET value = CAST(value AS REAL) + ? WHERE key = ?", [amount, account_key])

        send_json(res, 201, {
          success: true,
          payment_number: payment_number,
          new_credit_balance: new_credit,
          message: "Payment of #{amount} recorded successfully"
        })
      end

    when 'delivery-notes'
      order_id = data['order_id']
      customer_name = (data['customer_name'] || '').strip
      customer_phone = data['customer_phone']
      delivery_address = (data['delivery_address'] || '').strip
      transporter_name = data['transporter_name']
      vehicle_number = data['vehicle_number']
      dispatched_by = data['dispatched_by']
      delivery_date = data['delivery_date'] || Date.today.to_s
      notes = data['notes'] || ''

      if delivery_address.empty? || customer_name.empty?
        send_json(res, 400, { success: false, error: 'Customer name and delivery address are required' })
        return
      end

      delivery_number = "JK-DN-#{Time.now.strftime('%y%m%d')}-#{SecureRandom.hex(2).upcase}"

      db.execute(
        "INSERT INTO delivery_notes (delivery_number, order_id, customer_name, customer_phone, delivery_address, " \
        "transporter_name, vehicle_number, dispatched_by, delivery_date, notes) " \
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [delivery_number, order_id, customer_name, customer_phone, delivery_address, transporter_name, vehicle_number, dispatched_by, delivery_date, notes]
      )
      new_id = db.last_insert_row_id
      send_json(res, 201, { success: true, id: new_id, delivery_number: delivery_number, message: 'Delivery note generated successfully' })

    when 'purchase-orders'
      supplier_id = data['supplier_id']
      user_id = data['user_id']
      subtotal = (data['subtotal'] || 0.0).to_f
      tax = (data['tax'] || 0.0).to_f
      total_amount = (data['total_amount'] || 0.0).to_f
      expected_date = data['expected_date']
      notes = data['notes'] || ''
      items = data['items'] || []

      if supplier_id.nil? || items.empty?
        send_json(res, 400, { success: false, error: 'Supplier and items required' })
        return
      end

      po_number = "JK-PO-#{Time.now.strftime('%y%m%d')}-#{SecureRandom.hex(2).upcase}"

      db.transaction do
        db.execute(
          "INSERT INTO purchase_orders (po_number, supplier_id, user_id, subtotal, tax, total_amount, status, expected_date, notes) " \
          "VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)",
          [po_number, supplier_id, user_id, subtotal, tax, total_amount, expected_date, notes]
        )
        po_id = db.last_insert_row_id

        items.each do |item|
          db.execute(
            "INSERT INTO po_items (po_id, product_id, product_name, unit, quantity_ordered, cost_price, total_price) " \
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [po_id, item['product_id'], item['product_name'] || item['name'], item['unit'] || 'pcs',
             (item['quantity_ordered'] || item['quantity']).to_f, (item['cost_price'] || 0.0).to_f, (item['total_price'] || 0.0).to_f]
          )
        end

        send_json(res, 201, { success: true, po_id: po_id, po_number: po_number, message: 'Purchase Order created successfully' })
      end

    when %r{^purchase-orders/(\d+)/receive$}
      po_id = $1.to_i
      user_id = data['user_id']
      po = db.get_first_row("SELECT * FROM purchase_orders WHERE id = ?", [po_id])
      if po.nil?
        send_json(res, 404, { success: false, error: 'Purchase Order not found' })
        return
      end

      if po['status'] == 'RECEIVED'
        send_json(res, 400, { success: false, error: 'PO has already been received' })
        return
      end

      db.transaction do
        items = db.execute("SELECT * FROM po_items WHERE po_id = ?", [po_id])
        items.each do |it|
          prod_id = it['product_id']
          qty = it['quantity_ordered']
          cost = it['cost_price']

          if prod_id
            prod = db.get_first_row("SELECT stock_quantity, cost_price FROM products WHERE id = ?", [prod_id])
            if prod
              new_stock = prod['stock_quantity'] + qty
              db.execute("UPDATE products SET stock_quantity = ?, cost_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [new_stock, cost, prod_id])
              db.execute(
                "INSERT INTO stock_movements (product_id, user_id, movement_type, quantity, balance_after, unit_cost, reference_id, notes) " \
                "VALUES (?, ?, 'PO_RECEIVE', ?, ?, ?, ?, ?)",
                [prod_id, user_id, qty, new_stock, cost, po['po_number'], "Received PO #{po['po_number']}"]
              )
            end
          end
          db.execute("UPDATE po_items SET quantity_received = quantity_ordered WHERE id = ?", [it['id']])
        end

        db.execute("UPDATE purchase_orders SET status = 'RECEIVED', received_date = CURRENT_TIMESTAMP WHERE id = ?", [po_id])
        send_json(res, 200, { success: true, message: "PO #{po['po_number']} received and inventory updated" })
      end

    when 'expenses'
      category = (data['category'] || 'General').strip
      amount = (data['amount'] || 0.0).to_f
      payment_method = data['payment_method'] || 'CASH'
      description = (data['description'] || '').strip
      expense_date = data['expense_date'] || Date.today.to_s
      user_id = data['user_id']

      if amount <= 0 || description.empty?
        send_json(res, 400, { success: false, error: 'Amount and description required' })
        return
      end

      expense_number = "JK-EXP-#{Time.now.strftime('%y%m%d')}-#{SecureRandom.hex(2).upcase}"

      db.transaction do
        db.execute(
          "INSERT INTO expenses (expense_number, user_id, category, amount, payment_method, description, expense_date) " \
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
          [expense_number, user_id, category, amount, payment_method, description, expense_date]
        )
        new_id = db.last_insert_row_id

        # Deduct from corresponding capital / cash balance
        account_key = case payment_method
                      when 'BANK' then 'bank_balance'
                      when 'MPESA', 'TIGO_PESA', 'AIRTEL_MONEY' then 'mobile_money_balance'
                      else 'cash_balance'
                      end
        db.execute("UPDATE settings SET value = CAST(value AS REAL) - ? WHERE key = ?", [amount, account_key])

        send_json(res, 201, { success: true, id: new_id, expense_number: expense_number, message: 'Expense recorded successfully' })
      end

    when 'capital/adjust'
      entry_type = data['entry_type'] # 'CAPITAL_INJECTION', 'OWNER_DRAWING', 'ADJUSTMENT'
      amount = (data['amount'] || 0.0).to_f
      account = data['account'] || 'CASH' # CASH, BANK, MOBILE_MONEY
      description = (data['description'] || '').strip
      user_id = data['user_id']
      entry_date = data['entry_date'] || Date.today.to_s

      if amount <= 0 || description.empty?
        send_json(res, 400, { success: false, error: 'Positive amount and description required' })
        return
      end

      account_key = case account
                    when 'BANK' then 'bank_balance'
                    when 'MOBILE_MONEY' then 'mobile_money_balance'
                    else 'cash_balance'
                    end

      db.transaction do
        db.execute(
          "INSERT INTO capital_ledger (entry_type, amount, account, description, user_id, entry_date) " \
          "VALUES (?, ?, ?, ?, ?, ?)",
          [entry_type, amount, account, description, user_id, entry_date]
        )

        multiplier = (entry_type == 'OWNER_DRAWING' ? -1 : 1)
        db.execute("UPDATE settings SET value = CAST(value AS REAL) + ? WHERE key = ?", [amount * multiplier, account_key])

        send_json(res, 201, { success: true, message: "Capital transaction recorded" })
      end

    when %r{^proforma/(\d+)/convert$}
      proforma_id = $1.to_i
      target_type = data['target_type'] || 'INVOICE' # 'INVOICE' or 'POS'
      user_id = data['user_id']

      proforma = db.get_first_row("SELECT * FROM orders WHERE id = ? AND order_type = 'PROFORMA'", [proforma_id])
      if proforma.nil?
        send_json(res, 404, { success: false, error: 'Proforma Invoice not found' })
        return
      end

      items = db.execute("SELECT * FROM order_items WHERE order_id = ?", [proforma_id])

      prefix = target_type == 'POS' ? 'JK-POS' : 'JK-INV'
      new_order_number = "#{prefix}-#{Time.now.strftime('%y%m%d')}-#{SecureRandom.hex(2).upcase}"

      db.transaction do
        db.execute(
          "INSERT INTO orders (order_number, order_type, user_id, customer_id, customer_name, customer_phone, " \
          "subtotal, discount, tax, total, payment_method, payment_status, amount_paid, balance_due, notes) " \
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [new_order_number, target_type, user_id, proforma['customer_id'], proforma['customer_name'], proforma['customer_phone'],
           proforma['subtotal'], proforma['discount'], proforma['tax'], proforma['total'],
           'CASH', 'UNPAID', 0.0, proforma['total'], "Converted from #{proforma['order_number']}"]
        )
        new_order_id = db.last_insert_row_id

        items.each do |it|
          # Deduct stock
          if it['product_id']
            prod = db.get_first_row("SELECT stock_quantity FROM products WHERE id = ?", [it['product_id']])
            if prod
              new_stock = prod['stock_quantity'] - it['quantity']
              db.execute("UPDATE products SET stock_quantity = ? WHERE id = ?", [new_stock, it['product_id']])
              db.execute(
                "INSERT INTO stock_movements (product_id, user_id, movement_type, quantity, balance_after, unit_cost, reference_id, notes) " \
                "VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?)",
                [it['product_id'], user_id, -it['quantity'], new_stock, it['cost_price'], new_order_number, "Sale from converted proforma #{proforma['order_number']}"]
              )
            end
          end

          db.execute(
            "INSERT INTO order_items (order_id, product_id, product_name, unit, quantity, unit_price, cost_price, total_price) " \
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [new_order_id, it['product_id'], it['product_name'], it['unit'], it['quantity'], it['unit_price'], it['cost_price'], it['total_price']]
          )
        end

        send_json(res, 201, {
          success: true,
          order_id: new_order_id,
          order_number: new_order_number,
          message: "Proforma converted to #{target_type} successfully"
        })
      end

    else
      send_json(res, 404, { success: false, error: "Unknown POST endpoint: #{path}" })
    end
  rescue => e
    puts "Error POST #{path}: #{e.message}\n#{e.backtrace.join("\n")}"
    send_json(res, 500, { success: false, error: e.message })
  ensure
    db.close if db
  end

  def do_PUT(req, res)
    path = req.path.sub(%r{^/api/}, '')
    data = parse_body(req)
    db = get_db

    case path
    when %r{^workers/(\d+)$}
      worker_id = $1.to_i
      full_name = data['full_name']
      role = data['role']
      phone = data['phone']
      active = data['active']
      password = data['password']

      updates = []
      params = []

      if full_name
        updates << "full_name = ?"
        params << full_name
      end
      if role
        updates << "role = ?"
        params << role
      end
      if phone
        updates << "phone = ?"
        params << phone
      end
      if !active.nil?
        updates << "active = ?"
        params << (active ? 1 : 0)
      end
      if password && !password.strip.empty?
        updates << "pin_hash = ?"
        params << Digest::SHA256.hexdigest(password.strip)
      end

      if updates.empty?
        send_json(res, 400, { success: false, error: 'No fields to update' })
        return
      end

      params << worker_id
      db.execute("UPDATE users SET #{updates.join(', ')} WHERE id = ?", params)
      send_json(res, 200, { success: true, message: 'Worker updated successfully' })

    when %r{^products/(\d+)$}
      prod_id = $1.to_i
      db.execute(
        "UPDATE products SET sku = ?, barcode = ?, name = ?, category = ?, unit = ?, " \
        "cost_price = ?, selling_price = ?, min_alert_quantity = ?, description = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [data['sku'], data['barcode'], data['name'], data['category'], data['unit'],
         (data['cost_price'] || 0.0).to_f, (data['selling_price'] || 0.0).to_f, (data['min_alert_quantity'] || 5.0).to_f, data['description'], data['image_url'], prod_id]
      )
      send_json(res, 200, { success: true, message: 'Product updated successfully' })

    when %r{^customers/(\d+)$}
      cust_id = $1.to_i
      db.execute(
        "UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, credit_limit = ?, notes = ? WHERE id = ?",
        [data['name'], data['phone'], data['email'], data['address'], (data['credit_limit'] || 0.0).to_f, data['notes'], cust_id]
      )
      send_json(res, 200, { success: true, message: 'Customer updated successfully' })

    when %r{^suppliers/(\d+)$}
      sup_id = $1.to_i
      db.execute(
        "UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, notes = ? WHERE id = ?",
        [data['name'], data['contact_person'], data['phone'], data['email'], data['address'], data['notes'], sup_id]
      )
      send_json(res, 200, { success: true, message: 'Supplier updated successfully' })

    when %r{^orders/(\d+)/status$}
      order_id = $1.to_i
      status = data['payment_status']
      amount_paid = (data['amount_paid'] || 0.0).to_f

      ord = db.get_first_row("SELECT * FROM orders WHERE id = ?", [order_id])
      if ord.nil?
        send_json(res, 404, { success: false, error: 'Order not found' })
        return
      end

      bal = [0.0, ord['total'] - amount_paid].max
      db.execute("UPDATE orders SET payment_status = ?, amount_paid = ?, balance_due = ? WHERE id = ?", [status, amount_paid, bal, order_id])
      send_json(res, 200, { success: true, message: 'Order status updated' })

    else
      send_json(res, 404, { success: false, error: "Unknown PUT endpoint: #{path}" })
    end
  rescue => e
    send_json(res, 500, { success: false, error: e.message })
  ensure
    db.close if db
  end

  def do_DELETE(req, res)
    path = req.path.sub(%r{^/api/}, '')
    db = get_db

    case path
    when %r{^products/(\d+)$}
      prod_id = $1.to_i
      db.execute("DELETE FROM products WHERE id = ?", [prod_id])
      send_json(res, 200, { success: true, message: 'Product deleted' })

    when %r{^customers/(\d+)$}
      cust_id = $1.to_i
      cust = db.get_first_row("SELECT current_credit FROM customers WHERE id = ?", [cust_id])
      if cust && cust['current_credit'] > 0
        send_json(res, 400, { success: false, error: 'Cannot delete customer with outstanding credit balance' })
        return
      end
      db.execute("DELETE FROM customers WHERE id = ?", [cust_id])
      send_json(res, 200, { success: true, message: 'Customer deleted' })

    when %r{^suppliers/(\d+)$}
      sup_id = $1.to_i
      db.execute("DELETE FROM suppliers WHERE id = ?", [sup_id])
      send_json(res, 200, { success: true, message: 'Supplier deleted' })

    when %r{^expenses/(\d+)$}
      exp_id = $1.to_i
      db.execute("DELETE FROM expenses WHERE id = ?", [exp_id])
      send_json(res, 200, { success: true, message: 'Expense deleted' })

    else
      send_json(res, 404, { success: false, error: "Unknown DELETE endpoint: #{path}" })
    end
  rescue => e
    send_json(res, 500, { success: false, error: e.message })
  ensure
    db.close if db
  end
end

server.mount('/api', ApiServlet)

puts "=========================================================="
puts "  JENGAKWANZA Business Management System is running"
puts "  Local URL: http://localhost:#{PORT}"
puts "  Default Admin: admin | Password: admin123"
puts "=========================================================="

server.start
