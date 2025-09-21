import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// KMB realtime vehicle endpoint (public)
const KMB_VEHICLE_URL = 'https://data.etabus.gov.hk/v1/transport/kmb/vehicle';
// Citybus route endpoints (used for route lists / stops)
const CITYBUS_ROUTE_URL = 'https://rt.data.gov.hk/v1/transport/citybus-nwfb/route';
const CITYBUS_ROUTE_STOP = 'https://rt.data.gov.hk/v1/transport/citybus-nwfb/route-stop';

let latestVehicles = {}; // key -> vehicle object

async function pollKMBVehicles() {
  try {
    const res = await fetch(KMB_VEHICLE_URL);
    if (!res.ok) throw new Error(`KMB API ${res.status}`);
    const json = await res.json();
    const vehicles = json.data || [];
    const map = {};
    vehicles.forEach(v => {
      const key = v.plate || `${v.route}_${v.vehicle}` || JSON.stringify(v);
      map[key] = {
        key,
        plate: v.plate,
        vehicleId: v.vehicle,
        route: v.route,
        lat: parseFloat(v.lat),
        lon: parseFloat(v.long),
        timestamp: Date.now(),
        raw: v
      };
    });
    latestVehicles = map;
    io.emit('vehicles', Object.values(latestVehicles));
  } catch (err) {
    console.error('pollKMB error', err);
  }
}

// start polling every 5s
pollKMBVehicles();
setInterval(pollKMBVehicles, 5000);

// Simple server endpoints for front-end to fetch route lists/stops (avoid CORS issues)
app.get('/api/kmb/routes', async (req, res) => {
  try {
    const r = await fetch('https://data.etabus.gov.hk/v1/transport/kmb/route');
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/citybus/routes', async (req, res) => {
  try {
    const r = await fetch(CITYBUS_ROUTE_URL);
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/citybus/route-stop/:route/:direction', async (req, res) => {
  const { route, direction } = req.params;
  try {
    const r = await fetch(`${CITYBUS_ROUTE_STOP}/${route}/${direction}`);
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

io.on('connection', (socket) => {
  console.log('client connected', socket.id);
  socket.emit('vehicles', Object.values(latestVehicles));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server listening on', PORT));
