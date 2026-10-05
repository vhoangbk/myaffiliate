#!/usr/bin/env node
// Nhập sản phẩm từ data/products.csv -> data/products.json
// Cột: category,product_url,affiliate_url,name,price,sold,thumbnail
// Link bán hàng = affiliate_url, nếu trống thì dùng product_url
// Chạy: node scripts/import.js [input.csv] [--out output.json]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');

const INPUT = positional[0] || path.join(ROOT, 'data', 'products.csv');
const OUTPUT = opt('--out') || path.join(ROOT, 'data', 'products.json');

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

const toNumber = s => Number(String(s || '').replace(/[^\d]/g, '')) || 0;
// Giá có thể có phần thập phân kiểu "126262.00" -> bỏ phần thập phân trước khi lọc chữ số
const toPrice = s => toNumber(String(s || '').replace(/[.,]\d{1,2}$/, ''));

// Lượt bán kiểu Shopee: "22", "1.234", "2k+", "1,2k", "40k+" (có hậu tố k, nếu có thì dấu . , là thập phân)
function toCount(s) {
  const m = String(s || '').trim().toLowerCase().match(/^([\d.,]+)\s*(k|tr|m)?/);
  if (!m) return 0;
  if (!m[2]) return toNumber(m[1]);
  const mult = m[2] === 'k' ? 1e3 : 1e6;
  return Math.round(Number(m[1].replace(',', '.')) * mult) || 0;
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`Không thấy ${INPUT}. Sao chép data/products.example.csv thành data/products.csv rồi điền dữ liệu.`);
    process.exit(1);
  }
  const [header, ...lines] = parseCsv(fs.readFileSync(INPUT, 'utf8'));
  const cols = header.map(h => h.trim().toLowerCase());
  const rows = lines.map(l => Object.fromEntries(cols.map((c, i) => [c, (l[i] || '').trim()])));

  const products = [];
  const categories = [];
  let warnings = 0;

  for (const [i, row] of rows.entries()) {
    const label = `Dòng ${i + 2}`;
    const url = row.affiliate_url || row.product_url;
    if (!row.name || !url) { console.warn(`${label}: bỏ qua (thiếu tên hoặc link sản phẩm)`); warnings++; continue; }
    if (!row.affiliate_url) { console.warn(`${label}: chưa có affiliate_url, dùng product_url`); warnings++; }
    const missing = ['price', 'sold', 'thumbnail'].filter(k => !row[k]);
    if (missing.length) { console.warn(`${label}: thiếu ${missing.join(', ')}`); warnings++; }

    const category = row.category || 'Khác';
    if (!categories.includes(category)) categories.push(category);
    products.push({
      id: i + 1,
      name: row.name,
      category,
      price: toPrice(row.price),
      sold: toCount(row.sold),
      thumbnail: row.thumbnail,
      url,
    });
  }

  if (!products.length) { console.error('Không có sản phẩm hợp lệ, giữ nguyên file cũ'); process.exit(1); }
  fs.writeFileSync(OUTPUT, JSON.stringify({ categories, products }, null, 2));
  console.log(`Đã ghi ${products.length} sản phẩm (${warnings} cảnh báo) vào ${path.relative(process.cwd(), OUTPUT)}`);
}

main();
