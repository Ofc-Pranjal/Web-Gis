console.log("GIS APP STARTED");

const supabaseUrl = 'https://nmywnznzyxvcyrbxwley.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5teXduem56eXh2Y3lyYnh3bGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NzM4NDcsImV4cCI6MjA5NDM0OTg0N30.YUP_uUjULYnL4w6nzWOlWeRWqWVPSs4w8Ok68yqAI_U';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// ================= LAYER CONFIG =================
const layerConfig = [
  { id: "roads_2009", name: "Roads 2009" },
  { id: "allahabad_roads_1989", name: "Roads 1989" },
  { id: "allahabad_landused_area", name: "Landuse Area" },
  { id: "allahabad_parcels_1989", name: "Parcels 1989" },
  { id: "allahabad_parcels_2009", name: "Parcels 2009" },
  { id: "allahabad_roads_2009_modified", name: "Roads Modified" },
  { id: "allahabad_roads_2009_splitli", name: "Roads Split" },
  { id: "allahabad_wards", name: "Wards" },
  { id: "landused_masterplan2021", name: "Master Plan 2021" },
  { id: "place_of_interest", name: "POI" },
  { id: "railways", name: "Railways" },
  { id: "river", name: "River" }
];

const layers = {};

// ================= BASEMAPS =================
const basemaps = {
  osm: new ol.layer.Tile({ source: new ol.source.OSM({ crossOrigin: 'anonymous' }) }),
  satellite: new ol.layer.Tile({ source: new ol.source.XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', crossOrigin: 'anonymous' }) }),
  topo: new ol.layer.Tile({ source: new ol.source.XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', crossOrigin: 'anonymous' }) })
};

function switchBasemap() {
  const selected = document.getElementById('basemapSelect').value;
  map.getLayers().setAt(0, basemaps[selected]);
}

// ================= MAP =================
const map = new ol.Map({
  target: 'map',
  layers: [ basemaps.osm ],
  view: new ol.View({
    center: ol.proj.fromLonLat([81.8463, 25.4358]),
    zoom: 14
  })
});

// SCALE
map.addControl(new ol.control.ScaleLine({
  units: 'metric',
  bar: true,
  steps: 4,
  text: true
}));

// ================= SUPABASE VECTOR LAYERS =================
const layerContainer = document.getElementById("layerContainer");

layerConfig.forEach((item) => {
  const vectorSource = new ol.source.Vector({
    format: new ol.format.GeoJSON({ featureProjection: 'EPSG:3857' }),
    loader: function (extent, resolution, projection, success, failure) {
      fetch(`${supabaseUrl}/rest/v1/${item.id}`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/geo+json'
        }
      })
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok');
          return response.json();
        })
        .then(data => {
          const format = new ol.format.GeoJSON();
          const features = format.readFeatures(data, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
          });
          vectorSource.addFeatures(features);
          success(features);

          if (item.id === "roads_2009" && features.length > 0) {
            map.getView().fit(vectorSource.getExtent(), {
              duration: 800,
              padding: [50, 50, 50, 50]
            });
          }
        })
        .catch(error => {
          console.error(`Error loading layer ${item.id}:`, error);
          failure();
        });
    }
  });

  const isRoads2009 = item.id === "roads_2009";

  const layer = new ol.layer.Vector({
    source: vectorSource,
    visible: false,
    style: isRoads2009 ? new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: 'red',
        width: 4
      })
    }) : undefined,
    zIndex: isRoads2009 ? 999 : 1
  });

  layers[item.id] = layer;
  map.addLayer(layer);

  const div = document.createElement("div");

  div.innerHTML = `
    <input type="checkbox" id="${item.id}">
    <label style="cursor:pointer;" for="${item.id}">${item.name}</label>
  `;

  layerContainer.appendChild(div);

  const styleLayerSelect = document.getElementById('styleLayerSelect');
  if (styleLayerSelect) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    styleLayerSelect.appendChild(option);
    
    const dtOption = option.cloneNode(true);
    document.getElementById('dataTableLayerSelect').appendChild(dtOption);
  }

  document.getElementById(item.id).addEventListener("change", function () {
    layer.setVisible(this.checked);
    updateLegend();
  });
});

