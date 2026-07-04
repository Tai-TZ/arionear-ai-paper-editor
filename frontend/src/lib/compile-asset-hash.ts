/** SHA-256 hex digest for compile delta payloads (matches backend workspace hashes). */

function base64Payload(dataUrl: string): string {
  const trimmed = dataUrl.trim();
  if (trimmed.includes(",")) {
    return trimmed.split(",", 2)[1] ?? "";
  }
  return trimmed;
}

function decodeBase64ToBytes(payload: string): Uint8Array {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256HexFromDataUrl(dataUrl: string): Promise<string> {
  const payload = base64Payload(dataUrl);
  const bytes = decodeBase64ToBytes(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(digest);
}

export async function buildCompileAssetHashes(
  assets: Array<{ name: string; dataUrl: string }>,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    assets.map(async (asset) => [asset.name, await sha256HexFromDataUrl(asset.dataUrl)] as const),
  );
  return Object.fromEntries(entries);
}
