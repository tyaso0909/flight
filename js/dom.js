// 画面操作と計算の小さな道具
export const $ = (id) => document.getElementById(id);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rnd = (a, b) => a + Math.random() * (b - a);
export const stars = (r) => '★'.repeat(r) + '☆'.repeat(3 - r);
