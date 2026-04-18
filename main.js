/* ========================================
   THE ARCHIVE — Shared JavaScript
   ======================================== */

// ---- Auth Guard (Guest Browsing & Protected Pages) ----
const SESSION_KEY = 'archive_active_session';

function isActiveSession() {
  return !!localStorage.getItem(SESSION_KEY);
}

function getSessionEmail() {
  return localStorage.getItem(SESSION_KEY);
}

(function initAuthGuard() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  const protectedPages = ['account.html', 'checkout.html', 'wishlist.html'];
  const authPages = ['signin.html', 'signup.html'];
  
  const isActive = isActiveSession();

  if (!isActive && protectedPages.includes(path)) {
    // Force redirect unauthenticated users for protected content
    window.location.href = `signin.html?redirect=${path}`;
  } else if (isActive && authPages.includes(path)) {
    // Prevent authenticated users from seeing signin/signup
    window.location.href = 'account.html';
  }
})();

function requireAuth() {
  if (!isActiveSession()) {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    showToast('Please sign in to access this feature.');
    setTimeout(() => {
      window.location.href = `signin.html?redirect=${path}`;
    }, 1200);
    return false;
  }
  return true;
}

// ---- Cart State (localStorage-backed) ----
const CART_KEY = 'archive_cart';

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadges();
}

function addToCart(item) {
  if (!requireAuth()) return;
  const cart = getCart();
  const existing = cart.find(i => i.id === item.id && i.size === item.size && i.color === item.color);
  if (existing) {
    existing.qty = (existing.qty || 1) + (item.qty || 1);
  } else {
    cart.push({ ...item, qty: item.qty || 1 });
  }
  saveCart(cart);
  showToast(`"${item.name}" added to your archive.`);
}

function removeFromCart(id, size, color) {
  let cart = getCart();
  cart = cart.filter(i => !(i.id === id && i.size === size && i.color === color));
  saveCart(cart);
}

function updateQty(id, size, color, qty) {
  const cart = getCart();
  const item = cart.find(i => i.id === id && i.size === size && i.color === color);
  if (item) {
    if (qty <= 0) { removeFromCart(id, size, color); return; }
    item.qty = qty;
  }
  saveCart(cart);
}

function getCartTotal() {
  return getCart().reduce((sum, i) => sum + i.price * (i.qty || 1), 0);
}

function getCartCount() {
  return getCart().reduce((sum, i) => sum + (i.qty || 1), 0);
}

function updateCartBadges() {
  const count = getCartCount();
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
}

// ---- Wishlist State ----
function getWishlist() {
  const email = getSessionEmail();
  if (!email) return [];
  try {
    const db = JSON.parse(localStorage.getItem('archive_users')) || {};
    return db[email]?.wishlist || [];
  } catch(e) { return []; }
}

function saveWishlist(wishlist) {
  const email = getSessionEmail();
  if (!email) return;
  try {
    const db = JSON.parse(localStorage.getItem('archive_users')) || {};
    if (db[email]) {
      db[email].wishlist = wishlist;
      localStorage.setItem('archive_users', JSON.stringify(db));
    }
  } catch(e) {}
}

function toggleWishlist(productId, btnElement) {
  if (!requireAuth()) return;
  let list = getWishlist();
  
  // Find index considering type mismatch
  const index = list.findIndex(id => id == productId);
  
  if (index > -1) {
    list.splice(index, 1);
    if(btnElement) {
        btnElement.classList.remove('active');
        const path = btnElement.querySelector('path');
        if(path) path.setAttribute('fill', 'none');
    }
    showToast('Removed from wishlist.');
  } else {
    list.push(productId);
    if(btnElement) {
        btnElement.classList.add('active');
        const path = btnElement.querySelector('path');
        if(path) path.setAttribute('fill', 'currentColor');
    }
    showToast('Added to your wishlist.');
  }
  saveWishlist(list);
}

// ---- Address Management ----
function getAddresses() {
  const email = getSessionEmail();
  if (!email) return [];
  try {
    const db = JSON.parse(localStorage.getItem('archive_users')) || {};
    return db[email]?.addresses || [];
  } catch(e) { return []; }
}

function saveAddresses(addresses) {
  const email = getSessionEmail();
  if (!email) return;
  try {
    const db = JSON.parse(localStorage.getItem('archive_users')) || {};
    if (db[email]) {
      db[email].addresses = addresses;
      localStorage.setItem('archive_users', JSON.stringify(db));
    }
  } catch(e) {}
}

function addAddress(newAddress) {
  const list = getAddresses();
  const id = Date.now();
  list.push({ ...newAddress, id, label: newAddress.label || 'Other' });
  saveAddresses(list);
  return id;
}

function updateAddress(id, updatedAddress) {
  const list = getAddresses();
  const index = list.findIndex(a => a.id == id);
  if (index !== -1) {
    list[index] = { ...list[index], ...updatedAddress };
    saveAddresses(list);
    return true;
  }
  return false;
}

function deleteAddress(id) {
  let list = getAddresses();
  list = list.filter(a => a.id != id);
  saveAddresses(list);
}

function getAddress() {
  const list = getAddresses();
  return list.length > 0 ? list[0] : null;
}

