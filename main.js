'use strict'

/*******************************************************************************
*********************************** LPvis **************************************
********************************************************************************
************************** Land Parcel Visualizer ******************************
********************************************************************************
Visualize land parcels together with classification results
********************************************************************************

# OUTLINE

## UTIL
### PARAMETERS
### CLASS MODIFICATIONS
### FUNCTIONS

## MAP
### INIT MAP
### INIT BASEMAPS
### INIT ADMINISTRATIVE BOUNDARIES
### INIT LPIS LAYERS
### EVENT LISTENERS
### CONTROLS
*****************************/

/****** PARAMETERS ******/

const AGRICULTURAL_PARCELS_URL_TEMPLATE = '/tiles/agricultural_parcels/{z}/{x}/{y}.pbf'
const PHYSICAL_BLOCKS_URL_TEMPLATE = '/tiles/physical_blocks/{z}/{x}/{y}.pbf'
//const MUNICIPALITIES_URL_TEMPLATE = '/tiles/municipalities_unzipped/{z}/{x}/{y}'

// NUTS_LEVEL and NUTS_CODE_STARTS_WITH only apply to GeoJSONs from Eurostat's Nuts2json
// https://github.com/eurostat/Nuts2json
const NUTS_LEVEL = 2
const NUTS_CODE_STARTS_WITH = 'AT'
const NUTS2_GEOJSON_URL = 'geodata/bbox_classification_20191205.geojson' // OR: `https://raw.githubusercontent.com/eurostat/Nuts2json/gh-pages/2016/4258/10M/nutsrg_${NUTS_LEVEL}.json`

const CLASSIFICATION_API_URL = '/predictions'

const AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER = 'ID'
const PHYSICAL_BLOCKS_UNIQUE_IDENTIFIER = 'RFL_ID'
const SMALL_PARCELS_UNIQUE_IDENTIFIER = 'ID'
const SMALL_PARCELS_POINTS_UNIQUE_IDENTIFIER = 'id'

// parameter names of declaration and classification to be checked for match
const AGRICULTURAL_PARCELS_CLASSIFICATION_PARAM = "crop_id"
const AGRICULTURAL_PARCELS_DECLARATION_PARAM = "CTnumL4A"

const ORTHOPHOTO_URL_TEMPLATE = 'https://maps{s}.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg'

const CONFIDENCE_THRESHOLD = 0.95
const INITIAL_SWIPE_DISTANCE = 0.1


const font_awesome_attribution = 'Icons { CC-BY-4.0 <a href="https://fontawesome.com/">Font Awesome</a> }'

const parcel_style = {
  weight: 0.3,
  fill: true,
  fillOpacity: 0.6
}

const parcel_style_highlighted = {
  weight: 0.3,
  color: 'orange',
  fill: true,
  fillOpacity: 1,
}

const parcel_style_hidden = {
  visibility: 'hidden'
}

let clicked_features = []
let timestack_mode = false
let legend_control, nuts2, swipe_control, timestack_control, table, table_control, table_deletion_ref, currently_used_table_columns

/****** CLASS MODIFICATIONS ******/

/* Attribution can be lengthy. We don't want it to show always. This class
modification changes the attribution container so that we can hide it until
the user hovers an ℹ-icon. */
L.Control.Attribution.include({

	_update: function () {
		if (!this._map) { return; }

		var attribs = [];

		for (var i in this._attributions) {
			if (this._attributions[i]) {
				attribs.push(i);
			}
		}

		var prefixAndAttribs = [];

		if (this.options.prefix) {
			prefixAndAttribs.push(this.options.prefix);
		}
		if (attribs.length) {
			prefixAndAttribs.push(attribs.join(', '));
		}

    // Source: https://github.com/route360/Leaflet.CondensedAttribution/blob/master/dist/leaflet-control-condended-attribution.js
		this._container.innerHTML = '<div class="attribution-body">' +
                                  prefixAndAttribs.join(' | ') +
                                '</div>\
                                <div class="attribution-icon">ℹ</div>';
	}
})


