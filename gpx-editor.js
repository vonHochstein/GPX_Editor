// === Einfaches GPX-Editor-Modell =====================================

let gpxModel = null;
let currentTrackIndex = 0;

// Leaflet
let map;
let waypointLayerGroup;
let trackLayerGroup;

// Selektion
let selectedWaypointId = null;
let selectedTrackPointId = null;
let selectedTrackMarker = null;
let selectedWaypointMarker = null;

// Punkt-hinzufügen-Modus: 'track' | 'wpt' | null
let addPointMode = null;

// UI-Referenzen
let trackNameInputEl = null;
let metaVersionInputEl = null;
let metaCreatorInputEl = null;
let metaNameInputEl = null;
let metaDescInputEl = null;
let fileNameInputEl = null;

// === Initialisierung ==================================================

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initUI();
});

function initMap() {
  map = L.map("map").setView([51.0, 11.0], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap-Mitwirkende"
  }).addTo(map);

  waypointLayerGroup = L.layerGroup().addTo(map);
  trackLayerGroup = L.layerGroup().addTo(map);

  map.on("click", handleMapClickForNewPoint);
}

function initUI() {
  const fileInput = document.getElementById("gpx-file-input");
  fileInput.addEventListener("change", handleFileSelect);

  const trackSelect = document.getElementById("track-select");
  trackSelect.addEventListener("change", () => {
    currentTrackIndex = Number(trackSelect.value) || 0;
    if (gpxModel) {
      syncTrackNameInput();
      renderTrackpointsTable();
      renderMap();
    }
  });

  trackNameInputEl = document.getElementById("track-name-input");
  trackNameInputEl.disabled = true;
  trackNameInputEl.addEventListener("blur", handleTrackNameChange);

  fileNameInputEl = document.getElementById("file-name-input");
  fileNameInputEl.disabled = true;
  fileNameInputEl.addEventListener("blur", handleFileNameChange);

  metaVersionInputEl = document.getElementById("meta-version");
  metaCreatorInputEl = document.getElementById("meta-creator");
  metaNameInputEl = document.getElementById("meta-name");
  metaDescInputEl = document.getElementById("meta-desc");

  metaVersionInputEl.addEventListener("blur", handleMetaChange);
  metaCreatorInputEl.addEventListener("blur", handleMetaChange);
  metaNameInputEl.addEventListener("blur", handleMetaChange);
  metaDescInputEl.addEventListener("blur", handleMetaChange);

  document
    .getElementById("download-btn")
    .addEventListener("click", handleDownload);

  // Tabs
  const tabTrack = document.getElementById("tab-trackpoints");
  const tabWay = document.getElementById("tab-waypoints");

  const deleteTrackpointsBtn = document.getElementById("delete-selected-trackpoints-btn");
  const deleteWaypointsBtn = document.getElementById("delete-selected-waypoints-btn");

  // Standard: Trackpunkte aktiv, Waypoints-Löschbutton ausblenden
  deleteTrackpointsBtn.style.display = "";
  deleteWaypointsBtn.style.display = "none";

  tabTrack.addEventListener("click", () => {
    tabTrack.classList.add("active");
    tabWay.classList.remove("active");
    document.getElementById("trackpoints-section").style.display = "";
    document.getElementById("waypoints-section").style.display = "none";

    deleteTrackpointsBtn.style.display = "";
    deleteWaypointsBtn.style.display = "none";
  });

  tabWay.addEventListener("click", () => {
    tabWay.classList.add("active");
    tabTrack.classList.remove("active");
    document.getElementById("trackpoints-section").style.display = "none";
    document.getElementById("waypoints-section").style.display = "";

    deleteTrackpointsBtn.style.display = "none";
    deleteWaypointsBtn.style.display = "";
  });

  // Punkt via Karte hinzufügen (Toggle)
  const addTrackBtn = document.getElementById("add-trackpoint-btn");
  const addWptBtn = document.getElementById("add-waypoint-btn");

  addTrackBtn.addEventListener("click", () => {
    if (!gpxModel) {
      alert("Bitte zuerst eine GPX-Datei laden oder einen Track erstellen.");
      return;
    }
    if (!gpxModel.tracks.length) {
      alert("In dieser Datei sind keine Tracks enthalten. Bitte zuerst einen Track erstellen.");
      return;
    }

    if (addPointMode === "track") {
      addPointMode = null;
      map.getContainer().style.cursor = "";
      addTrackBtn.classList.remove("active");
    } else {
      addPointMode = "track";
      map.getContainer().style.cursor = "crosshair";
      addTrackBtn.classList.add("active");
      addWptBtn.classList.remove("active");
    }
  });

  addWptBtn.addEventListener("click", () => {
    if (!gpxModel) {
      alert("Bitte zuerst eine GPX-Datei laden oder einen Track/Waypoint-Bestand anlegen.");
      return;
    }

    if (addPointMode === "wpt") {
      addPointMode = null;
      map.getContainer().style.cursor = "";
      addWptBtn.classList.remove("active");
    } else {
      addPointMode = "wpt";
      map.getContainer().style.cursor = "crosshair";
      addWptBtn.classList.add("active");
      addTrackBtn.classList.remove("active");
    }
  });

  // Mehrfach-Löschen (Toolbar-Buttons)
  deleteTrackpointsBtn.addEventListener("click", deleteSelectedTrackPoints);
  deleteWaypointsBtn.addEventListener("click", deleteSelectedWaypoints);

  // Neue Buttons: Track erstellen / löschen
  document
    .getElementById("new-track-btn")
    .addEventListener("click", handleNewTrack);

  document
    .getElementById("delete-track-btn")
    .addEventListener("click", handleDeleteTrack);
}

