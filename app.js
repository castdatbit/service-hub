// ============================================================
//  STATE
// ============================================================
var allDocs = [];
var filteredDocs = [];
var activeCategory = '';
var activeModel = '';
var searchQuery = '';
var currentToken = '';
var currentUser = { name: '', role: '' };
var dynamicCats = []; // Stochează categoriile găsite dinamic

var MODELS = [
    'DATECS DP-25 MX', 'DATECS DP-150 MX', 'DATECS WP-50 MX', 'DATECS DP-05 MX',
    'DATECS WP-500', 'DATECS FP-700', 'DATECS BC50', 'DATECS DP-25', 'DATECS DP-150',
    'DATECS DP-25X', 'DATECS WP-50', 'DATECS DP-05', 'DATECS BP5000',
    'DAISY EXPERT SX', 'DAISY PERFECT M', 'DAISY COMPACT M', 'DAISY COMPACT S', 'DAISY EXPERT L',
    'BEKO X30TR',
    'ZIT B20 MSBW', 'ZIT B30 MSBW',
    'VALMED TREMOL M20', 'VALMED TREMOL S25',
    'ADPOS TREMOL M20', 'ADPOS TREMOL S25', 'ADPOS TREMOL S',
    'PECOTREMOL M20',
    'ACTIVA GALAXY PLUS',
    'ORGTECH TEO'
];

var CAT_ICONS = {
    'Proceduri': { icon: '📋', cls: 'cat-proceduri' },
    'Șabloane': { icon: '📄', cls: 'cat-sabloane' },
    'Moduri utilizare': { icon: '💡', cls: 'cat-moduri' },
    'Erori frecvente': { icon: '⚠️', cls: 'cat-erori' }
};

function getCatConfig(catName) {
    if (CAT_ICONS[catName]) return Object.assign({}, CAT_ICONS[catName], { name: catName });

    // Verificăm dacă numele categoriei (folderului) începe cu un emoticon (emoji)
    try {
        var match = catName.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}|\p{Emoji}\uFE0F)\s*(.*)$/u);
        if (match) {
            return { icon: match[1], cls: 'cat-proceduri', name: match[2].trim() || catName };
        }
    } catch (e) { }

    // Config default pentru categorii noi găsite în foldere
    return { icon: '📁', cls: 'cat-proceduri', name: catName };
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    // Restaurează sesiunea dacă există
    var saved = sessionStorage.getItem('serviceHubSession');
    if (saved) {
        try {
            var sess = JSON.parse(saved);
            if (sess.token && sess.name) {
                currentToken = sess.token;
                currentUser = { name: sess.name, role: sess.role };
                showAppView();
                return;
            }
        } catch (e) { }
    }
    showLoginView();

    // Login form
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('password').addEventListener('input', function () {
        this.classList.remove('error');
        document.getElementById('login-error').style.display = 'none';
    });
});

// ============================================================
//  VIEW SWITCHING
// ============================================================
function showLoginView() {
    document.getElementById('login-view').classList.add('active');
    document.getElementById('app-view').classList.remove('active');
}

function showAppView() {
    document.getElementById('login-view').classList.remove('active');
    document.getElementById('app-view').classList.add('active');

    // Setează info utilizator
    document.getElementById('user-name-display').textContent = currentUser.name;
    document.getElementById('user-role-display').textContent = currentUser.role;
    document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();

    var syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.style.display = 'inline-block';
    }

    populateModelSelect();
    loadDocuments();
}

// ============================================================
//  LOGIN
// ============================================================
function handleLogin(e) {
    e.preventDefault();
    var btn = document.getElementById('login-btn');
    var errEl = document.getElementById('login-error');
    var user = document.getElementById('username').value.trim();
    var pass = document.getElementById('password').value;

    btn.textContent = 'Se verifică...';
    btn.disabled = true;
    errEl.style.display = 'none';

    if (!API_URL || API_URL === 'PUNE_URL_APPS_SCRIPT_AICI') {
        showLoginError('API_URL nu este configurat în config.js!');
        btn.textContent = 'Autentificare';
        btn.disabled = false;
        return;
    }

    apiCall({ action: 'login', u: user, p: pass })
        .then(function (result) {
            if (result.success) {
                currentToken = result.token;
                currentUser = { name: result.name, role: result.role };
                sessionStorage.setItem('serviceHubSession', JSON.stringify({
                    token: result.token,
                    name: result.name,
                    role: result.role
                }));
                showAppView();
            } else {
                showLoginError(result.error || 'Credențiale incorecte.');
                btn.textContent = 'Autentificare';
                btn.disabled = false;
            }
        })
        .catch(function (err) {
            showLoginError('Eroare de conexiune. Verificați URL-ul API.');
            btn.textContent = 'Autentificare';
            btn.disabled = false;
        });
}

function showLoginError(msg) {
    var el = document.getElementById('login-error');
    el.textContent = '⚠️ ' + msg;
    el.style.display = 'block';
    document.getElementById('password').classList.add('error');
}