/* MagnifyingGlass only activates after clicking on control */
//Source: https://github.com/bbecquet/Leaflet.MagnifyingGlass/blob/master/examples/example_button.js
L.Control.MagnifyingGlass = L.Control.extend({
  _magnifyingGlass: false,

  options: {
    position: 'topleft',
    title: 'Toggle Magnifying Glass',
    forceSeparateButton: false
  },

  initialize: function (magnifyingGlass, options) {
    this._magnifyingGlass = magnifyingGlass;
    // Override default options
    for (var i in options) if (options.hasOwnProperty(i) && this.options.hasOwnProperty(i)) this.options[i] = options[i];
  },

  onAdd: function (map) {
    var className = 'leaflet-control-magnifying-glass far fa-eye', container;

    if (map.zoomControl && !this.options.forceSeparateButton) {
      container = map.zoomControl._container;
    } else {
      container = L.DomUtil.create('div', 'leaflet-bar');
    }

    this._createButton(this.options.title, className, container, this._clicked, map, this._magnifyingGlass);
    return container;
  },

  _createButton: function (title, className, container, method, map, magnifyingGlass) {
    var link = L.DomUtil.create('a', className, container);
    link.href = '#';
    link.title = title;

    L.DomEvent
    .addListener(link, 'click', L.DomEvent.stopPropagation)
    .addListener(link, 'click', L.DomEvent.preventDefault)
    .addListener(link, 'click', function() {method(map, magnifyingGlass, link);}, map);

    return link;
  },

  _clicked: function (map, magnifyingGlass, link) {
    if (!magnifyingGlass) {
      return;
    }

    if (map.hasLayer(magnifyingGlass)) {
      map.removeLayer(magnifyingGlass);
      link.classList.remove('active')
    } else {
      magnifyingGlass.addTo(map);
      link.classList.add('active')
    }
  }
});

L.control.magnifyingglass = function (magnifyingGlass, options) {
  return new L.Control.MagnifyingGlass(magnifyingGlass, options);
};


/* Default of the Swipe control is to split the screen 50/50. We want the
physical blocks to be less prominent. Thus we set a different
INITIAL_SWIPE_DISTANCE. */
L.Control.Swipe.include({
  onAdd: function(map) {
    var e = L.DomUtil.create('div', 'leaflet-control-swipe');
    e.style.margin = `-24px 0px 0px calc(-${INITIAL_SWIPE_DISTANCE*100}% - 48px)`;
    e.style.left = INITIAL_SWIPE_DISTANCE*100 + '%'
    e.innerHTML = "\u25C0\u25B6";
    this._container = e;
    (new L.Draggable(e)).on("drag", this._onDrag, this).enable();
    map.on("swipePaneUpdate", this._update, this);
    this._update();
    return this._container;
  },
  _update: function() {
    var s = map.getSwipePaneSize();
    L.DomUtil.setPosition(this._container, L.point(s.x, 0));
  }

})

/* By default the button only reads "Tables". We make this more verbose:
"Open/Close Table" */
L.control.Table.include({
  initialize: function(){
    var that = this;

    var control = L.DomUtil.create('div','leaflet-control leaflet-table-container');
    var topbar = L.DomUtil.create('div', 'leaflet-table-topbar');

    var tables = L.DomUtil.create('div','leaflet-tables-container');
    this.tables = tables;

    var switcher = L.DomUtil.create('select','leaflet-table-select btn');
    switcher.addEventListener('change',function(evt){
      var curr = evt.target[evt.target.selectedIndex].value;
      for(var rel in that.containers) {
        var container = that.containers[rel];
        if(rel==curr && container.style.display != 'block') {
          container.style.display='block';
        } else {
          container.style.display='none';
        }
      }
    },false);
    this.switcher=switcher;

    var option = L.DomUtil.create('option');
    option.value='none';
    option.innerHTML='Open/Close Table';
    switcher.appendChild(option);

    control.appendChild(topbar);
    topbar.appendChild(switcher);
    control.appendChild(tables);

    control.onmousedown = control.ondblclick = L.DomEvent.stopPropagation;

    this.control=control;
  }
})

// Prepare leaflet.css style update for timestack mode cursor change
const leaflet_interactive_style_css = getStyleGlobal('.leaflet-interactive')

/* New button to toggle timestack mode / sidebar */
L.Control.Timestack = L.Control.extend({
  options: {
    position: 'topleft'
  },

  onAdd: function (map) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
    const link = L.DomUtil.create('a', 'custom-control leaflet-control-timestack fas fa-chart-area', container)
    link.setAttribute('title', 'Toggle Timestack mode')

    L.DomEvent
      .addListener(link, 'click', L.DomEvent.stopPropagation)
      .addListener(link, 'click', L.DomEvent.preventDefault)
      .addListener(link, 'click', this._clicked);

    map.timestack_control = this
    return container
  },

  onRemove: function (map) {
    delete map.timestack_control
  },

  _clicked: function () {
    if(timestack_mode) {
      timestack_mode = false
      this.classList.remove('active')
      // changing global stylesheet to avoid iterating over large number of svg elements
      leaflet_interactive_style_css['cursor'] = 'pointer'
      L.DomUtil.removeClass(map._container,'crosshair-cursor-enabled');
      hideSidebar()
    } else {
      timestack_mode = true
      this.classList.add('active')
      leaflet_interactive_style_css['cursor'] = 'crosshair'
      L.DomUtil.addClass(map._container,'crosshair-cursor-enabled');
    }
  }
})

