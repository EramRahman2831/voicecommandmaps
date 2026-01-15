

// set mapbox access token
mapboxgl.accessToken =
  "pk.eyJ1IjoiZXJhbTI4MzEiLCJhIjoiY21rZXAwbXZzMDlscjNnbjI1Y3d2NWVlNSJ9.giMSz5H4E0tb0vNA-trvnw";

/* map */

// create the map instance
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v12",
  center: [-118.2437, 34.0522],
  zoom: 12
});


let stopWarningTimeout = null;
let startMarker = null;
let endMarker = null;
let userMarker = null;
let routeSteps = [];
let currentStepIndex = 0;
let navigationActive = false;
let watchId = null;
let stopMarkers = [];

let stops = [];

/*ui*/

const sidebar = document.getElementById("sidebar");
const startNavBtn = document.getElementById("startNav");
const exitNavBtn = document.getElementById("exitNav");
const routeBtn = document.getElementById("routeBtn");
const addStopBtn = document.getElementById("addStopBtn");
const startInput = document.getElementById("start");
const endInput = document.getElementById("end");
const useCurrent = document.getElementById("useCurrent");
const stopsContainer = document.getElementById("stopsContainer");
const voiceBtn = document.getElementById("voiceBtn");

/* voice */

let voiceEnabled = false;
let selectedVoice = null;
let lastSpokenStepIndex = -1;
let nearTurnAnnounced = false;

// pick a preferred voice when available
function loadVoices() {
  const voices = speechSynthesis.getVoices();
  selectedVoice =
    voices.find(v => v.name === "Google US English") || voices[0];
}

speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

// speak a string through the selected voice
function speak(text) {
  if (!voiceEnabled || !selectedVoice) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = selectedVoice;
  u.lang = "en-US";
  speechSynthesis.speak(u);
}

// toggle voice feedback on click
voiceBtn.onclick = () => {
  voiceEnabled = !voiceEnabled;
  voiceBtn.textContent = voiceEnabled ? "Voice: On" : "Voice: Off";
  voiceBtn.classList.toggle("active", voiceEnabled);

  if (voiceEnabled && navigationActive && routeSteps.length) {
    lastSpokenStepIndex = -1; // force re-speak
    showCurrentStep();
  }
};

/* route ipnut */

// enable or disable routing controls
function setRoutingControlsEnabled(enabled) {
  startInput.disabled = !enabled || useCurrent.checked;
  endInput.disabled = !enabled;

  routeBtn.classList.toggle("hidden", !enabled);
  addStopBtn.classList.toggle("hidden", !enabled);

  voiceBtn.disabled = false;

  document
    .querySelectorAll("#stopsContainer input")
    .forEach(i => (i.disabled = !enabled));
}

/* current location*/

// toggle start input for current location
useCurrent.onchange = () => {
  startInput.disabled = useCurrent.checked;
  startInput.value = useCurrent.checked ? "Current location" : "";
};

/* add stop */

