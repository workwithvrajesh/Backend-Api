function decode(buffer, encoding) {
  if (Buffer.isBuffer(buffer)) return buffer.toString(encoding || "utf8");
  return String(buffer);
}

function encode(content, encoding) {
  return Buffer.from(String(content), encoding || "utf8");
}

function encodingExists() {
  return true;
}

function getDecoder(encoding) {
  return {
    write(buf) {
      return decode(buf, encoding);
    },
    end() {
      return "";
    },
  };
}

function getEncoder(encoding) {
  return {
    write(str) {
      return encode(str, encoding);
    },
    end() {
      return Buffer.alloc(0);
    },
  };
}

module.exports = {
  decode,
  encode,
  encodingExists,
  getDecoder,
  getEncoder,
  skipDecodeWarning: true,
};