L.control.timestack = function () {
  return new L.Control.Timestack();
};

/* Two new functions for L.MagnifyingGlass to aid interaction with additional
zoom level (zoom in orthophoto beyond level 19)*/
L.MagnifyingGlass.include({
  setFixedZoom: function(fixedZoom) {
    this._fixedZoom = (fixedZoom != -1);
    this.options.fixedZoom = fixedZoom;
    this._updateZoom()
  },

  setRadius: function(radius) {
    this.options.radius = radius;
    if(this._wrapperElt) {
      this._wrapperElt.style.width = this.options.radius * 2 + 'px';
      this._wrapperElt.style.height = this.options.radius * 2 + 'px';
      this._glassMap.invalidateSize()
    }
  },
})


/****** FUNCTIONS ******/

function fetchJSON(url) {
  return fetch(url)
    .then(function(response) {
      return response.json();
    });
}

function fetchClassificationApi(url, ids) {
  return fetch(url, {
    method: 'post',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(ids)
  }).then(function(response){
    if (!response.ok) {
      throw Error(response.statusText);
    }
    return response;
  }).then(function(response) {
    return response.json()
  }).catch(function(error) {
    console.log(error);
  })
}

function clearClickedFeatures() {
  for(let f of clicked_features) agricultural_parcels.resetFeatureStyle(f[AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER])
  clicked_features = []
}

function exportTableToCSV() {
  const table_rows = document.querySelector('div.body > table > tbody').children
  const csv = []
  const a = document.createElement('a') // create link, don't add it to DOM
  const event = document.createEvent('MouseEvents')
  event.initEvent('click', true, true)

  csv.push(Object.keys(table_rows[0].dataset).join(','))
  for(let tr of table_rows) {
    csv.push(Object.values(tr.dataset).join(','))
  }

  a.setAttribute('download', 'data.csv')
  a.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv.join('\r\n')))
  a.dispatchEvent(event); // click link to trigger download
}

function initSwipeControl() {
  swipe_control = L.control.swipe().addTo(map)
  const swipe_container = swipe_control.getContainer()
  swipe_container.onclick = e => e.stopPropagation()

  // Properly resize swipe pane and remove it from controls DOM container
  const map_container = map.getContainer()
  map.getPane('swipePane').style.zIndex = 451 // above labels to improve visibility of physical_blocks boundaries
  map.setSwipePaneSize(map.getSize().scaleBy(L.point(INITIAL_SWIPE_DISTANCE, 1)));
  map_container.insertBefore(swipe_container, map_container.firstChild) // We don't want it to take up space in the controls DOM container

  // Open tooltip on map to explain Swipe control
  const c = swipe_container.getBoundingClientRect()
  const tooltip_coords = map.containerPointToLatLng([c.x+c.width*.9,c.y+c.height/2*1.2])
  map.openTooltip('Pull right to overlay physical blocks.', tooltip_coords)

  // Prevent tooltip from staying too long
  map.once('mousedown zoomstart layerremove', removeTooltipsFromMap)
}

function initTable(attribute_labels) {
  if(L.Browser.mobile) return; // disable on mobile browsers
  // make it global, so we can remove table later, when it should be updated
  table_control = new L.control.Table({}).addTo(map)
  const table_container = table_control.getContainer()
  const button = document.createElement('button')
  currently_used_table_columns = attribute_labels
  table_container.onclick = e => e.stopPropagation() // to prevent click events on map, which clear table
  table_deletion_ref = addTable(attribute_labels, table_control, 'agricultural_parcels', 'Agricultural parcels')
  button.classList.add('btn', 'download-btn')
  button.style.display = 'none'
  button.innerHTML = 'Export (CSV)'
  button.onclick = exportTableToCSV

  table_container.querySelector('.leaflet-table-topbar').appendChild(button)
  table_container.querySelector('select').addEventListener('change', e => {
    if(e.target.selectedOptions[0].value === 'none') {
      button.style.display = 'none'
    } else {
      button.style.display = 'block'
    }
  })
}

function addTable(attribute_labels, tcl, rel, title) {
  table = new Supagrid({
    fields: attribute_labels,
    id_field: AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER,
    data: {} // to be filled later on click
  })

  return tcl.addTable(table.supagrid, rel, title)
}

function removeTooltipsFromMap() {
  // source: https://gis.stackexchange.com/questions/254276/how-to-close-all-tooltips-defined-against-the-map-object
  map.eachLayer(function(layer) {
    if(layer.options.pane === "tooltipPane") layer.removeFrom(map);
  })
}

