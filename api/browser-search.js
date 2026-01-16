
// Since we cannot easily run Puppeteer on Vercel Hobby plan,
// we'll return a failure so the client falls back to proxy-based parsing.
export default async function handler(req, res) {
  res.status(200).json({ 
    success: false, 
    message: "Server-side browser rendering is not supported in this environment. Falling back to client-side parsing." 
  });
}
