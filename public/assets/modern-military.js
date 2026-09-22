/* 2026 conventional military reference. This is not a historical or regional population estimate. */
(function (root) {
  'use strict';
  const source = 'https://www.globalfirepower.com/countries-listing.php';
  const year = 2026;
  // Explicit contemporary-state aliases only. Historical dynasties must never inherit these values.
  const entries = [
    { name: '중국', aliases: ['중화인민공화국', 'People\'s Republic of China', 'China'], rank: 3, index: 0.0919 },
    { name: '대한민국', aliases: ['한국', 'South Korea', 'Republic of Korea'], rank: 5, index: 0.1642 },
    { name: '일본', aliases: ['Japan'], rank: 7, index: 0.1876 },
    { name: '러시아', aliases: ['러시아 연방', 'Russia', 'Russian Federation'], rank: 2, index: 0.0791 },
    { name: '인도', aliases: ['India'], rank: 4, index: 0.1346 },
    { name: '북한', aliases: ['조선민주주의인민공화국', 'North Korea'], rank: 31, index: 0.5933 },
    { name: '대만', aliases: ['중화민국', 'Taiwan'], rank: 22, index: 0.3927 },
    { name: '베트남', aliases: ['Vietnam'], rank: 23, index: 0.4066 },
    { name: '태국', aliases: ['Thailand'], rank: 24, index: 0.4458 },
    { name: '인도네시아', aliases: ['Indonesia'], rank: 13, index: 0.2582 },
    { name: '몽골', aliases: ['몽골국', 'Mongolia'], rank: 93, index: 1.9987 }
  ];
  const byName = new Map();
  for (const entry of entries) for (const name of [entry.name, ...entry.aliases]) byName.set(name.toLowerCase(), entry);
  function lookup(name, selectedYear) {
    return Number(selectedYear) === year ? byName.get(String(name || '').trim().toLowerCase()) || null : null;
  }
  const api = { year, source, entries, lookup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ModernMilitaryReference = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