function trafficLightStyle (match, accuracy, is_highlighted) {
  if (accuracy < CONFIDENCE_THRESHOLD) return {
    fillColor: 'yellow',
    color: 'yellow',
    ...(is_highlighted ? parcel_style_highlighted : parcel_style),
    ...(legend_control.options._color_hidden.yellow ? parcel_style_hidden : {})
  }
  else if (match === true) return {
    fillColor: 'green',
    color: 'green',
    ...(is_highlighted ? parcel_style_highlighted : parcel_style),
    ...(legend_control.options._color_hidden.green ? parcel_style_hidden : {})
  }
  else if (match === false) return {
    fillColor: 'red',
    color: 'red',
    ...(is_highlighted ? parcel_style_highlighted : parcel_style),
    ...(legend_control.options._color_hidden.red ? parcel_style_hidden : {})
  }
  else return {
    fillColor: 'grey',
    color: 'grey',
    ...(is_highlighted ? parcel_style_highlighted : parcel_style),
    ...(legend_control.options._color_hidden.grey ? parcel_style_hidden : {})
  }
}


/****** INIT MAP ******/

const map = L.map('map').setView([50.102223, 9.254419], 4)
map.attributionControl.setPrefix('<a href="https://github.com/EOX-A/LPvis" target="_blank">LPvis 🕺</a> | <a href="https://leafletjs.com/" target="_blank">Leaflet</a>')
map.attributionControl.addAttribution(font_awesome_attribution)
map.createPane('administrative').style.zIndex = 250
map.createPane('labels').style.zIndex = 450


/****** INIT BASEMAPS ******/

const cloudless2018 = L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2018_3857/default/g/{z}/{y}/{x}.jpg', {
  interactive: false,
  attribution: '<a xmlns:dct="http://purl.org/dc/terms/" href="https://s2maps.eu" \
                property="dct:title">Sentinel-2 cloudless - https://s2maps.eu</a>\
                by\
                <a xmlns:cc="http://creativecommons.org/ns#" href="https://eox.at" \
                property="cc:attributionName" rel="cc:attributionURL">EOX IT Services GmbH</a> \
                (Contains modified Copernicus Sentinel data 2017 & 2018)'
})

const terrain_light = L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/terrain-light_3857/default/g/{z}/{y}/{x}.jpg', {
  interactive: false,
  attribution: 'Terrain Light { Data © \
                <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> \
                contributors and <a href="https://maps.eox.at/#data">others</a>, \
                Rendering © <a href="http://eox.at">EOX</a> }'
}).addTo(map)

const overlay = L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/overlay_3857/default/g/{z}/{y}/{x}.png', {
  interactive: false,
  format: 'image/png',
  transparent: true,
  pane: 'labels',
  attribution: 'Overlay { Data © \
                <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> \
                contributors, Rendering © \
                <a href="http://eox.at">EOX</a> and <a href="https://github.com/mapserver/basemaps">MapServer</a>}'
}).addTo(map)

const orthophoto = L.tileLayer(ORTHOPHOTO_URL_TEMPLATE, {
  interactive: false,
  maxZoom: 20,
  subdomains: ['','1','2','3','4'],
  attribution: 'Orthophoto: <a href="basemap.at">basemap.at</a>'
})

const osm = L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/osm_3857/default/g/{z}/{y}/{x}.jpg', {
  interactive: false,
  attribution: 'OpenStreetMap { Data © \
                <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> \
                contributors, Rendering © \
                <a href="https://github.com/mapserver/basemaps">MapServer</a> \
                and <a href="http://eox.at">EOX</a> }'
})


/****** INIT ADMINISTRATIVE BOUNDARIES ******/

fetchJSON(NUTS2_GEOJSON_URL).then(data => {
  nuts2 = L.geoJSON(data, {
    interactive: false,
    pane: 'administrative',
    filter: feature => {
      if (feature.properties.id) {
        return feature.properties.id.startsWith(NUTS_CODE_STARTS_WITH)
      } else {
        return true
      }
    },
    style: feature => { return {
      fill: true,
      fillColor: '#cc6633',
      fillOpacity: 0.6,
      stroke: true,
      color: '#cc6633',
      weight: 2
    }},
    attribution: 'NUTS2 { CC-BY-3.0 <a href="data.statistik.gv.at">Statistik Austria</a> }'
  }).addTo(map)
  map.flyToBounds(nuts2.getBounds(), { duration: 2 })
})

