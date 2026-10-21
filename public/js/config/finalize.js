/* Fyller i standardvärden efter konfigurationen och validerar den. Ladda sist av config-filerna. */
(function (CityBuilder) {
  'use strict';
  const Config = CityBuilder.Config;
  const warn = message => console.warn('[config] ' + message);

  // image utelämnat -> images/<mapp>/<id>.png
  const applyDefaultImages = (groupName, folder) => {
    for (const [id, definition] of Object.entries(Config[groupName])) {
      if (definition.image === undefined) definition.image = `images/${folder}/${id}.png?v=${Config.settings.version}`;
    }
  };
  applyDefaultImages('resources', 'resources');
  applyDefaultImages('terrain', 'terrain');
  applyDefaultImages('buildings', 'buildings');
  applyDefaultImages('units', 'units');

  for (const [id, building] of Object.entries(Config.buildings)) {
    if (building.job && !building.requiredEquipment) building.requiredEquipment = Config.settings.defaultEquipment;

    for (const resourceId of Object.keys(building.buildCost || {})) {
      if (!Config.resources[resourceId]) warn(`${id}: okänd kostnadsresurs '${resourceId}'`);
    }
    if (building.placeOnTerrain && !Config.terrain[building.placeOnTerrain]) warn(`${id}: okänd placeOnTerrain '${building.placeOnTerrain}'`);

    const job = building.job;
    if (!job) continue;
    for (const group of [].concat(job.eats || [])) for (const resourceId of group.any || []) if (!Config.resources[resourceId]) warn(`${id}: okänd resurs '${resourceId}' i eats`);
    if (job.kind === 'gather') {
      // Jakt (sourceUnit) hämtar från enheter och har outputs i stället för outputResource
      const outputs = job.sourceUnit ? Object.keys(job.outputs || {}) : [job.outputResource];
      if (!job.sourceUnit && !Config.terrain[job.sourceTerrain]) warn(`${id}: okänd terräng '${job.sourceTerrain}'`);
      for (const resourceId of outputs) if (!Config.resources[resourceId]) warn(`${id}: okänd resurs '${resourceId}'`);
    } else if (job.kind === 'craft') {
      for (const resourceId of [...Object.keys(job.inputs), ...Object.keys(job.outputs)]) {
        if (!Config.resources[resourceId]) warn(`${id}: okänd resurs '${resourceId}'`);
      }
    } else if (job.kind === 'garrison') {
      if (!(job.capacity > 0)) warn(`${id}: garnisonen saknar capacity`);
      if (!job.trains || !job.trains.length) warn(`${id}: garnisonen tränar inga soldater (trains)`);
      for (const unitId of job.trains || []) {
        const unit = Config.units[unitId];
        if (!unit || !unit.isSoldier) { warn(`${id}: '${unitId}' är ingen soldattyp`); continue; }
        if (!unit.training) warn(`${id}: soldaten '${unitId}' saknar training`);
        for (const resourceId of Object.keys(unit.training ? unit.training.inputs : {})) {
          if (!Config.resources[resourceId]) warn(`${unitId}: okänd resurs '${resourceId}'`);
        }
      }
    }
  }
})(window.CityBuilder);
