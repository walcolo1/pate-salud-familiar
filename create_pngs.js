const fs = require('fs');
const path = require('path');

// Implementación de CRC32 para bloques de chunks PNG
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}

// Genera un archivo PNG plano (uncompressed) del color teal (#0d9488)
function createTealPNG(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB (3 bytes por píxel)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdrData);
  
  // IDAT chunk (Uncompressed raw pixels)
  // Cada fila comienza con un byte de filtro (0) seguido de W * 3 bytes (RGB)
  const rowSize = 1 + width * 3;
  const rawDataSize = rowSize * height;
  const rawData = Buffer.alloc(rawDataSize);
  
  // Rellenamos de color Teal (RGB: 13, 148, 136)
  for (let y = 0; y < height; y++) {
    let offset = y * rowSize;
    rawData[offset] = 0; // Filter byte: 0 (None)
    for (let x = 0; x < width; x++) {
      let px = offset + 1 + x * 3;
      rawData[px] = 13;      // R
      rawData[px + 1] = 148; // G
      rawData[px + 2] = 136; // B
    }
  }
  
  // Zlib DEFLATE sin compresión (block type 0)
  // Dividimos en bloques DEFLATE de máximo 65535 bytes
  const blocks = [];
  const maxBlockSize = 65535;
  let bytesLeft = rawDataSize;
  let srcOffset = 0;
  
  while (bytesLeft > 0) {
    const blockSize = Math.min(bytesLeft, maxBlockSize);
    const isLast = (bytesLeft <= maxBlockSize) ? 1 : 0;
    
    const blockHeader = Buffer.alloc(5);
    blockHeader[0] = isLast; // BFINAL and BTYPE (00 = no compression)
    blockHeader.writeUInt16LE(blockSize, 1);
    blockHeader.writeUInt16LE(~blockSize & 0xffff, 3);
    
    blocks.push(blockHeader);
    blocks.push(rawData.subarray(srcOffset, srcOffset + blockSize));
    
    bytesLeft -= blockSize;
    srcOffset += blockSize;
  }
  
  // Header zlib: CMF (0x78) y FLG (0x01)
  const zlibHeader = Buffer.from([0x78, 0x01]);
  
  // Adler-32 checksum de rawData
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < rawDataSize; i++) {
    s1 = (s1 + rawData[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler32 = Buffer.alloc(4);
  adler32.writeUInt16BE(s2, 0);
  adler32.writeUInt16BE(s1, 2);
  
  const deflateStream = Buffer.concat([zlibHeader, ...blocks, adler32]);
  const idatChunk = createChunk('IDAT', deflateStream);
  
  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  
  const crcData = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcData), 0);
  
  return Buffer.concat([lengthBuf, crcData, crcBuf]);
}

// Crear los iconos en la carpeta public
const publicDir = path.join(__dirname, 'public');
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), createTealPNG(192, 192));
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), createTealPNG(512, 512));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createTealPNG(180, 180));

console.log('Iconos PNG creados exitosamente en public/: icon-192.png, icon-512.png, apple-touch-icon.png');