/*
const municipalities = L.vectorGrid.protobuf(MUNICIPALITIES_URL_TEMPLATE, {
  interactive: false,
  maxNativeZoom: 14,
  minZoom: 11,
  pane: 'administrative',
  vectorTileLayerStyles: {
    municipalities: {
      stroke: true,
      color: '#cc6633',
      weight: 1
    }
  },
  attribution: 'Gemeinden { CC-BY-3.0 <a href="data.statistik.gv.at">Statistik Austria</a> }'
}).addTo(map)
*/

/****** INIT LPIS LAYERS ******/
/* Instead of Leaflet.VectorGrid we could use Leaflet.VectorTileLayer by Joachim Kuebart
https://gitlab.com/jkuebart/Leaflet.VectorTileLayer/
We then would not have to declare layer names in the style (useful for
interoperability with other sources -> we don't have to know layer names in advance)
Also svg styles in high zoom levels would not seem bloated because stroke weight
does not get overscaled */

const physical_blocks = L.vectorGrid.protobuf(PHYSICAL_BLOCKS_URL_TEMPLATE, {
  rendererFactory: L.svg.tile, // canvas ist pixelated and has tooltip artifacts
  pane: 'swipePane',
  interactive: true,
  minNativeZoom: 11,
  maxNativeZoom: 15,
  minZoom: 14,
  vectorTileLayerStyles: {
    physical_blocks: properties => {
      return {
        fill: true,
        fillColor: '#ffffff',
        fillOpacity: 0.7,
        color: '#000000',
        weight: 1.5
      }
    }
  },
  getFeatureId: feature => feature.properties[PHYSICAL_BLOCKS_UNIQUE_IDENTIFIER],
  attribution: 'INVEKOS Referenzflächen Österreich { CC-BY-3.0-AT Agrarmarkt Austria }'
}).bindTooltip('', { sticky: true }).addTo(map)

const agricultural_parcels = L.vectorGrid.protobuf(AGRICULTURAL_PARCELS_URL_TEMPLATE, {
  rendererFactory: L.svg.tile,
  interactive: true,
  // minZoom must not be <= minNativeZoom otherwise library requests millions of tiles
  // Leaflet bug: https://github.com/Leaflet/Leaflet/issues/6504
  // minNativeZoom: 14,
  maxNativeZoom: 16,
  minZoom: 14,
  vectorTileLayerStyles: {
    agricultural_parcels: properties => {
      if(!table) {
        initTable(Object.keys(properties))
      }

      return trafficLightStyle(properties.match, properties.accuracy, false)
    }
  },
  getFeatureId: feature => feature.properties[AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER],
  attribution: 'INVEKOS Schläge Österreich { CC-BY-3.0-AT Agrarmarkt Austria }'
}).bindTooltip('', { sticky: true }).addTo(map)


/****** EVENT LISTENERS ******/

agricultural_parcels.on('mouseover', e => {
  const attributes = e.propagatedFrom.properties
  agricultural_parcels.setTooltipContent(
    `ID: ${attributes[AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER]}<br>
    Declaration: ${attributes['CT']}<br>
    Conform: ${attributes.match === true ? 'yes'
             : attributes.match === false ? 'no'
             : 'not classified'}<br>
    Confidence level: ${typeof (attributes.accuracy) !== 'undefined' ? attributes.accuracy : 'not classified'}`,
    { sticky:true })
})

agricultural_parcels.on('click', e => {
  L.DomEvent.stopPropagation(e)
  if (timestack_mode || L.Browser.mobile) clearClickedFeatures() // so that only one parcel is highlighted at a time

  const attributes = e.propagatedFrom.properties
  console.log(attributes)

  if(!clicked_features.includes(attributes)) {
    if (table) table.addLine(attributes)
    clicked_features.push(attributes)

    agricultural_parcels.setFeatureStyle(attributes[AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER],
                                          trafficLightStyle(attributes.match, attributes.accuracy, true))
  }


  if(timestack_mode) {
    //Prepare UI
    showSidebar()
    setFilterOnAllSidebarChildrenButOverlay('blur(4px)')

    // Spinner
    // Source: https://tobiasahlin.com/spinkit/
    createSidebarOverlayAndReturnMessageDiv()
      .html(`
        <p>Querying Database...</p>
        <div class="sk-cube-grid">
        <div class="sk-cube sk-cube1"></div>
        <div class="sk-cube sk-cube2"></div>
        <div class="sk-cube sk-cube3"></div>
        <div class="sk-cube sk-cube4"></div>
        <div class="sk-cube sk-cube5"></div>
        <div class="sk-cube sk-cube6"></div>
        <div class="sk-cube sk-cube7"></div>
        <div class="sk-cube sk-cube8"></div>
        <div class="sk-cube sk-cube9"></div>
        </div>
    `)

    // parcel ID is used for timestack query
    updateSidebar(attributes[AGRICULTURAL_PARCELS_UNIQUE_IDENTIFIER])
  }
})

