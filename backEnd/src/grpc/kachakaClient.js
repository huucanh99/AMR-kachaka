'use strict';

const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = path.join(__dirname, '../../kachaka-api.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDef).kachaka_api;

let _stub = null;

/**
 * Get (or create) the singleton gRPC stub.
 * Lazily initialised so the host/port env vars are read after dotenv loads.
 */
function getStub() {
  if (_stub) return _stub;

  const host = process.env.KACHAKA_HOST || '127.0.0.1';
  const port = process.env.KACHAKA_PORT || '26400';
  const target = `${host}:${port}`;

  _stub = new proto.KachakaApi(target, grpc.credentials.createInsecure());
  console.log(`[gRPC] Client connected to ${target}`);
  return _stub;
}

/**
 * Promisify a unary gRPC call.
 * Usage: await call('GetRobotPose', { metadata: {} })
 */
function call(method, request = {}) {
  return new Promise((resolve, reject) => {
    getStub()[method](request, (err, response) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

/**
 * Convenience: empty GetRequest (cursor = 0 means "get latest")
 */
function getRequest(cursor = '0') {
  return { metadata: { cursor } };
}

module.exports = { getStub, call, getRequest };
