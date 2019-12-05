const crop_group_mapping_at = new Map([
  [1010, 'SOMMERGETREIDE'],
  [1020, 'WINTERGETREIDE'],
  [1030, 'MENGGETREIDE'],
  [1040, 'MAIS'],
  [1050, 'SOMMERRAPS'],
  [1060, 'WINTERRAPS'],
  [1070, 'SONNENBLUME'],
  [1080, 'HANF'],
  [1090, 'LEGUMINOSEN'],
  [1100, 'WINTERLEGUMINOSE'],
  [1110, 'KARTOFFELN'],
  [1120, 'RÜBEN'],
  [1130, 'GEMÜSE'],
  [1140, 'GEWÜRZE'],
  [1150, 'WINTERGEWÜRZE'],
  [1160, 'KÜRBIS'],
  [1170, 'BRACHE'],
  [1180, 'DAUERKULTUR'],
  [1190, 'GEWÄCHSHAUS'],
  [1200, 'WEIN'],
  [1210, 'GRÜNLAND'],
  [1220, 'PRO RATA'],
  [1230, 'LAGERFLÄCHEN'],
  [1240, 'SONSTIGES'],
]);

function convertCropGroupAt(id) {
  if (crop_group_mapping_at.has(id)) {
    return crop_group_mapping_at.get(id);
  }
  return id;
}
