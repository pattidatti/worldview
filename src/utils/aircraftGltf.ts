// Procedural glTF 2.0 aircraft models — no external asset files required.
// Each aircraft type is a low-poly box-mesh assembled from fuselage, wings, tail, etc.
// Returns a base64-encoded 'data:model/gltf+json;base64,...' URI cached per type.

export type AircraftType = 'small' | 'medium' | 'large' | 'military';

const GLTF_CACHE = new Map<AircraftType, string>();

interface Box {
    x0: number; y0: number; z0: number;
    x1: number; y1: number; z1: number;
}

// Appends 8 vertices + 12 triangles for a box into the accumulator arrays.
function addBox(positions: number[], indices: number[], b: Box): void {
    const base = positions.length / 3;
    positions.push(
        b.x0, b.y0, b.z0,  // 0 left-bottom-back
        b.x1, b.y0, b.z0,  // 1 right-bottom-back
        b.x1, b.y1, b.z0,  // 2 right-top-back
        b.x0, b.y1, b.z0,  // 3 left-top-back
        b.x0, b.y0, b.z1,  // 4 left-bottom-front
        b.x1, b.y0, b.z1,  // 5 right-bottom-front
        b.x1, b.y1, b.z1,  // 6 right-top-front
        b.x0, b.y1, b.z1,  // 7 left-top-front
    );
    const f = (a: number, b: number, c: number) => { indices.push(base+a, base+b, base+c); };
    f(0,2,1); f(0,3,2); // -Z face
    f(4,5,6); f(4,6,7); // +Z face
    f(0,1,5); f(0,5,4); // -Y face
    f(3,7,6); f(3,6,2); // +Y face
    f(0,4,7); f(0,7,3); // -X face
    f(1,2,6); f(1,6,5); // +X face
}

// Axis convention (model-local space, before Cesium loads it):
//   +X = nose direction (forward)
//   +Y = up
//   +Z = starboard (right wing)
// Cesium converts glTF Y-up to its internal Z-up, preserving +X = forward.
// With entity.orientation = headingPitchRollQuaternion(pos, HPR(heading-90°, 0, 0))
// the nose will point in the flight's heading direction.

function partsForType(type: AircraftType): Box[] {
    switch (type) {
        case 'large': return [
            // Fuselage: 52m long, 5.6m wide, 5.6m tall
            { x0:-30, y0:-2.8, z0:-2.8, x1:22, y1:2.8, z1:2.8 },
            // Wings: spans 64m total, 18m chord
            { x0:-6,  y0:-0.6, z0:-32, x1:12, y1:0.6, z1:32 },
            // Vertical fin
            { x0:-30, y0:2.8,  z0:-0.9, x1:-15, y1:10.5, z1:0.9 },
            // Horizontal stabilizers
            { x0:-30, y0:-0.6, z0:-11,  x1:-16, y1:0.6, z1:11 },
            // Engine pod left
            { x0:-14, y0:-5,   z0:-22,  x1:2,   y1:-3.5, z1:-15 },
            // Engine pod right
            { x0:-14, y0:-5,   z0:15,   x1:2,   y1:-3.5, z1:22 },
        ];
        case 'medium': return [
            // Fuselage: 38m long, 3.6m wide
            { x0:-20, y0:-1.8, z0:-1.8, x1:18, y1:1.8, z1:1.8 },
            // Wings: 36m span, 12m chord
            { x0:-4,  y0:-0.4, z0:-18,  x1:8,  y1:0.4, z1:18 },
            // Vertical fin
            { x0:-20, y0:1.8,  z0:-0.6, x1:-10, y1:8,  z1:0.6 },
            // Horizontal stabilizers
            { x0:-20, y0:-0.4, z0:-7.5, x1:-11, y1:0.4, z1:7.5 },
            // Engine pod left (under wing)
            { x0:-9,  y0:-3.5, z0:-13,  x1:2,  y1:-2.2, z1:-8 },
            // Engine pod right
            { x0:-9,  y0:-3.5, z0:8,    x1:2,  y1:-2.2, z1:13 },
        ];
        case 'small': return [
            // Fuselage: 9m long, 1.2m wide
            { x0:-4.5, y0:-0.6, z0:-0.6, x1:4.5, y1:0.6, z1:0.6 },
            // High-wing: 11m span, 1.8m chord
            { x0:-0.5, y0:0.3,  z0:-5.5,  x1:1.3, y1:0.7, z1:5.5 },
            // Vertical fin
            { x0:-4.5, y0:0.6,  z0:-0.25, x1:-2,  y1:2.2, z1:0.25 },
            // Horizontal stabilizers
            { x0:-4.5, y0:-0.2, z0:-2.2,  x1:-2.2, y1:0.2, z1:2.2 },
        ];
        case 'military': return [
            // Fuselage: long slender nose
            { x0:-7.5, y0:-1,   z0:-1,    x1:9,  y1:1,   z1:1 },
            // Swept delta left wing
            { x0:-7.5, y0:-0.3, z0:-8.5,  x1:3,  y1:0.3, z1:-1.2 },
            // Swept delta right wing
            { x0:-7.5, y0:-0.3, z0:1.2,   x1:3,  y1:0.3, z1:8.5 },
            // Twin vertical fins left
            { x0:-7.5, y0:1,    z0:-1.8,  x1:-3, y1:4.5, z1:-0.6 },
            // Twin vertical fins right
            { x0:-7.5, y0:1,    z0:0.6,   x1:-3, y1:4.5, z1:1.8 },
            // Horizontal stabilizers
            { x0:-7.5, y0:-0.3, z0:-4.5,  x1:-2, y1:0.3, z1:4.5 },
            // Engine intake
            { x0:-1.5, y0:-1.8, z0:-1.4,  x1:6,  y1:0.2, z1:1.4 },
        ];
    }
}