updateLegend();

// ================= POPUP =================
const popupElement = document.getElementById('popup');

const popup = new ol.Overlay({
  element: popupElement,
  positioning: 'bottom-center',
  stopEvent: true
});

map.addOverlay(popup);

map.on('singleclick', function (evt) {
  popup.setPosition(undefined);
  let found = false;

  map.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
    if (found || feature === positionFeature || layer === measureLayer) return;
    found = true;

    const props = feature.getProperties();
    window.selectedFeatureId = feature.getId() || feature.get('id') || props.id || props.fid;

    let layerId = null;
    Object.keys(layers).forEach(k => {
      if (layers[k] === layer) layerId = k;
    });
    window.selectedLayerId = layerId;

    let html = `<b>Edit ${layerId || 'Feature'}</b><hr>`;
    Object.keys(props).forEach(k => {
      if (k === 'geometry') return;
      html += `<label>${k}</label><input type="text" id="${k}" value="${props[k] || ''}">`;
    });
    html += `<button onclick="saveFeature()">Save</button>`;

    popupElement.innerHTML = html;
    popup.setPosition(evt.coordinate);
  });
});

// ================= UI MENUS =================
function toggleMenu(id, element) {
  const container = document.getElementById(id);
  const icon = element.querySelector('.chevron');
  if (container.style.display === "none") {
    container.style.display = "block";
    if(icon) icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
  } else {
    container.style.display = "none";
    if(icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
  }
}

// ================= DYNAMIC LEGEND =================
function updateLegend() {
  const legendContent = document.getElementById('legendContent');
  if (!legendContent) return;

  let html = '';
  layerConfig.forEach(item => {
    const layer = layers[item.id];
    if (layer && layer.getVisible()) {
      let color = '#3399CC';
      const style = layer.getStyle();
      if (style && typeof style.getStroke === 'function' && style.getStroke()) {
         color = style.getStroke().getColor();
      } else if (item.id === 'roads_2009') {
         color = 'red';
      }
      html += `
        <div style="display:flex; align-items:center; margin-bottom:10px;">
          <div style="width:25px; height:6px; background:${color}; margin-right:12px; border-radius:2px;"></div>
          <span>${item.name}</span>
        </div>
      `;
    }
  });
  legendContent.innerHTML = html === '' ? 'No layers active.' : html;
}

// ================= LAYER STYLING =================
function applyStyle() {
  const layerId = document.getElementById('styleLayerSelect').value;
  const color = document.getElementById('styleColor').value;
  const width = parseInt(document.getElementById('styleWidth').value);
  const opacity = parseFloat(document.getElementById('styleOpacity').value);

  if (!layerId || !layers[layerId]) { alert("Please select a layer to style"); return; }
  const layer = layers[layerId];
  const newStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({ color: color, width: width }),
    fill: new ol.style.Fill({ color: color + '40' })
  });

  layer.setStyle(newStyle);
  layer.setOpacity(opacity);
  updateLegend();
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const btn = document.getElementById("sidebar-toggle");
  sidebar.classList.toggle("collapsed");
  btn.classList.toggle("shifted");
  if (sidebar.classList.contains("collapsed")) {
    btn.innerHTML = '<i class="fas fa-chevron-right"></i>';
  } else {
    btn.innerHTML = '<i class="fas fa-bars"></i>';
  }
}

// ================= SAVE =================
async function saveFeature() {
  if (!window.selectedFeatureId || !window.selectedLayerId) return;
  const inputs = document.querySelectorAll("#popup input");
  let updatedData = {};
  inputs.forEach(input => {
    if (input.id === 'ogc_fid' || input.id === 'id') return;
    updatedData[input.id] = input.value === "" ? null : input.value;
  });

  const { error } = await supabaseClient.from(window.selectedLayerId).update(updatedData).eq('id', window.selectedFeatureId);
  if (error) {
    const fallback = await supabaseClient.from(window.selectedLayerId).update(updatedData).eq('fid', window.selectedFeatureId);
    if (fallback.error) alert("❌ Failed to update. Check console for details.");
    else { alert("✅ Updated Successfully!"); layers[window.selectedLayerId].getSource().refresh(); popup.setPosition(undefined); }
  } else {
    alert("✅ Updated Successfully!");
    layers[window.selectedLayerId].getSource().refresh();
    popup.setPosition(undefined);
  }
}

