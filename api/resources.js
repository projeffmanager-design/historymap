/**
 * 고려만리지도 — /api/resources 라우터
 * 기존 서버에 추가:
 *   const resourcesRouter = require('./api/resources');
 *   app.use('/api/resources', resourcesRouter);
 */

const express = require('express');
const router  = express.Router();
const { getDb } = require('../db');   // 기존 DB 모듈 재사용

// GET /api/resources?type=population|gold|iron&major=true&bbox=lng1,lat1,lng2,lat2
router.get('/', async (req, res) => {
  try {
    const { type, major, bbox, limit = 500 } = req.query;
    const filter = {};

    if (type) {
      const types = type.split(',').map(t => t.trim());
      filter.resource_type = types.length === 1 ? types[0] : { $in: types };
    }
    if (major !== undefined) {
      filter.major = major === 'true';
    }
    if (bbox) {
      const [lng1, lat1, lng2, lat2] = bbox.split(',').map(Number);
      filter.location = {
        $geoWithin: {
          $box: [[lng1, lat1], [lng2, lat2]]
        }
      };
    }

    const docs = await getDb()
      .collection('resources')
      .find(filter)
      .limit(parseInt(limit))
      .project({
        _id: 1, resource_type: 1, name: 1, name_ko: 1,
        lat: 1, lng: 1, density: 1, tier: 1,
        est_population: 1, force_3pct: 1, force_5pct: 1,
        major: 1, region: 1, hist: 1, strat: 1, source_map: 1
      })
      .toArray();

    res.json(docs);
  } catch (err) {
    console.error('/api/resources GET 오류:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/resources/stats — 타입별 통계
router.get('/stats', async (req, res) => {
  try {
    const stats = await getDb().collection('resources').aggregate([
      {
        $group: {
          _id: '$resource_type',
          count:            { $sum: 1 },
          major_count:      { $sum: { $cond: ['$major', 1, 0] } },
          avg_density:      { $avg: '$density' },
          max_density:      { $max: '$density' },
          total_population: { $sum: '$est_population' }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/resources/nearby?lat=35&lng=117&radius=150000&type=gold,iron
// radius 단위: 미터
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 150000, type } = req.query;
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
      filter.resource_type = types.length === 1 ? types[0] : { $in: types };
    }

    const docs = await getDb()
      .collection('resources')
      .find(filter)
      .limit(100)
      .toArray();

    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