// === Datei laden & parsen ============================================

function handleFileSelect(evt) {
  const file = evt.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    gpxModel = parseGpx(text);

    // Dateiname aus Upload übernehmen
    gpxModel.meta.filename = file.name || "edited.gpx";

    currentTrackIndex = 0;
    updateTrackSelect();
    syncTrackNameInput();
    syncFileNameInput();
    renderMetaPanel();
    renderWaypointTable();
    renderTrackpointsTable();
    renderMap();
  };
  reader.readAsText(file, "utf-8");
}

function parseGpx(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "application/xml");

  const gpxEl = xmlDoc.getElementsByTagName("gpx")[0];
  if (!gpxEl) {
    alert("Keine <gpx>-Wurzel gefunden.");
    return null;
  }

  const version = gpxEl.getAttribute("version") || "1.1";
  const creator = gpxEl.getAttribute("creator") || "GPX Editor";

  // <metadata>
  let metaName = null;
  let metaDesc = null;
  const metadataEl = xmlDoc.getElementsByTagName("metadata")[0];
  if (metadataEl) {
    const mNameEl = metadataEl.getElementsByTagName("name")[0];
    const mDescEl = metadataEl.getElementsByTagName("desc")[0];
    if (mNameEl && mNameEl.textContent) {
      metaName = mNameEl.textContent.trim();
    }
    if (mDescEl && mDescEl.textContent) {
      metaDesc = mDescEl.textContent.trim();
    }
  }

  const wptEls = Array.from(xmlDoc.getElementsByTagName("wpt"));
  const waypoints = wptEls.map((wptEl, i) => {
    const lat = parseFloatSafe(wptEl.getAttribute("lat"));
    const lon = parseFloatSafe(wptEl.getAttribute("lon"));
    const eleEl = wptEl.getElementsByTagName("ele")[0];
    const timeEl = wptEl.getElementsByTagName("time")[0];
    const nameEl = wptEl.getElementsByTagName("name")[0];
    const descEl = wptEl.getElementsByTagName("desc")[0];

    return {
      id: `wpt-${i}`,
      lat,
      lon,
      ele: eleEl ? parseFloatSafe(eleEl.textContent) : null,
      time: timeEl ? timeEl.textContent.trim() : null,
      name: nameEl ? nameEl.textContent.trim() : null,
      desc: descEl ? descEl.textContent.trim() : null,
      _marker: null
    };
  });

  const trkEls = Array.from(xmlDoc.getElementsByTagName("trk"));
  const tracks = trkEls.map((trkEl, tIndex) => {
    const nameEl = trkEl.getElementsByTagName("name")[0];
    const trkName = nameEl ? nameEl.textContent.trim() : `Track ${tIndex + 1}`;

    const segEls = Array.from(trkEl.getElementsByTagName("trkseg"));
    const segments = segEls.map((segEl, sIndex) => {
      const ptEls = Array.from(segEl.getElementsByTagName("trkpt"));
      const points = ptEls.map((ptEl, pIndex) => {
        const lat = parseFloatSafe(ptEl.getAttribute("lat"));
        const lon = parseFloatSafe(ptEl.getAttribute("lon"));
        const eleEl = ptEl.getElementsByTagName("ele")[0];
        const timeEl = ptEl.getElementsByTagName("time")[0];
        return {
          id: `trk-${tIndex}-seg-${sIndex}-pt-${pIndex}`,
          trackId: `trk-${tIndex}`,
          segmentId: `trk-${tIndex}-seg-${sIndex}`,
          index: pIndex,
          lat,
          lon,
          ele: eleEl ? parseFloatSafe(eleEl.textContent) : null,
          time: timeEl ? timeEl.textContent.trim() : null,
          _marker: null
        };
      });
      return {
        id: `trk-${tIndex}-seg-${sIndex}`,
        points,
        _polyline: null
      };
    });

    return {
      id: `trk-${tIndex}`,
      name: trkName,
      segments
    };
  });

  return {
    meta: {
      version,
      creator,
      name: metaName,
      desc: metaDesc,
      filename: null // wird später gesetzt
    },
    waypoints,
    tracks
  };
}

