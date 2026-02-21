// frontend/app-marketplace.js v1
// B2B Phase 4: Marketplace — product catalog, cart, orders

(function(global) {
    'use strict';

    function _escSafe(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // ── In-memory cart ──
    var _cart = [];

    // ── Category Config ──
    var CAT_CONFIG = {
        service:      { color: '#4A90D9', icon: 'briefcase', label: 'Servizi' },
        package:      { color: '#8E44AD', icon: 'package', label: 'Pacchetti' },
        nutrition:    { color: '#27AE60', icon: 'apple', label: 'Nutrizione' },
        insurance:    { color: '#E67E22', icon: 'shield', label: 'Assicurazioni' },
        subscription: { color: '#16A085', icon: 'repeat', label: 'Abbonamenti' },
        course:       { color: '#2C3E50', icon: 'graduation-cap', label: 'Corsi' }
    };

    var CAT_ORDER = ['service', 'package', 'nutrition', 'insurance', 'subscription', 'course'];

    // ── Main ──
    async function loadMarketplacePage() {
        var page = document.getElementById('page-marketplace');
        if (!page) return;
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento marketplace...</p></div>';

        try {
            var results = await Promise.all([
                fetchApi('/api/marketplace/products'),
                fetchApi('/api/marketplace/orders')
            ]);

            if (!results[0].ok) throw new Error('Errore prodotti ' + results[0].status);
            var ordersOk = results[1].ok;

            var productsData = await results[0].json();
            var ordersData = ordersOk ? await results[1].json() : { orders: [] };

            var products = productsData.products || productsData.data || [];
            var orders = ordersData.orders || ordersData.data || [];

            _renderMarketplace(page, products, orders);
        } catch (e) {
            page.innerHTML = '<div class="error-message">Errore caricamento marketplace: ' + _escSafe(e.message) + '</div>';
        }
    }

    function _renderMarketplace(page, products, orders) {
        var html = '<h2 style="margin:0 0 20px"><i data-lucide="store" style="width:24px;height:24px;vertical-align:middle;margin-right:8px"></i>Marketplace</h2>';

        // ── Cart Summary Panel ──
        html += '<div id="marketplace-cart-panel" style="' + (_cart.length ? '' : 'display:none;') +
            'background:#f0f7ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin-bottom:24px">' +
            _renderCartHTML() + '</div>';

        // ── Products grouped by category ──
        var grouped = {};
        for (var i = 0; i < products.length; i++) {
            var p = products[i];
            var cat = (p.category || 'service').toLowerCase();
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(p);
        }

        var hasAnyProduct = false;

        for (var ci = 0; ci < CAT_ORDER.length; ci++) {
            var catKey = CAT_ORDER[ci];
            var catItems = grouped[catKey];
            if (!catItems || !catItems.length) continue;
            hasAnyProduct = true;

            var cc = CAT_CONFIG[catKey] || CAT_CONFIG.service;

            html += '<div style="margin-bottom:24px">' +
                '<h3 style="margin:0 0 10px;color:' + cc.color + ';font-size:15px;display:flex;align-items:center;gap:6px">' +
                '<i data-lucide="' + cc.icon + '" style="width:18px;height:18px"></i>' + cc.label +
                '<span style="font-size:12px;color:#aaa;font-weight:400">(' + catItems.length + ')</span></h3>';

            html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">';

            for (var j = 0; j < catItems.length; j++) {
                var prod = catItems[j];
                var price = prod.price != null ? Number(prod.price) : 0;
                var priceStr = price > 0 ? '\u20AC ' + price.toFixed(2) : 'Gratuito';

                html += '<div style="border:1px solid ' + cc.color + '33;border-top:3px solid ' + cc.color + ';border-radius:10px;padding:16px;background:#fff;display:flex;flex-direction:column;justify-content:space-between">' +
                    '<div>' +
                        '<div style="font-weight:600;font-size:15px;color:#333;margin-bottom:6px">' +
                            '<i data-lucide="' + cc.icon + '" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;color:' + cc.color + '"></i>' +
                            _escSafe(prod.name || 'Prodotto') +
                        '</div>' +
                        (prod.description ? '<div style="font-size:13px;color:#666;line-height:1.4;margin-bottom:10px">' + _escSafe(prod.description) + '</div>' : '') +
                    '</div>' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #f0f0f0;padding-top:12px;margin-top:auto">' +
                        '<span style="font-size:18px;font-weight:700;color:' + cc.color + '">' + priceStr + '</span>' +
                        '<button onclick="_addToMarketplaceCart(\'' + _escSafe(prod.id) + '\',\'' + _escSafe(prod.name) + '\',' + price + ')" ' +
                        'style="background:' + cc.color + ';color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">' +
                        '<i data-lucide="plus" style="width:14px;height:14px;vertical-align:middle;margin-right:4px"></i>Aggiungi</button>' +
                    '</div>' +
                '</div>';
            }

            html += '</div></div>';
        }

        // Also render uncategorized products
        var allCatKeys = Object.keys(grouped);
        for (var oi = 0; oi < allCatKeys.length; oi++) {
            if (CAT_ORDER.indexOf(allCatKeys[oi]) === -1 && grouped[allCatKeys[oi]].length > 0) {
                hasAnyProduct = true;
                var otherItems = grouped[allCatKeys[oi]];
                html += '<h3 style="margin:16px 0 10px;color:#555">' + _escSafe(allCatKeys[oi]) + '</h3>';
                html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">';
                for (var ok = 0; ok < otherItems.length; ok++) {
                    var op = otherItems[ok];
                    var oPrice = op.price != null ? Number(op.price) : 0;
                    html += '<div style="border:1px solid #e0e0e0;border-radius:10px;padding:16px;background:#fff">' +
                        '<div style="font-weight:600;font-size:15px;margin-bottom:6px">' + _escSafe(op.name) + '</div>' +
                        (op.description ? '<div style="font-size:13px;color:#666;margin-bottom:10px">' + _escSafe(op.description) + '</div>' : '') +
                        '<div style="display:flex;justify-content:space-between;align-items:center">' +
                            '<span style="font-weight:700">\u20AC ' + oPrice.toFixed(2) + '</span>' +
                            '<button onclick="_addToMarketplaceCart(\'' + _escSafe(op.id) + '\',\'' + _escSafe(op.name) + '\',' + oPrice + ')" ' +
                            'style="background:#4A90D9;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Aggiungi</button>' +
                        '</div>' +
                    '</div>';
                }
                html += '</div>';
            }
        }

        if (!hasAnyProduct) {
            html += '<p style="color:#888">Nessun prodotto disponibile al momento.</p>';
        }

        // ── My Orders ──
        html += '<h3 style="margin:32px 0 12px;color:#555"><i data-lucide="clipboard-list" style="width:18px;height:18px;vertical-align:middle;margin-right:6px"></i>I miei Ordini</h3>';

        if (!orders.length) {
            html += '<p style="color:#888" id="marketplace-orders-empty">Nessun ordine effettuato.</p>';
        } else {
            html += '<div id="marketplace-orders-list" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">' +
                '<thead><tr style="background:#f5f7fa;text-align:left">' +
                    '<th style="padding:10px 12px;border-bottom:2px solid #ddd">ID Ordine</th>' +
                    '<th style="padding:10px 12px;border-bottom:2px solid #ddd">Data</th>' +
                    '<th style="padding:10px 12px;border-bottom:2px solid #ddd;text-align:right">Totale</th>' +
                    '<th style="padding:10px 12px;border-bottom:2px solid #ddd;text-align:center">Stato</th>' +
                    '<th style="padding:10px 12px;border-bottom:2px solid #ddd">Articoli</th>' +
                '</tr></thead><tbody>';

            for (var oi2 = 0; oi2 < orders.length; oi2++) {
                var ord = orders[oi2];
                var bgRow = oi2 % 2 === 0 ? '#fff' : '#fafbfc';
                var oSt = _orderStatus(ord.status);
                var total = ord.total != null ? Number(ord.total) : 0;
                var itemCount = ord.items_count || (ord.items ? ord.items.length : 0);

                html += '<tr style="background:' + bgRow + '">' +
                    '<td style="padding:10px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">' + _escSafe(ord.id || '—') + '</td>' +
                    '<td style="padding:10px 12px;border-bottom:1px solid #eee;white-space:nowrap">' + _escSafe(ord.created_at || ord.date || '—') + '</td>' +
                    '<td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">\u20AC ' + total.toFixed(2) + '</td>' +
                    '<td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">' +
                        '<span style="background:' + oSt.bg + ';color:' + oSt.text + ';font-size:11px;padding:2px 8px;border-radius:8px;font-weight:600">' + oSt.label + '</span></td>' +
                    '<td style="padding:10px 12px;border-bottom:1px solid #eee">' + itemCount + ' articol' + (itemCount === 1 ? 'o' : 'i') + '</td>' +
                '</tr>';
            }

            html += '</tbody></table></div>';
        }

        page.innerHTML = html;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── Cart HTML ──
    function _renderCartHTML() {
        if (!_cart.length) return '';
        var total = 0;
        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
            '<strong style="font-size:16px;color:#1e40af"><i data-lucide="shopping-cart" style="width:18px;height:18px;vertical-align:middle;margin-right:6px"></i>Carrello (' + _cart.length + ')</strong>' +
            '<button onclick="_clearMarketplaceCart()" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:13px;font-weight:600">Svuota</button>' +
            '</div>';

        html += '<div style="margin-bottom:12px">';
        for (var i = 0; i < _cart.length; i++) {
            var item = _cart[i];
            total += item.price;
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:13px">' +
                '<span>' + _escSafe(item.name) + '</span>' +
                '<div style="display:flex;align-items:center;gap:8px">' +
                    '<span style="font-weight:600">\u20AC ' + item.price.toFixed(2) + '</span>' +
                    '<button onclick="_removeFromMarketplaceCart(' + i + ')" style="background:none;border:none;color:#dc3545;cursor:pointer;font-size:16px;line-height:1">&times;</button>' +
                '</div>' +
            '</div>';
        }
        html += '</div>';

        html += '<div style="display:flex;justify-content:space-between;align-items:center;border-top:2px solid #bfdbfe;padding-top:10px">' +
            '<strong style="font-size:16px">Totale: \u20AC ' + total.toFixed(2) + '</strong>' +
            '<button onclick="_completeMarketplaceOrder()" style="background:#28a745;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">' +
            '<i data-lucide="check-circle" style="width:16px;height:16px;vertical-align:middle;margin-right:6px"></i>Completa Ordine</button>' +
            '</div>';

        return html;
    }

    // ── Cart Operations ──
    function _addToMarketplaceCart(productId, productName, price) {
        _cart.push({ id: productId, name: productName, price: Number(price) || 0 });
        _updateCartPanel();
        if (typeof showToast === 'function') showToast('"' + productName + '" aggiunto al carrello', 'success');
    }

    function _removeFromMarketplaceCart(index) {
        _cart.splice(index, 1);
        _updateCartPanel();
    }

    function _clearMarketplaceCart() {
        _cart = [];
        _updateCartPanel();
    }

    function _updateCartPanel() {
        var panel = document.getElementById('marketplace-cart-panel');
        if (!panel) return;
        if (!_cart.length) {
            panel.style.display = 'none';
            panel.innerHTML = '';
        } else {
            panel.style.display = '';
            panel.innerHTML = _renderCartHTML();
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    // ── Complete Order ──
    async function _completeMarketplaceOrder() {
        if (!_cart.length) {
            if (typeof showToast === 'function') showToast('Il carrello \u00e8 vuoto', 'error');
            return;
        }

        try {
            var items = [];
            for (var i = 0; i < _cart.length; i++) {
                items.push({ product_id: _cart[i].id, quantity: 1 });
            }

            var resp = await fetchApi('/api/marketplace/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: items })
            });

            if (!resp.ok) {
                var errData = await resp.json().catch(function() { return {}; });
                throw new Error(errData.error || 'Errore ' + resp.status);
            }

            _cart = [];
            if (typeof showToast === 'function') showToast('Ordine completato con successo!', 'success');
            loadMarketplacePage();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Errore ordine: ' + e.message, 'error');
        }
    }

    // ── Helpers ──
    function _orderStatus(status) {
        switch ((status || '').toLowerCase()) {
            case 'pending': case 'in_attesa': return { bg: '#fff3cd', text: '#856404', label: 'In Attesa' };
            case 'confirmed': case 'confermato': return { bg: '#cce5ff', text: '#004085', label: 'Confermato' };
            case 'processing': case 'in_lavorazione': return { bg: '#d1ecf1', text: '#0c5460', label: 'In Lavorazione' };
            case 'completed': case 'completato': return { bg: '#d4edda', text: '#155724', label: 'Completato' };
            case 'cancelled': case 'annullato': return { bg: '#f8d7da', text: '#721c24', label: 'Annullato' };
            case 'shipped': case 'spedito': return { bg: '#d6d8db', text: '#383d41', label: 'Spedito' };
            default: return { bg: '#e2e3e5', text: '#383d41', label: status || '—' };
        }
    }

    // ── Export ──
    global.loadMarketplacePage = loadMarketplacePage;
    global._addToMarketplaceCart = _addToMarketplaceCart;
    global._removeFromMarketplaceCart = _removeFromMarketplaceCart;
    global._clearMarketplaceCart = _clearMarketplaceCart;
    global._completeMarketplaceOrder = _completeMarketplaceOrder;
})(window);