physical_blocks.on('mouseover', e => {
  const attributes = e.propagatedFrom.properties
  physical_blocks.setTooltipContent(
    `ID: ${attributes[PHYSICAL_BLOCKS_UNIQUE_IDENTIFIER]}<br>
    Type: ${attributes['REF_ART']}`
  )
})

map.on('click', e => {
  if(clicked_features.length > 0 && !timestack_mode) {
    clearClickedFeatures()

    const tbody = document.querySelector('div.body > table > tbody')
    while(tbody && tbody.lastChild) {
      tbody.removeChild(tbody.lastChild)
    }
  }
})

map.on('zoomend', e => {
  console.log('Zoomlevel: ' + map.getZoom())
  if (map.getZoom() >= 11) {
    nuts2.setStyle(feature => { return {
      fill: false
    }})
  }

  if (map.getZoom() < 11) {
    nuts2.setStyle(feature => { return {
      fill: true
    }})
  }

  if (map.getZoom() >= 13) {
    nuts2.setStyle(feature => { return {
      stroke: false
    }})
  }

  if (map.getZoom() < 13) {
    nuts2.setStyle(feature => { return {
      stroke: true
    }})
  }

  if (swipe_control && map.getZoom() < 14) {
    map.removeControl(swipe_control)
    swipe_control = null
    map.getPane('swipePane').style.visibility = 'hidden';
  }

  if (!swipe_control && map.getZoom() >= 14 && map.hasLayer(agricultural_parcels) && map.hasLayer(physical_blocks)) {
    initSwipeControl()
    map.getPane('swipePane').style.visibility = 'visible';
  }

  if (map.getZoom() >= 14 && map.hasLayer(agricultural_parcels)) {
    map.addControl(legend_control)
    if(!map.timestack_control) map.addControl(timestack_control)
  }

  if (map.getZoom() < 14) {
    map.removeControl(legend_control)

    map.removeControl(timestack_control)
    timestack_mode = false
    hideSidebar()

    removeTooltipsFromMap()
  }
})

map.on('layeradd', e => {
  if(!swipe_control && map.getZoom() >= 14 && map.hasLayer(agricultural_parcels) && map.hasLayer(physical_blocks)) {
    initSwipeControl()
  }

  if(map.getZoom() >= 14 && map.hasLayer(agricultural_parcels) && legend_control && !map._customControl_legend) {
    map.addControl(legend_control)
  }
})

map.on('layerremove', e => {
  if(swipe_control && !(map.hasLayer(agricultural_parcels) && map.hasLayer(physical_blocks))) {
    map.removeControl(swipe_control)
    map.setSwipePaneSize(map.getSize())
    swipe_control = null
  }

  if(!map.hasLayer(agricultural_parcels)) {
    map.removeControl(legend_control)
  }
})

/* Dynamic Classification Results */
let parcel_map = new Map()
let new_tile_keys = new Set()
let new_parcels = new Map()

function colorFeatures(idmap) {
  idmap.forEach((parcel, id)  => {
    const classification_results = parcel.classification_results
    const tilekeys = parcel.tilekeys
    tilekeys.forEach(tilekey => updateFeatureWithClassificationResults(tilekey, id, classification_results))
  })
}

function setDiff(a,b) {
  return new Set([...a].filter(x => !b.has(x)));
}

function mapDiff(a,b) {
  return new Map([...a].filter(x => !b.has(x[0])))
}

function mapDiffWithTileKeysCheck(a,b) {
  // extra check if there is same list of tilekeys or different
  // taking care of corner case when parcel was fetched in another tile already
  // we need to refetch it to color it even on new tile
  return new Map([...a].filter(x => !b.has(x[0]) || !arraysEqualityCheck(b.get(x[0]['tilekeys']), x[1]['tilekeys'])))
}

