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

// Number words map for voice parsing
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
  const [activeTab, setActiveTab] = useState('pos'); // pos | kds | ai | inventory | menu_pricing
  const [menuItems, setMenuItems] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState([]);
  const [orderNotice, setOrderNotice] = useState(null);

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

  // Fetch data on authentication
  useEffect(() => {
    if (token && currentUser) {
      fetchMenu();
      fetchOrders();
      if (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER') {
        fetchInventory();
        fetchForecast();
      }
    }
  }, [token, currentUser]);

  // Auth Headers helper
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

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
      if (res.ok) setOrders(await res.json());
    } catch (err) {
      console.error('Error fetching orders:', err);
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

  // =========================================================================
  // VOICE ORDERING WITH WEB SPEECH API
  // =========================================================================
  const parseVoiceCommand = (text) => {
    const cleanText = text.toLowerCase().trim();
    if (!cleanText || menuItems.length === 0) return;

    // Define aliases for fuzzy speech matching
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

    // Split speech by phrases / conjunctions
    const phrases = cleanText.split(/\band\b|\bplus\b|\balso\b|,/);
    const addedItems = [];

    phrases.forEach((phrase) => {
      const trimmed = phrase.trim();
      if (!trimmed) return;

      // Extract quantity from phrase (default 1)
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

      // Find matching menu item
      let matchedMenuItem = null;

      // 1. Check alias keywords
      for (const alias of itemAliases) {
        for (const kw of alias.keywords) {
          if (trimmed.includes(kw)) {
            matchedMenuItem = menuItems.find((m) => m.code === alias.id);
            if (matchedMenuItem) break;
          }
        }
        if (matchedMenuItem) break;
      }

      // 2. Direct name substring check
      if (!matchedMenuItem) {
        matchedMenuItem = menuItems.find((m) =>
          trimmed.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(trimmed)
        );
      }

      if (matchedMenuItem) {
        // Add to cart with specified quantity
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
      alert("Web Speech API is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
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

  // Submit Order & Display Thermal Receipt
  const submitOrder = async () => {
    if (cart.length === 0) return;
    try {
      const payload = {
        customer_name: `Table #${Math.floor(Math.random() * 15) + 1}`,
        table_number: Math.floor(Math.random() * 15) + 1,
        order_type: 'DINE_IN',
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
        // Set completed order and open the thermal receipt modal
        setCompletedOrder(newOrder);
        setShowReceiptModal(true);

        setOrderNotice(`Order ${newOrder.order_number} confirmed! Raw ingredients deducted.`);
        setTimeout(() => setOrderNotice(null), 4000);
        clearCart();
        fetchOrders();
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
      if (res.ok) fetchOrders();
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.0825;
  const total = subtotal + tax;

  const categories = ['ALL', ...new Set(menuItems.map((m) => m.category))];
  const filteredMenu =
    selectedCategory === 'ALL'
      ? menuItems
      : menuItems.filter((m) => m.category === selectedCategory);

  const isCashier = currentUser?.role === 'CASHIER';
  const isAdminOrManager = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';

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
            <h1 className="text-2xl font-bold tracking-tight text-white">RestoAI Portal</h1>
            <p className="text-xs text-slate-400 mt-1">Smart Restaurant POS & AI Demand Forecasting</p>
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
              <span>{loginLoading ? 'Authenticating...' : 'Sign In to RestoAI'}</span>
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
          {/* Logo & User Role Banner */}
          <div className="p-5 border-b border-slate-800">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Sparkles className="w-5 h-5 text-slate-950 font-bold" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white leading-tight">RestoAI</h1>
                <p className="text-[11px] text-emerald-400 font-medium">Smart POS & AI</p>
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
                  <span>AI Demand Forecast</span>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                  7-Day ML
                </span>
              </button>
            ) : (
              <div className="px-3.5 py-2 rounded-xl text-xs text-slate-400 flex items-center justify-between cursor-not-allowed opacity-60">
                <div className="flex items-center space-x-3">
                  <TrendingUp className="w-4 h-4" />
                  <span>AI Demand Forecast</span>
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
                  <span>Inventory Ledger</span>
                </div>
                {inventoryItems.filter((i) => i.low_stock).length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                    {inventoryItems.filter((i) => i.low_stock).length} Low
                  </span>
                )}
              </button>
            ) : (
              <div className="px-3.5 py-2 rounded-xl text-xs text-slate-400 flex items-center justify-between cursor-not-allowed opacity-60">
                <div className="flex items-center space-x-3">
                  <Boxes className="w-4 h-4" />
                  <span>Inventory Ledger</span>
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
            <span className="font-mono text-emerald-400 font-semibold">JWT Active</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Notification Banners */}
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

        {/* 1. POS Terminal View */}
        {activeTab === 'pos' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Catalog Grid */}
            <div className="flex-1 flex flex-col p-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">POS Cashier Register</h2>
                  <p className="text-xs text-slate-400">Authenticated as {currentUser.full_name} ({currentUser.role})</p>
                </div>

                {/* Voice Ordering Button & Category Pills */}
                <div className="flex items-center space-x-3">
                  {/* Voice Order Button */}
                  <button
                    onClick={toggleVoiceOrdering}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shadow-lg ${
                      isListening
                        ? 'bg-rose-500 text-white animate-pulse shadow-rose-500/30'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                    }`}
                    title="Speak menu item and quantity to add to ticket"
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

                  {/* Category Pills */}
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
                          ${item.price.toFixed(2)}
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

            {/* Current Order Cart Sidebar */}
            <div className="w-88 bg-slate-900 border-l border-slate-800 flex flex-col justify-between p-6">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <ShoppingBag className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-bold text-base text-white">Current Ticket</h3>
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
                <div className="mt-4 space-y-3 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
                  {cart.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      <UtensilsCrossed className="w-8 h-8 mx-auto text-slate-700 mb-2" />
                      <p>Ticket is currently empty.</p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Click dishes or use <strong>Voice Order</strong>.
                      </p>
                    </div>
                  ) : (
                    cart.map((c) => (
                      <div
                        key={c.id}
                        className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between"
                      >
                        <div className="flex-1 pr-2">
                          <p className="text-xs font-semibold text-white">{c.name}</p>
                          <p className="text-[11px] text-slate-400">${c.price.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => updateQuantity(c.id, -1)}
                            className="w-6 h-6 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center text-slate-200"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-5 text-center text-xs font-bold text-emerald-400">
                            {c.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(c.id, 1)}
                            className="w-6 h-6 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center text-slate-200"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Order Summary & Submit */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Sales Tax (8.25%)</span>
                    <span>${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
                    <span>Total Amount</span>
                    <span className="text-emerald-400 font-mono text-base">${total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-2 text-[10px] text-emerald-300 flex items-start space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Deducts raw inventory & generates printable 80mm receipt.</span>
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
                  Checkout & Print Receipt (${total.toFixed(2)})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Kitchen Display System (KDS) View */}
        {activeTab === 'kds' && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Kitchen Display System (KDS)</h2>
                <p className="text-xs text-slate-400">Advance orders: Pending → Preparing → Ready</p>
              </div>
              <button
                onClick={fetchOrders}
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
                                <h4 className="text-xs font-bold text-white">{ord.customer_name}</h4>
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
                                  Mark Ready
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

        {/* 3. AI Demand Forecasting Dashboard */}
        {activeTab === 'ai' && isAdminOrManager && (
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
                  <TrendingUp className="w-6 h-6 text-emerald-400" />
                  <span>AI Demand Forecasting & Restock Analytics</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Scikit-Learn Random Forest regressor with calendar seasonality & trend analysis.
                </p>
              </div>
              <button
                disabled={loading}
                onClick={fetchForecast}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-2 shadow-lg shadow-emerald-500/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Re-run ML Projections</span>
              </button>
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
                      ${forecastData.food_wastage_impact.estimated_financial_savings_usd}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">Saved from over-prep waste</p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <p className="text-xs text-slate-400 font-medium">Recommended Restock Budget</p>
                    <p className="text-2xl font-bold text-indigo-400 mt-1">
                      ${forecastData.summary.estimated_restock_budget_needed}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">{forecastData.summary.warning_stock_count} stock alerts</p>
                  </div>
                </div>

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

                {/* Restock Alerts Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-sm font-bold text-white mb-1">Raw Ingredient Restock Recommendations</h3>
                  <p className="text-xs text-slate-400 mb-4">Calculated by multiplying forecast by recipe bill-of-materials</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 font-semibold uppercase">
                        <tr>
                          <th className="py-2.5 px-3">Ingredient</th>
                          <th className="py-2.5 px-3">Current Stock</th>
                          <th className="py-2.5 px-3">7-Day Demand</th>
                          <th className="py-2.5 px-3">Recommended Restock</th>
                          <th className="py-2.5 px-3">Estimated Cost</th>
                          <th className="py-2.5 px-3">Urgency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {forecastData.ingredient_restock_alerts.map((ing) => (
                          <tr key={ing.inventory_item_id} className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-3 font-semibold text-white">{ing.name}</td>
                            <td className="py-2.5 px-3 font-mono">{ing.current_stock} {ing.unit}</td>
                            <td className="py-2.5 px-3 font-mono text-emerald-400">{ing.weekly_projected_demand} {ing.unit}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-white">
                              {ing.recommended_restock_quantity > 0 ? (
                                <span className="text-amber-400">+{ing.recommended_restock_quantity} {ing.unit}</span>
                              ) : (
                                <span className="text-slate-400">Sufficient</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-300">${ing.estimated_restock_cost.toFixed(2)}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  ing.status === 'CRITICAL'
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                    : ing.status === 'WARNING'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                }`}
                              >
                                {ing.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* 4. Live Inventory View */}
        {activeTab === 'inventory' && isAdminOrManager && (
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">Raw Inventory & Stock Depletion Ledger</h2>
                <p className="text-xs text-slate-400">Live stock levels automatically updated upon each order.</p>
              </div>
              <button
                onClick={fetchInventory}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center space-x-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Stock</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {inventoryItems.map((inv) => (
                <div
                  key={inv.id}
                  className={`bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between ${
                    inv.low_stock ? 'border-rose-500/50 shadow-lg shadow-rose-500/5' : 'border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-mono text-slate-400 uppercase">{inv.category}</span>
                      {inv.low_stock && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          <span>LOW STOCK</span>
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-xs text-white">{inv.name}</h4>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">{inv.sku}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400">Current Stock</p>
                      <p className="text-base font-bold font-mono text-emerald-400">
                        {inv.current_stock} <span className="text-xs text-slate-400">{inv.unit}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400">Reorder Level</p>
                      <p className="text-xs font-mono text-slate-400">{inv.minimum_threshold} {inv.unit}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Menu Pricing & Catalog View */}
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
                        <td className="py-3 px-4 font-mono text-slate-400">${item.cost_price.toFixed(2)}</td>
                        <td className="py-3 px-4 font-mono">
                          {isEditing ? (
                            <div className="flex items-center space-x-1">
                              <span className="text-slate-400">$</span>
                              <input
                                type="number"
                                step="0.25"
                                value={editPriceValue}
                                onChange={(e) => setEditPriceValue(e.target.value)}
                                className="w-20 px-2 py-1 bg-slate-950 border border-emerald-500 rounded text-emerald-400 text-xs font-mono focus:outline-none"
                              />
                            </div>
                          ) : (
                            <span className="font-bold text-emerald-400">${item.price.toFixed(2)}</span>
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
                                onClick={() => savePriceChange(item.id)}
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
                              <span>Edit Price</span>
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
      </main>

      {/* ========================================================================= */}
      {/* 80mm THERMAL RECEIPT MODAL                                                */}
      {/* ========================================================================= */}
      {showReceiptModal && completedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
            {/* Modal Actions Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4 print:hidden">
              <div className="flex items-center space-x-2 text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-bold text-sm">Order Placed Successfully</span>
              </div>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 80mm Thermal Receipt Layout Container */}
            <div
              id="thermal-receipt"
              className="bg-white text-slate-950 p-6 rounded-2xl shadow-inner font-mono text-[11px] leading-relaxed max-w-[320px] mx-auto border border-dashed border-slate-300"
            >
              {/* Receipt Header */}
              <div className="text-center pb-3 border-b border-dashed border-slate-300">
                <h3 className="font-extrabold text-base tracking-wider uppercase">RESTOAI BISTRO</h3>
                <p className="text-[10px] text-slate-600">Smart AI Hospitality System</p>
                <p className="text-[9px] text-slate-500">100 Innovation Way, Silicon Valley</p>
                <p className="text-[9px] text-slate-500">Tel: (555) 019-2831</p>
              </div>

              {/* Order Meta */}
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
                  <span className="text-slate-600">TABLE / TYPE:</span>
                  <span>Table #{completedOrder.table_number || '1'} ({completedOrder.order_type})</span>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5">
                <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase pb-1 border-b border-slate-200">
                  <span>ITEM</span>
                  <span className="text-right">AMOUNT</span>
                </div>
                {completedOrder.items.map((it) => (
                  <div key={it.id} className="flex justify-between items-start text-[10px]">
                    <div className="pr-2">
                      <span className="font-bold">{it.quantity}x</span> {it.menu_item_name}
                    </div>
                    <span className="font-bold">${it.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Subtotal & Total */}
              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[10px]">
                <div className="flex justify-between text-slate-600">
                  <span>SUBTOTAL:</span>
                  <span>${completedOrder.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>TAX (8.25%):</span>
                  <span>${completedOrder.tax_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs font-black pt-1 border-t border-slate-300">
                  <span>TOTAL:</span>
                  <span className="text-sm font-black">${completedOrder.total_amount.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="py-2 text-[9px] space-y-0.5 text-center text-slate-600 border-b border-dashed border-slate-300">
                <p>PAYMENT METHOD: {completedOrder.payment_method}</p>
                <p>STATUS: {completedOrder.payment_status} (AUTH #83921)</p>
              </div>

              {/* Barcode & Footer */}
              <div className="pt-3 text-center space-y-2">
                {/* Simulated Thermal Barcode */}
                <div className="h-8 flex justify-center items-center space-x-1 opacity-80">
                  <div className="w-1 h-8 bg-black"></div>
                  <div className="w-2 h-8 bg-black"></div>
                  <div className="w-1 h-8 bg-black"></div>
                  <div className="w-3 h-8 bg-black"></div>
                  <div className="w-1 h-8 bg-black"></div>
                  <div className="w-2 h-8 bg-black"></div>
                  <div className="w-1 h-8 bg-black"></div>
                  <div className="w-2 h-8 bg-black"></div>
                  <div className="w-3 h-8 bg-black"></div>
                  <div className="w-1 h-8 bg-black"></div>
                  <div className="w-2 h-8 bg-black"></div>
                  <div className="w-1 h-8 bg-black"></div>
                </div>
                <p className="text-[8px] font-mono tracking-widest text-slate-500 uppercase">
                  *{completedOrder.order_number}*
                </p>
                <p className="text-[10px] font-semibold text-slate-800">THANK YOU FOR DINING WITH US!</p>
                <p className="text-[8px] text-slate-500">Powered by RestoAI Smart POS</p>
              </div>
            </div>

            {/* Modal Buttons */}
            <div className="mt-5 flex space-x-3 print:hidden">
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
    </div>
  );
}
