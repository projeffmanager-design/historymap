/**
 * 고려만리지도 — /api/crops 라우터
 * 기존 서버에 추가:
 *   const cropsRouter = require('./api/crops');
 *   app.use('/api/crops', cropsRouter);
 */
const express = require('express');
const router  = express.Router();
const { getDb } = require('../db');   // 기존 DB 모듈 재사용

// GET /api/crops?type=rice,wheat&region=江蘇省&bbox=lng1,lat1,lng2,lat2&min_productivity=7
router.get('/', async (req, res) => {
  try {
    const { type, region, bbox, min_productivity, limit = 500 } = req.query;
    const filter = {};

    if (type) {
      const types = type.split(',').map(t => t.trim());
      filter.crop_type = types.length === 1 ? types[0] : { $in: types };
    }
    if (region) filter.region = { $regex: region, $options: 'i' };
    if (min_productivity) filter.productivity = { $gte: parseInt(min_productivity) };
    if (bbox) {
      const [lng1, lat1, lng2, lat2] = bbox.split(',').map(Number);
      filter.location = { $geoWithin: { $box: [[lng1, lat1], [lng2, lat2]] } };
    }

    const docs = await getDb().collection('crops')
      .find(filter)
      .limit(parseInt(limit))
      .project({
        _id: 1, crop_type: 1, crop_type_ko: 1,
        name: 1, name_ko: 1, lat: 1, lng: 1,
        productivity: 1, area_km2: 1,
        annual_yield_ton: 1, annual_tax_grain: 1, tax_coin_equiv: 1,
        region: 1, era_note: 1
      })
      .toArray();

    res.json(docs);
  } catch (err) {
    console.error('/api/crops GET 오류:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crops/stats — 작물별·지역별 집계
router.get('/stats', async (req, res) => {
  try {
    const [byCrop, byRegion] = await Promise.all([
      getDb().collection('crops').aggregate([
        { $group: {
          _id: '$crop_type_ko',
          count:            { $sum: 1 },
          total_yield:      { $sum: '$annual_yield_ton' },
          total_tax:        { $sum: '$annual_tax_grain' },
          total_revenue:    { $sum: '$tax_coin_equiv' },
          avg_productivity: { $avg: '$productivity' }
        }},
        { $sort: { total_yield: -1 } }
      ]).toArray(),
      getDb().collection('crops').aggregate([
        { $group: {
          _id: '$region',
          count:       { $sum: 1 },
          total_yield: { $sum: '$annual_yield_ton' },
          total_tax:   { $sum: '$annual_tax_grain' }
        }},
        { $sort: { total_yield: -1 } },
        { $limit: 20 }
      ]).toArray()
    ]);
    res.json({ by_crop: byCrop, by_region: byRegion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crops/nearby?lat=32&lng=119&radius=200000
// 반경 내 농업 거점 + 작물별 합산 세수 반환
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 200000, type } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat, lng 필수' });

    const filter = {
      location: {
        $nearSphere: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(radius)
        }
      }
    };
    if (type) {
      const types = type.split(',').map(t => t.trim());
      filter.crop_type = types.length === 1 ? types[0] : { $in: types };
    }

    const docs = await getDb().collection('crops').find(filter).limit(80).toArray();

    const summary = {
      count: docs.length,
      total_yield_ton:  docs.reduce((s, d) => s + (d.annual_yield_ton || 0), 0),
      total_tax_grain:  docs.reduce((s, d) => s + (d.annual_tax_grain || 0), 0),
      total_tax_coin:   docs.reduce((s, d) => s + (d.tax_coin_equiv   || 0), 0),
      by_crop: {}
    };
    docs.forEach(d => {
      const k = d.crop_type_ko;
      if (!summary.by_crop[k]) summary.by_crop[k] = { count: 0, yield: 0, tax: 0 };
      summary.by_crop[k].count++;
      summary.by_crop[k].yield += d.annual_yield_ton || 0;
      summary.by_crop[k].tax  += d.annual_tax_grain  || 0;
    });

    res.json({ docs, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
