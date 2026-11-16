import React, { useState, useEffect, useRef } from 'react';
import {
  UtensilsCrossed,
  TrendingUp,
  Boxes,
  ChefHat,
  ShoppingBag,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Plus,
  Minus,
  Trash2,
  Lock,
  UserCheck,
  LogOut,
  Tag,
  Printer,
  X,
  Mic,
  MicOff,
  Volume2,
  Edit2,
  Save,
  Download,
  Settings,
  Store,
  Grid,
  Check,
  ArrowUpRight,
  PackagePlus,
  Percent,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const API_BASE = 'http://localhost:8000/api';

const WORD_TO_NUMBER = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('restoai_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('restoai_token') || '');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Application State
  const [activeTab, setActiveTab] = useState('pos'); // pos | kds | ai | inventory | menu_pricing | settings
  const [menuItems, setMenuItems] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState([]);
  const [orderNotice, setOrderNotice] = useState(null);

  // Dine-In Table Floor Plan Selection
  const [selectedTable, setSelectedTable] = useState(1); // 1-12 or null for Takeaway
  const [orderType, setOrderType] = useState('DINE_IN'); // DINE_IN | TAKEAWAY | DELIVERY

  // White-Label Store Settings State
  const [storeSettings, setStoreSettings] = useState({
    restaurant_name: 'RestoAI Bistro & Lounge',
    tagline: 'Smart AI-Powered Hospitality',
    address: '100 Innovation Way, Silicon Valley, CA',
    phone: '(555) 019-2831',
    currency_symbol: '$',
    tax_rate: 8.25,
  });
  const [settingsForm, setSettingsForm] = useState(storeSettings);
  const [settingsNotice, setSettingsNotice] = useState('');

  // Voice Ordering State
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceNotice, setVoiceNotice] = useState('');
  const recognitionRef = useRef(null);

  // Thermal Receipt Modal State
  const [completedOrder, setCompletedOrder] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Price Editing State (Admin/Manager)
  const [editingItemId, setEditingItemId] = useState(null);
  const [editPriceValue, setEditPriceValue] = useState('');

  // Restock Modal / Quick Restock State
  const [restockModalItem, setRestockModalItem] = useState(null);
  const [restockQty, setRestockQty] = useState(25);

  // Auth Headers helper
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Fetch data on authentication
  useEffect(() => {
    if (token && currentUser) {
      fetchSettings();
      fetchMenu();
      fetchOrders();
      fetchTables();
      if (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER') {
        fetchInventory();
        fetchForecast();
      }
    }
  }, [token, currentUser]);

  const handleLogin = async (email, password) => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Login failed. Please check your credentials.');
      }

      const data = await res.json();
      setToken(data.access_token);
      setCurrentUser(data.user);
      localStorage.setItem('restoai_token', data.access_token);
      localStorage.setItem('restoai_user', JSON.stringify(data.user));
      setActiveTab('pos');
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setToken('');
    setCurrentUser(null);
    localStorage.removeItem('restoai_token');
    localStorage.removeItem('restoai_user');
    setCart([]);
    setActiveTab('pos');
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  // API Calls
  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setStoreSettings(data);
        setSettingsForm(data);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const fetchMenu = async () => {
    try {
      const res = await fetch(`${API_BASE}/menu`, { headers: authHeaders });
      if (res.ok) setMenuItems(await res.json());
    } catch (err) {
      console.error('Error fetching menu:', err);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await fetch(`${API_BASE}/inventory`, { headers: authHeaders });
      if (res.ok) setInventoryItems(await res.json());
    } catch (err) {
      console.error('Error fetching inventory:', err);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API_BASE}/orders?limit=30`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
    }
  };

  const fetchTables = async () => {
    try {
      const res = await fetch(`${API_BASE}/tables`, { headers: authHeaders });
      if (res.ok) setTables(await res.json());
    } catch (err) {
      console.error('Error fetching tables:', err);
    }
  };

  const fetchForecast = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai/forecast?horizon_days=7`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setForecastData(data);
      }
    } catch (err) {
      console.error('Error fetching AI forecast:', err);
    } finally {
      setLoading(false);
    }
  };

  // 1-Click Inventory Restock
  const handleRestock = async (itemId, quantity) => {
    try {
      const res = await fetch(`${API_BASE}/inventory/${itemId}/restock`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ quantity, notes: 'Quick restock from inventory dashboard' }),
      });
      if (res.ok) {
        fetchInventory();
        setRestockModalItem(null);
        setOrderNotice(`Replenished +${quantity} units to stock!`);
        setTimeout(() => setOrderNotice(null), 3500);
      }
    } catch (err) {
      console.error('Error restocking item:', err);
    }
  };

  // White-Label Settings Save (Admin Only)
  const saveStoreSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          restaurant_name: settingsForm.restaurant_name,
          tagline: settingsForm.tagline,
          address: settingsForm.address,
          phone: settingsForm.phone,
          currency_symbol: settingsForm.currency_symbol,
          tax_rate: parseFloat(settingsForm.tax_rate),
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setStoreSettings(updated);
        setSettingsNotice('Store branding & tax configuration updated successfully!');
        setTimeout(() => setSettingsNotice(''), 4000);
      }
    } catch (err) {
      console.error('Error updating settings:', err);
    }
  };

  // Export Sales Report (CSV)
  const downloadSalesCSV = async () => {
    try {
      const res = await fetch(`${API_BASE}/reports/sales/csv?days=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to download report');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `restoai_financial_sales_report_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setOrderNotice('Financial Sales Report (.CSV) generated and downloaded!');
      setTimeout(() => setOrderNotice(null), 4000);
    } catch (err) {
      console.error('Error downloading CSV:', err);
    }
  };

  // Voice Ordering
  const parseVoiceCommand = (text) => {
    const cleanText = text.toLowerCase().trim();
    if (!cleanText || menuItems.length === 0) return;

    const itemAliases = [
      { id: 'BUR-01', keywords: ['cheeseburger', 'truffle cheeseburger', 'burger'] },
      { id: 'BUR-02', keywords: ['chicken sandwich', 'hot honey chicken', 'chicken burger'] },
      { id: 'PIZ-01', keywords: ['margherita pizza', 'pizza', 'margherita'] },
      { id: 'PAS-01', keywords: ['fettuccine', 'mushroom pasta', 'pasta'] },
      { id: 'SID-01', keywords: ['fries', 'truffle fries', 'parmesan fries', 'french fries'] },
      { id: 'STA-01', keywords: ['caesar salad', 'salad'] },
      { id: 'BEV-01', keywords: ['matcha latte', 'matcha', 'iced matcha'] },
      { id: 'BEV-02', keywords: ['cold brew', 'nitro cold brew', 'coffee'] },
      { id: 'DES-01', keywords: ['lava cake', 'chocolate cake', 'cake', 'lava'] },
    ];

    const phrases = cleanText.split(/\band\b|\bplus\b|\balso\b|,/);
    const addedItems = [];

    phrases.forEach((phrase) => {
      const trimmed = phrase.trim();
      if (!trimmed) return;

      let quantity = 1;
      const tokens = trimmed.split(/\s+/);

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (WORD_TO_NUMBER[token]) {
          quantity = WORD_TO_NUMBER[token];
          break;
        } else if (!isNaN(parseInt(token, 10))) {
          quantity = parseInt(token, 10);
          break;
        }
      }

      let matchedMenuItem = null;
      for (const alias of itemAliases) {
        for (const kw of alias.keywords) {
          if (trimmed.includes(kw)) {
            matchedMenuItem = menuItems.find((m) => m.code === alias.id);
            if (matchedMenuItem) break;
          }
        }
        if (matchedMenuItem) break;
      }

      if (!matchedMenuItem) {
        matchedMenuItem = menuItems.find((m) =>
          trimmed.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(trimmed)
        );
      }

      if (matchedMenuItem) {
        addToCart(matchedMenuItem, quantity);
        addedItems.push(`${quantity}x ${matchedMenuItem.name}`);
      }
    });

    if (addedItems.length > 0) {
      setVoiceNotice(`Added to Ticket: ${addedItems.join(', ')}`);
      setTimeout(() => setVoiceNotice(''), 4500);
    } else {
      setVoiceNotice(`Could not recognize menu item in: "${text}". Try "two cheeseburgers" or "three fries".`);
      setTimeout(() => setVoiceNotice(''), 5000);
    }
  };

  const toggleVoiceOrdering = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Web Speech API is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceTranscript('Listening... Speak dishes & quantities now (e.g. "two cheeseburgers and one cold brew")');
      };

      recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        setVoiceTranscript(`Heard: "${spokenText}"`);
        parseVoiceCommand(spokenText);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setVoiceTranscript(`Microphone error: ${event.error}`);
        setTimeout(() => setVoiceTranscript(''), 3000);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  // Cart operations
  const addToCart = (item, qtyToAdd = 1) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.id === item.id ? { ...c, quantity: c.quantity + qtyToAdd } : c
        );
      }
      return [...prev, { ...item, quantity: qtyToAdd }];
    });
  };

  const updateQuantity = (id, delta) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.id === id) {
            const newQty = c.quantity + delta;
            return newQty > 0 ? { ...c, quantity: newQty } : null;
          }
          return c;
        })
        .filter(Boolean)
    );
  };

  const clearCart = () => setCart([]);

  // Submit Order with Dine-In Table Floor Plan integration
  const submitOrder = async () => {
    if (cart.length === 0) return;
    try {
      const isDineIn = orderType === 'DINE_IN';
      const payload = {
        customer_name: isDineIn ? `Table #${selectedTable || 1} Guests` : `${orderType} Customer`,
        table_number: isDineIn ? selectedTable : null,
        order_type: orderType,
        payment_method: 'CARD',
        discount_amount: 0.0,
        items: cart.map((c) => ({ menu_item_id: c.id, quantity: c.quantity })),
      };

      const res = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const newOrder = await res.json();
        setCompletedOrder(newOrder);
        setShowReceiptModal(true);

        const tableText = isDineIn ? `Table #${selectedTable}` : orderType;
        setOrderNotice(`Order ${newOrder.order_number} (${tableText}) placed! Floor plan & inventory updated.`);
        setTimeout(() => setOrderNotice(null), 4000);
        clearCart();
        fetchOrders();
        fetchTables(); // Sync floor plan status
        if (currentUser?.role !== 'CASHIER') fetchInventory();
      }
    } catch (err) {
      console.error('Error submitting order:', err);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchOrders();
        fetchTables(); // Releasing ready/completed tables back to available!
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // Dynamic calculations based on white-label store settings
  const currency = storeSettings.currency_symbol || '$';
  const taxRatePercent = storeSettings.tax_rate ?? 8.25;

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * (taxRatePercent / 100);
  const total = subtotal + tax;

  const categories = ['ALL', ...new Set(menuItems.map((m) => m.category))];
  const filteredMenu =
    selectedCategory === 'ALL'
      ? menuItems
      : menuItems.filter((m) => m.category === selectedCategory);

  const isCashier = currentUser?.role === 'CASHIER';
  const isAdminOrManager = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';
  const isAdmin = currentUser?.role === 'ADMIN';

  // Critical Low Stock Items
  const lowStockItems = inventoryItems.filter((i) => i.low_stock);

  // =========================================================================
  // VIEW: LOGIN SCREEN (if not authenticated)
  // =========================================================================
  if (!token || !currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-emerald-500/5">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-3">
              <Sparkles className="w-8 h-8 text-slate-950" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{storeSettings.restaurant_name}</h1>
            <p className="text-xs text-slate-400 mt-1">{storeSettings.tagline}</p>
          </div>

          {/* Quick Demo Login Cards */}
          <div className="mb-6">
            <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Quick Demo Accounts (1-Click)
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleLogin('admin@restoai.com', 'admin123')}
                className="bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30 rounded-xl p-3 text-left transition-all"
              >
                <span className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Admin</span>
                <span className="text-xs font-semibold text-white block mt-0.5">Full Access</span>
                <span className="text-[9px] text-slate-400 block mt-1 font-mono">admin123</span>
              </button>

              <button
                type="button"
                onClick={() => handleLogin('manager@restoai.com', 'manager123')}
                className="bg-blue-950/40 hover:bg-blue-900/60 border border-blue-500/30 rounded-xl p-3 text-left transition-all"
              >
                <span className="block text-[10px] font-bold text-blue-400 uppercase tracking-wider">Manager</span>
                <span className="text-xs font-semibold text-white block mt-0.5">Inventory/AI</span>
                <span className="text-[9px] text-slate-400 block mt-1 font-mono">manager123</span>
              </button>

              <button
                type="button"
                onClick={() => handleLogin('cashier@restoai.com', 'cashier123')}
                className="bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/30 rounded-xl p-3 text-left transition-all"
              >
                <span className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider">Cashier</span>
                <span className="text-xs font-semibold text-white block mt-0.5">POS & KDS</span>
                <span className="text-[9px] text-slate-400 block mt-1 font-mono">cashier123</span>
              </button>
            </div>
          </div>

          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
            <span className="relative px-3 bg-slate-900 text-slate-500 text-xs uppercase font-medium">Or Sign In Manually</span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin(loginEmail, loginPassword);
            }}
            className="space-y-4"
          >
            {loginError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Email / Username</label>
              <input
                type="text"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="e.g. admin@restoai.com"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2"
            >
              <Lock className="w-4 h-4" />
              <span>{loginLoading ? 'Authenticating...' : 'Sign In to Restaurant Portal'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: MAIN APPLICATION DASHBOARD (AUTHENTICATED)
  // =========================================================================
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between">
        <div>
          {/* White-Label Store Header */}
          <div className="p-5 border-b border-slate-800">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Store className="w-5 h-5 text-slate-950 font-bold" />
              </div>
              <div className="overflow-hidden">
                <h1 className="text-base font-bold tracking-tight text-white leading-tight truncate">
                  {storeSettings.restaurant_name}
                </h1>
                <p className="text-[10px] text-emerald-400 font-medium truncate">{storeSettings.tagline}</p>
              </div>
            </div>

            {/* Authenticated User Pill */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
              <div className="overflow-hidden pr-2">
                <p className="text-xs font-bold text-white truncate">{currentUser.full_name}</p>
                <p className="text-[10px] text-slate-400 truncate">{currentUser.email}</p>
              </div>
              <span
                className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                  currentUser.role === 'ADMIN'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : currentUser.role === 'MANAGER'
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}
              >
                {currentUser.role}
              </span>
            </div>
          </div>

          {/* Navigation Links with RBAC */}
          <nav className="p-4 space-y-1.5">
            {/* POS Register */}
            <button
              onClick={() => setActiveTab('pos')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'pos'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-3">
                <UtensilsCrossed className="w-4 h-4" />
                <span>POS Register</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Floor Plan</span>
            </button>

            {/* Kitchen Display System */}
            <button
              onClick={() => setActiveTab('kds')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'kds'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center space-x-3">
                <ChefHat className="w-4 h-4" />
                <span>Kitchen KDS</span>
              </div>
              {orders.filter((o) => o.status === 'PENDING' || o.status === 'PREPARING').length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                  {orders.filter((o) => o.status === 'PENDING' || o.status === 'PREPARING').length}
                </span>
              )}
            </button>

            {/* Management Section Header */}
            <div className="pt-3 pb-1 px-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                <span>Management & AI</span>
                {isCashier && <Lock className="w-3 h-3 text-slate-400" />}
              </span>
            </div>

            {/* AI Demand Forecast (Restricted) */}
            {isAdminOrManager ? (
              <button
                onClick={() => setActiveTab('ai')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'ai'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>AI Demand & Reports</span>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                  CSV Export
                </span>
              </button>
            ) : (
              <div className="px-3.5 py-2 rounded-xl text-xs text-slate-400 flex items-center justify-between cursor-not-allowed opacity-60">
                <div className="flex items-center space-x-3">
                  <TrendingUp className="w-4 h-4" />
                  <span>AI Demand & Reports</span>
                </div>
                <Lock className="w-3 h-3 text-slate-400" />
              </div>
            )}

            {/* Inventory Ledger (Restricted) */}
            {isAdminOrManager ? (
              <button
                onClick={() => setActiveTab('inventory')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'inventory'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Boxes className="w-4 h-4" />
                  <span>Inventory & Restock</span>
                </div>
                {lowStockItems.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 animate-pulse">
                    {lowStockItems.length} Low
                  </span>
                )}
              </button>
            ) : (
              <div className="px-3.5 py-2 rounded-xl text-xs text-slate-400 flex items-center justify-between cursor-not-allowed opacity-60">
                <div className="flex items-center space-x-3">
                  <Boxes className="w-4 h-4" />
                  <span>Inventory & Restock</span>
                </div>
                <Lock className="w-3 h-3 text-slate-400" />
              </div>
            )}

            {/* Menu Pricing (Restricted) */}
            {isAdminOrManager ? (
              <button
                onClick={() => setActiveTab('menu_pricing')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'menu_pricing'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Tag className="w-4 h-4" />
                  <span>Menu Pricing</span>
                </div>
              </button>
            ) : (
              <div className="px-3.5 py-2 rounded-xl text-xs text-slate-400 flex items-center justify-between cursor-not-allowed opacity-60">
                <div className="flex items-center space-x-3">
                  <Tag className="w-4 h-4" />
                  <span>Menu Pricing</span>
                </div>
                <Lock className="w-3 h-3 text-slate-400" />
              </div>
            )}

            {/* Store Settings (Admin Only) */}
            {isAdmin && (
              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'settings'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Settings className="w-4 h-4" />
                  <span>Store Settings</span>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                  Admin
                </span>
              </button>
            )}
          </nav>
        </div>

        {/* Footer & Logout */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          <button
            onClick={handleLogout}
            className="w-full py-2 bg-slate-800/80 hover:bg-rose-950/40 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/30 text-slate-300 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center space-x-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out ({currentUser.role})</span>
          </button>
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>FastAPI :8000</span>
            </span>
            <span className="font-mono text-emerald-400 font-semibold">{currency} Active</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Global Notifications */}
        {orderNotice && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/30 text-emerald-300 px-6 py-2.5 text-xs flex items-center justify-between animate-fadeIn">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{orderNotice}</span>
            </div>
            <button onClick={() => setOrderNotice(null)} className="text-emerald-400 text-xs underline">Dismiss</button>
          </div>
        )}

        {voiceNotice && (
          <div className="bg-indigo-500/20 border-b border-indigo-500/30 text-indigo-300 px-6 py-2.5 text-xs flex items-center justify-between animate-fadeIn">
            <div className="flex items-center space-x-2">
              <Volume2 className="w-4 h-4 text-indigo-400 animate-bounce" />
              <span className="font-medium">{voiceNotice}</span>
            </div>
            <button onClick={() => setVoiceNotice('')} className="text-indigo-400 text-xs underline">Dismiss</button>
          </div>
        )}

        {/* Global Low Stock Banner for Admin/Manager */}
        {isAdminOrManager && lowStockItems.length > 0 && activeTab !== 'inventory' && (
          <div className="bg-rose-950/40 border-b border-rose-500/30 text-rose-300 px-6 py-2 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 animate-pulse" />
              <span>
                <strong>Low Stock Alert:</strong> {lowStockItems.length} raw ingredients are below safety reorder threshold (
                {lowStockItems.map((i) => i.name).slice(0, 3).join(', ')}
                {lowStockItems.length > 3 ? '...' : ''}).
              </span>
            </div>
            <button
              onClick={() => setActiveTab('inventory')}
              className="text-xs font-bold text-rose-300 underline hover:text-white flex items-center space-x-1"
            >
              <span>Restock Now</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: POS REGISTER + INTERACTIVE DINE-IN TABLE FLOOR PLAN                */}
        {/* ========================================================================= */}
        {activeTab === 'pos' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Catalog Grid */}
            <div className="flex-1 flex flex-col p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">POS Cashier Register</h2>
                  <p className="text-xs text-slate-400">Authenticated as {currentUser.full_name} ({currentUser.role})</p>
                </div>

                {/* Voice Ordering Button & Category Pills */}
                <div className="flex items-center space-x-3">
                  <button
                    onClick={toggleVoiceOrdering}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shadow-lg ${
                      isListening
                        ? 'bg-rose-500 text-white animate-pulse shadow-rose-500/30'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                    }`}
                    title="Speak dishes and quantities (e.g. 'two cheeseburgers and one cold brew')"
                  >
                    {isListening ? (
                      <>
                        <MicOff className="w-4 h-4" />
                        <span>Listening...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        <span>Voice Order (AI)</span>
                      </>
                    )}
                  </button>

                  <div className="flex space-x-2 overflow-x-auto pb-1">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          selectedCategory === cat
                            ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Voice Listening Active Banner */}
              {isListening && (
                <div className="mb-4 p-3 bg-gradient-to-r from-indigo-950/80 to-purple-950/80 border border-indigo-500/40 rounded-2xl flex items-center space-x-3 text-xs text-indigo-200">
                  <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping"></div>
                  <div>
                    <span className="font-bold text-white">Voice Assistant Active: </span>
                    <span>{voiceTranscript || 'Say e.g. "two cheeseburgers and one cold brew"'}</span>
                  </div>
                </div>
              )}

              {/* Menu Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMenu.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="group bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-xl hover:shadow-emerald-500/5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="h-32 rounded-xl overflow-hidden mb-3 bg-slate-800 relative">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-600">
                            <UtensilsCrossed className="w-8 h-8" />
                          </div>
                        )}
                        <span className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur text-emerald-400 font-bold text-xs px-2.5 py-1 rounded-full border border-emerald-500/20">
                          {currency}{item.price.toFixed(2)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-white group-hover:text-emerald-300 transition-colors text-sm">
                        {item.name}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                        {item.description || 'Crafted with premium fresh ingredients.'}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80">
                      <span className="text-[11px] font-mono text-slate-400">{item.code}</span>
                      <button className="px-3 py-1 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1">
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Current Order Cart & Table Floor Plan Sidebar */}
            <div className="w-96 bg-slate-900 border-l border-slate-800 flex flex-col justify-between p-5 overflow-y-auto">
              <div>
                {/* 1. Interactive Table Floor Plan Selector */}
                <div className="mb-4 pb-4 border-b border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                      <Grid className="w-4 h-4 text-emerald-400" />
                      <span>Table Floor Plan (1-12)</span>
                    </span>
                    <button
                      onClick={fetchTables}
                      className="text-[10px] text-slate-400 hover:text-emerald-400 flex items-center space-x-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Sync</span>
                    </button>
                  </div>

                  {/* Order Type Toggle */}
                  <div className="grid grid-cols-3 gap-1 mb-3">
                    {['DINE_IN', 'TAKEAWAY', 'DELIVERY'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setOrderType(t)}
                        className={`py-1 rounded-lg text-[10px] font-bold transition-all ${
                          orderType === t
                            ? 'bg-emerald-500 text-slate-950 shadow'
                            : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {t === 'DINE_IN' ? 'Dine-In' : t === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}
                      </button>
                    ))}
                  </div>

                  {/* Dine-In Tables Grid (Tables 1 to 12) */}
                  {orderType === 'DINE_IN' && (
                    <div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((tNum) => {
                          const tableInfo = tables.find((t) => t.table_number === tNum);
                          const isOccupied = tableInfo?.status === 'OCCUPIED';
                          const isSelected = selectedTable === tNum;

                          return (
                            <button
                              key={tNum}
                              type="button"
                              onClick={() => setSelectedTable(tNum)}
                              className={`p-1.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center relative ${
                                isSelected
                                  ? 'border-emerald-400 bg-emerald-500/20 ring-2 ring-emerald-500/30'
                                  : isOccupied
                                  ? 'border-rose-500/40 bg-rose-950/30 hover:border-rose-500 text-rose-300'
                                  : 'border-slate-800 bg-slate-950/80 hover:border-slate-700 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center space-x-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${isOccupied ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                                <span className="text-[11px] font-bold">T-{tNum}</span>
                              </div>
                              <span className="text-[9px] mt-0.5 font-mono">
                                {isOccupied ? (
                                  <span className="text-rose-400 font-semibold">{currency}{tableInfo?.total_amount?.toFixed(0)}</span>
                                ) : (
                                  <span className="text-emerald-400/80">Open</span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Floor Plan Legend */}
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 px-1">
                        <span className="flex items-center space-x-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          <span>Emerald = Open</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                          <span>Rose = Occupied (KDS Active)</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Cart Ticket Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <ShoppingBag className="w-4 h-4 text-emerald-400" />
                    <h3 className="font-bold text-sm text-white">
                      Ticket {orderType === 'DINE_IN' ? `(Table #${selectedTable})` : `(${orderType})`}
                    </h3>
                  </div>
                  {cart.length > 0 && (
                    <button
                      onClick={clearCart}
                      className="text-slate-400 hover:text-rose-400 text-xs flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>

                {/* Cart Items List */}
                <div className="mt-3 space-y-2.5 max-h-[calc(100vh-490px)] overflow-y-auto pr-1">
                  {cart.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      <UtensilsCrossed className="w-7 h-7 mx-auto text-slate-700 mb-2" />
                      <p>Ticket is empty.</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">Click dishes or use Voice Order.</p>
                    </div>
                  ) : (
                    cart.map((c) => (
                      <div
                        key={c.id}
                        className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between"
                      >
                        <div className="flex-1 pr-2">
                          <p className="text-xs font-semibold text-white">{c.name}</p>
                          <p className="text-[11px] text-slate-400">{currency}{c.price.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => updateQuantity(c.id, -1)}
                            className="w-5 h-5 bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center text-slate-200"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="w-4 text-center text-xs font-bold text-emerald-400">
                            {c.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(c.id, 1)}
                            className="w-5 h-5 bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center text-slate-200"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Order Summary & Submit */}
              <div className="pt-3 border-t border-slate-800 space-y-2.5">
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span>{currency}{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Sales Tax ({taxRatePercent}%)</span>
                    <span>{currency}{tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-white pt-1.5 border-t border-slate-800">
                    <span>Total</span>
                    <span className="text-emerald-400 font-mono text-base">{currency}{total.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  disabled={cart.length === 0}
                  onClick={submitOrder}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg ${
                    cart.length > 0
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  Checkout & Print Receipt ({currency}{total.toFixed(2)})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: KITCHEN DISPLAY SYSTEM (KDS)                                       */}
        {/* ========================================================================= */}
        {activeTab === 'kds' && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Kitchen Display System (KDS)</h2>
                <p className="text-xs text-slate-400">Advance tickets: Pending → Preparing → Ready (Frees Table)</p>
              </div>
              <button
                onClick={() => {
                  fetchOrders();
                  fetchTables();
                }}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center space-x-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Queue</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {['PENDING', 'PREPARING', 'READY'].map((statusKey) => {
                const columnOrders = orders.filter((o) => o.status === statusKey);
                const headerColors = {
                  PENDING: 'border-amber-500/40 text-amber-400 bg-amber-500/10',
                  PREPARING: 'border-blue-500/40 text-blue-400 bg-blue-500/10',
                  READY: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10',
                };

                return (
                  <div key={statusKey} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col">
                    <div className={`px-3 py-2 rounded-xl border font-bold text-xs mb-4 flex items-center justify-between ${headerColors[statusKey]}`}>
                      <span>{statusKey}</span>
                      <span className="bg-slate-950/60 px-2 py-0.5 rounded-full">{columnOrders.length}</span>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-250px)]">
                      {columnOrders.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 text-xs">No orders in queue</div>
                      ) : (
                        columnOrders.map((ord) => (
                          <div key={ord.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="font-mono text-[11px] text-emerald-400 font-bold">{ord.order_number}</span>
                                <div className="flex items-center space-x-1.5 mt-0.5">
                                  <span className="text-xs font-bold text-white">{ord.customer_name}</span>
                                  {ord.table_number && (
                                    <span className="px-1.5 py-0.2 text-[9px] font-mono bg-purple-500/20 text-purple-300 rounded border border-purple-500/30 font-bold">
                                      Table #{ord.table_number}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                                <Clock className="w-3 h-3" />
                                <span>{new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </span>
                            </div>

                            <div className="space-y-1 pt-2 border-t border-slate-800/80 text-xs">
                              {ord.items.map((it) => (
                                <div key={it.id} className="flex justify-between text-slate-300">
                                  <span>
                                    <strong className="text-emerald-400 font-bold">{it.quantity}x</strong> {it.menu_item_name}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="pt-2 flex justify-end space-x-2">
                              {statusKey === 'PENDING' && (
                                <button
                                  onClick={() => updateOrderStatus(ord.id, 'PREPARING')}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
                                >
                                  Start Prep
                                </button>
                              )}
                              {statusKey === 'PREPARING' && (
                                <button
                                  onClick={() => updateOrderStatus(ord.id, 'READY')}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                                >
                                  Mark Ready & Free Table
                                </button>
                              )}
                              {statusKey === 'READY' && (
                                <button
                                  onClick={() => updateOrderStatus(ord.id, 'COMPLETED')}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                                >
                                  Complete Ticket
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: AI DEMAND FORECAST & FINANCIAL CSV EXPORT                          */}
        {/* ========================================================================= */}
        {activeTab === 'ai' && isAdminOrManager && (
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
                  <TrendingUp className="w-6 h-6 text-emerald-400" />
                  <span>AI Demand Forecasting & Financial Analytics</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Scikit-Learn Random Forest regressor with calendar seasonality & trend analysis.
                </p>
              </div>

              {/* Action Buttons: 1-Click CSV Export & Re-run Forecast */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={downloadSalesCSV}
                  className="px-4 py-2 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-white border border-slate-700 font-bold rounded-xl text-xs flex items-center space-x-2 transition-all shadow"
                  title="Generate and download 30-day comprehensive financial sales CSV report"
                >
                  <Download className="w-4 h-4 text-emerald-400 group-hover:text-slate-950" />
                  <span>Export Sales Report (CSV)</span>
                </button>

                <button
                  disabled={loading}
                  onClick={fetchForecast}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-2 shadow-lg shadow-emerald-500/20"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Re-run ML Projections</span>
                </button>
              </div>
            </div>

            {forecastData && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <p className="text-xs text-slate-400 font-medium">7-Day Projected Demand</p>
                    <p className="text-2xl font-bold text-emerald-400 mt-1">
                      {forecastData.summary.total_projected_portions} <span className="text-xs text-slate-400">portions</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">Across all menu catalog dishes</p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <p className="text-xs text-slate-400 font-medium">Food Waste Prevented</p>
                    <p className="text-2xl font-bold text-teal-400 mt-1">
                      {forecastData.food_wastage_impact.estimated_food_waste_prevented_kg} <span className="text-xs text-slate-400">kg</span>
                    </p>
                    <p className="text-[11px] text-teal-300 mt-1">~14% reduction in perishable spoilage</p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <p className="text-xs text-slate-400 font-medium">Estimated Spoilage Savings</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1">
                      {currency}{forecastData.food_wastage_impact.estimated_financial_savings_usd}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">Saved from over-prep waste</p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <p className="text-xs text-slate-400 font-medium">Recommended Restock Budget</p>
                    <p className="text-2xl font-bold text-indigo-400 mt-1">
                      {currency}{forecastData.summary.estimated_restock_budget_needed}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">{forecastData.summary.warning_stock_count} stock alerts</p>
                  </div>
                </div>

                {/* 7-Day Demand Bar Chart */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-sm font-bold text-white mb-1">
                    7-Day Projected Demand by Menu Dish
                  </h3>
                  <p className="text-xs text-slate-400 mb-6">Generated using Time-Series Machine Learning</p>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={forecastData.dish_forecasts.map((d) => ({
                          name: d.name.length > 18 ? d.name.substring(0, 16) + '...' : d.name,
                          projected: d.weekly_projected_demand,
                        }))}
                        margin={{ top: 10, right: 10, left: -20, bottom: 35 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                        <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }}
                          itemStyle={{ color: '#34d399' }}
                        />
                        <Bar dataKey="projected" fill="#10b981" radius={[6, 6, 0, 0]} name="Projected Portions (7d)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: INVENTORY LEDGER & 1-CLICK RESTOCK                                 */}
        {/* ========================================================================= */}
        {activeTab === 'inventory' && isAdminOrManager && (
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
                  <Boxes className="w-6 h-6 text-emerald-400" />
                  <span>Raw Inventory & Stock Depletion Ledger</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Real-time ingredient levels depleted automatically per POS order. Click "+ Restock" for 1-click replenishment.
                </p>
              </div>
              <button
                onClick={fetchInventory}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center space-x-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Stock</span>
              </button>
            </div>

            {/* Prominent Low Stock Alert Banner */}
            {lowStockItems.length > 0 && (
              <div className="bg-rose-950/60 border border-rose-500/40 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-rose-950/20">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                    <AlertTriangle className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      Action Required: {lowStockItems.length} Ingredients are in Critical Low Stock
                    </h4>
                    <p className="text-xs text-rose-300/90 mt-0.5">
                      Current levels have breached the minimum safety threshold. Use 1-Click Restock buttons below.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Inventory Grid with 1-Click Restock */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {inventoryItems.map((inv) => (
                <div
                  key={inv.id}
                  className={`bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between transition-all ${
                    inv.low_stock
                      ? 'border-rose-500/60 shadow-lg shadow-rose-950/30 ring-1 ring-rose-500/30'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-mono text-slate-400 uppercase">{inv.category}</span>
                      {inv.low_stock ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold flex items-center space-x-1 animate-pulse">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          <span>LOW STOCK</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                          Healthy
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm text-white">{inv.name}</h4>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">{inv.sku}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-[10px] text-slate-400">Current Stock</p>
                        <p className={`text-base font-bold font-mono ${inv.low_stock ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {inv.current_stock} <span className="text-xs text-slate-400">{inv.unit}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400">Reorder Level</p>
                        <p className="text-xs font-mono text-slate-400">{inv.minimum_threshold} {inv.unit}</p>
                      </div>
                    </div>

                    {/* 1-Click Restock Button Group */}
                    <div className="flex space-x-1 pt-1">
                      <button
                        onClick={() => handleRestock(inv.id, 10)}
                        className="flex-1 py-1 bg-slate-800 hover:bg-emerald-600 hover:text-white rounded-lg text-[10px] font-bold text-slate-300 transition-colors"
                        title="Quick Restock +10 units"
                      >
                        +10 {inv.unit}
                      </button>
                      <button
                        onClick={() => handleRestock(inv.id, 25)}
                        className="flex-1 py-1 bg-slate-800 hover:bg-emerald-600 hover:text-white rounded-lg text-[10px] font-bold text-slate-300 transition-colors"
                        title="Quick Restock +25 units"
                      >
                        +25 {inv.unit}
                      </button>
                      <button
                        onClick={() => {
                          setRestockModalItem(inv);
                          setRestockQty(50);
                        }}
                        className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 rounded-lg text-[10px] font-bold transition-colors flex items-center space-x-1"
                        title="Custom restock"
                      >
                        <PackagePlus className="w-3 h-3" />
                        <span>Custom</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: MENU PRICING & MARGINS                                             */}
        {/* ========================================================================= */}
        {activeTab === 'menu_pricing' && isAdminOrManager && (
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
                  <Tag className="w-6 h-6 text-emerald-400" />
                  <span>Menu Pricing & Margin Management</span>
                </h2>
                <p className="text-xs text-slate-400">Update customer selling prices and inspect food cost margins.</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase">
                  <tr>
                    <th className="py-3 px-4">Dish</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Cost of Goods</th>
                    <th className="py-3 px-4">Current Price</th>
                    <th className="py-3 px-4">Gross Margin</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {menuItems.map((item) => {
                    const margin = item.price > 0 ? (((item.price - item.cost_price) / item.price) * 100).toFixed(1) : 0;
                    const isEditing = editingItemId === item.id;

                    return (
                      <tr key={item.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4">
                          <p className="font-bold text-white">{item.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{item.code}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{item.category}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{currency}{item.cost_price.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono">
                          {isEditing ? (
                            <div className="flex items-center space-x-1">
                              <span className="text-slate-400">{currency}</span>
                              <input
                                type="number"
                                step="0.25"
                                value={editPriceValue}
                                onChange={(e) => setEditPriceValue(e.target.value)}
                                className="w-20 px-2 py-1 bg-slate-950 border border-emerald-500 rounded text-emerald-400 text-xs font-mono focus:outline-none"
                              />
                            </div>
                          ) : (
                            <span className="font-bold text-emerald-400">{currency}{item.price.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            parseFloat(margin) >= 70 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {margin}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={async () => {
                                  const newPrice = parseFloat(editPriceValue);
                                  if (isNaN(newPrice) || newPrice <= 0) return;
                                  const res = await fetch(`${API_BASE}/menu/${item.id}`, {
                                    method: 'PATCH',
                                    headers: authHeaders,
                                    body: JSON.stringify({ price: newPrice }),
                                  });
                                  if (res.ok) {
                                    setEditingItemId(null);
                                    fetchMenu();
                                  }
                                }}
                                className="p-1.5 bg-emerald-500 text-slate-950 rounded-lg hover:bg-emerald-400"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingItemId(null)}
                                className="p-1.5 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingItemId(item.id);
                                setEditPriceValue(item.price.toString());
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center space-x-1 ml-auto"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: WHITE-LABEL STORE SETTINGS (ADMIN ONLY)                           */}
        {/* ========================================================================= */}
        {activeTab === 'settings' && isAdmin && (
          <div className="flex-1 p-6 overflow-y-auto space-y-6 max-w-4xl">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
                <Settings className="w-6 h-6 text-emerald-400" />
                <span>White-Label Restaurant Branding & Tax Settings</span>
              </h2>
              <p className="text-xs text-slate-400">
                Commercial SaaS configuration. Updates restaurant branding, currency symbols, and sales tax across all POS registers, receipts, and KDS screens.
              </p>
            </div>

            {settingsNotice && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{settingsNotice}</span>
              </div>
            )}

            <form onSubmit={saveStoreSettings} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Restaurant Business Name</label>
                  <input
                    type="text"
                    required
                    value={settingsForm.restaurant_name}
                    onChange={(e) => setSettingsForm({ ...settingsForm, restaurant_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. The Gourmet Haven"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Tagline / Subheading</label>
                  <input
                    type="text"
                    required
                    value={settingsForm.tagline}
                    onChange={(e) => setSettingsForm({ ...settingsForm, tagline: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. Modern Fusion & Craft Cocktails"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Physical Address (Prints on Receipt)</label>
                  <input
                    type="text"
                    required
                    value={settingsForm.address}
                    onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. 742 Evergreen Terrace, Springfield"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Customer Support Phone</label>
                  <input
                    type="text"
                    required
                    value={settingsForm.phone}
                    onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. (555) 019-2831"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Currency Symbol</label>
                  <select
                    value={settingsForm.currency_symbol}
                    onChange={(e) => setSettingsForm({ ...settingsForm, currency_symbol: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="$">$ (USD / CAD / AUD)</option>
                    <option value="PKR">PKR (Pakistani Rupee)</option>
                    <option value="AED">AED (UAE Dirham)</option>
                    <option value="£">£ (British Pound)</option>
                    <option value="€">€ (Euro)</option>
                    <option value="₹">₹ (Indian Rupee)</option>
                    <option value="SAR">SAR (Saudi Riyal)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Sales Tax Rate (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="40"
                      required
                      value={settingsForm.tax_rate}
                      onChange={(e) => setSettingsForm({ ...settingsForm, tax_rate: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                    <Percent className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-3" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 flex items-center space-x-2 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Store Configuration</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* 80mm THERMAL RECEIPT MODAL                                                */}
      {/* ========================================================================= */}
      {showReceiptModal && completedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 print:hidden">
              <div className="flex items-center space-x-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-bold text-xs">Order Confirmed</span>
              </div>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 80mm Thermal Receipt Layout */}
            <div
              id="thermal-receipt"
              className="bg-white text-slate-950 p-6 rounded-2xl shadow-inner font-mono text-[11px] leading-relaxed max-w-[320px] mx-auto border border-dashed border-slate-300"
            >
              <div className="text-center pb-3 border-b border-dashed border-slate-300">
                <h3 className="font-black text-sm tracking-wider uppercase">{storeSettings.restaurant_name}</h3>
                <p className="text-[10px] text-slate-600">{storeSettings.tagline}</p>
                <p className="text-[9px] text-slate-500">{storeSettings.address}</p>
                <p className="text-[9px] text-slate-500">Tel: {storeSettings.phone}</p>
              </div>

              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-600">RECEIPT #:</span>
                  <span className="font-bold">{completedOrder.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">DATE:</span>
                  <span>{new Date(completedOrder.created_at).toLocaleDateString()} {new Date(completedOrder.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">CASHIER:</span>
                  <span>{currentUser?.full_name?.split(' ')[0] || 'Staff'} ({currentUser?.role})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">LOCATION:</span>
                  <span className="font-bold">
                    {completedOrder.table_number ? `Table #${completedOrder.table_number} (Dine-In)` : completedOrder.order_type}
                  </span>
                </div>
              </div>

              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1.5">
                <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase pb-1 border-b border-slate-200">
                  <span>ITEM</span>
                  <span className="text-right">AMOUNT</span>
                </div>
                {completedOrder.items.map((it) => (
                  <div key={it.id} className="flex justify-between items-start text-[10px]">
                    <div className="pr-2">
                      <span className="font-bold">{it.quantity}x</span> {it.menu_item_name}
                    </div>
                    <span className="font-bold">{currency}{it.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[10px]">
                <div className="flex justify-between text-slate-600">
                  <span>SUBTOTAL:</span>
                  <span>{currency}{completedOrder.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>SALES TAX ({taxRatePercent}%):</span>
                  <span>{currency}{completedOrder.tax_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs font-black pt-1 border-t border-slate-300">
                  <span>TOTAL:</span>
                  <span className="text-sm font-black">{currency}{completedOrder.total_amount.toFixed(2)}</span>
                </div>
              </div>

              <div className="py-2 text-[9px] space-y-0.5 text-center text-slate-600 border-b border-dashed border-slate-300">
                <p>PAYMENT METHOD: {completedOrder.payment_method}</p>
                <p>STATUS: {completedOrder.payment_status} (AUTH #83921)</p>
              </div>

              <div className="pt-3 text-center space-y-1.5">
                <div className="h-7 flex justify-center items-center space-x-1 opacity-80">
                  <div className="w-1 h-7 bg-black"></div>
                  <div className="w-2 h-7 bg-black"></div>
                  <div className="w-1 h-7 bg-black"></div>
                  <div className="w-3 h-7 bg-black"></div>
                  <div className="w-1 h-7 bg-black"></div>
                  <div className="w-2 h-7 bg-black"></div>
                  <div className="w-1 h-7 bg-black"></div>
                  <div className="w-2 h-7 bg-black"></div>
                  <div className="w-3 h-7 bg-black"></div>
                  <div className="w-1 h-7 bg-black"></div>
                </div>
                <p className="text-[8px] font-mono tracking-widest text-slate-500 uppercase">
                  *{completedOrder.order_number}*
                </p>
                <p className="text-[10px] font-semibold text-slate-800">THANK YOU FOR DINING WITH US!</p>
                <p className="text-[8px] text-slate-500">Powered by RestoAI Smart Hospitality</p>
              </div>
            </div>

            {/* Modal Buttons */}
            <div className="mt-4 flex space-x-3 print:hidden">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20"
              >
                <Printer className="w-4 h-4" />
                <span>Print 80mm Receipt</span>
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CUSTOM RESTOCK MODAL (ADMIN / MANAGER)                                    */}
      {/* ========================================================================= */}
      {restockModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-emerald-400">
                <PackagePlus className="w-5 h-5" />
                <span className="font-bold text-sm">Replenish Inventory</span>
              </div>
              <button
                onClick={() => setRestockModalItem(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white">{restockModalItem.name}</h4>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Current: {restockModalItem.current_stock} {restockModalItem.unit} | Min Level: {restockModalItem.minimum_threshold} {restockModalItem.unit}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Replenishment Quantity ({restockModalItem.unit})</label>
              <input
                type="number"
                min="1"
                step="1"
                value={restockQty}
                onChange={(e) => setRestockQty(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => handleRestock(restockModalItem.id, restockQty)}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center justify-center space-x-2"
              >
                <Check className="w-4 h-4" />
                <span>Confirm +{restockQty} {restockModalItem.unit}</span>
              </button>
              <button
                onClick={() => setRestockModalItem(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