function parseFloatSafe(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// === Track-Verwaltung =================================================

function handleNewTrack() {
  if (!gpxModel) {
    gpxModel = {
      meta: {
        version: "1.1",
        creator: "GPX Editor",
        name: null,
        desc: null,
        filename: "edited.gpx"
      },
      waypoints: [],
      tracks: []
    };
  }

  const newIndex = gpxModel.tracks.length;
  const trkId = `trk-${newIndex}`;
  const segId = `trk-${newIndex}-seg-0`;

  const newTrack = {
    id: trkId,
    name: `Track ${newIndex + 1}`,
    segments: [
      {
        id: segId,
        points: [],
        _polyline: null
      }
    ]
  };

  gpxModel.tracks.push(newTrack);
  currentTrackIndex = newIndex;
  updateTrackSelect();
  syncTrackNameInput();
  syncFileNameInput();
  renderMetaPanel();
  renderTrackpointsTable();
  renderMap();
}

function handleDeleteTrack() {
  if (!gpxModel || !gpxModel.tracks.length) {
    alert("Es gibt keinen Track, der gelöscht werden könnte.");
    return;
  }

  const track = gpxModel.tracks[currentTrackIndex];
  const name = track?.name || `Track ${currentTrackIndex + 1}`;

  const ok = confirm(`Track "${name}" wirklich löschen?`);
  if (!ok) return;

  gpxModel.tracks.splice(currentTrackIndex, 1);

  if (currentTrackIndex >= gpxModel.tracks.length) {
    currentTrackIndex = Math.max(0, gpxModel.tracks.length - 1);
  }

  updateTrackSelect();
  syncTrackNameInput();
  renderTrackpointsTable();
  renderMap();
}

// === Track-Namen bearbeiten ==========================================

function syncTrackNameInput() {
  if (!trackNameInputEl) return;
  if (!gpxModel || !gpxModel.tracks.length) {
    trackNameInputEl.value = "";
    trackNameInputEl.disabled = true;
    return;
  }
  const track = gpxModel.tracks[currentTrackIndex];
  trackNameInputEl.disabled = false;
  trackNameInputEl.value = track.name || "";
}

function handleTrackNameChange() {
  if (!gpxModel || !gpxModel.tracks.length) return;
  const v = trackNameInputEl.value.trim();
  const track = gpxModel.tracks[currentTrackIndex];
  track.name = v || null;
  updateTrackSelect();
  renderMap();
}

// === Dateinamen bearbeiten ===========================================

function syncFileNameInput() {
  if (!fileNameInputEl) return;
  if (!gpxModel) {
    fileNameInputEl.value = "";
    fileNameInputEl.disabled = true;
    return;
  }
  fileNameInputEl.disabled = false;
  const fn = gpxModel.meta.filename || "edited.gpx";
  fileNameInputEl.value = fn;
}

function handleFileNameChange() {
  if (!gpxModel) return;
  let name = fileNameInputEl.value.trim();
  if (!name) {
    name = "edited.gpx";
  }
  if (!name.toLowerCase().endsWith(".gpx")) {
    name += ".gpx";
  }
  gpxModel.meta.filename = name;
  fileNameInputEl.value = name;
}

// === Metadaten bearbeiten =============================================

function renderMetaPanel() {
  if (!gpxModel) {
    metaVersionInputEl.value = "";
    metaCreatorInputEl.value = "";
    metaNameInputEl.value = "";
    metaDescInputEl.value = "";
    metaVersionInputEl.disabled = true;
    metaCreatorInputEl.disabled = true;
    metaNameInputEl.disabled = true;
    metaDescInputEl.disabled = true;
    return;
  }

  metaVersionInputEl.disabled = false;
  metaCreatorInputEl.disabled = false;
  metaNameInputEl.disabled = false;
  metaDescInputEl.disabled = false;

  metaVersionInputEl.value = gpxModel.meta.version || "";
  metaCreatorInputEl.value = gpxModel.meta.creator || "";
  metaNameInputEl.value = gpxModel.meta.name || "";
  metaDescInputEl.value = gpxModel.meta.desc || "";
}

function handleMetaChange() {
  if (!gpxModel) return;
  gpxModel.meta.version = metaVersionInputEl.value.trim() || "1.1";
  gpxModel.meta.creator = metaCreatorInputEl.value.trim() || "GPX Editor";
  gpxModel.meta.name = metaNameInputEl.value.trim() || null;
  gpxModel.meta.desc = metaDescInputEl.value.trim() || null;
}

// === UI: Track-Auswahl ===============================================

function updateTrackSelect() {
  const select = document.getElementById("track-select");
  select.innerHTML = "";

  if (!gpxModel || !gpxModel.tracks.length) {
    const opt = document.createElement("option");
    opt.value = "0";
    opt.textContent = "– kein Track –";
    select.appendChild(opt);
    trackNameInputEl.disabled = true;
    return;
  }

  gpxModel.tracks.forEach((trk, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = trk.name || `Track ${i + 1}`;
    select.appendChild(opt);
  });

  select.value = String(currentTrackIndex || 0);
}

// === Tabellen rendern (Waypoints + Trackpunkte) ======================

function renderWaypointTable() {
  const wrapper = document.getElementById("waypoints-table-wrapper");
  wrapper.innerHTML = "";

  if (!gpxModel) return;

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  thead.innerHTML = `
    <tr>
      <th><input type="checkbox" id="wpt-select-all" /></th>
      <th>✕</th>
      <th>#</th>
      <th>Name</th>
      <th>Beschreibung</th>
      <th>Breite (lat)</th>
      <th>Länge (lon)</th>
      <th>Höhe (m)</th>
      <th>Zeit</th>
    </tr>
  `;

  gpxModel.waypoints.forEach((wpt, i) => {
    const tr = document.createElement("tr");
    tr.dataset.id = wpt.id;

    tr.innerHTML = `
      <td><input type="checkbox" class="wpt-select-checkbox" /></td>
      <td><button type="button" class="delete-wpt-btn">✕</button></td>
      <td>${i + 1}</td>
      <td contenteditable="true" data-field="name">${wpt.name ?? ""}</td>
      <td contenteditable="true" data-field="desc">${wpt.desc ?? ""}</td>
      <td contenteditable="true" data-field="lat">${wpt.lat ?? ""}</td>
      <td contenteditable="true" data-field="lon">${wpt.lon ?? ""}</td>
      <td contenteditable="true" data-field="ele">${wpt.ele ?? ""}</td>
      <td contenteditable="true" data-field="time">${wpt.time ?? ""}</td>
    `;

    tr.addEventListener("click", () => {
      selectWaypointRow(wpt.id);
    });

    Array.from(tr.querySelectorAll("td[contenteditable='true']")).forEach(
      (td) => {
        td.addEventListener("blur", () => {
          handleWaypointCellEdit(wpt.id, td);
        });
      }
    );

    const delBtn = tr.querySelector(".delete-wpt-btn");
    delBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      deleteWaypoint(wpt.id);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  wrapper.appendChild(table);

  const master = table.querySelector("#wpt-select-all");
  if (master) {
    master.addEventListener("change", () => {
      const checked = master.checked;
      const boxes = table.querySelectorAll(".wpt-select-checkbox");
      boxes.forEach((cb) => {
        cb.checked = checked;
      });
    });
  }
}

function renderTrackpointsTable() {
  const wrapper = document.getElementById("trackpoints-table-wrapper");
  wrapper.innerHTML = "";

  if (!gpxModel || !gpxModel.tracks.length) return;

  const track = gpxModel.tracks[currentTrackIndex];
  const seg = track.segments[0] || { points: [] };

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  thead.innerHTML = `
    <tr>
      <th><input type="checkbox" id="trk-select-all" /></th>
      <th>✕</th>
      <th>#</th>
      <th>Zeit</th>
      <th>Breite (lat)</th>
      <th>Länge (lon)</th>
      <th>Höhe (m)</th>
    </tr>
  `;

  seg.points.forEach((pt, i) => {
    const tr = document.createElement("tr");
    tr.dataset.id = pt.id;

    tr.innerHTML = `
      <td><input type="checkbox" class="trk-select-checkbox" /></td>
      <td><button type="button" class="delete-trkpt-btn">✕</button></td>
      <td>${i + 1}</td>
      <td contenteditable="true" data-field="time">${pt.time ?? ""}</td>
      <td contenteditable="true" data-field="lat">${pt.lat ?? ""}</td>
      <td contenteditable="true" data-field="lon">${pt.lon ?? ""}</td>
      <td contenteditable="true" data-field="ele">${pt.ele ?? ""}</td>
    `;

    tr.addEventListener("click", () => {
      selectTrackPointRow(pt.id);
    });

    Array.from(tr.querySelectorAll("td[contenteditable='true']")).forEach(
      (td) => {
        td.addEventListener("blur", () => {
          handleTrackPointCellEdit(pt.id, td);
        });
      }
    );

    const delBtn = tr.querySelector(".delete-trkpt-btn");
    delBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      deleteTrackPoint(pt.id);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  wrapper.appendChild(table);

  const master = table.querySelector("#trk-select-all");
  if (master) {
    master.addEventListener("change", () => {
      const checked = master.checked;
      const boxes = table.querySelectorAll(".trk-select-checkbox");
      boxes.forEach((cb) => {
        cb.checked = checked;
      });
    });
  }
}

// === Bearbeitung von Zellen ==========================================

function handleWaypointCellEdit(wptId, td) {
  if (!gpxModel) return;
  const field = td.dataset.field;
  const value = td.textContent.trim();
  const wpt = gpxModel.waypoints.find((w) => w.id === wptId);
  if (!wpt || !field) return;

  if (field === "lat" || field === "lon" || field === "ele") {
    const num = parseFloatSafe(value);
    wpt[field] = num;
  } else {
    wpt[field] = value || null;
  }

  renderMap();
}

function handleTrackPointCellEdit(ptId, td) {
  if (!gpxModel) return;
  const field = td.dataset.field;
  const value = td.textContent.trim();
  const track = gpxModel.tracks[currentTrackIndex];
  if (!track || !field) return;

  const seg = track.segments[0] || { points: [] };
  const pt = seg.points.find((p) => p.id === ptId);
  if (!pt) return;

  if (field === "lat" || field === "lon" || field === "ele") {
    const num = parseFloatSafe(value);
    pt[field] = num;
  } else {
    pt[field] = value || null;
  }

  renderMap();
}

// === Löschen (einzeln) ===============================================

function deleteWaypoint(wptId) {
  if (!gpxModel) return;
  const idx = gpxModel.waypoints.findIndex((w) => w.id === wptId);
  if (idx === -1) return;

  gpxModel.waypoints.splice(idx, 1);
  if (selectedWaypointId === wptId) {
    selectedWaypointId = null;
    selectedWaypointMarker = null;
  }
  renderWaypointTable();
  renderMap();
}

function deleteTrackPoint(ptId) {
  if (!gpxModel) return;
  const track = gpxModel.tracks[currentTrackIndex];
  if (!track) return;

  let changed = false;
  track.segments.forEach((seg) => {
    const idx = seg.points.findIndex((p) => p.id === ptId);
    if (idx !== -1) {
      seg.points.splice(idx, 1);
      changed = true;
    }
  });

  if (!changed) return;

  if (selectedTrackPointId === ptId) {
    selectedTrackPointId = null;
    selectedTrackMarker = null;
  }

  renderTrackpointsTable();
  renderMap();
}

// === Löschen (Mehrfach) ==============================================

function deleteSelectedTrackPoints() {
  if (!gpxModel || !gpxModel.tracks.length) return;

  const wrapper = document.getElementById("trackpoints-table-wrapper");
  const boxes = wrapper.querySelectorAll(".trk-select-checkbox:checked");
  const ids = Array.from(boxes).map((cb) => cb.closest("tr").dataset.id);

  if (!ids.length) return;

  const track = gpxModel.tracks[currentTrackIndex];
  if (!track) return;

  track.segments.forEach((seg) => {
    seg.points = seg.points.filter((p) => !ids.includes(p.id));
  });

  if (ids.includes(selectedTrackPointId)) {
    selectedTrackPointId = null;
    selectedTrackMarker = null;
  }

  renderTrackpointsTable();
  renderMap();
}

function deleteSelectedWaypoints() {
  if (!gpxModel) return;

  const wrapper = document.getElementById("waypoints-table-wrapper");
  const boxes = wrapper.querySelectorAll(".wpt-select-checkbox:checked");
  const ids = Array.from(boxes).map((cb) => cb.closest("tr").dataset.id);

  if (!ids.length) return;

  gpxModel.waypoints = gpxModel.waypoints.filter((w) => !ids.includes(w.id));

  if (ids.includes(selectedWaypointId)) {
    selectedWaypointId = null;
    selectedWaypointMarker = null;
  }

  renderWaypointTable();
  renderMap();
}

// === Selektion / Karte ===============================================

function selectWaypointRow(wptId) {
  selectedWaypointId = wptId;

  const wrapper = document.getElementById("waypoints-table-wrapper");
  Array.from(wrapper.querySelectorAll("tr")).forEach((tr) => {
    tr.classList.toggle("selected", tr.dataset.id === wptId);
  });

  const wpt = gpxModel.waypoints.find((w) => w.id === wptId);
  if (!wpt || !wpt._marker) return;

  if (selectedWaypointMarker && selectedWaypointMarker !== wpt._marker) {
    selectedWaypointMarker.setStyle({ radius: 5, weight: 1 });
  }

  selectedWaypointMarker = wpt._marker;
  selectedWaypointMarker.setStyle({ radius: 8, weight: 2 });

  map.setView([wpt.lat, wpt.lon], Math.max(map.getZoom(), 14), {
    animate: true
  });
}

function selectTrackPointRow(ptId) {
  selectedTrackPointId = ptId;

  const wrapper = document.getElementById("trackpoints-table-wrapper");
  Array.from(wrapper.querySelectorAll("tr")).forEach((tr) => {
    tr.classList.toggle("selected", tr.dataset.id === ptId);
  });

  const track = gpxModel.tracks[currentTrackIndex];
  if (!track) return;
  const seg = track.segments[0] || { points: [] };
  const pt = seg.points.find((p) => p.id === ptId);
  if (!pt || !pt._marker) return;

  if (selectedTrackMarker && selectedTrackMarker !== pt._marker) {
    selectedTrackMarker.setStyle({ radius: 4, weight: 1 });
  }

  selectedTrackMarker = pt._marker;
  selectedTrackMarker.setStyle({ radius: 7, weight: 2 });

  map.setView([pt.lat, pt.lon], Math.max(map.getZoom(), 14), {
    animate: true
  });
}

// === Karte: Punkte per Klick =========================================

function handleMapClickForNewPoint(e) {
  if (!addPointMode || !gpxModel) return;

  const lat = e.latlng.lat;
  const lon = e.latlng.lng;

  if (addPointMode === "wpt") {
    const newId = "wpt-new-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    const wpt = {
      id: newId,
      lat,
      lon,
      ele: null,
      time: null,
      name: null,
      desc: null,
      _marker: null
    };
    gpxModel.waypoints.push(wpt);
    renderWaypointTable();
    renderMap();
    selectWaypointRow(newId);
  } else if (addPointMode === "track") {
    if (!gpxModel.tracks.length) {
      alert("Keine Tracks vorhanden.");
      return;
    }
    const tIndex = currentTrackIndex;
    const track = gpxModel.tracks[tIndex];
    if (!track.segments.length) {
      track.segments.push({
        id: `trk-${tIndex}-seg-0`,
        points: [],
        _polyline: null
      });
    }
    const seg = track.segments[0];

    const newId =
      "trk-" +
      tIndex +
      "-seg-0-pt-new-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2);

    const pt = {
      id: newId,
      trackId: track.id,
      segmentId: seg.id,
      index: seg.points.length,
      lat,
      lon,
      ele: null,
      time: null,
      _marker: null
    };

    seg.points.push(pt);
    renderTrackpointsTable();
    renderMap();
    selectTrackPointRow(newId);
  }
}

// === Karte rendern ====================================================

function renderMap() {
  waypointLayerGroup.clearLayers();
  trackLayerGroup.clearLayers();
  selectedTrackMarker = null;
  selectedWaypointMarker = null;

  if (!gpxModel) return;

  const bounds = [];

  gpxModel.waypoints.forEach((wpt) => {
    if (wpt.lat == null || wpt.lon == null) return;

    const marker = L.circleMarker([wpt.lat, wpt.lon], {
      radius: 5,
      color: "#c0392b",
      weight: 1,
      fillOpacity: 0.8
    }).addTo(waypointLayerGroup);

    const label = wpt.name || "Waypoint";
    marker.bindTooltip(label, { permanent: false });

    marker.on("click", () => {
      selectWaypointRow(wpt.id);
    });

    wpt._marker = marker;
    bounds.push([wpt.lat, wpt.lon]);
  });

  gpxModel.tracks.forEach((trk, tIndex) => {
    trk.segments.forEach((seg) => {
      const latlngs = seg.points
        .filter((p) => p.lat != null && p.lon != null)
        .map((p) => [p.lat, p.lon]);

      if (latlngs.length) {
        const poly = L.polyline(latlngs, {
          color: tIndex === currentTrackIndex ? "#0077cc" : "#888",
          weight: 3,
          opacity: 0.8
        }).addTo(trackLayerGroup);
        seg._polyline = poly;
        latlngs.forEach((ll) => bounds.push(ll));
      }

      seg.points.forEach((pt) => {
        if (pt.lat == null || pt.lon == null) return;

        const marker = L.circleMarker([pt.lat, pt.lon], {
          radius: 4,
          color: tIndex === currentTrackIndex ? "#1abc9c" : "#7f8c8d",
          weight: 1,
          fillOpacity: 0.7
        }).addTo(trackLayerGroup);

        marker.on("click", () => {
          if (currentTrackIndex !== tIndex) {
            currentTrackIndex = tIndex;
            updateTrackSelect();
            syncTrackNameInput();
            renderTrackpointsTable();
          }
          selectTrackPointRow(pt.id);
        });

        pt._marker = marker;
      });
    });
  });

  if (bounds.length) {
    const leafletBounds = L.latLngBounds(bounds);
    map.fitBounds(leafletBounds, { padding: [20, 20] });
  }
}

// === GPX Export =======================================================

function handleDownload() {
  if (!gpxModel) {
    alert("Kein GPX geladen.");
    return;
  }

  const xml = buildGpxXml(gpxModel);
  const blob = new Blob([xml], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);

  let filename = (gpxModel.meta && gpxModel.meta.filename) || "edited.gpx";
  if (!filename.toLowerCase().endsWith(".gpx")) {
    filename += ".gpx";
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeXml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildGpxXml(model) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<gpx version="${escapeXml(model.meta.version || "1.1")}" creator="${escapeXml(
      model.meta.creator || "GPX Editor"
    )}" xmlns="http://www.topografix.com/GPX/1/1">`
  );

  // Metadaten-Block
  if (model.meta.name || model.meta.desc) {
    lines.push(`  <metadata>`);
    if (model.meta.name) {
      lines.push(`    <name>${escapeXml(model.meta.name)}</name>`);
    }
    if (model.meta.desc) {
      lines.push(`    <desc>${escapeXml(model.meta.desc)}</desc>`);
    }
    lines.push(`  </metadata>`);
  }

  model.waypoints.forEach((w) => {
    if (w.lat == null || w.lon == null) return;
    lines.push(`  <wpt lat="${w.lat}" lon="${w.lon}">`);
    if (w.ele != null) lines.push(`    <ele>${w.ele}</ele>`);
    if (w.time) lines.push(`    <time>${escapeXml(w.time)}</time>`);
    if (w.name) lines.push(`    <name>${escapeXml(w.name)}</name>`);
    if (w.desc) lines.push(`    <desc>${escapeXml(w.desc)}</desc>`);
    lines.push(`  </wpt>`);
  });

  model.tracks.forEach((trk) => {
    lines.push(`  <trk>`);
    if (trk.name) lines.push(`    <name>${escapeXml(trk.name)}</name>`);
    trk.segments.forEach((seg) => {
      lines.push(`    <trkseg>`);
      seg.points.forEach((pt) => {
        if (pt.lat == null || pt.lon == null) return;
        lines.push(`      <trkpt lat="${pt.lat}" lon="${pt.lon}">`);
        if (pt.ele != null) lines.push(`        <ele>${pt.ele}</ele>`);
        if (pt.time) lines.push(`        <time>${escapeXml(pt.time)}</time>`);
        lines.push(`      </trkpt>`);
      });
      lines.push(`    </trkseg>`);
    });
    lines.push(`  </trk>`);
  });

  lines.push(`</gpx>`);
  return lines.join("\n");
}