// resolve stop input to coordinates
async function resolveStopInput(input) {
  const selected = input.getSelectedFeature?.();
  if (selected && isValidCoords(selected.center)) {
    return selected.center;
  }

  const value = input.value.trim();
  if (!value) return null;

  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?limit=1&access_token=${mapboxgl.accessToken}`
  );

  const data = await res.json();
  const center = data.features?.[0]?.center;

  return isValidCoords(center) ? center : null;
}

// add a new stop input group
addStopBtn.onclick = () => {
  const warning = document.getElementById("stopWarning");

  if (stops.length >= 1) {
    warning.classList.remove("hidden");

    clearTimeout(stopWarningTimeout);
    stopWarningTimeout = setTimeout(() => {
      warning.classList.add("hidden");
    }, 3000);

    return;
}

  warning.classList.add("hidden");

  stops.push(null);

  const stopGroup = document.createElement("div");
  stopGroup.className = "input-group";

  const stopInput = document.createElement("input");
  stopInput.placeholder = "Stop";
  stopInput.autocomplete = "off";

  const removeButton = document.createElement("button");
  removeButton.className = "stop-remove";
  removeButton.textContent = "×";

  const suggestionsBox = document.createElement("div");
  suggestionsBox.className = "suggestions";

  stopGroup.append(stopInput, removeButton, suggestionsBox);
  stopsContainer.appendChild(stopGroup);

  setupDynamicAutocomplete(stopInput, suggestionsBox);

  stopInput.addEventListener("blur", async () => {
    const coords = await resolveStopInput(stopInput);
    if (coords) stops[0] = coords;
  });

  removeButton.onclick = () => {
  stopGroup.remove();
  stops.length = 0;

  stopMarkers.forEach(m => m.remove());
  stopMarkers = [];

  warning.classList.add("hidden");
};
};

/* get route */

// fetch and display a route
routeBtn.onclick = async () => {
  try {
    let startCoords;

    if (useCurrent.checked) {
      const pos = await getCurrentLocation();
      startCoords = [pos.coords.longitude, pos.coords.latitude];
    } else {
      startCoords = await geocode(startInput.value);
    }

    if (!isValidCoords(startCoords)) {
      alert("Invalid start location");
      return;
    }

    const stopInputs = [...stopsContainer.querySelectorAll("input")];

    for (let i = 0; i < stopInputs.length; i++) {
      const coords = await resolveStopInput(stopInputs[i]);

      if (!coords) {
        alert(`Invalid Stop ${i + 1}`);
        return;
      }

      stops[i] = coords;
    }

    const endCoords = await geocode(endInput.value);

    if (!isValidCoords(endCoords)) {
      alert("Invalid destination");
      return;
    }

    const route = await getRoute(startCoords, endCoords);

    routeSteps = route.legs.flatMap(l => l.steps);
    currentStepIndex = 0;

    showDirections(route);
    sidebar.classList.remove("hidden");
    startNavBtn.classList.remove("hidden");

  } catch (err) {
    console.error(err);
    alert(err.message || "Unable to get route");
  }
};


/* routing */

// validate coordinates array shape
function isValidCoords(c) {
    return (
      Array.isArray(c) &&
      c.length === 2 &&
      Number.isFinite(c[0]) &&
      Number.isFinite(c[1])
    );
  }

// request a route and render it
async function getRoute(start, end) {
  const points = [start, ... stops, end];
  const coords = points.map(p => p.join(",")).join(";");

  const res = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?steps=true&geometries=geojson&overview=full` +
    `&access_token=${mapboxgl.accessToken}`
  );

  const data = await res.json();

  if (!data.routes || data.routes.length === 0) {
    console.error("Mapbox routing error:", data);
    throw new Error(
      data.message || "No route found between the selected locations."
    );
  }

  const route = data.routes[0];

  const geojson = { type: "Feature", geometry: route.geometry };

  if (!map.isStyleLoaded()) {
    await new Promise(r => map.once("load", r));
  }

  if (map.getSource("route")) {
    map.getSource("route").setData(geojson);
  } else {
    map.addSource("route", { type: "geojson", data: geojson });
    map.addLayer({
      id: "route",
      type: "line",
      source: "route",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#1db7dd",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 6, 18, 10],
        "line-opacity": 0.9
      }
    });
  }

  map.moveLayer("route");

  addMarker(start, "S", "start");
  stopMarkers.forEach(m => m.remove());
  stopMarkers = [];

  stops.forEach((s, i) => {
    const m = addMarker(s, `${i + 1}`, "stop");
    if (m) stopMarkers.push(m);
  });
  
  addMarker(end, "D", "end");

  map.fitBounds(points, { padding: 80 });
  return route;
}

/* markers for the map */

// create a labeled map marker
function addMarker(coords, label, cls) {
  if (!coords) return null;

  const el = document.createElement("div");
  el.className = `marker ${cls}`;
  el.textContent = label;

  if (cls === "start" && startMarker) startMarker.remove();
  if (cls === "end" && endMarker) endMarker.remove();

  const marker = new mapboxgl.Marker(el).setLngLat(coords).addTo(map);

  if (cls === "start") startMarker = marker;
  if (cls === "end") endMarker = marker;

  return marker;
}

/* directions */

// render directions summary and steps
function showDirections(route) {
  document.getElementById("summary").innerHTML = `
    <div class="summary-item"><span>Distance</span><span>${(route.distance / 1609).toFixed(1)} mi</span></div>
    <div class="summary-item"><span>Duration</span><span>${Math.round(route.duration / 60)} min</span></div>
  `;

  const stepsEl = document.getElementById("steps");
  stepsEl.innerHTML = "";

  route.legs[0].steps.forEach(s => {
    const d = document.createElement("div");
    d.className = "step";
    d.textContent = s.maneuver.instruction;
    stepsEl.appendChild(d);
  });
}

/* nav mode*/

// start navigation and tracking
startNavBtn.onclick = () => {
  document.body.classList.add("nav-active");
  document.getElementById("controls").classList.add("disabled");
  navigationActive = true;
  startNavBtn.classList.add("hidden");
  exitNavBtn.classList.remove("hidden");

  setRoutingControlsEnabled(false);

  setTimeout(() => map.resize(), 100);

  currentStepIndex = 0;
  lastSpokenStepIndex = -1;

  showCurrentStep();

  watchId = navigator.geolocation.watchPosition(updateNavigation, null, {
    enableHighAccuracy: true
  });
};