function updateFeatureWithClassificationResults(key, id, classification_result) {
  if (agricultural_parcels._vectorTiles[key]) {
    const feature_properties = agricultural_parcels._vectorTiles[key]._features[id][0].feature.properties;
    const declared_group = feature_properties[AGRICULTURAL_PARCELS_DECLARATION_PARAM];
    if (classification_result[0]) {
      feature_properties.match = (declared_group === classification_result[0][AGRICULTURAL_PARCELS_CLASSIFICATION_PARAM]);
      feature_properties.accuracy = classification_result[0].probability;
      feature_properties.classified_first_rank = convertCropGroupAt(classification_result[0][AGRICULTURAL_PARCELS_CLASSIFICATION_PARAM]);
    }
    if (classification_result[1]) {
      feature_properties.classified_second_rank = convertCropGroupAt(classification_result[1][AGRICULTURAL_PARCELS_CLASSIFICATION_PARAM]);
      feature_properties.accuracy_second_rank = classification_result[1].probability;
    }
    if (classification_result[2]) {
      feature_properties.classified_third_rank = convertCropGroupAt(classification_result[2][AGRICULTURAL_PARCELS_CLASSIFICATION_PARAM]);
      feature_properties.accuracy_third_rank = classification_result[2].probability;
    }
    agricultural_parcels.setFeatureStyle(id,
       trafficLightStyle(
        feature_properties.match,
        feature_properties.accuracy,
        false
      )
    )
    const table_column_keys_new = Object.keys(feature_properties).filter(col_name => {
      // filter out tilekeys from table columns
      return col_name !== 'tilekeys'
    })
    if (currently_used_table_columns.length < table_column_keys_new.length) {
      // delete & add back table because columns changed after new data fetched
      currently_used_table_columns = table_column_keys_new
      table_control.removeTable(table_deletion_ref[0], table_deletion_ref[1])
      table_deletion_ref = addTable(table_column_keys_new, table_control, 'agricultural_parcels', 'Agricultural parcels')
    }
  }
}

// When tiles start loading
agricultural_parcels.on('loading', e => {
  console.log('Start loading')
  new_tile_keys.clear()
  new_parcels.clear()
})

// When a tile has loaded
agricultural_parcels.on('tileload', e => {
  const key = agricultural_parcels._tileCoordsToKey(e.coords)
  new_tile_keys.add(key)
})

// When layer has loaded all tiles
agricultural_parcels.on('load', e => {
  console.log('Finished loading')
  // Get all new parcels
  new_tile_keys.forEach(key => {
    const features = agricultural_parcels._vectorTiles[key]._features
    const tile_parcels = new Map(Object.keys(features).map(id => {
      const properties = features[id][0].feature.properties
      properties.tilekeys = [key]
      return [Number(id), properties]
    }))
    tile_parcels.forEach((params, key) => {
      // insert parcel into new_parcels map only if it is not there yet
      // if yes, just append another tilekey to tilekeys
      if (!new_parcels.has(key)) {
        new_parcels.set(key, params)
      } else {
        const new_parcels_params = Object.assign({}, new_parcels.get(key))
        new_parcels_params['tilekeys'] = new_parcels_params['tilekeys'].concat(params['tilekeys'])
        new_parcels.set(key, new_parcels_params)
      }
    }) 
  })


  // Prune and send ids to service
  const pruned_parcels = mapDiffWithTileKeysCheck(new_parcels, parcel_map) // prune new_parcels (remove parcels that we already have)
  // console.log(pruned_parcels)
  const sent_ids = new Set(pruned_parcels.keys())
  fetchClassificationApi(CLASSIFICATION_API_URL, { parcel_ids: [...sent_ids] })
    .then(results => {
      if (results) {
        results = new Map(results.filter(r => {
              return pruned_parcels.has(r.parcel_id)
          }).map(r => {
            const parcel_id = r.parcel_id,
                  classification_results = r.classification_results,
                  properties = pruned_parcels.get(parcel_id)

            return [parcel_id, {
              'classification_results': r.classification_results,
              'tilekeys': properties.tilekeys
          }]
        }))
        // console.log(results)
        // merge parcels_we_have with results_we_received to color(grey) those parcels not returned by API for some reason too
        const pruned_parcels_save = new Map([...pruned_parcels].map(x => {
          return [
            x[0], 
            {
              'classification_results': [],
              'tilekeys': x[1]['tilekeys']
            }
          ]
        }))
        results = new Map([...pruned_parcels_save, ...results])
        colorFeatures(results)
        parcel_map = new Map([...parcel_map, ...results])
        console.log(parcel_map)
      }
  })
})

agricultural_parcels.on('tileunload', e => {
  console.log('Tile unloaded')
  const key = agricultural_parcels._tileCoordsToKey(e.coords)
  const removed_ids = new Set(Array.from(parcel_map.entries()).filter(p => {
    const contains = p[1].tilekeys.includes(key)
    if (p[1].tilekeys.length > 1) {
      // just remove reference to tile key
      var index = p[1].tilekeys.indexOf(key);
      if (index > -1) {
        p[1].tilekeys.splice(index, 1);
      }
      return false
    }
    // will be deleted
    return true
  }).map(p => {
    return p[0]
  }))
  for (let id of removed_ids.keys()) {
    parcel_map.delete(id)
  }
  console.log(parcel_map)
})




/****** CONTROLS ******/

