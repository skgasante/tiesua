// Build-time guard. Never prints environment values or credentials.
const base = process.env.VITE_API_BASE;
if (!base || !/^https:\/\/[^/]+\/?$/.test(base)) {
  throw new Error('Set VITE_API_BASE to the HTTPS backend origin in the frontend Vercel project.');
}
for (const name of Object.keys(process.env)) {
  if (/^VITE_.*(KEY|TOKEN|SECRET)/i.test(name)) throw new Error('Remove secret-like VITE variables. Browser builds are public.');
}
console.log('HTTPS backend origin configured. No client secret variables detected.');