setTimeout(() => {
  map.resize();
  if (map.getSource("route")) {
    const coords = map.getSource("route")._data.geometry.coordinates;
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new mapboxgl.LngLatBounds(coords[0], coords[0])
    );
    map.fitBounds(bounds, { padding: 80 });
  }
}, 120);

// exit navigation and reset ui
exitNavBtn.onclick = () => {
  document.body.classList.remove("nav-active");
  
  navigationActive = false;

  setTimeout(() => map.resize(), 100);

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  if (userMarker) {
    userMarker.remove();
    userMarker = null;
  }

  setRoutingControlsEnabled(true);

  startNavBtn.classList.remove("hidden");
  exitNavBtn.classList.add("hidden");
  document.getElementById("controls").classList.remove("disabled");

  showDirections({
    distance: routeSteps.reduce((a, s) => a + s.distance, 0),
    duration: routeSteps.reduce((a, s) => a + s.duration, 0),
    legs: [{ steps: routeSteps }]
  });
};

// show the current step in ui
function showCurrentStep() {
  const step = routeSteps[currentStepIndex];
  if (!step) return;

  const stepsEl = document.getElementById("steps");
  stepsEl.innerHTML = "";

  const div = document.createElement("div");
  div.className = "step";
  div.textContent = step.maneuver.instruction;
  stepsEl.appendChild(div);

  if (voiceEnabled && lastSpokenStepIndex !== currentStepIndex) {
    speak(step.maneuver.instruction);
    lastSpokenStepIndex = currentStepIndex;
    nearTurnAnnounced = false;
  }
}

// update navigation state from gps
function updateNavigation(pos) {
  if (!navigationActive || !routeSteps.length) return;

  const userPos = [pos.coords.longitude, pos.coords.latitude];
  map.easeTo({ center: userPos, zoom: 16 });

  if (!userMarker) {
    const el = document.createElement("div");
    el.style.width = "14px";
    el.style.height = "14px";
    el.style.background = "#007bff";
    el.style.borderRadius = "50%";
    el.style.boxShadow = "0 0 0 6px rgba(0,123,255,0.3)";
    userMarker = new mapboxgl.Marker(el).setLngLat(userPos).addTo(map);
  } else {
    userMarker.setLngLat(userPos);
  }

  const step = routeSteps[currentStepIndex];
  if (!step) return;

  const dist = distance(userPos, step.maneuver.location);
  const feet = dist * 3.28084;

  if (voiceEnabled && feet < 300 && !nearTurnAnnounced) {
    speak(`In ${Math.round(feet)} feet, ${step.maneuver.instruction}`);
    nearTurnAnnounced = true;
  }

  if (dist < 25 && currentStepIndex < routeSteps.length - 1) {
    currentStepIndex++;
    showCurrentStep();
  }
}

/* helper functions */

// get current position as a promise
function getCurrentLocation() {
  return new Promise((res, rej) =>
    navigator.geolocation.getCurrentPosition(res, rej)
  );
}

// geocode a place name
async function geocode(place) {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(place)}.json?limit=1&access_token=${mapboxgl.accessToken}`
  );
  const data = await res.json();
  return data.features[0].center;
}

// compute haversine distance meters
function distance(a, b) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/* autocomplete for search */

// enable autocomplete for inputs
setupAutocomplete("start");
setupAutocomplete("end");

// wire autocomplete by element id
function setupAutocomplete(id) {
  setupDynamicAutocomplete(
    document.getElementById(id),
    document.getElementById(id + "-suggestions")
  );
}

// fetch and render autocomplete suggestions
function setupDynamicAutocomplete(input, box) {
  let selectedFeature = null;

  input.addEventListener("input", async () => {
    selectedFeature = null;
    if (input.disabled || input.value.length < 2) {
      box.innerHTML = "";
      return;
    }

    const c = map.getCenter();
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(input.value)}.json` +
      `?autocomplete=true&limit=6&proximity=${c.lng},${c.lat}` +
      `&access_token=${mapboxgl.accessToken}`
    );

    const data = await res.json();
    box.innerHTML = "";

    data.features.forEach(f => {
      const d = document.createElement("div");
      d.innerHTML = `<strong>${f.text}</strong><br/><small>${f.place_name}</small>`;
      d.onclick = () => {
        selectedFeature = f;
        input.value = f.place_name;
        box.innerHTML = "";
      };
      box.appendChild(d);
    });
  });

  input.getSelectedFeature = () => selectedFeature;
}
