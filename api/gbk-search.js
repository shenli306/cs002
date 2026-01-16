
import iconv from 'iconv-lite';

export default async function handler(req, res) {
  const { target, keyword, method = 'GET', data } = req.query;

  if (!target || !keyword) {
    return res.status(400).send("Missing parameters");
  }

  try {
      // Encode keyword to GBK
      const buf = iconv.encode(keyword, 'gbk');
      let encodedKeyword = '';
      for (let i = 0; i < buf.length; i++) {
          encodedKeyword += '%' + buf[i].toString(16).toUpperCase().padStart(2, '0');
      }

      let finalUrl = target.replace('{keyword}', encodedKeyword);
      
      const fetchOptions = {
          method: method,
          headers: {
             'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
             'Referer': 'https://www.jizai22.com/'
          }
      };
      
      if (method === 'POST' && data) {
          fetchOptions.body = data.replace('{keyword}', encodedKeyword);
          fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }

      const response = await fetch(finalUrl, fetchOptions);
      const buffer = await response.arrayBuffer();
      
      // We assume the response is GBK (or whatever the site returns), usually HTML
      // We pass it back as binary/buffer and let the frontend decode it using TextDecoder('gb18030')
      // but we should set the content type.
      
      res.setHeader('Content-Type', 'text/html; charset=gbk');
      res.send(Buffer.from(buffer));
  } catch (e) {
      console.error("GBK Search Error:", e);
      res.status(500).send(e.message);
  }
}
