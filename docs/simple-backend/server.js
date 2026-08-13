'use strict';

const express = require('express');
const cors    = require('cors');
const grpc    = require('@grpc/grpc-js');
const loader  = require('@grpc/proto-loader');
const path    = require('path');

// ── Config ──────────────────────────────────────────────────────
const KACHAKA_HOST = process.env.KACHAKA_HOST || '192.168.0.26';
const KACHAKA_PORT = process.env.KACHAKA_PORT || '26400';
const PORT         = process.env.PORT         || 3000;

// ── gRPC client ─────────────────────────────────────────────────
const pkgDef = loader.loadSync(path.join(__dirname, 'kachaka-api.proto'), {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(pkgDef).kachaka_api;
const stub  = new proto.KachakaApi(
  `${KACHAKA_HOST}:${KACHAKA_PORT}`,
  grpc.credentials.createInsecure()
);

function call(method, req = {}) {
  return new Promise((resolve, reject) => {
    stub[method](req, (err, res) => err ? reject(err) : resolve(res));
  });
}

const GET_REQ = { metadata: { cursor: 0 } };

// ── Express ─────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

function ok(res, data)  { res.json({ success: true,  data }); }
function err(res, e)    { res.status(500).json({ success: false, error: e.message }); }

// GET /api/robot/battery
app.get('/api/robot/battery', async (req, res) => {
  try {
    const r = await call('GetBatteryInfo', GET_REQ);
    ok(res, {
      percentage: r.battery_info?.remaining_percentage,
      charging:   r.battery_info?.power_supply_status === 'POWER_SUPPLY_STATUS_CHARGING',
    });
  } catch (e) { err(res, e); }
});

// GET /api/robot/status
app.get('/api/robot/status', async (req, res) => {
  try {
    const [pose, state, battery] = await Promise.all([
      call('GetRobotPose',    GET_REQ),
      call('GetCommandState', GET_REQ),
      call('GetBatteryInfo',  GET_REQ),
    ]);
    ok(res, {
      pose:    pose.pose,
      command: state.state,
      battery: battery.battery_info?.remaining_percentage,
    });
  } catch (e) { err(res, e); }
});

// GET /api/robot/locations
app.get('/api/robot/locations', async (req, res) => {
  try {
    const r = await call('GetLocations', GET_REQ);
    ok(res, r.locations || []);
  } catch (e) { err(res, e); }
});

// GET /api/robot/shelves
app.get('/api/robot/shelves', async (req, res) => {
  try {
    const r = await call('GetShelves', GET_REQ);
    ok(res, r.shelves || []);
  } catch (e) { err(res, e); }
});

// GET /api/robot/maps
app.get('/api/robot/maps', async (req, res) => {
  try {
    const [list, current] = await Promise.all([
      call('GetMapList',      GET_REQ),
      call('GetCurrentMapId', GET_REQ),
    ]);
    ok(res, { maps: list.map_list || [], current_map_id: current.id });
  } catch (e) { err(res, e); }
});

// GET /api/robot/maps/png
app.get('/api/robot/maps/png', async (req, res) => {
  try {
    const r = await call('GetPngMap', GET_REQ);
    ok(res, {
      png:        r.map?.data ? Buffer.from(r.map.data).toString('base64') : null,
      width:      r.map?.width,
      height:     r.map?.height,
      resolution: r.map?.resolution,
    });
  } catch (e) { err(res, e); }
});

// GET /api/robot/maps/with-locations
// Returns the current map image (base64 PNG) together with every location's
// pixel coordinates so the front-end can draw markers on top of the map.
//
// Coordinate conversion:
//   pixel_x = (loc.pose.x - origin_x) / resolution
//   pixel_y = height - (loc.pose.y - origin_y) / resolution   ← flip Y (image vs world)
app.get('/api/robot/maps/with-locations', async (req, res) => {
  try {
    const [mapRes, locRes] = await Promise.all([
      call('GetPngMap',    GET_REQ),
      call('GetLocations', GET_REQ),
    ]);

    const map = mapRes.map || {};
    const width      = map.width      || 0;
    const height     = map.height     || 0;
    const resolution = map.resolution || 0.05;
    // Kachaka PngMap origin (bottom-left corner of the image in world coords)
    const originX = map.origin?.x || 0;
    const originY = map.origin?.y || 0;

    const locations = (locRes.locations || []).map(loc => {
      const wx = loc.pose?.x || 0;
      const wy = loc.pose?.y || 0;
      const px = Math.round((wx - originX) / resolution);
      const py = Math.round(height - (wy - originY) / resolution);
      return {
        id:    loc.id,
        name:  loc.name,
        pose:  loc.pose,       // raw world coords (x, y, theta)
        pixel: { x: px, y: py },  // pixel position on the PNG
      };
    });

    ok(res, {
      map: {
        png:        map.data ? Buffer.from(map.data).toString('base64') : null,
        width,
        height,
        resolution,
        origin:     { x: originX, y: originY },
      },
      locations,
    });
  } catch (e) { err(res, e); }
});

// POST /api/robot/move-to-location   body: { locationId }
// Navigate the robot to a named location.
app.post('/api/robot/move-to-location', async (req, res) => {
  try {
    const { locationId } = req.body;
    if (!locationId) return res.status(400).json({ success: false, error: 'locationId required' });
    const r = await call('StartCommand', {
      command:    { move_to_location_command: { target_location_id: locationId } },
      cancel_all: true,
    });
    ok(res, { command_id: r.command_id, success: r.result?.success });
  } catch (e) { err(res, e); }
});

// POST /api/robot/move   body: { locationId }
app.post('/api/robot/move', async (req, res) => {
  try {
    const { locationId } = req.body;
    if (!locationId) return res.status(400).json({ success: false, error: 'locationId required' });
    const r = await call('StartCommand', {
      command:    { move_to_location_command: { target_location_id: locationId } },
      cancel_all: true,
    });
    ok(res, { command_id: r.command_id, success: r.result?.success });
  } catch (e) { err(res, e); }
});

// POST /api/robot/return-home
app.post('/api/robot/return-home', async (req, res) => {
  try {
    const r = await call('StartCommand', { command: { return_home_command: {} }, cancel_all: true });
    ok(res, { command_id: r.command_id });
  } catch (e) { err(res, e); }
});

// POST /api/robot/pause
app.post('/api/robot/pause', async (req, res) => {
  try {
    const r = await call('CancelCommand', {});
    ok(res, { success: r.result?.success });
  } catch (e) { err(res, e); }
});

// POST /api/robot/emergency-stop
app.post('/api/robot/emergency-stop', async (req, res) => {
  try {
    const r = await call('SetEmergencyStop', {});
    ok(res, { success: r.result?.success });
  } catch (e) { err(res, e); }
});

// GET /api/robot/camera/:side   side = front | back | tof
app.get('/api/robot/camera/:side', async (req, res) => {
  const methods = {
    front: 'GetFrontCameraRosCompressedImage',
    back:  'GetBackCameraRosCompressedImage',
    tof:   'GetTofCameraRosCompressedImage',
  };
  const method = methods[req.params.side];
  if (!method) return res.status(400).json({ success: false, error: 'side must be front | back | tof' });

  res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
  res.setHeader('Cache-Control', 'no-cache');

  async function sendFrame() {
    try {
      const r = await call(method, GET_REQ);
      const img = r.image?.data;
      if (img) {
        res.write('--frame\r\nContent-Type: image/jpeg\r\n\r\n');
        res.write(Buffer.from(img));
        res.write('\r\n');
      }
    } catch (_) {}
  }

  await sendFrame();
  const timer = setInterval(sendFrame, 100);
  req.on('close', () => clearInterval(timer));
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Robot: ${KACHAKA_HOST}:${KACHAKA_PORT}`);
});