// ---- Dynamic Order Management ----
function updateOrderStatuses() {
  const email = getSessionEmail();
  if (!email) return;
  
  try {
    const db = JSON.parse(localStorage.getItem('archive_users')) || {};
    if (!db[email] || !db[email].orders) return;
    
    let changed = false;
    const now = new Date();
    
    db[email].orders = db[email].orders.map(order => {
      if (order.status === 'Cancelled' || order.status === 'Returned') return order;
      
      const orderDate = new Date(order.date);
      const diffMinutes = (now - orderDate) / (1000 * 60);
      const diffDays = (now - orderDate) / (1000 * 60 * 60 * 24);
      
      // After 2 mins -> Confirmed
      if (order.status === 'Processing' && diffMinutes >= 2) {
        order.status = 'Confirmed';
        changed = true;
      }
      
      // After 10 mins -> Delivered
      if (order.status === 'Confirmed' && diffMinutes >= 10) {
        order.status = 'Delivered';
        changed = true;
      }
      
      // Update return availability (can only return within 7 days of order/delivery)
      order.canReturn = (order.status === 'Delivered' && diffDays <= 7);
      
      return order;
    });
    
    if (changed) {
      localStorage.setItem('archive_users', JSON.stringify(db));
    }
  } catch(e) { console.error("Status update error", e); }
}

function returnOrder(orderId) {
    const email = getSessionEmail();
    if (!email) return;
    
    if(!confirm('Are you sure you want to return this curation? A master craftsperson will be assigned for pick-up inspection.')) return;

    try {
        let usersDB = JSON.parse(localStorage.getItem('archive_users'));
        let orders = usersDB[email].orders;
        let idx = orders.findIndex(o => o.id === orderId);
        
        if (idx > -1 && orders[idx].canReturn) {
            orders[idx].status = 'Returned';
            orders[idx].canReturn = false;
            localStorage.setItem('archive_users', JSON.stringify(usersDB));
            showToast('Return initiated. Pick-up scheduled within 48 hours.');
            if (typeof renderOrders === 'function') renderOrders(orders, email);
        }
    } catch(e) {}
}

// ---- Toast ----
let toastTimer;
function showToast(msg) {
  let toast = document.getElementById('site-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'site-toast';
    toast.className = 'toast';
    toast.innerHTML = `<span class="toast-icon">✦</span><span class="toast-msg"></span>`;
    document.body.appendChild(toast);
  }
  toast.querySelector('.toast-msg').textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

// ---- Mobile nav toggle ----
function initMobileNav() {
  const hamburger = document.getElementById('nav-hamburger');
  const mobileNav = document.getElementById('mobile-nav');
  if (!hamburger || !mobileNav) return;

  hamburger.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  mobileNav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      mobileNav.classList.remove('open');
      hamburger.setAttribute('aria-expanded', false);
      document.body.style.overflow = '';
    });
  });
}

// ---- Scroll reveal ----
function initScrollReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => observer.observe(el));
}

// ---- Nav scroll effect ----
function initNavScroll() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.style.background = window.scrollY > 20
      ? 'rgba(252,249,248,0.97)'
      : 'rgba(252,249,248,0.85)';
  }, { passive: true });
}

// ---- Active nav link ----
function setActiveNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  
  // Header Links
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path || (path === '' && href === 'index.html')) {
      a.classList.add('active');
    } else {
      a.classList.remove('active');
    }
  });

  // Sidebar Links (Dashboard/Account)
  document.querySelectorAll('.sidebar-nav-item').forEach(link => {
    const href = link.getAttribute('href');
    if (href === path) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

// ---- Page entry animation ----
function initPageEntry() {
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.4s ease';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { document.body.style.opacity = '1'; });
  });
}

// ---- Navigate (SPA-like page transition) ----
function navigateTo(url) {
  document.body.style.opacity = '0';
  setTimeout(() => { window.location.href = url; }, 350);
}

// Make product cards clickable
function initProductCards() {
  document.querySelectorAll('.product-card[data-href]').forEach(card => {
    card.addEventListener('click', () => navigateTo(card.dataset.href));
  });
}

// ---- Update Auth Links ----
function updateAuthLinks() {
  const isActive = isActiveSession();
  const email = getSessionEmail();
  
  if (isActive) {
    let usersDB = {};
    try { usersDB = JSON.parse(localStorage.getItem('archive_users')) || {}; } catch(e) {}
    const user = usersDB[email];
    const firstName = user ? user.name.split(' ')[0] : 'Member';

    // Desktop
    document.querySelectorAll('a[href="signin.html"]').forEach(a => {
      a.href = 'account.html';
      a.title = `Account: ${firstName}`;
      if (a.textContent.trim() === 'Sign In') {
        a.textContent = 'Account';
      }
    });
    // Mobile
    const mobileLink = document.querySelector('.mobile-nav a[href="signin.html"]');
    if (mobileLink) {
      mobileLink.href = 'account.html';
      mobileLink.textContent = `Account: ${firstName}`;
    }
  }
}

function handleSignOut() {
  localStorage.removeItem(SESSION_KEY);
  showToast('Signed out of your archive.');
  setTimeout(() => { window.location.href = 'index.html'; }, 800);
}

// ---- Wishlist UI Sync for Cards ----
function updateCardWishlistUI(btn, id) {
  const isWished = getWishlist().includes(id.toString()) || getWishlist().includes(parseInt(id));
  if (isWished) {
    btn.classList.add('active');
    const path = btn.querySelector('path');
    if (path) path.setAttribute('fill', 'currentColor');
  } else {
    btn.classList.remove('active');
    const path = btn.querySelector('path');
    if (path) path.setAttribute('fill', 'none');
  }
}

function initCardWishlistUI() {
  document.querySelectorAll('.card-wishlist-btn').forEach(btn => {
    const pid = btn.getAttribute('data-product-id');
    if (pid) updateCardWishlistUI(btn, pid);
  });
}

// ---- DOM Ready ----
document.addEventListener('DOMContentLoaded', () => {
  initPageEntry();
  updateAuthLinks();
  initMobileNav();
  initScrollReveal();
  initNavScroll();
  setActiveNav();
  updateCartBadges();
  initProductCards();
  initCardWishlistUI();
});
