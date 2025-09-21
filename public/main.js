// client main.js - connects to server socket.io and shows vehicles with smooth movement
const socket = io();
const map = L.map('map').setView([22.302711,114.177216],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);

const companySelect = document.getElementById('companySelect');
const routeSelect = document.getElementById('routeSelect');
const dirBtn = document.getElementById('dirBtn');
const stopListEl = document.getElementById('stopList');
const clockEl = document.getElementById('clock');

function updateClock(){ clockEl.textContent = new Date().toLocaleTimeString('zh-HK',{hour12:false}); }
setInterval(updateClock,1000); updateClock();

let vehicleMarkers = {}; // key -> { marker, lat, lon }

// animate marker from old to new pos over duration ms
function animateMarkerTo(marker, from, to, duration=4800){
  const start = performance.now();
  function step(now){
    const t = Math.min(1,(now-start)/duration);
    const lat = from.lat + (to.lat - from.lat) * t;
    const lng = from.lng + (to.lng - from.lng) * t;
    marker.setLatLng([lat,lng]);
    if(t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// handle incoming vehicles (from server)
socket.on('vehicles', (vehicles) => {
  // vehicles: array of {key, plate, vehicleId, route, lat, lon}
  const present = new Set();
  vehicles.forEach(v=>{
    const key = v.key || v.plate || v.vehicleId;
    if(!key) return;
    present.add(key);
    const lat = Number(v.lat), lng = Number(v.lon);
    if(isNaN(lat) || isNaN(lng)) return;

    if(vehicleMarkers[key]){
      const old = { lat: vehicleMarkers[key].lat, lng: vehicleMarkers[key].lon };
      animateMarkerTo(vehicleMarkers[key].marker, old, {lat,lng}, 4800);
      vehicleMarkers[key].lat = lat; vehicleMarkers[key].lon = lng;
      vehicleMarkers[key].marker.getPopup().setContent(`路線: ${v.route}<br>車牌: ${v.plate || v.vehicleId}`);
    } else {
      const m = L.marker([lat,lng], { icon: L.divIcon({className:'bus-icon', html:'🚌'}) }).addTo(map);
      m.bindPopup(`路線: ${v.route}<br>車牌: ${v.plate || v.vehicleId}`);
      vehicleMarkers[key] = { marker: m, lat, lon };
    }
  });

  // remove disappeared
  Object.keys(vehicleMarkers).forEach(k=>{
    if(!present.has(k)){
      map.removeLayer(vehicleMarkers[k].marker);
      delete vehicleMarkers[k];
    }
  });
});

// load routes for selects (calls server endpoints)
async function loadRoutes(){
  try{
    const kmb = await fetch('/api/kmb/routes').then(r=>r.json());
    const city = await fetch('/api/citybus/routes').then(r=>r.json()).catch(()=>({data:[]}));
    routeSelect.innerHTML = '<option value="all">所有路線</option>';
    (kmb.data||[]).slice(0,500).forEach(r=>{
      const opt = document.createElement('option'); opt.value = 'KMB '+r.route; opt.textContent = 'KMB '+r.route;
      routeSelect.appendChild(opt);
    });
    (city.data||[]).slice(0,500).forEach(r=>{
      const op = (r.operator||r.co||'CTB').toUpperCase();
      const opt = document.createElement('option'); opt.value = op+' '+r.route; opt.textContent = op+' '+r.route;
      routeSelect.appendChild(opt);
    });

    routeSelect.onchange = ()=>{
      const val = routeSelect.value;
      if(val==='all'){ /* show all vehicles */ return; }
      const parts = val.split(' ');
      const co = parts[0], route = parts.slice(1).join(' ');
      if(co==='KMB'){
        loadKMBRouteStops(route);
      } else {
        loadCitybusRouteStops(route);
      }
    };
  }catch(e){
    console.error('loadRoutes error', e);
  }
}

async function loadKMBRouteStops(route){
  stopListEl.innerHTML = '<li>載入站點...</li>';
  try{
    const res = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/inbound/1`);
    const j = await res.json();
    const stops = j.data||[];
    stopListEl.innerHTML = '';
    for(const s of stops){
      try{
        const si = await fetch(`https://data.etabus.gov.hk/v1/transport/kmb/stop/${s.stop}`).then(r=>r.json());
        const d = si.data;
        const li = document.createElement('li'); li.innerHTML = `<span>${d.name_tc}</span><span class="eta">-</span>`;
        stopListEl.appendChild(li);
      }catch(e){}
    }
  }catch(e){ stopListEl.innerHTML = '<li>載入失敗</li>'; console.warn(e); }
}

async function loadCitybusRouteStops(route){
  stopListEl.innerHTML = '<li>載入站點...</li>';
  try{
    const res = await fetch(`/api/citybus/route-stop/${route}/inbound`).then(r=>r.json());
    const stops = res.data||[];
    stopListEl.innerHTML = '';
    stops.forEach(s=>{
      const li = document.createElement('li'); li.innerHTML = `<span>${s.stop_tc||s.stop}</span><span class="eta">-</span>`;
      stopListEl.appendChild(li);
    });
  }catch(e){ stopListEl.innerHTML = '<li>載入失敗</li>'; console.warn(e); }
}

loadRoutes();
