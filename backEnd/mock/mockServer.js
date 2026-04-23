'use strict';

const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// ---------------------------------------------------------------------------
// Load the proto
// ---------------------------------------------------------------------------
const PROTO_PATH = path.join(__dirname, '../kachaka-api.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDef).kachaka_api;

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------
let robotState = {
  serial_number: 'KACHAKA-MOCK-001',
  version: '3.2.0',
  pose: { x: 1.0, y: 2.0, theta: 0.5 },
  battery: { remaining_percentage: 78.5, power_supply_status: 'POWER_SUPPLY_STATUS_DISCHARGING' },
  command_state: 'COMMAND_STATE_PENDING',
  current_command: null,
  current_command_id: '',
  last_result: null,
  auto_homing_enabled: true,
  manual_control_enabled: false,
  speaker_volume: 5,
  front_torch: 0,
  back_torch: 0,
  current_map_id: 'map-001',
};

const mockLocations = [
  { id: 'loc-503', name: 'Room 503',     pose: { x: 1.0, y: 1.0, theta: 0.0  }, type: 'LOCATION_TYPE_UNSPECIFIED', undock_shelf_aligning_to_wall: false, undock_shelf_avoiding_obstacles: true,  ignore_voice_recognition: false },
  { id: 'loc-504', name: 'Room 504',     pose: { x: 2.0, y: 1.0, theta: 0.0  }, type: 'LOCATION_TYPE_UNSPECIFIED', undock_shelf_aligning_to_wall: false, undock_shelf_avoiding_obstacles: false, ignore_voice_recognition: false },
  { id: 'loc-505', name: 'Room 505',     pose: { x: 3.0, y: 1.0, theta: 0.0  }, type: 'LOCATION_TYPE_UNSPECIFIED', undock_shelf_aligning_to_wall: false, undock_shelf_avoiding_obstacles: false, ignore_voice_recognition: false },
  { id: 'loc-601', name: 'Room 601',     pose: { x: 1.0, y: 3.0, theta: 0.0  }, type: 'LOCATION_TYPE_UNSPECIFIED', undock_shelf_aligning_to_wall: false, undock_shelf_avoiding_obstacles: true,  ignore_voice_recognition: false },
  { id: 'loc-602', name: 'Room 602',     pose: { x: 2.0, y: 3.0, theta: 0.0  }, type: 'LOCATION_TYPE_UNSPECIFIED', undock_shelf_aligning_to_wall: false, undock_shelf_avoiding_obstacles: false, ignore_voice_recognition: false },
  { id: 'loc-611', name: 'Meeting 611',  pose: { x: 3.0, y: 3.0, theta: 1.57 }, type: 'LOCATION_TYPE_UNSPECIFIED', undock_shelf_aligning_to_wall: false, undock_shelf_avoiding_obstacles: false, ignore_voice_recognition: false },
  { id: 'loc-charger', name: 'Charger',  pose: { x: 0.0, y: 0.0, theta: 0.0  }, type: 'LOCATION_TYPE_CHARGER',     undock_shelf_aligning_to_wall: false, undock_shelf_avoiding_obstacles: false, ignore_voice_recognition: true  },
];

const mockShelves = [
  {
    id: 'shelf-001',
    name: 'Shelf A',
    pose: { x: 3.0, y: 1.5, theta: 0.0 },
    size: { width: 0.4, depth: 0.3, height: 0.9 },
    appearance: 'SHELF_APPEARANCE_KACHAKA_SHELF_3DRAWERS',
    recognizable_names: [{ name: 'Shelf A', deletable: false }],
    home_location_id: 'loc-001',
    speed_mode: 'SHELF_SPEED_MODE_NORMAL',
    ignore_voice_recognition: false,
  },
];

const mockMaps = [
  { id: 'map-001', name: 'Floor 1' },
  { id: 'map-002', name: 'Floor 2' },
];

const mockShortcuts = [
  { id: 'sc-001', name: 'Go to Kitchen' },
  { id: 'sc-002', name: 'Return Home' },
];

const mockHistory = [
  {
    id: 'hist-001',
    command: { move_to_location_command: { target_location_id: 'loc-001' } },
    success: true,
    error_code: 0,
    command_executed_time: Date.now() - 3600000,
  },
];

let commandIdCounter = 1;

// ---------------------------------------------------------------------------
// Helper: build Metadata with an incrementing cursor
// ---------------------------------------------------------------------------
let cursorCounter = BigInt(1);
function nextMeta() {
  return { cursor: String(cursorCounter++) };
}

function nowNsec() {
  return String(BigInt(Date.now()) * BigInt(1_000_000));
}

function makeRosHeader(frameId = 'base_link') {
  return { stamp_nsec: nowNsec(), frame_id: frameId };
}

// ---------------------------------------------------------------------------
// Unary handler factory – logs the call and calls fn(call, callback)
// ---------------------------------------------------------------------------
function unary(name, fn) {
  return (call, callback) => {
    console.log(`[RPC] ${name}`, JSON.stringify(call.request));
    try {
      fn(call, callback);
    } catch (err) {
      console.error(`[RPC] ${name} error:`, err);
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  };
}

// ---------------------------------------------------------------------------
// RPC Implementations
// ---------------------------------------------------------------------------

// -- Robot info --
function GetRobotSerialNumber(call, cb) {
  cb(null, { metadata: nextMeta(), serial_number: robotState.serial_number });
}

function GetRobotVersion(call, cb) {
  cb(null, { metadata: nextMeta(), version: robotState.version });
}

function GetRobotPose(call, cb) {
  cb(null, { metadata: nextMeta(), pose: robotState.pose });
}

function SetRobotPose(call, cb) {
  robotState.pose = call.request.pose;
  console.log(`  -> Pose set to`, robotState.pose);
  cb(null, { result: { success: true, error_code: 0 } });
}

function GetBatteryInfo(call, cb) {
  cb(null, {
    metadata: nextMeta(),
    remaining_percentage: robotState.battery.remaining_percentage,
    power_supply_status: robotState.battery.power_supply_status,
  });
}

function GetRobotErrorCodeJson(call, cb) {
  cb(null, {
    json: JSON.stringify({ error_codes: {} }),
    result: { success: true, error_code: 0 },
  });
}

function GetError(call, cb) {
  cb(null, { metadata: nextMeta(), error_codes: [] });
}

function IsReady(call, cb) {
  cb(null, { ready: true });
}

// -- Sensor data --
function GetRosImu(call, cb) {
  cb(null, {
    metadata: nextMeta(),
    imu: {
      header: makeRosHeader('imu_link'),
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      orientation_covariance: new Array(9).fill(0),
      angular_velocity: { x: 0.001, y: -0.002, z: 0.003 },
      angular_velocity_covariance: new Array(9).fill(0),
      linear_acceleration: { x: 0.01, y: -0.01, z: 9.81 },
      linear_acceleration_covariance: new Array(9).fill(0),
    },
  });
}

function GetRosOdometry(call, cb) {
  cb(null, {
    metadata: nextMeta(),
    odometry: {
      header: makeRosHeader('odom'),
      child_frame_id: 'base_link',
      pose: {
        pose: {
          position: { x: robotState.pose.x, y: robotState.pose.y, z: 0 },
          orientation: { x: 0, y: 0, z: Math.sin(robotState.pose.theta / 2), w: Math.cos(robotState.pose.theta / 2) },
        },
        covariance: new Array(36).fill(0),
      },
      twist: {
        twist: { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } },
        covariance: new Array(36).fill(0),
      },
    },
  });
}

function GetRosWheelOdometry(call, cb) {
  // Same structure, different frame
  GetRosOdometry(call, cb);
}

function GetRosLaserScan(call, cb) {
  const numRays = 360;
  const ranges = Array.from({ length: numRays }, (_, i) => 1.0 + 0.3 * Math.sin(i * Math.PI / 45));
  cb(null, {
    metadata: nextMeta(),
    scan: {
      header: makeRosHeader('laser'),
      angle_min: -Math.PI,
      angle_max: Math.PI,
      angle_increment: (2 * Math.PI) / numRays,
      time_increment: 0.0,
      scan_time: 0.1,
      range_min: 0.12,
      range_max: 10.0,
      ranges,
      intensities: new Array(numRays).fill(100),
    },
  });
}

function GetObjectDetection(call, cb) {
  cb(null, {
    metadata: nextMeta(),
    header: makeRosHeader('camera_link'),
    objects: [
      {
        label: 1, // OBJECT_LABEL_PERSON
        roi: { x_offset: 100, y_offset: 80, height: 200, width: 100, do_rectify: false },
        score: 0.92,
        distance_median: 1.5,
      },
    ],
  });
}

function GetObjectDetectionFeatures(call, cb) {
  cb(null, {
    metadata: nextMeta(),
    header: makeRosHeader('camera_link'),
    features: [],
  });
}

function makeCameraInfo(frameId) {
  return {
    header: makeRosHeader(frameId),
    height: 480,
    width: 640,
    distortion_model: 'plumb_bob',
    D: [0.0, 0.0, 0.0, 0.0, 0.0],
    K: [500, 0, 320, 0, 500, 240, 0, 0, 1],
    R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    P: [500, 0, 320, 0, 0, 500, 240, 0, 0, 0, 1, 0],
    binning_x: 0,
    binning_y: 0,
    roi: { x_offset: 0, y_offset: 0, height: 0, width: 0, do_rectify: false },
  };
}

function makeImage(frameId, encoding = 'rgb8') {
  const w = 16, h = 16; // tiny placeholder image
  return {
    header: makeRosHeader(frameId),
    height: h,
    width: w,
    encoding,
    is_bigendian: false,
    step: w * 3,
    data: Buffer.alloc(w * h * 3, 128), // grey
  };
}

function makeCompressedImage(frameId) {
  return {
    header: makeRosHeader(frameId),
    format: 'jpeg',
    data: Buffer.alloc(64, 0), // placeholder
  };
}

function GetFrontCameraRosCameraInfo(call, cb) { cb(null, { metadata: nextMeta(), camera_info: makeCameraInfo('front_camera') }); }
function GetFrontCameraRosImage(call, cb)       { cb(null, { metadata: nextMeta(), image: makeImage('front_camera') }); }
function GetFrontCameraRosCompressedImage(call, cb) { cb(null, { metadata: nextMeta(), image: makeCompressedImage('front_camera') }); }
function GetBackCameraRosCameraInfo(call, cb)   { cb(null, { metadata: nextMeta(), camera_info: makeCameraInfo('back_camera') }); }
function GetBackCameraRosImage(call, cb)         { cb(null, { metadata: nextMeta(), image: makeImage('back_camera') }); }
function GetBackCameraRosCompressedImage(call, cb) { cb(null, { metadata: nextMeta(), image: makeCompressedImage('back_camera') }); }
function GetTofCameraRosCameraInfo(call, cb)    { cb(null, { metadata: nextMeta(), camera_info: makeCameraInfo('tof_camera') }); }
function GetTofCameraRosImage(call, cb)          { cb(null, { metadata: nextMeta(), image: makeImage('tof_camera', 'mono16'), is_available: true }); }
function GetTofCameraRosCompressedImage(call, cb) { cb(null, { metadata: nextMeta(), image: makeCompressedImage('tof_camera'), is_available: true }); }

function GetPngMap(call, cb) {
  const w = 100, h = 100;
  cb(null, {
    metadata: nextMeta(),
    map: {
      data: Buffer.alloc(w * h, 255),
      name: 'Floor 1',
      resolution: 0.05,
      width: w,
      height: h,
      origin: { x: -2.5, y: -2.5, theta: 0.0 },
    },
  });
}

// -- Commands --
function StartCommand(call, cb) {
  const id = `cmd-${commandIdCounter++}`;
  robotState.current_command = call.request.command;
  robotState.current_command_id = id;
  robotState.command_state = 'COMMAND_STATE_RUNNING';

  console.log(`  -> Starting command ${id}`);

  // Simulate command completing after 3 seconds
  setTimeout(() => {
    robotState.last_result = { success: true, error_code: 0 };
    robotState.command_state = 'COMMAND_STATE_PENDING';
    robotState.current_command = null;
    console.log(`  -> Command ${id} completed`);
  }, 3000);

  cb(null, { result: { success: true, error_code: 0 }, command_id: id });
}

function CancelCommand(call, cb) {
  const cmd = robotState.current_command;
  robotState.command_state = 'COMMAND_STATE_PENDING';
  robotState.current_command = null;
  robotState.current_command_id = '';
  cb(null, { result: { success: true, error_code: 0 }, command: cmd || {} });
}

function GetCommandState(call, cb) {
  cb(null, {
    metadata: nextMeta(),
    state: robotState.command_state,
    command: robotState.current_command || {},
    command_id: robotState.current_command_id,
  });
}

function GetLastCommandResult(call, cb) {
  cb(null, {
    metadata: nextMeta(),
    result: robotState.last_result || {},
    command: {},
    command_id: '',
  });
}

function Proceed(call, cb) {
  cb(null, { result: { success: true, error_code: 0 } });
}

// -- Locations & Shelves --
function GetLocations(call, cb) {
  cb(null, { metadata: nextMeta(), locations: mockLocations, default_location_id: 'loc-001' });
}

function GetShelves(call, cb) {
  cb(null, { metadata: nextMeta(), shelves: mockShelves });
}

function GetMovingShelfId(call, cb) {
  cb(null, { metadata: nextMeta(), shelf_id: '' });
}

function ResetShelfPose(call, cb) {
  console.log(`  -> Reset shelf pose for id: "${call.request.shelf_id || 'ALL'}"`);
  cb(null, { result: { success: true, error_code: 0 } });
}

// -- Auto homing --
function SetAutoHomingEnabled(call, cb) {
  robotState.auto_homing_enabled = call.request.enable;
  cb(null, { result: { success: true, error_code: 0 } });
}

function GetAutoHomingEnabled(call, cb) {
  cb(null, { metadata: nextMeta(), enabled: robotState.auto_homing_enabled });
}

// -- Teleop --
function SetManualControlEnabled(call, cb) {
  robotState.manual_control_enabled = call.request.enable;
  cb(null, { result: { success: true, error_code: 0 } });
}

function GetManualControlEnabled(call, cb) {
  cb(null, { metadata: nextMeta(), enabled: robotState.manual_control_enabled });
}

function SetFrontTorchIntensity(call, cb) {
  robotState.front_torch = call.request.intensity;
  cb(null, { result: { success: true, error_code: 0 } });
}

function SetBackTorchIntensity(call, cb) {
  robotState.back_torch = call.request.intensity;
  cb(null, { result: { success: true, error_code: 0 } });
}

function SetRobotVelocity(call, cb) {
  console.log(`  -> Velocity: linear=${call.request.linear} angular=${call.request.angular}`);
  cb(null, { result: { success: true, error_code: 0 } });
}

function ActivateLaserScan(call, cb) {
  console.log(`  -> Laser scan activated for ${call.request.duration_sec}s`);
  cb(null, { result: { success: true, error_code: 0 } });
}

// -- Map --
function GetMapList(call, cb) {
  cb(null, { metadata: nextMeta(), map_list_entries: mockMaps });
}

function GetCurrentMapId(call, cb) {
  cb(null, { metadata: nextMeta(), id: robotState.current_map_id });
}

function LoadMapPreview(call, cb) {
  const mapId = call.request.map_id;
  const w = 50, h = 50;
  cb(null, {
    result: { success: true, error_code: 0 },
    map: {
      data: Buffer.alloc(w * h, 200),
      name: mockMaps.find(m => m.id === mapId)?.name || 'Unknown',
      resolution: 0.05,
      width: w,
      height: h,
      origin: { x: 0, y: 0, theta: 0 },
    },
  });
}

function SwitchMap(call, cb) {
  robotState.current_map_id = call.request.map_id;
  console.log(`  -> Switched to map: ${call.request.map_id}`);
  cb(null, { result: { success: true, error_code: 0 } });
}

// ExportMap – server streaming
function ExportMap(call) {
  const mapId = call.request.map_id;
  console.log(`[RPC] ExportMap mapId=${mapId}`);

  const fakeData = Buffer.alloc(256, 0xAB); // simulate map bytes
  const chunkSize = 64;

  let offset = 0;
  function sendNext() {
    if (offset >= fakeData.length) {
      call.write({ end_of_stream: { result: { success: true, error_code: 0 } } });
      call.end();
      console.log(`  -> ExportMap stream ended`);
      return;
    }
    const chunk = fakeData.slice(offset, offset + chunkSize);
    call.write({ middle_of_stream: { data: chunk } });
    offset += chunkSize;
    setTimeout(sendNext, 50);
  }
  sendNext();
}

// ImportMap – client streaming
function ImportMap(call, cb) {
  console.log(`[RPC] ImportMap (client streaming)`);
  const chunks = [];
  call.on('data', chunk => { chunks.push(chunk.data); });
  call.on('end', () => {
    const total = chunks.reduce((s, b) => s + b.length, 0);
    console.log(`  -> ImportMap received ${total} bytes`);
    cb(null, { result: { success: true, error_code: 0 }, map_id: 'map-imported-001' });
  });
  call.on('error', err => {
    console.error('  -> ImportMap error:', err);
    cb({ code: grpc.status.INTERNAL, message: err.message });
  });
}

// ImportImageAsMap – client streaming
function ImportImageAsMap(call, cb) {
  console.log(`[RPC] ImportImageAsMap (client streaming)`);
  const chunks = [];
  call.on('data', chunk => { chunks.push(chunk.data); });
  call.on('end', () => {
    const total = chunks.reduce((s, b) => s + b.length, 0);
    console.log(`  -> ImportImageAsMap received ${total} bytes`);
    cb(null, { result: { success: true, error_code: 0 }, map_id: 'map-image-001' });
  });
  call.on('error', err => {
    console.error('  -> ImportImageAsMap error:', err);
    cb({ code: grpc.status.INTERNAL, message: err.message });
  });
}

// -- Shortcuts --
function GetShortcuts(call, cb) {
  cb(null, { metadata: nextMeta(), shortcuts: mockShortcuts });
}

function StartShortcutCommand(call, cb) {
  console.log(`  -> Shortcut: ${call.request.target_shortcut_id}`);
  cb(null, { result: { success: true, error_code: 0 } });
}

// -- History --
function GetHistoryList(call, cb) {
  cb(null, { metadata: nextMeta(), histories: mockHistory });
}

// -- Robot settings --
function GetSpeakerVolume(call, cb) {
  cb(null, { metadata: nextMeta(), volume: robotState.speaker_volume });
}

function SetSpeakerVolume(call, cb) {
  robotState.speaker_volume = call.request.volume;
  cb(null, { result: { success: true, error_code: 0 } });
}

function RestartRobot(call, cb) {
  console.log('  -> RestartRobot called (no-op in mock)');
  cb(null, { result: { success: true, error_code: 0 } });
}

function SetEmergencyStop(call, cb) {
  console.log('  -> SetEmergencyStop called');
  robotState.command_state = 'COMMAND_STATE_PENDING';
  robotState.current_command = null;
  cb(null, { result: { success: true, error_code: 0 } });
}

// -- Transform --
function GetStaticTransform(call, cb) {
  cb(null, {
    metadata: nextMeta(),
    transforms: [
      {
        header: makeRosHeader('base_link'),
        child_frame_id: 'laser',
        translation: { x: 0.1, y: 0.0, z: 0.2 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      {
        header: makeRosHeader('base_link'),
        child_frame_id: 'front_camera',
        translation: { x: 0.15, y: 0.0, z: 0.3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    ],
  });
}

// GetDynamicTransform – server streaming (pushes updates every 500ms)
function GetDynamicTransform(call) {
  console.log(`[RPC] GetDynamicTransform (server streaming)`);

  function sendTransform() {
    if (call.cancelled) return;
    call.write({
      transforms: [
        {
          header: makeRosHeader('odom'),
          child_frame_id: 'base_link',
          translation: { x: robotState.pose.x, y: robotState.pose.y, z: 0 },
          rotation: {
            x: 0, y: 0,
            z: Math.sin(robotState.pose.theta / 2),
            w: Math.cos(robotState.pose.theta / 2),
          },
        },
      ],
    });
    setTimeout(sendTransform, 500);
  }

  call.on('cancelled', () => console.log('  -> GetDynamicTransform cancelled'));
  sendTransform();
}

// ---------------------------------------------------------------------------
// Wrap all unary handlers with the logging/error wrapper
// ---------------------------------------------------------------------------
const serviceImpl = {
  GetRobotSerialNumber:           unary('GetRobotSerialNumber',           GetRobotSerialNumber),
  GetRobotVersion:                unary('GetRobotVersion',                GetRobotVersion),
  GetRobotPose:                   unary('GetRobotPose',                   GetRobotPose),
  SetRobotPose:                   unary('SetRobotPose',                   SetRobotPose),
  GetBatteryInfo:                 unary('GetBatteryInfo',                 GetBatteryInfo),
  GetRobotErrorCodeJson:          unary('GetRobotErrorCodeJson',          GetRobotErrorCodeJson),
  GetError:                       unary('GetError',                       GetError),
  IsReady:                        unary('IsReady',                        IsReady),
  GetPngMap:                      unary('GetPngMap',                      GetPngMap),
  GetObjectDetection:             unary('GetObjectDetection',             GetObjectDetection),
  GetObjectDetectionFeatures:     unary('GetObjectDetectionFeatures',     GetObjectDetectionFeatures),
  GetRosImu:                      unary('GetRosImu',                      GetRosImu),
  GetRosOdometry:                 unary('GetRosOdometry',                 GetRosOdometry),
  GetRosWheelOdometry:            unary('GetRosWheelOdometry',            GetRosWheelOdometry),
  GetRosLaserScan:                unary('GetRosLaserScan',                GetRosLaserScan),
  GetFrontCameraRosCameraInfo:    unary('GetFrontCameraRosCameraInfo',    GetFrontCameraRosCameraInfo),
  GetFrontCameraRosImage:         unary('GetFrontCameraRosImage',         GetFrontCameraRosImage),
  GetFrontCameraRosCompressedImage: unary('GetFrontCameraRosCompressedImage', GetFrontCameraRosCompressedImage),
  GetBackCameraRosCameraInfo:     unary('GetBackCameraRosCameraInfo',     GetBackCameraRosCameraInfo),
  GetBackCameraRosImage:          unary('GetBackCameraRosImage',          GetBackCameraRosImage),
  GetBackCameraRosCompressedImage: unary('GetBackCameraRosCompressedImage', GetBackCameraRosCompressedImage),
  GetTofCameraRosCameraInfo:      unary('GetTofCameraRosCameraInfo',      GetTofCameraRosCameraInfo),
  GetTofCameraRosImage:           unary('GetTofCameraRosImage',           GetTofCameraRosImage),
  GetTofCameraRosCompressedImage: unary('GetTofCameraRosCompressedImage', GetTofCameraRosCompressedImage),
  StartCommand:                   unary('StartCommand',                   StartCommand),
  CancelCommand:                  unary('CancelCommand',                  CancelCommand),
  GetCommandState:                unary('GetCommandState',                GetCommandState),
  GetLastCommandResult:           unary('GetLastCommandResult',           GetLastCommandResult),
  Proceed:                        unary('Proceed',                        Proceed),
  GetLocations:                   unary('GetLocations',                   GetLocations),
  GetShelves:                     unary('GetShelves',                     GetShelves),
  GetMovingShelfId:               unary('GetMovingShelfId',               GetMovingShelfId),
  ResetShelfPose:                 unary('ResetShelfPose',                 ResetShelfPose),
  SetAutoHomingEnabled:           unary('SetAutoHomingEnabled',           SetAutoHomingEnabled),
  GetAutoHomingEnabled:           unary('GetAutoHomingEnabled',           GetAutoHomingEnabled),
  SetManualControlEnabled:        unary('SetManualControlEnabled',        SetManualControlEnabled),
  GetManualControlEnabled:        unary('GetManualControlEnabled',        GetManualControlEnabled),
  SetFrontTorchIntensity:         unary('SetFrontTorchIntensity',         SetFrontTorchIntensity),
  SetBackTorchIntensity:          unary('SetBackTorchIntensity',          SetBackTorchIntensity),
  SetRobotVelocity:               unary('SetRobotVelocity',               SetRobotVelocity),
  ActivateLaserScan:              unary('ActivateLaserScan',              ActivateLaserScan),
  GetMapList:                     unary('GetMapList',                     GetMapList),
  GetCurrentMapId:                unary('GetCurrentMapId',                GetCurrentMapId),
  LoadMapPreview:                 unary('LoadMapPreview',                 LoadMapPreview),
  SwitchMap:                      unary('SwitchMap',                      SwitchMap),
  GetShortcuts:                   unary('GetShortcuts',                   GetShortcuts),
  StartShortcutCommand:           unary('StartShortcutCommand',           StartShortcutCommand),
  GetHistoryList:                 unary('GetHistoryList',                 GetHistoryList),
  GetSpeakerVolume:               unary('GetSpeakerVolume',               GetSpeakerVolume),
  SetSpeakerVolume:               unary('SetSpeakerVolume',               SetSpeakerVolume),
  RestartRobot:                   unary('RestartRobot',                   RestartRobot),
  SetEmergencyStop:               unary('SetEmergencyStop',               SetEmergencyStop),
  GetStaticTransform:             unary('GetStaticTransform',             GetStaticTransform),
  // Streaming (not wrapped – they manage their own flow)
  ExportMap,
  ImportMap,
  ImportImageAsMap,
  GetDynamicTransform,
};

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------
const HOST = '0.0.0.0';
const PORT = 26400;

const server = new grpc.Server();
server.addService(proto.KachakaApi.service, serviceImpl);

server.bindAsync(`${HOST}:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error('Failed to bind server:', err);
    process.exit(1);
  }
  console.log(`Kachaka mock gRPC server listening on ${HOST}:${port}`);
  console.log('Press Ctrl+C to stop.\n');
});