// ============================================================
//  LOGOUT
// ============================================================
function handleLogout() {
    sessionStorage.removeItem('serviceHubSession');
    apiCall({ action: 'logout', token: currentToken }).catch(function () { });
    currentToken = '';
    currentUser = { name: '', role: '' };
    allDocs = [];
    document.getElementById('doc-list').innerHTML = '';
    clearViewer();
    document.getElementById('login-form').reset();
    document.getElementById('login-btn').textContent = 'Autentificare';
    document.getElementById('login-btn').disabled = false;
    showLoginView();
}

// ============================================================
//  SYNC FOLDER
// ============================================================
function handleSync() {
    if (!currentUser.role) return;
    showSpinner(true);
    showToast('Începem sincronizarea cu Drive...', '');

    apiCall({ action: 'sync', token: currentToken })
        .then(function (result) {
            if (result.error) {
                showSpinner(false);
                showToast(result.error, 'error');
                return;
            }
            showToast(result.msg, 'success');
            loadDocuments();
        })
        .catch(function (err) {
            showSpinner(false);
            showToast('Eroare conexiune sincronizare', 'error');
        });
}

// ============================================================
//  DOCUMENTE
// ============================================================
function loadDocuments() {
    showSpinner(true);
    apiCall({ action: 'docs', token: currentToken })
        .then(function (result) {
            showSpinner(false);
            if (result.error) {
                if (result.error.includes('expirată')) { handleLogout(); return; }
                showToast(result.error, 'error');
                return;
            }
            allDocs = result.docs || [];
            extractDynamicCategories();
            renderSidebarCategories();
            updateBadges();
            applyFilters();
        })
        .catch(function (err) {
            showSpinner(false);
            showToast('Eroare la încărcare: ' + err.message, 'error');
        });
}

// ============================================================
//  FILTRE
// ============================================================
function filterCategory(cat, el) {
    activeCategory = cat;
    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
    if (el) el.classList.add('active');
    applyFilters();
    clearViewer();
}

function filterModel(model) {
    activeModel = model;
    applyFilters();
    clearViewer();
}

function handleSearch(val) {
    searchQuery = val.toLowerCase().trim();
    applyFilters();
}

function applyFilters() {
    filteredDocs = allDocs.filter(function (doc) {
        var matchCat = !activeCategory || doc.categorie === activeCategory;
        var matchModel = !activeModel || doc.model === activeModel;
        var matchSearch = !searchQuery ||
            doc.titlu.toLowerCase().includes(searchQuery) ||
            doc.model.toLowerCase().includes(searchQuery) ||
            doc.tags.toLowerCase().includes(searchQuery) ||
            doc.descriere.toLowerCase().includes(searchQuery) ||
            doc.categorie.toLowerCase().includes(searchQuery);
        return matchCat && matchModel && matchSearch;
    });
    renderDocList(filteredDocs);
    var n = filteredDocs.length;
    document.getElementById('results-count').textContent =
        n + (n === 1 ? ' document' : ' documente');
}

function updateBadges() {
    document.getElementById('badge-all').textContent = allDocs.length;

    // Actualizăm badge-urile dinamice create
    dynamicCats.forEach(function (cat) {
        var badgeId = 'badge-' + escAttr(cat);
        var el = document.getElementById(badgeId);
        if (el) {
            el.textContent = allDocs.filter(function (d) { return d.categorie === cat; }).length;
        }
    });
}

function extractDynamicCategories() {
    var cats = new Set();
    allDocs.forEach(function (doc) {
        if (doc.categorie) cats.add(doc.categorie);
    });
    dynamicCats = Array.from(cats).sort();
}

function renderSidebarCategories() {
    var container = document.getElementById('dynamic-categories-container');
    if (!container) return;

    var html = '';
    // Categorii dinamice găsite în documente
    dynamicCats.forEach(function (cat) {
        var cfg = getCatConfig(cat);
        var isActive = (activeCategory === cat) ? 'active' : '';
        html += '<div class="nav-item ' + isActive + '" data-cat="' + escAttr(cat) + '" onclick="filterCategory(\'' + escJson(cat).slice(1, -1) + '\', this)">' +
            '<span class="nav-icon">' + cfg.icon + '</span> ' + escHtml(cfg.name) +
            '<span class="nav-badge" id="badge-' + escAttr(cat) + '">0</span>' +
            '</div>';
    });
    container.innerHTML = html;
}