// ================= SEARCH (DEEP LOCAL + NOMINATIM) =================
const searchInput = document.querySelector('.search-overlay input');
const searchBtn = document.querySelector('.search-overlay button');

if (searchInput && searchBtn) {
  function performSearch() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return;

    // 1. Deep Local Search
    let foundLocal = false;
    Object.values(layers).forEach(layer => {
      if (!layer.getVisible()) return;
      const features = layer.getSource().getFeatures();
      for (let feat of features) {
        const props = feat.getProperties();
        for (let key in props) {
          if (props[key] && String(props[key]).toLowerCase().includes(query)) {
            const geom = feat.getGeometry();
            if (geom) {
              map.getView().fit(geom.getExtent(), { duration: 1000, padding: [50,50,50,50], maxZoom: 18 });
              foundLocal = true;
              return;
            }
          }
        }
        if (foundLocal) return;
      }
    });

    if (foundLocal) return;

    // 2. Nominatim Fallback
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          const result = data[0];
          map.getView().animate({ center: ol.proj.fromLonLat([parseFloat(result.lon), parseFloat(result.lat)]), zoom: 14, duration: 1000 });
        } else {
          alert("Location not found in database or real world");
        }
      })
      .catch(err => console.error("Search error:", err));
  }

  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
}

// ================= GPS LOCATION =================
const geolocation = new ol.Geolocation({
  trackingOptions: { enableHighAccuracy: true },
  projection: map.getView().getProjection()
});
const positionFeature = new ol.Feature();
positionFeature.setStyle(new ol.style.Style({
  image: new ol.style.Circle({
    radius: 7,
    fill: new ol.style.Fill({ color: '#3399CC' }),
    stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
  })
}));
const gpsLayer = new ol.layer.Vector({
  source: new ol.source.Vector({ features: [positionFeature] }),
  zIndex: 1000
});
map.addLayer(gpsLayer);

function findMyLocation() {
  if (!geolocation.getTracking()) geolocation.setTracking(true);
  const position = geolocation.getPosition();
  if (position) {
    map.getView().animate({ center: position, zoom: 16, duration: 1000 });
  } else {
    geolocation.once('change:position', function() {
      map.getView().animate({ center: geolocation.getPosition(), zoom: 16, duration: 1000 });
    });
  }
}
geolocation.on('change:position', function () {
  const coordinates = geolocation.getPosition();
  positionFeature.setGeometry(coordinates ? new ol.geom.Point(coordinates) : null);
});

