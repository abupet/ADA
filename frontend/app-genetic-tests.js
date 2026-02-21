// frontend/app-genetic-tests.js v1
// B2B Phase 4: Genetic tests catalog, ordering, and breeding reports

(function(global) {
    'use strict';

    function _escSafe(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // ── Main ──
    async function loadGeneticTestsPage() {
        var page = document.getElementById('page-genetic-tests');
        if (!page) return;
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento test genetici...</p></div>';

        try {
            var results = await Promise.all([
                fetchApi('/api/genetic-tests/catalog'),
                fetchApi('/api/genetic-tests/orders')
            ]);

            if (!results[0].ok) throw new Error('Errore catalogo ' + results[0].status);
            if (!results[1].ok) throw new Error('Errore ordini ' + results[1].status);

            var catalogData = await results[0].json();
            var ordersData = await results[1].json();

            var catalog = catalogData.tests || catalogData.catalog || catalogData.data || [];
            var orders = ordersData.orders || ordersData.data || [];

            var html = '<h2 style="margin:0 0 20px"><i data-lucide="dna" style="width:24px;height:24px;vertical-align:middle;margin-right:8px"></i>Test Genetici</h2>';

            // ── Breeding Report Button (for breeders) ──
            if (typeof getActiveRole === 'function') {
                var role = getActiveRole();
                if (role === 'breeder' || role === 'allevatore') {
                    html += '<div style="margin-bottom:20px">' +
                        '<button onclick="_requestBreedingReport()" style="background:#8E44AD;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">' +
                        '<i data-lucide="file-text" style="width:16px;height:16px;vertical-align:middle;margin-right:6px"></i>Report Riproduzione</button></div>';
                }
            }

            // ── Catalog Grid ──
            html += '<h3 style="margin:0 0 12px;color:#555"><i data-lucide="grid-3x3" style="width:18px;height:18px;vertical-align:middle;margin-right:6px"></i>Catalogo Test</h3>';

            if (!catalog.length) {
                html += '<p style="color:#888">Nessun test disponibile al momento.</p>';
            } else {
                html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-bottom:28px">';

                for (var i = 0; i < catalog.length; i++) {
                    var t = catalog[i];
                    var price = t.price != null ? '\u20AC ' + Number(t.price).toFixed(2) : 'Su richiesta';
                    var turnaround = t.turnaround_days ? t.turnaround_days + ' giorni' : (t.turnaround || '—');
                    var sampleType = t.sample_type || t.sample || '—';

                    html += '<div style="border:1px solid #e0e0e0;border-radius:12px;padding:18px;background:#fff;display:flex;flex-direction:column;justify-content:space-between">' +
                        '<div>' +
                            '<div style="font-weight:600;font-size:15px;color:#333;margin-bottom:6px">' +
                                '<i data-lucide="dna" style="width:15px;height:15px;vertical-align:middle;margin-right:4px;color:#8E44AD"></i>' +
                                _escSafe(t.name || 'Test') +
                            '</div>' +
                            (t.description ? '<div style="font-size:13px;color:#666;margin-bottom:10px;line-height:1.4">' + _escSafe(t.description) + '</div>' : '') +
                            '<div style="font-size:12px;color:#888;margin-bottom:4px"><strong>Campione:</strong> ' + _escSafe(sampleType) + '</div>' +
                            '<div style="font-size:12px;color:#888;margin-bottom:10px"><strong>Tempi:</strong> ' + _escSafe(turnaround) + '</div>' +
                        '</div>' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #f0f0f0;padding-top:12px;margin-top:auto">' +
                            '<span style="font-size:18px;font-weight:700;color:#4A90D9">' + price + '</span>' +
                            '<button onclick="_orderGeneticTest(\'' + _escSafe(t.id) + '\',\'' + _escSafe(t.name) + '\')" ' +
                            'style="background:#4A90D9;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">' +
                            '<i data-lucide="shopping-cart" style="width:14px;height:14px;vertical-align:middle;margin-right:4px"></i>Ordina</button>' +
                        '</div>' +
                    '</div>';
                }

                html += '</div>';
            }

            // ── My Orders ──
            html += '<h3 style="margin:0 0 12px;color:#555"><i data-lucide="package" style="width:18px;height:18px;vertical-align:middle;margin-right:6px"></i>I miei Ordini</h3>';

            if (!orders.length) {
                html += '<p style="color:#888">Nessun ordine effettuato.</p>';
            } else {
                html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">' +
                    '<thead><tr style="background:#f5f7fa;text-align:left">' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd">Test</th>' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd">Animale</th>' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd">Data Ordine</th>' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd;text-align:center">Stato</th>' +
                        '<th style="padding:10px 12px;border-bottom:2px solid #ddd">Risultato</th>' +
                    '</tr></thead><tbody>';

                for (var j = 0; j < orders.length; j++) {
                    var o = orders[j];
                    var bgRow = j % 2 === 0 ? '#fff' : '#fafbfc';
                    var st = _orderStatus(o.status);

                    html += '<tr style="background:' + bgRow + '">' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;font-weight:500">' + _escSafe(o.test_name || o.name || '—') + '</td>' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee">' + _escSafe(o.pet_name || '—') + '</td>' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;white-space:nowrap">' + _escSafe(o.created_at || o.order_date || '—') + '</td>' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center">' +
                            '<span style="background:' + st.bg + ';color:' + st.text + ';font-size:11px;padding:2px 8px;border-radius:8px;font-weight:600">' + st.label + '</span></td>' +
                        '<td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px">' + _escSafe(o.result_summary || o.result || '—') + '</td>' +
                    '</tr>';
                }

                html += '</tbody></table></div>';
            }

            page.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (e) {
            page.innerHTML = '<div class="error-message">Errore caricamento test genetici: ' + _escSafe(e.message) + '</div>';
        }
    }

    // ── Order a Test ──
    async function _orderGeneticTest(testId, testName) {
        // Prompt for pet selection
        var petId = typeof getCurrentPetId === 'function' ? getCurrentPetId() : null;
        if (!petId) {
            petId = prompt('Inserisci l\'ID dell\'animale per il test "' + testName + '":');
            if (!petId) return;
        }

        try {
            var resp = await fetchApi('/api/genetic-tests/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ test_id: testId, pet_id: petId })
            });
            if (!resp.ok) {
                var errData = await resp.json().catch(function() { return {}; });
                throw new Error(errData.error || 'Errore ' + resp.status);
            }
            if (typeof showToast === 'function') showToast('Ordine test "' + testName + '" inviato!', 'success');
            loadGeneticTestsPage();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Errore ordine: ' + e.message, 'error');
        }
    }

    // ── Breeding Report ──
    async function _requestBreedingReport() {
        try {
            // Try to get breeder ID from JWT or user profile
            var breederId = typeof getJwtUserId === 'function' ? getJwtUserId() : null;
            if (!breederId) {
                breederId = prompt('Inserisci il tuo ID allevatore:');
                if (!breederId) return;
            }
            var resp = await fetchApi('/api/genetic-tests/breeding-report/' + encodeURIComponent(breederId));
            if (!resp.ok) throw new Error('Errore ' + resp.status);
            var blob = await resp.blob();
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'breeding-report-' + new Date().toISOString().slice(0, 10) + '.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (typeof showToast === 'function') showToast('Report riproduzione scaricato', 'success');
        } catch (e) {
            if (typeof showToast === 'function') showToast('Errore report: ' + e.message, 'error');
        }
    }

    // ── Helpers ──
    function _orderStatus(status) {
        switch ((status || '').toLowerCase()) {
            case 'pending': case 'in_attesa': return { bg: '#fff3cd', text: '#856404', label: 'In Attesa' };
            case 'processing': case 'in_lavorazione': return { bg: '#cce5ff', text: '#004085', label: 'In Lavorazione' };
            case 'shipped': case 'spedito': return { bg: '#d1ecf1', text: '#0c5460', label: 'Spedito' };
            case 'completed': case 'completato': return { bg: '#d4edda', text: '#155724', label: 'Completato' };
            case 'cancelled': case 'annullato': return { bg: '#f8d7da', text: '#721c24', label: 'Annullato' };
            default: return { bg: '#e2e3e5', text: '#383d41', label: status || '—' };
        }
    }

    // ── Export ──
    global.loadGeneticTestsPage = loadGeneticTestsPage;
    global._orderGeneticTest = _orderGeneticTest;
    global._requestBreedingReport = _requestBreedingReport;
})(window);