var baselayers = {
   "Terrain Light background layer": terrain_light,
   "Sentinel-2 cloudless layer for 2018": cloudless2018
};

var overlays = {
  "Physical blocks": physical_blocks,
  "Agricultural parcels": agricultural_parcels,
  "Overlay": overlay
}

L.control.layers(baselayers, overlays).addTo(map)

L.control.mousePosition({
  separator: ', ',
  numDigits: 3,
  lngFirst: true,
}).addTo(map);

legend_control = L.control.custom({
  id: 'legend',
  position: 'topright',
  classes: 'legend custom-control',
  content: (function() {
    let legend_content = ''
    const high_confidence_string = `High Confidence (≥${CONFIDENCE_THRESHOLD})`
    const legend_definition = {
      'green':  ['Conform', high_confidence_string],
      'yellow': [`Low Confidence (<${CONFIDENCE_THRESHOLD})`],
      'red':    ['Not conform', high_confidence_string],
      'grey':   ['Not classified'],
    }
    for(let color of Object.keys(legend_definition)) {
      legend_content +=
        `<div class="legend-row">
          <div class="legend-colour" title="Click to show/hide parcels" style="background-color: ${color}" data-color=${color}></div>
          <div class="legend-description" data-color=${color}>${legend_definition[color].join('<br>')}</div>
        </div>`
    }
    return legend_content
  })(),
  events: {
    click: function (evt) {
      // enable or disable target color from display
      if (evt) {
        const color = evt.target.dataset.color
        if (typeof (color !== 'undefined') && legend_control.options._color_hidden.hasOwnProperty(color)) {
          legend_control.options._color_hidden[color] = !legend_control.options._color_hidden[color]
          colorFeatures(parcel_map)
        }
      }
    }
  },
  _color_hidden: {
    'green': false,
    'yellow': false,
    'red': false,
    'grey': false,
  },
})

const magnifying_glass = L.magnifyingGlass({
    layers: [orthophoto],
    radius: 140,
    zoomOffset: 0,
    attribution: orthophoto.getAttribution()
}).on('add', e => {
  const glass_map = e.sourceTarget.getMap()
  glass_map.setMaxZoom(20)
  L.DomEvent.on(glass_map.getContainer(), 'mousewheel', e => {
    if (map.getZoom() === 18 && e.deltaY < 0) { // zoom in
      magnifying_glass.setFixedZoom(19)
      magnifying_glass.setRadius(280)
    }
    if (magnifying_glass.options.fixedZoom !== -1 && e.deltaY > 0) { // zoom out
      L.DomEvent.stopPropagation(e) // avoid zoom out of main map
      magnifying_glass.setFixedZoom(-1)
      magnifying_glass.setRadius(140)
    }
  })
})

L.control.magnifyingglass(magnifying_glass, {
    forceSeparateButton: true
}).addTo(map)

const minimap = L.control.minimap(osm, { //layer must be one that is not present on map yet
  toggleDisplay: true,
  minimized: L.Browser.mobile // true if mobile browser
}).addTo(map)
minimap._miniMap.invalidateSize() // otherwise minimap is going crazy
map.attributionControl.addAttribution(osm.getAttribution())

L.control.scale( {
  imperial: false,
  maxWidth: 200
} ).addTo(map)

timestack_control = L.control.timestack()

function formatResultsSearch(feature, el) {
  var title = L.DomUtil.create('div', 'search-results-title', el),
    detailsContainer = L.DomUtil.create('div', 'search-results-details', el),
    details = [],
    type = this.formatType(feature);
  if (feature.properties.name) {
    title.innerHTML = feature.properties.name;
  } else if (feature.properties.housenumber) {
    title.innerHTML = feature.properties.housenumber;
    if (feature.properties.street) {
      title.innerHTML += ' ' + feature.properties.street;
    }
  }
  if (type) details.push(type);
  if (feature.properties.city && feature.properties.city !== feature.properties.name) {
    details.push(feature.properties.city);
  }
  if (feature.properties.country) details.push(feature.properties.country);
  detailsContainer.innerHTML = details.join(', ');
}

function onSelectedSearch(feature) {
  const zoomToUse = map.getZoom() >= 14 ? map.getZoom() : 14;
  map.setView([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], zoomToUse);
}

const photonControlOptions = {
  //url:
  position: 'topcenter', 
  placeholder: 'Zoom to Place ...',
  feedbackEmail: null,
  minChar: 3,
  limit: 7,
  lang: 'en',
  formatResult: formatResultsSearch,
  onSelected: onSelectedSearch,
  bbox: [9.3, 46.3, 17.4, 49.0],
}

const searchControl = L.control.photon(photonControlOptions);
searchControl.addTo(map);
