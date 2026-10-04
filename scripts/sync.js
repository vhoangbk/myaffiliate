#!/usr/bin/env node
// Đồng bộ sản phẩm từ Shopee Affiliate Open API vào data/products.json
// Chạy: SHOPEE_APP_ID=... SHOPEE_SECRET=... node scripts/sync.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ENDPOINT = 'https://open-api.affiliate.shopee.vn/graphql';

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const APP_ID = process.env.SHOPEE_APP_ID;
const SECRET = process.env.SHOPEE_SECRET;
if (!APP_ID || !SECRET) {
  console.error('Thiếu SHOPEE_APP_ID hoặc SHOPEE_SECRET (đặt trong env hoặc file .env)');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const PAGE_SIZE = 50;

const QUERY = `query ($keyword: String, $sortType: Int, $page: Int, $limit: Int) {
  productOfferV2(keyword: $keyword, sortType: $sortType, page: $page, limit: $limit) {
    nodes { itemId productName priceMin price sales imageUrl offerLink productLink }
    pageInfo { hasNextPage }
  }
}`;

async function gql(variables) {
  const payload = JSON.stringify({ query: QUERY, variables });
  const ts = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash('sha256').update(APP_ID + ts + payload + SECRET).digest('hex');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${APP_ID}, Timestamp=${ts}, Signature=${signature}`,
    },
    body: payload,
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`API lỗi (${res.status}): ${JSON.stringify(json.errors || json)}`);
  }
  return json.data.productOfferV2;
}

async function fetchCategory(keyword, limit) {
  const out = [];
  for (let page = 1; out.length < limit; page++) {
    const { nodes, pageInfo } = await gql({
      keyword,
      sortType: config.sortType ?? 2, // 2 = bán chạy
      page,
      limit: Math.min(PAGE_SIZE, limit - out.length),
    });
    out.push(...nodes);
    if (!pageInfo.hasNextPage || nodes.length === 0) break;
  }
  return out;
}

async function main() {
  const products = [];
  const seen = new Set();
  const categories = [];

  for (const cat of config.categories) {
    const items = [];
    for (const kw of cat.keywords) {
      items.push(...(await fetchCategory(kw, config.limitPerKeyword ?? 20)));
    }
    let added = 0;
    for (const n of items) {
      if (seen.has(n.itemId)) continue;
      seen.add(n.itemId);
      products.push({
        id: Number(n.itemId),
        name: n.productName,
        category: cat.name,
        price: Math.round(Number(n.priceMin || n.price)),
        sold: Number(n.sales) || 0,
        thumbnail: n.imageUrl,
        url: n.offerLink || n.productLink,
      });
      added++;
    }
    if (added) categories.push(cat.name);
    console.log(`${cat.name}: ${added} sản phẩm`);
  }

  if (products.length === 0) throw new Error('Không lấy được sản phẩm nào, giữ nguyên products.json');

  const file = path.join(ROOT, 'data', 'products.json');
  fs.writeFileSync(file, JSON.stringify({ categories, products }, null, 2));
  console.log(`Đã ghi ${products.length} sản phẩm vào data/products.json`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
