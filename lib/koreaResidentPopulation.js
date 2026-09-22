'use strict';
const reference=require('./korea-resident-population.json');

// Attach documented modern observations to the existing historical series.
// The territory editor's population_overrides are applied later by the model.
function withResidentPopulation(region){
  const observed=reference.regions[String(region._id)];
  if(!observed)return region;
  const sources=Object.fromEntries(Object.entries(reference.snapshots).map(([year,snapshot])=>[
    year,`행정안전부 주민등록인구 ${snapshot.month} 말 · ${reference.source}`
  ]));
  return {...region,
    population_series:{...(region.population_series||{}),2025:observed[2025],2026:observed[2026]},
    population_sources:{...(region.population_sources||{}),...sources}
  };
}
module.exports={reference,withResidentPopulation};
