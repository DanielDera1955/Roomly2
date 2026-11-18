/**
 * Match screenshots: squeezed on the phone to about 200 KB, then uploaded to Cloudinary (already used for product photos).
 * Every upload is tagged with its season, so a whole season's screenshots can be deleted at once
 * in the Cloudinary console: Media Library, search the tag "season-<id>", select all, delete.
 */
import { CLOUDINARY } from './cloudinary.ts';

const TARGET_BYTES = 200 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not a picture. Choose a screenshot.'));
    };
    img.src = url;
  });
}

/** A JPEG of about 200 KB or less: scaled down to 1280 px on the long side, quality lowered until it fits */
export async function compressScreenshot(file) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Choose a screenshot (a picture file).');
  const img = await loadImage(file);
  let scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.8, 0.65, 0.5, 0.4]) {
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= TARGET_BYTES) return blob;
      if (blob && attempt === 3 && q === 0.4) return blob;
    }
    scale *= 0.75;
  }
  return file;
}

/** Upload a screenshot and return its link */
export async function uploadProof(file, seasonId) {
  if (!CLOUDINARY.cloudName || !CLOUDINARY.uploadPreset) throw new Error('Screenshot upload is not set up.');
  const blob = await compressScreenshot(file);
  const fd = new FormData();
  fd.append('file', blob);
  fd.append('upload_preset', CLOUDINARY.uploadPreset);
  fd.append('tags', `roomly-proof,season-${seasonId}`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Screenshot upload failed. Check your network and try again.');
  const data = await res.json();
  return String(data.secure_url || '');
}