// ================= DATA TABLE =================
function toggleDataPanel() {
  document.getElementById('data-panel').classList.toggle('collapsed');
}
function loadTableData() {
  const layerId = document.getElementById('dataTableLayerSelect').value;
  const container = document.getElementById('table-container');
  if (!layerId || !layers[layerId]) { container.innerHTML = ''; return; }
  
  const features = layers[layerId].getSource().getFeatures();
  if (features.length === 0) {
    container.innerHTML = '<p style="padding:10px;">No features loaded yet. Zoom in or ensure layer is active.</p>';
    return;
  }
  const keys = Object.keys(features[0].getProperties()).filter(k => k !== 'geometry');
  let html = '<table><thead><tr>';
  keys.forEach(k => html += `<th>${k}</th>`);
  html += '</tr></thead><tbody>';
  features.forEach(f => {
    html += '<tr>';
    const props = f.getProperties();
    keys.forEach(k => html += `<td>${props[k] || ''}</td>`);
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ================= MEASUREMENT =================
const measureSource = new ol.source.Vector();
const measureLayer = new ol.layer.Vector({
  source: measureSource,
  style: new ol.style.Style({
    fill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
    stroke: new ol.style.Stroke({ color: '#ffcc33', width: 2 }),
    image: new ol.style.Circle({ radius: 7, fill: new ol.style.Fill({ color: '#ffcc33' }) })
  }),
  zIndex: 1001
});
map.addLayer(measureLayer);

let draw;
let measureTooltipElement;
let measureTooltip;

function createMeasureTooltip() {
  if (measureTooltipElement) measureTooltipElement.parentNode.removeChild(measureTooltipElement);
  measureTooltipElement = document.createElement('div');
  measureTooltipElement.className = 'ol-tooltip ol-tooltip-measure';
  measureTooltip = new ol.Overlay({
    element: measureTooltipElement,
    offset: [0, -15],
    positioning: 'bottom-center',
    stopEvent: false
  });
  map.addOverlay(measureTooltip);
}

function startMeasurement(type) {
  map.removeInteraction(draw);
  const drawType = (type === 'area' ? 'Polygon' : 'LineString');
  draw = new ol.interaction.Draw({
    source: measureSource,
    type: drawType,
    style: new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
      stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.5)', lineDash: [10, 10], width: 2 }),
      image: new ol.style.Circle({ radius: 5, stroke: new ol.style.Stroke({ color: 'rgba(0, 0, 0, 0.7)' }), fill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.2)' }) })
    })
  });
  map.addInteraction(draw);
  createMeasureTooltip();
  
  let listener;
  draw.on('drawstart', function (evt) {
    const sketch = evt.feature;
    let tooltipCoord = evt.coordinate;
    listener = sketch.getGeometry().on('change', function (evt) {
      const geom = evt.target;
      let output;
      if (geom instanceof ol.geom.Polygon) {
        output = (ol.sphere.getArea(geom) / 1000000).toFixed(2) + ' km²';
        tooltipCoord = geom.getInteriorPoint().getCoordinates();
      } else if (geom instanceof ol.geom.LineString) {
        output = (ol.sphere.getLength(geom) / 1000).toFixed(2) + ' km';
        tooltipCoord = geom.getLastCoordinate();
      }
      measureTooltipElement.innerHTML = output;
      measureTooltip.setPosition(tooltipCoord);
    });
  });
  
  draw.on('drawend', function () {
    measureTooltipElement.className = 'ol-tooltip ol-tooltip-static';
    measureTooltip.setOffset([0, -7]);
    ol.Observable.unByKey(listener);
    map.removeInteraction(draw);
  });
}

function clearMeasurement() {
  measureSource.clear();
  map.getOverlays().getArray().slice(0).forEach(overlay => {
    if (overlay !== popup) map.removeOverlay(overlay);
  });
  map.removeInteraction(draw);
}

// ================= PRINT MAP =================
function printMap() {
  map.once('rendercomplete', function () {
    const mapCanvas = document.createElement('canvas');
    const size = map.getSize();
    mapCanvas.width = size[0];
    mapCanvas.height = size[1];
    const mapContext = mapCanvas.getContext('2d');
    
    Array.prototype.forEach.call(
      document.querySelectorAll('.ol-layer canvas'),
      function (canvas) {
        if (canvas.width > 0) {
          const opacity = canvas.parentNode.style.opacity;
          mapContext.globalAlpha = opacity === '' ? 1 : Number(opacity);
          const backgroundColor = canvas.parentNode.style.backgroundColor;
          if (backgroundColor) {
            mapContext.fillStyle = backgroundColor;
            mapContext.fillRect(0, 0, canvas.width, canvas.height);
          }
          const transform = canvas.style.transform;
          let matrix;
          if (transform) {
            matrix = transform.match(/^matrix\(([^\(]*)\)$/)[1].split(',').map(Number);
          } else {
            matrix = [parseFloat(canvas.style.width) / canvas.width, 0, 0, parseFloat(canvas.style.height) / canvas.height, 0, 0];
          }
          CanvasRenderingContext2D.prototype.setTransform.apply(mapContext, matrix);
          mapContext.drawImage(canvas, 0, 0);
        }
      }
    );
    mapContext.setTransform(1, 0, 0, 1, 0, 0);
    const link = document.createElement('a');
    link.href = mapCanvas.toDataURL('image/png');
    link.download = 'GIS_Map_Export.png';
    link.click();
  });
  map.renderSync();
}