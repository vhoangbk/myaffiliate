const ALL = 'Tất cả';
const params = new URLSearchParams(location.search);
const state = {
  category: params.get('cat') || ALL,
  query: params.get('q') || '',
  sort: params.get('sort') || 'default',
};
let data = { categories: [], products: [] };

const $grid = document.getElementById('grid');
const $cats = document.getElementById('categories');
const $search = document.getElementById('search');
const $sort = document.getElementById('sort');
const $count = document.getElementById('count');
const $empty = document.getElementById('empty');

const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const formatPrice = n => n.toLocaleString('vi-VN') + '₫';
const formatSold = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',').replace(',0', '') + 'k' : String(n);
const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const sorters = {
  default: null,
  sold: (a, b) => b.sold - a.sold,
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  name: (a, b) => a.name.localeCompare(b.name, 'vi'),
};

function syncUrl() {
  const p = new URLSearchParams();
  if (state.category !== ALL) p.set('cat', state.category);
  if (state.query) p.set('q', state.query);
  if (state.sort !== 'default') p.set('sort', state.sort);
  const qs = p.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

function renderChips() {
  $cats.innerHTML = [ALL, ...data.categories].map(c =>
    `<button class="chip${c === state.category ? ' active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join('');
}

function render() {
  const q = normalize(state.query.trim());
  let list = data.products.filter(p =>
    (state.category === ALL || p.category === state.category) &&
    (!q || normalize(p.name).includes(q))
  );
  const sorter = sorters[state.sort];
  if (sorter) list = [...list].sort(sorter);

  $grid.innerHTML = list.map(p => `
    <a class="card" href="${escapeHtml(p.url)}" target="_blank" rel="noopener sponsored nofollow">
      <img src="${escapeHtml(p.thumbnail)}" alt="${escapeHtml(p.name)}" loading="lazy">
      <div class="card-body">
        <div class="card-name">${escapeHtml(p.name)}</div>
        <div class="card-meta">
          <span class="card-price">${formatPrice(p.price)}</span>
          <span class="card-sold">Đã bán ${formatSold(p.sold)}</span>
        </div>
      </div>
    </a>`).join('');
  $empty.hidden = list.length > 0;
  $count.textContent = `${list.length} sản phẩm`;
  renderChips();
  syncUrl();
}

$cats.addEventListener('click', e => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  state.category = btn.dataset.cat;
  render();
});

let timer;
$search.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.query = $search.value; render(); }, 200);
});
$sort.addEventListener('change', () => { state.sort = $sort.value; render(); });

fetch('data/products.json')
  .then(r => r.json())
  .then(d => {
    data = d;
    $search.value = state.query;
    if (!sorters.hasOwnProperty(state.sort)) state.sort = 'default';
    $sort.value = state.sort;
    render();
  })
  .catch(() => { $empty.hidden = false; $empty.textContent = 'Không tải được dữ liệu sản phẩm.'; });