// ============================================================
//  RENDER LISTA
// ============================================================
function renderDocList(docs) {
    var list = document.getElementById('doc-list');
    if (!docs.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>Niciun document găsit.</p></div>';
        return;
    }
    list.innerHTML = docs.map(function (doc) {
        var cfg = getCatConfig(doc.categorie);
        var tags = doc.tags
            ? doc.tags.split(',').map(function (t) { return '<span class="tag">#' + t.trim() + '</span>'; }).join('')
            : '';
        return '<div class="doc-card" id="card-' + escAttr(doc.id) + '" onclick="openDoc(\'' + escAttr(doc.id) + '\')">' +
            '<div class="doc-card-header">' +
            '<div class="doc-cat-icon ' + cfg.cls + '">' + cfg.icon + '</div>' +
            '<div>' +
            '<div class="doc-title">' + escHtml(doc.titlu) + '</div>' +
            (doc.model ? '<div class="doc-model">🖨️ ' + escHtml(doc.model) + '</div>' : '') +
            '</div>' +
            '</div>' +
            (doc.descriere ? '<div class="doc-descriere">' + escHtml(doc.descriere) + '</div>' : '') +
            (tags ? '<div class="doc-tags">' + tags + '</div>' : '') +
            (doc.dataActualizare ? '<div class="doc-date">📅 ' + escHtml(doc.dataActualizare) + '</div>' : '') +
            '</div>';
    }).join('');
}

// ============================================================
//  DESCHIDE DOCUMENT
// ============================================================
function openDoc(docId) {
    var doc = allDocs.find(function (d) { return String(d.id) === String(docId); });
    if (!doc) return;

    document.querySelectorAll('.doc-card').forEach(function (c) { c.classList.remove('selected'); });
    var card = document.getElementById('card-' + doc.id);
    if (card) card.classList.add('selected');

    document.getElementById('viewer-title').textContent = doc.titlu;
    document.getElementById('viewer-cat').textContent = doc.categorie;
    document.getElementById('viewer-model').textContent = doc.model || 'General';
    document.getElementById('viewer-date').textContent = doc.dataActualizare ? '📅 ' + doc.dataActualizare : '';

    document.getElementById('doc-viewer-placeholder').style.display = 'none';
    document.getElementById('doc-viewer-content').classList.add('visible');
    document.getElementById('doc-body').innerHTML = '<div class="spinner"></div>';

    apiCall({ action: 'doc', token: currentToken, url: doc.linkDoc })
        .then(function (result) {
            if (result.error) {
                document.getElementById('doc-body').innerHTML =
                    '<div class="empty-state"><div class="empty-icon">⚠️</div><p>' + escHtml(result.error) + '</p></div>';
                return;
            }
            document.getElementById('doc-body').innerHTML = result.html || '<p><em>Document gol.</em></p>';
        })
        .catch(function (err) {
            document.getElementById('doc-body').innerHTML =
                '<div class="empty-state"><div class="empty-icon">❌</div><p>Eroare: ' + escHtml(err.message) + '</p></div>';
        });
}

function clearViewer() {
    var sel = document.querySelector('.doc-card.selected');
    if (sel) sel.classList.remove('selected');
    document.getElementById('doc-viewer-placeholder').style.display = '';
    document.getElementById('doc-viewer-content').classList.remove('visible');
}

// ============================================================
//  MODEL SELECT
// ============================================================
function populateModelSelect() {
    var sel = document.getElementById('model-select');
    var brands = {};
    MODELS.forEach(function (m) {
        var brand = m.split(' ')[0];
        if (!brands[brand]) brands[brand] = [];
        brands[brand].push(m);
    });
    Object.keys(brands).sort().forEach(function (brand) {
        var group = document.createElement('optgroup');
        group.label = brand;
        brands[brand].forEach(function (model) {
            var opt = document.createElement('option');
            opt.value = model; opt.textContent = model;
            group.appendChild(opt);
        });
        sel.appendChild(group);
    });
}

// ============================================================
//  API CALL – JSONP (avoid CORS / redirect issues from Apps Script)
// ============================================================
var jsonpCounter = 0;

function apiCall(params) {
    return new Promise(function (resolve, reject) {
        var callbackName = 'jsonp_callback_' + (++jsonpCounter);

        // Configurare timeout
        var timeoutId = setTimeout(function () {
            cleanup();
            reject(new Error('API Timeout'));
        }, 15000);

        window[callbackName] = function (data) {
            cleanup();
            resolve(data);
        };

        var cleanup = function () {
            clearTimeout(timeoutId);
            if (script.parentNode) script.parentNode.removeChild(script);
            delete window[callbackName];
        };

        params.callback = callbackName;
        var qs = Object.keys(params).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('&');

        var script = document.createElement('script');
        script.src = API_URL + '?' + qs;
        script.onerror = function () {
            cleanup();
            reject(new Error('Network Error or CORS failure'));
        };

        document.body.appendChild(script);
    });
}

// ============================================================
//  UTILITARE
// ============================================================
function showSpinner(show) {
    document.getElementById('loading-spinner').style.display = show ? 'block' : 'none';
}

function showToast(msg, type) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show ' + (type || '');
    setTimeout(function () { t.className = ''; }, 3500);
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function escJson(obj) {
    return "'" + JSON.stringify(obj).replace(/'/g, "\\'") + "'";
}