function colorForType(type: AircraftType): [number, number, number] {
    switch (type) {
        case 'large':    return [0.83, 0.87, 0.92]; // silver-white
        case 'medium':   return [0.75, 0.80, 0.87]; // silver-gray
        case 'small':    return [0.70, 0.83, 0.65]; // light green
        case 'military': return [0.38, 0.43, 0.32]; // olive drab
    }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    // Process in chunks to avoid stack overflow on spread
    for (let i = 0; i < bytes.length; i += 4096) {
        binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 4096)));
    }
    return btoa(binary);
}

function buildGltf(type: AircraftType): string {
    const parts = partsForType(type);
    const [r, g, b] = colorForType(type);

    const positions: number[] = [];
    const indices: number[] = [];
    for (const box of parts) addBox(positions, indices, box);

    const nVerts   = positions.length / 3;
    const nIdx     = indices.length;
    const posArray = new Float32Array(positions);
    const idxArray = new Uint16Array(indices);

    // Bounding box (required by POSITION accessor)
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
        if (positions[i]   < minX) minX = positions[i];
        if (positions[i]   > maxX) maxX = positions[i];
        if (positions[i+1] < minY) minY = positions[i+1];
        if (positions[i+1] > maxY) maxY = positions[i+1];
        if (positions[i+2] < minZ) minZ = positions[i+2];
        if (positions[i+2] > maxZ) maxZ = positions[i+2];
    }

    // Pack positions then indices into one buffer
    const posBytes = posArray.byteLength;  // nVerts * 12 (always multiple of 4)
    const idxBytes = idxArray.byteLength;
    const combined = new Uint8Array(posBytes + idxBytes);
    combined.set(new Uint8Array(posArray.buffer), 0);
    combined.set(new Uint8Array(idxArray.buffer), posBytes);

    const bufUri = 'data:application/octet-stream;base64,' + arrayBufferToBase64(combined.buffer);

    const gltf = {
        asset: { version: '2.0', generator: 'WorldView procedural' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, mode: 4 }] }],
        materials: [{
            pbrMetallicRoughness: {
                baseColorFactor: [r, g, b, 1.0],
                metallicFactor: 0.45,
                roughnessFactor: 0.55,
            },
            doubleSided: true,
        }],
        accessors: [
            {
                bufferView: 0, byteOffset: 0,
                componentType: 5126, // FLOAT
                count: nVerts, type: 'VEC3',
                min: [minX, minY, minZ], max: [maxX, maxY, maxZ],
            },
            {
                bufferView: 1, byteOffset: 0,
                componentType: 5123, // UNSIGNED_SHORT
                count: nIdx, type: 'SCALAR',
            },
        ],
        bufferViews: [
            { buffer: 0, byteOffset: 0,        byteLength: posBytes, target: 34962 },
            { buffer: 0, byteOffset: posBytes,  byteLength: idxBytes, target: 34963 },
        ],
        buffers: [{ byteLength: posBytes + idxBytes, uri: bufUri }],
    };

    const jsonStr = JSON.stringify(gltf);
    return 'data:model/gltf+json;base64,' + btoa(unescape(encodeURIComponent(jsonStr)));
}

export function getAircraftGltf(type: AircraftType): string {
    const cached = GLTF_CACHE.get(type);
    if (cached) return cached;
    const uri = buildGltf(type);
    GLTF_CACHE.set(type, uri);
    return uri;
}

export function classifyAircraftType(typeCode: string, isMilitary: boolean): AircraftType {
    if (isMilitary) return 'military';
    const t = typeCode.toUpperCase();
    if (/A38[0-9]|B74[4-9]|77[7W]|A35[01]|A33[012]|B74[78]/.test(t)) return 'large';
    if (/B73[5-9]|A32[01]|A31[89]|E1[789][0-9]|B78[78]|CRJ/.test(t)) return 'medium';
    return 'small';
}
