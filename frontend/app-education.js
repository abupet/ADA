// frontend/app-education.js v1
// B2B Phase 4: Education platform — courses, enrollments, ECM credits

(function(global) {
    'use strict';

    function _escSafe(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // ── Course Type Config ──
    var TYPE_CONFIG = {
        webinar:        { color: '#4A90D9', bg: '#e8f0fe', icon: 'video', label: 'Webinar' },
        on_demand:      { color: '#8E44AD', bg: '#f3e8ff', icon: 'play-circle', label: 'On Demand' },
        live_workshop:  { color: '#E67E22', bg: '#fff4e5', icon: 'users', label: 'Workshop Live' },
        case_study:     { color: '#27AE60', bg: '#e8f8ef', icon: 'book-open', label: 'Caso Studio' }
    };

    var TYPE_ORDER = ['webinar', 'on_demand', 'live_workshop', 'case_study'];

    // ── Main ──
    async function loadEducationPage() {
        var page = document.getElementById('page-education');
        if (!page) return;
        page.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><p>Caricamento formazione...</p></div>';

        try {
            var results = await Promise.all([
                fetchApi('/api/education/courses'),
                fetchApi('/api/education/enrollments'),
                fetchApi('/api/education/ecm/summary')
            ]);

            if (!results[0].ok) throw new Error('Errore corsi ' + results[0].status);
            if (!results[1].ok) throw new Error('Errore iscrizioni ' + results[1].status);
            // ECM summary may fail if not available — handle gracefully
            var ecmOk = results[2].ok;

            var coursesData = await results[0].json();
            var enrollData = await results[1].json();
            var ecmData = ecmOk ? await results[2].json() : {};

            var courses = coursesData.courses || coursesData.data || [];
            var enrollments = enrollData.enrollments || enrollData.data || [];
            var ecm = ecmData.summary || ecmData;

            var html = '<h2 style="margin:0 0 20px"><i data-lucide="graduation-cap" style="width:24px;height:24px;vertical-align:middle;margin-right:8px"></i>Formazione Continua</h2>';

            // ── ECM Summary ──
            if (ecmOk && ecm) {
                html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px">' +
                    _kpiCard('Crediti ECM Totali', ecm.total_credits || 0, '#4A90D9', 'award') +
                    _kpiCard('Crediti Anno', ecm.current_year_credits || ecm.year_credits || 0, '#27AE60', 'calendar') +
                    _kpiCard('Corsi Completati', ecm.completed_courses || 0, '#8E44AD', 'check-circle') +
                    _kpiCard('Corsi in Corso', ecm.in_progress_courses || 0, '#E67E22', 'loader') +
                    '</div>';
            }

            // ── My Enrollments ──
            html += '<h3 style="margin:0 0 12px;color:#555"><i data-lucide="bookmark" style="width:18px;height:18px;vertical-align:middle;margin-right:6px"></i>Le mie Iscrizioni</h3>';

            if (!enrollments.length) {
                html += '<p style="color:#888;margin-bottom:24px">Nessuna iscrizione attiva. Esplora il catalogo corsi qui sotto.</p>';
            } else {
                html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:28px">';

                for (var e = 0; e < enrollments.length; e++) {
                    var en = enrollments[e];
                    var progress = en.progress != null ? Number(en.progress) : 0;
                    var enStatus = _enrollStatus(en.status);

                    html += '<div style="border:1px solid #e0e0e0;border-radius:10px;padding:14px;background:#fff">' +
                        '<div style="font-weight:600;font-size:14px;color:#333;margin-bottom:6px">' + _escSafe(en.course_name || en.title || '—') + '</div>' +
                        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
                            '<div style="flex:1;background:#e9ecef;border-radius:6px;height:10px;overflow:hidden">' +
                                '<div style="background:#4A90D9;height:100%;width:' + progress + '%;border-radius:6px;transition:width 0.3s"></div>' +
                            '</div>' +
                            '<span style="font-size:12px;font-weight:600;color:#4A90D9;white-space:nowrap">' + progress + '%</span>' +
                        '</div>' +
                        '<div style="display:flex;justify-content:space-between;align-items:center">' +
                            '<span style="background:' + enStatus.bg + ';color:' + enStatus.text + ';font-size:11px;padding:2px 8px;border-radius:8px;font-weight:600">' + enStatus.label + '</span>' +
                            (en.ecm_credits ? '<span style="font-size:12px;color:#666"><i data-lucide="award" style="width:12px;height:12px;vertical-align:middle;margin-right:2px"></i>' + en.ecm_credits + ' ECM</span>' : '') +
                        '</div>' +
                    '</div>';
                }

                html += '</div>';
            }

            // ── Course Catalog grouped by type ──
            html += '<h3 style="margin:0 0 12px;color:#555"><i data-lucide="library" style="width:18px;height:18px;vertical-align:middle;margin-right:6px"></i>Catalogo Corsi</h3>';

            // Group courses by type
            var grouped = {};
            for (var c = 0; c < courses.length; c++) {
                var course = courses[c];
                var ctype = (course.type || course.course_type || 'on_demand').toLowerCase();
                if (!grouped[ctype]) grouped[ctype] = [];
                grouped[ctype].push(course);
            }

            var hasAnyCourse = false;
            for (var ti = 0; ti < TYPE_ORDER.length; ti++) {
                var typeKey = TYPE_ORDER[ti];
                var typeItems = grouped[typeKey];
                if (!typeItems || !typeItems.length) continue;
                hasAnyCourse = true;

                var tc = TYPE_CONFIG[typeKey] || TYPE_CONFIG.on_demand;

                html += '<div style="margin-bottom:20px">' +
                    '<h4 style="margin:0 0 10px;color:' + tc.color + ';font-size:14px;display:flex;align-items:center;gap:6px">' +
                    '<i data-lucide="' + tc.icon + '" style="width:16px;height:16px"></i>' + tc.label +
                    '<span style="font-size:12px;color:#aaa;font-weight:400">(' + typeItems.length + ')</span></h4>';

                html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';

                for (var ci = 0; ci < typeItems.length; ci++) {
                    var cr = typeItems[ci];
                    var duration = cr.duration_hours ? cr.duration_hours + 'h' : (cr.duration || '—');
                    var ecmCredits = cr.ecm_credits || 0;

                    html += '<div style="border:1px solid ' + tc.color + '33;border-top:3px solid ' + tc.color + ';border-radius:10px;padding:16px;background:#fff;display:flex;flex-direction:column;justify-content:space-between">' +
                        '<div>' +
                            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">' +
                                '<div style="font-weight:600;font-size:15px;color:#333">' + _escSafe(cr.title || cr.name || 'Corso') + '</div>' +
                                '<span style="background:' + tc.bg + ';color:' + tc.color + ';font-size:10px;padding:2px 6px;border-radius:6px;white-space:nowrap;font-weight:600">' + tc.label + '</span>' +
                            '</div>' +
                            (cr.instructor ? '<div style="font-size:13px;color:#666;margin-bottom:4px"><i data-lucide="user" style="width:12px;height:12px;vertical-align:middle;margin-right:4px"></i>' + _escSafe(cr.instructor) + '</div>' : '') +
                            '<div style="font-size:12px;color:#888;display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">' +
                                '<span><i data-lucide="clock" style="width:12px;height:12px;vertical-align:middle;margin-right:2px"></i>' + _escSafe(duration) + '</span>' +
                                (ecmCredits > 0 ? '<span><i data-lucide="award" style="width:12px;height:12px;vertical-align:middle;margin-right:2px"></i>' + ecmCredits + ' ECM</span>' : '') +
                            '</div>' +
                            (cr.description ? '<div style="font-size:13px;color:#666;line-height:1.4;margin-bottom:12px">' + _escSafe(cr.description) + '</div>' : '') +
                        '</div>' +
                        '<button onclick="_enrollCourse(\'' + _escSafe(cr.id) + '\',\'' + _escSafe(cr.title || cr.name) + '\')" ' +
                        'style="background:' + tc.color + ';color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;width:100%">' +
                        '<i data-lucide="plus-circle" style="width:14px;height:14px;vertical-align:middle;margin-right:4px"></i>Iscriviti</button>' +
                    '</div>';
                }

                html += '</div></div>';
            }

            // Also render any types not in TYPE_ORDER
            var otherKeys = Object.keys(grouped);
            for (var oi = 0; oi < otherKeys.length; oi++) {
                if (TYPE_ORDER.indexOf(otherKeys[oi]) === -1 && grouped[otherKeys[oi]].length > 0) {
                    hasAnyCourse = true;
                    var otherItems = grouped[otherKeys[oi]];
                    html += '<h4 style="margin:16px 0 10px;color:#555">' + _escSafe(otherKeys[oi]) + '</h4>';
                    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';
                    for (var oj = 0; oj < otherItems.length; oj++) {
                        var oc = otherItems[oj];
                        html += '<div style="border:1px solid #e0e0e0;border-radius:10px;padding:16px;background:#fff">' +
                            '<div style="font-weight:600;font-size:15px;margin-bottom:8px">' + _escSafe(oc.title || oc.name) + '</div>' +
                            (oc.description ? '<div style="font-size:13px;color:#666;margin-bottom:10px">' + _escSafe(oc.description) + '</div>' : '') +
                            '<button onclick="_enrollCourse(\'' + _escSafe(oc.id) + '\',\'' + _escSafe(oc.title || oc.name) + '\')" ' +
                            'style="background:#4A90D9;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;width:100%">Iscriviti</button>' +
                        '</div>';
                    }
                    html += '</div>';
                }
            }

            if (!hasAnyCourse) {
                html += '<p style="color:#888">Nessun corso disponibile al momento.</p>';
            }

            page.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (e) {
            page.innerHTML = '<div class="error-message">Errore caricamento formazione: ' + _escSafe(e.message) + '</div>';
        }
    }

    // ── Enroll ──
    async function _enrollCourse(courseId, courseName) {
        try {
            var resp = await fetchApi('/api/education/enrollments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ course_id: courseId })
            });
            if (!resp.ok) {
                var errData = await resp.json().catch(function() { return {}; });
                throw new Error(errData.error || 'Errore ' + resp.status);
            }
            if (typeof showToast === 'function') showToast('Iscrizione a "' + courseName + '" completata!', 'success');
            loadEducationPage();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Errore iscrizione: ' + e.message, 'error');
        }
    }

    // ── Helpers ──
    function _kpiCard(label, value, color, icon) {
        return '<div style="background:' + color + ';color:#fff;padding:16px;border-radius:12px;text-align:center">' +
            '<i data-lucide="' + icon + '" style="width:20px;height:20px;margin-bottom:4px;opacity:0.85"></i>' +
            '<div style="font-size:24px;font-weight:700">' + value + '</div>' +
            '<div style="font-size:11px;opacity:0.9;margin-top:2px">' + label + '</div></div>';
    }

    function _enrollStatus(status) {
        switch ((status || '').toLowerCase()) {
            case 'in_progress': case 'in_corso': return { bg: '#cce5ff', text: '#004085', label: 'In Corso' };
            case 'completed': case 'completato': return { bg: '#d4edda', text: '#155724', label: 'Completato' };
            case 'enrolled': case 'iscritto': return { bg: '#fff3cd', text: '#856404', label: 'Iscritto' };
            case 'cancelled': case 'annullato': return { bg: '#f8d7da', text: '#721c24', label: 'Annullato' };
            default: return { bg: '#e2e3e5', text: '#383d41', label: status || 'Iscritto' };
        }
    }

    // ── Export ──
    global.loadEducationPage = loadEducationPage;
    global._enrollCourse = _enrollCourse;
})(window);
