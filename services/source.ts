import { Novel, Chapter, AppState, NovelSource } from "../types";
import pLimit from 'p-limit';

const WANBENGE_URL = "https://www.jizai22.com";
const YEDUJI_URL = "https://www.yeduji.com";
const BASE_URL = "https://www.jizai22.com"; // Fallback

const SHIJIEMINGZHU_URL = "https://www.shijiemingzhu.com";
const SHUKUGE_URL = "http://www.shukuge.com";
const DINGDIAN_URL = "https://www.23ddw.net";

// 搜索缓存喵~ 5分钟过期时间
const searchCache = new Map<string, { results: Novel[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟喵~

type SourceKey = 'wanbenge' | 'local' | 'yeduji' | 'shukuge' | 'dingdian';

const parseHTML = (html: string) => new DOMParser().parseFromString(html, "text/html");

/**
 * 顶点小说网直接HTTP搜索函数喵~
 * 比浏览器搜索更快，作为首选方案喵~
 */
const directDingdianSearch = async (keyword: string): Promise<Novel[]> => {
  try {
    // 顶点搜索URL格式喵~ (更新为新接口 /searchsss/)
    const searchUrl = `https://www.23ddw.net/searchsss/?searchkey=${encodeURIComponent(keyword)}`;
    console.log(`[Dingdian] Searching with URL: ${searchUrl}喵~`);
    
    // 使用代理获取搜索页面喵 (编码改为 utf-8)
    const html = await fetchText(searchUrl, undefined, 'utf-8');
    
    if (!html || html.length < 500) {
      console.warn(`[Dingdian] Page content suspicious, length: ${html?.length}喵~`);
      throw new Error('搜索页面内容过少或获取失败喵~');
    }
    
    // 检查是否包含关键字，防止拿到的是空搜索结果页喵
    if (!html.includes('searchkey') && !html.includes(keyword) && !html.includes('item')) {
      console.warn(`[Dingdian] Page content may not be a search result page喵~`);
    }

    const doc = parseHTML(html);
    
    // 多种选择器策略喵~
    const results: Novel[] = [];
    const seenUrls = new Set<string>();
    
    // 策略1: 标准搜索结果（.item 选择器）
    const items = doc.querySelectorAll('.item');
    console.log(`[Dingdian] Found ${items.length} .item elements喵~`);

    items.forEach((item, index) => {
      try {
        // 适配新结构: .item -> dl -> dt -> a (标题)
        const titleLink = item.querySelector('dl dt a') || item.querySelector('dt a') || item.querySelector('.image a');
        
        // 作者提取逻辑优化喵~
        const authorEl = item.querySelector('dt span') || item.querySelector('.btm') || item.querySelector('dd span');
        const coverEl = item.querySelector('img');
        const descEl = item.querySelector('dd');
        
        if (titleLink && titleLink.textContent) {
          const title = titleLink.textContent.trim();
          // 详情页链接处理
          const href = titleLink.getAttribute('href') || '';
          const detailUrl = href.startsWith('http') ? href : new URL(href, DINGDIAN_URL).href;
          
          // 提取作者：优化后的逻辑喵
          let author = '未知';
          if (authorEl) {
              const authorText = authorEl.textContent?.trim() || '';
              // 过滤掉 "作者：" 前缀喵
              author = authorText.replace(/作者[：:]\s*/, '').split(/\s+/)[0] || '未知';
              
              const authorLink = authorEl.querySelector('a');
              if (authorLink) {
                  author = authorLink.textContent?.trim() || author;
              }
          }

          if (!seenUrls.has(detailUrl) && isRelevant(title, author, keyword)) {
            seenUrls.add(detailUrl);
            
            results.push({
              id: detailUrl,
              title,
              author,
              coverUrl: coverEl?.getAttribute('data-original') || coverEl?.getAttribute('src') || '',
              description: descEl?.textContent?.trim() || '',
              tags: [],
              status: 'Unknown',
              chapters: [],
              sourceName: '顶点小说网',
              detailUrl
            });
          }
        }
      } catch (e) {
        console.warn(`[Dingdian] Error parsing item ${index}:`, e);
      }
    });
    
    // 策略2: 列表页结果（dl dt dd 结构）
    const dtElements = doc.querySelectorAll('dt');
    dtElements.forEach(dt => {
      const link = dt.querySelector('a');
      if (link && link.textContent && !link.textContent.includes('最新')) {
        const title = link.textContent.trim();
        const href = link.getAttribute('href') || '';
        const detailUrl = href.startsWith('http') ? href : new URL(href, DINGDIAN_URL).href;
        
        if (!seenUrls.has(detailUrl) && isRelevant(title, '', keyword)) {
          seenUrls.add(detailUrl);
          
          // 尝试从相邻元素获取作者信息喵
          let author = '未知';
          const nextSibling = dt.nextElementSibling;
          if (nextSibling && nextSibling.tagName === 'DD') {
            const authorMatch = nextSibling.textContent?.match(/作者[：:]([^\s]+)/);
            if (authorMatch) author = authorMatch[1].trim();
          }
          
          results.push({
            id: detailUrl,
            title,
            author,
            coverUrl: '',
            description: '',
            tags: [],
            status: 'Unknown',
            chapters: [],
            sourceName: '顶点小说网',
            detailUrl
          });
        }
      }
    });
    
    // 策略3: 通用链接检测（备用方案）
    if (results.length === 0) {
      const allLinks = doc.querySelectorAll('a');
      allLinks.forEach(link => {
        const title = link.textContent?.trim();
        const href = link.getAttribute('href') || '';
        if (title && title.length > 2 && title.length < 50 && 
            !title.includes('首页') && !title.includes('顶点') &&
            href.includes('/book/')) {
          const detailUrl = href.startsWith('http') ? href : new URL(href, DINGDIAN_URL).href;
          
          if (!seenUrls.has(detailUrl) && isRelevant(title, '', keyword)) {
            seenUrls.add(detailUrl);
            
            results.push({
              id: detailUrl,
              title,
              author: '未知',
              coverUrl: '',
              description: '',
              tags: [],
              status: 'Unknown',
              chapters: [],
              sourceName: '顶点小说网',
              detailUrl
            });
          }
        }
      });
    }
    
    return results;
    
  } catch (error) {
    console.warn('[Dingdian] Direct search failed喵~', error);
    return [];
  }
};

/**
 * 智能搜索结果相关性检查喵~
 * 支持多关键词、拼音匹配、模糊搜索和权重评分喵~
 */
export const isRelevant = (title: string, author: string, keyword: string): boolean => {
    const t = title.trim().toLowerCase();
    const a = author.trim().toLowerCase();
    const kw = keyword.trim().toLowerCase();
    
    if (!kw) return true;
    
    // 特殊字符处理喵~
    const cleanTitle = t.replace(/[《》【】\(\)\[\]{}「」]/g, '');
    const cleanKeyword = kw.replace(/[《》【】\(\)\[\]{}「」]/g, '');
    
    // 1. 完全匹配（最高优先级喵~）
    if (cleanTitle === cleanKeyword || a === cleanKeyword) {
        return true;
    }
    
    // 2. 包含匹配（次高优先级）
    if (cleanTitle.includes(cleanKeyword) || a.includes(cleanKeyword)) {
        return true;
    }
    
    // 3. 多关键词拆分匹配
    const words = cleanKeyword.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 1) {
        // 所有关键词都必须在标题或作者中出现喵~
        return words.every(word => cleanTitle.includes(word) || a.includes(word));
    }
    
    // 4. 拼音模糊匹配（用于中文搜索喵~）
    // 注意：这里我们只在关键词是纯拼音时才在标题里找拼音喵~
    // 或者我们应该把标题转成拼音首字母再匹配，但目前我们先修好逻辑喵
    if (/^[a-zA-Z]+$/.test(cleanKeyword) && cleanKeyword.length > 1) {
        // 如果关键词是纯英文/拼音，尝试匹配标题的首字母喵（简单实现）
        const titleInitials = cleanTitle.split('').map(char => {
            // 这是一个非常简化的映射，仅用于演示修复喵
            const simplePinyinMap: Record<string, string> = {
                '凡': 'f', '人': 'r', '修': 'x', '仙': 'x', '传': 'c',
                '剑': 'j', '来': 'l', '大': 'd', '奉': 'f', '打': 'd', '更': 'g'
            };
            return simplePinyinMap[char] || '';
        }).join('');
        
        if (titleInitials.includes(cleanKeyword)) return true;
    }
    
    // 5. 权重评分喵~
    let score = 0;
    
    // 标题完全包含关键词，直接给高分喵
    if (cleanTitle.includes(cleanKeyword)) score += 50;
    // 作者包含关键词，给次高分喵
    if (a.includes(cleanKeyword)) score += 30;
    
    // 如果是“凡人”搜索“凡人修仙传”，长度相似度也很重要喵
    const lengthDiff = Math.abs(cleanTitle.length - cleanKeyword.length);
    if (lengthDiff < 5) score += 10;
    
    return score >= 30;
};

/**
 * 清理过期搜索缓存喵~
 * 避免内存泄漏，保持缓存新鲜度喵~
 */
const cleanupSearchCache = (): void => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      searchCache.delete(key);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[Cache] Cleaned ${cleanedCount} expired search entries喵~`);
  }
  
  // 如果缓存太大，清理最老的50个条目喵
  if (searchCache.size > 100) {
    const entries = Array.from(searchCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toDelete = entries.slice(0, Math.min(50, entries.length));
    toDelete.forEach(([key]) => searchCache.delete(key));
    
    console.log(`[Cache] Cleaned ${toDelete.length} oldest entries due to size limit喵~`);
  }
};

interface SourceProvider {
  key: SourceKey;
  name: string;
  baseUrl: string;
  search: (keyword: string) => Promise<Novel[]>;
  getDetails: (novel: Novel) => Promise<Novel>;
  getChapterContent?: (chapter: Chapter) => Promise<string>;
}

const PROXY_LIST = [
  // 1. 优先使用本地配置好的 Vite 代理，它们带有特定的请求头喵~
  (url: string) => {
    if (url.includes('www.jizai22.com')) {
      return url.replace('https://www.jizai22.com', '/proxy/wanbenge');
    }
    if (url.includes('www.yeduji.com')) {
      return url.replace('https://www.yeduji.com', '/proxy/yeduji');
    }
    if (url.includes('www.shukuge.com')) {
      return url.replace('http://www.shukuge.com', '/proxy/shukuge');
    }
    if (url.includes('www.23ddw.net')) {
      return url.replace('https://www.23ddw.net', '/proxy/dingdian');
    }
    return url;
  },
  // 2. 本地万能 Node 代理喵~
  (url: string) => `/api/proxy?url=${encodeURIComponent(url)}`,
  // 3. 外部公共代理兜底喵~
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
  // 4. 最后才尝试直接请求喵~（通常会被 CORS 拦截，除非有插件喵）
  (url: string) => url,
];

// Helper to fetch text with proxy rotation
const fetchText = async (url: string, options?: RequestInit, encoding = 'utf-8'): Promise<string> => {
  // 如果是本地 API 或代理路径，直接请求，不进行代理轮换喵~
  if (url.startsWith('/')) {
    console.log(`[Fetch] Local request: ${url}喵~`);
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder(encoding === 'gbk' ? 'gb18030' : encoding);
    return decoder.decode(buffer);
  }

  const targetUrl = url.startsWith('http') ? url : `${WANBENGE_URL}${url.startsWith('/') ? '' : '/'}${url}`;

  // 完本阁搜索请求增加“猫步”延迟，防止请求过快被封喵~
  if (targetUrl.includes('jizai22.com')) {
    const searchDelay = Math.random() * 300 + 200; // 0.2s - 0.5s，稍微快一点喵~
    await new Promise(resolve => setTimeout(resolve, searchDelay));
  }

  let lastError: any;

  for (const proxyFn of PROXY_LIST) {
    try {
      const proxyUrl = proxyFn(targetUrl);
      const isWanbenge = targetUrl.includes('jizai22.com') || proxyUrl.includes('/proxy/wanbenge');
      
      // Use dynamic referer based on targetUrl
      let referer = WANBENGE_URL;
      try {
        const urlObj = new URL(targetUrl);
        referer = `${urlObj.protocol}//${urlObj.host}/`;
      } catch (e) {
        // Fallback to WANBENGE_URL
      }

      const headers: any = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Referer': referer,
        ...(options?.headers || {})
      };

      // 为 fetch 添加超时控制喵~
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6秒超时，加速失败切换喵~

      try {
        console.log(`[Proxy] Trying ${proxyFn.name || 'proxy'}: ${proxyUrl} for ${targetUrl}喵~`);
        const response = await fetch(proxyUrl, {
          ...options,
          headers,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(`[Proxy] ${proxyUrl} returned HTTP ${response.status} (${response.statusText})喵~`);
          throw new Error(`HTTP ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        console.log(`[Proxy] Successfully fetched ${buffer.byteLength} bytes from ${proxyUrl} (Target: ${targetUrl})喵~`);
        
        // 增加对空内容的检查喵
         if (buffer.byteLength < 10) {
           console.warn(`[Proxy] Received empty or very small response from ${proxyUrl}喵~`);
           throw new Error("Empty response");
         }

         // TextDecoder might not support 'gbk' in all browsers, 'gb18030' is a safer superset
         const decoder = new TextDecoder(encoding === 'gbk' ? 'gb18030' : encoding);
         return decoder.decode(buffer);
       } catch (e) {
        clearTimeout(timeoutId);
        throw e;
      }
    } catch (e) {
      lastError = e;
      console.warn(`Proxy failed for ${targetUrl}:`, e);
      // 如果失败了，稍微等一下再试下一个代理喵~ 减少等待时间
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  throw lastError || new Error("All proxies failed");
};

// Helper to fetch blob (for download)
export const fetchBlob = async (url: string): Promise<Blob> => {
  const targetUrl = url.startsWith('http') ? url : `${WANBENGE_URL}${url.startsWith('/') ? '' : '/'}${url}`;

  try {
    const response = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': new URL(targetUrl).origin + '/',
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.blob();
  } catch (e) {
    console.error(`Blob fetch failed`, e);
    throw new Error("Download failed");
  }
};

const isUrl = (str: string) => {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
};

const wanbengeProvider: SourceProvider = {
  key: 'wanbenge',
  name: '完本阁',
  baseUrl: WANBENGE_URL,
  search: async (keyword: string): Promise<Novel[]> => {
    console.log(`[Wanbenge] Searching for: ${keyword}喵~`);
    let novels: Novel[] = [];
    
    // Helper to parse results from HTML
    const parseWanbengeHTML = (html: string, kw: string): Novel[] => {
      const doc = parseHTML(html);
      const results: Novel[] = [];
      const kwLower = kw.toLowerCase();
      
      // Detection if we are on homepage or irrelevant page
      const pageTitle = (doc.querySelector('title')?.textContent || "").toLowerCase();
      const isHomepage = pageTitle === '完本阁' || pageTitle.includes('首页') || (!pageTitle.includes(kwLower) && !doc.querySelector('.booklist') && !doc.querySelector('#bookIntro') && !html.includes('搜索“'));
      
      if (isHomepage) return [];

      // 1. Direct Detail Page (Redirected)
      const titleEl = doc.querySelector('h1.bookTitle') || doc.querySelector('.booktitle') || doc.querySelector('h1');
      const isDetailPage = doc.querySelector('.booklist') || doc.querySelector('#bookIntro') || doc.querySelector('dd.read');
      if (titleEl && isDetailPage) {
          const title = titleEl.textContent?.trim() || "未知";
          if (title.toLowerCase().includes(kwLower)) {
              const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
              const detailUrl = canonical || "";
              
              results.push({
                id: detailUrl || title,
                title: title,
                author: doc.querySelector('.booktag a[title^="作者："]')?.textContent?.trim() || 
                        doc.querySelector('.author')?.textContent?.trim() || "未知",
                description: doc.querySelector('#bookIntro')?.textContent?.trim() || 
                             doc.querySelector('.bookintro')?.textContent?.trim() || "",
                coverUrl: doc.querySelector('.img-thumbnail')?.getAttribute('src') || 
                          doc.querySelector('.bookimg img')?.getAttribute('src') || "",
                tags: [],
                status: 'Unknown',
                detailUrl: detailUrl,
                chapters: [],
                sourceName: '完本阁'
              });
              return results;
          }
      }

      // 2. mySearch structure (List view) - often used on mobile
      const ulItems = doc.querySelectorAll('.mySearch ul');
      if (ulItems.length > 0) {
        ulItems.forEach((ul) => {
          const titleLink = ul.querySelector('li:nth-child(1) a');
          const authorText = ul.querySelector('li:nth-child(3)')?.textContent?.replace('作者：', '').trim();
          if (titleLink) {
            const title = titleLink.textContent?.trim() || "未知";
            if (title.toLowerCase().includes(kwLower) || (authorText && authorText.toLowerCase().includes(kwLower))) {
              const relativeUrl = titleLink.getAttribute('href') || "";
              results.push({
                id: relativeUrl,
                title: title,
                author: authorText || "未知",
                description: "",
                coverUrl: "",
                tags: [],
                status: 'Unknown',
                detailUrl: relativeUrl.startsWith('http') ? relativeUrl : `${WANBENGE_URL}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`,
                chapters: [],
                sourceName: '完本阁'
              });
            }
          }
        });
      }

      // 3. Search Results Table / List (More specific selectors to avoid sidebar/recommendations)
      // Focus on the main content area
      const mainContent = doc.querySelector('.main, #content, .booklist, .mySearch') || doc;
      const listItems = mainContent.querySelectorAll('tr, .bookbox, .item, .book-item');
      
      if (listItems.length === 0 && !isHomepage) {
          // Fallback: search for links in the main content area
          const links = mainContent.querySelectorAll('a[href*="/info/"], a[href*="/book/"]');
          links.forEach(link => {
              const title = link.textContent?.trim() || '';
              if (title && title.toLowerCase().includes(kwLower)) {
                  const relativeUrl = link.getAttribute('href') || '';
                  const detailUrl = relativeUrl.startsWith('http') ? relativeUrl : `${WANBENGE_URL}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`;
                  
                  if (!results.some(r => r.detailUrl === detailUrl)) {
                      results.push({
                          id: detailUrl,
                          title: title,
                          detailUrl: detailUrl,
                          author: '未知',
                          coverUrl: '',
                          description: '',
                          tags: [],
                          status: 'Unknown',
                          chapters: [],
                          sourceName: '完本阁'
                      });
                  }
              }
          });
      } else {
          listItems.forEach(el => {
              // Avoid sidebar items by checking if the element is inside a sidebar
              if (el.closest('.sidebar, .side, #sidebar, .right')) return;

              const link = el.querySelector('a[href*="/info/"], a[href*="/book/"]') as HTMLAnchorElement;
              if (link) {
                  const title = link.textContent?.trim() || '';
                  const author = el.querySelector('.author, .s4, .item-author, td:nth-child(3)')?.textContent?.trim() || '未知';
                  
                  // Strict filtering for search results
                  if (title.toLowerCase().includes(kwLower) || author.toLowerCase().includes(kwLower)) {
                      const relativeUrl = link.getAttribute('href') || '';
                      const detailUrl = relativeUrl.startsWith('http') ? relativeUrl : `${WANBENGE_URL}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`;
                      
                      if (!results.some(r => r.detailUrl === detailUrl)) {
                          const imgEl = el.querySelector('img');
                          const coverSrc = imgEl?.getAttribute('src') || '';
                          const coverUrl = coverSrc ? (coverSrc.startsWith('http') ? coverSrc : `${WANBENGE_URL}${coverSrc.startsWith('/') ? '' : '/'}${coverSrc}`) : '';
                          
                          results.push({
                              id: detailUrl,
                              title: title,
                              detailUrl: detailUrl,
                              author: author,
                              coverUrl: coverUrl,
                              description: el.querySelector('.intro, .item-desc')?.textContent?.trim() || '',
                              tags: [],
                              status: 'Unknown',
                              chapters: [],
                              sourceName: '完本阁'
                          });
                      }
                  }
              }
          });
      }

      return results;
    };

    // Try GET search
    try {
      const getUrl = `/api/gbk-search?target=${encodeURIComponent(`${WANBENGE_URL}/modules/article/search.php?searchkey={keyword}`)}&keyword=${encodeURIComponent(keyword)}&method=GET`;
      const getHtml = await fetchText(getUrl, undefined, 'gb18030');
      novels = parseWanbengeHTML(getHtml, keyword);
    } catch (e) {
      console.warn("[Wanbenge] GET search failed", e);
    }

    // Try POST search if GET failed
    if (novels.length === 0) {
      try {
        const postTarget = `${WANBENGE_URL}/modules/article/search.php`;
        const postData = `searchkey={keyword}&action=login&submit=%CB%D1++%CB%F7`;
        const postUrl = `/api/gbk-search?target=${encodeURIComponent(postTarget)}&keyword=${encodeURIComponent(keyword)}&method=POST&data=${encodeURIComponent(postData)}`;
        const postHtml = await fetchText(postUrl, undefined, 'gb18030');
        novels = parseWanbengeHTML(postHtml, keyword);
      } catch (e) {
        console.warn("[Wanbenge] POST search failed", e);
      }
    }

    // Fallback to browser search
    if (novels.length === 0) {
        try {
            const browserSearchUrl = `/api/browser-search?site=wanbenge&keyword=${encodeURIComponent(keyword)}`;
            const response = await fetch(browserSearchUrl);
            const data = await response.json();
            if (data.success && data.results) {
                novels = data.results.map((item: any) => ({
                    id: item.detailUrl,
                    title: item.title,
                    author: item.author || '未知',
                    coverUrl: item.coverUrl || '',
                    description: item.description || '',
                    tags: [],
                    status: 'Unknown',
                    chapters: [],
                    sourceName: '完本阁',
                    detailUrl: item.detailUrl
                }));
            }
        } catch (e) {
            console.warn("Wanbenge browser search fallback failed", e);
        }
    }

    // Final filtering to ensure relevance
    return novels.filter(n => isRelevant(n.title, n.author, keyword));
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    const html = await fetchText(novel.detailUrl, undefined, 'gb18030');
    const doc = parseHTML(html);

    // Update Metadata
    const introP = doc.querySelector('.bookintro') || doc.querySelector('#bookIntro');
    if (introP) {
      // remove imgs and thumbnail
      introP.querySelectorAll('img').forEach(img => img.remove());
      novel.description = introP.textContent?.trim() || novel.description;
    }

    // Attempt to find cover if missing or invalid
    if (!novel.coverUrl || novel.coverUrl.includes('nocover')) {
       const img = doc.querySelector('.bookimg img, .pic img, .book-img img, .thumbnail, .img-thumbnail');
       if (img) {
         let src = img.getAttribute('src');
         if (src && !src.includes('nocover')) {
            if (!src.startsWith('http')) {
                src = `${WANBENGE_URL}${src.startsWith('/') ? '' : '/'}${src}`;
            }
            novel.coverUrl = src;
         }
       }
    }

    const titleEl = doc.querySelector('.booktitle') || doc.querySelector('h1');
    if (titleEl) novel.title = titleEl.textContent?.trim() || novel.title;

    const authorEl = doc.querySelector('.booktag a.red') || doc.querySelector('.author');
    if (authorEl) novel.author = authorEl.textContent?.trim() || novel.author;

    const statusSpan = Array.from(doc.querySelectorAll('.booktag .red, .booktag .blue')).find(s => s.textContent?.includes('连载') || s.textContent?.includes('完结') || s.textContent?.includes('连载中'));
    if (statusSpan) {
      if (statusSpan.textContent?.includes('完结')) novel.status = 'Completed';
      else novel.status = 'Serializing';
    }

    // Cover extraction handled above


    const chapterItems = doc.querySelectorAll('#list-chapterAll dd a');
    const chapters: Chapter[] = [];
    const seenUrls = new Set<string>();

    chapterItems.forEach((a, index) => {
      const href = a.getAttribute('href');
      const title = a.textContent?.trim() || `第${index + 1}章`;

      // Skip invalid URLs
      if (!href || href.trim() === '' || href.startsWith('javascript:') || href === '#') {
        return;
      }

      // Handle relative URLs
      const fullUrl = href.startsWith('http') ? href : (href.startsWith('/') ? `${WANBENGE_URL}${href}` : `${novel.detailUrl}${href}`);
      
      const normalizedUrl = new URL(fullUrl).pathname;
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        chapters.push({
          number: chapters.length + 1,
          title: title,
          url: fullUrl,
          content: undefined
        });
      }
    });

    if (chapters.length === 0) throw new Error("未找到任何章节");

    return { ...novel, chapters };
  },
  getChapterContent: async (chapter: Chapter): Promise<string> => {
    const html = await fetchText(chapter.url, undefined, 'gb18030');
    const doc = parseHTML(html);
    // 完本阁常见的内容容器 ID 喵~
    const cDiv = doc.querySelector('#content') || 
                 doc.querySelector('#rtext') || 
                 doc.querySelector('.content') || 
                 doc.querySelector('.showtxt') ||
                 doc.querySelector('#bookText');
    
    if (!cDiv) {
        console.error(`[Wanbenge] Content not found for ${chapter.url}. Page title: ${doc.querySelector('title')?.textContent}`);
        throw new Error("Content div not found");
    }

    cDiv.querySelectorAll('p.text-center, a, script, div[style*="display:none"]').forEach(el => el.remove());
    
    // 统一处理所有换行和 HTML 实体喵~
    let text = cDiv.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    
    // 使用单个临时 div 处理所有剩余的 HTML 标签喵~
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    const cleanText = tempDiv.textContent || "";
    
    const lines = cleanText.split('\n');
    const finalLines = lines
      .map(l => l.trim())
      .filter(l => {
        if (l.length === 0) return false;
        
        // 过滤掉导航词和垃圾信息喵~
        const junkKeywords = [
          'jizai', '投票推荐', '加入书签', 'search', '完本阁', 'www.', 
          '目录', '上一页', '下一页', '尾页', '首页', 'Top', '返回目录',
          '获取失败', '第阅读记录页', '推荐本书', '举报错误'
        ];
        
        // 如果行很短且包含导航词，或者是纯导航词行喵~
        if (l.length < 20) {
          const navTerms = ['目录', '上一页', '下一页', '尾页', '首页', 'Top', '阅读记录'];
          if (navTerms.some(term => l === term || l.includes(` ${term} `) || l.startsWith(`${term} `) || l.endsWith(` ${term}`))) {
            return false;
          }
          // 检查是否是一串导航词喵~
          const words = l.split(/\s+/);
          if (words.length > 1 && words.every(w => navTerms.includes(w) || /^[0-9\-\/]+$/.test(w))) {
            return false;
          }
        }

        return !junkKeywords.some(kw => l.includes(kw));
      });

    return finalLines.join('\n\n');
  }
}

const localProvider: SourceProvider = {
  key: 'local',
  name: '本地书库',
  baseUrl: '',
  search: async (keyword: string): Promise<Novel[]> => {
    try {
      const response = await fetch(`/api/list-downloads?keyword=${encodeURIComponent(keyword)}`);
      if (!response.ok) return [];
      const files: any[] = await response.json();

      const matched = files.filter(f => f.title.includes(keyword));

      return matched.map(f => ({
        id: f.filename,
        title: f.title,
        author: f.author || "本地下载",
        description: f.description || `已下载文件 | 大小: ${(f.size / 1024 / 1024).toFixed(2)} MB`,
        coverUrl: f.coverUrl || "",
        tags: ["本地"],
        status: 'Completed',
        detailUrl: f.url,
        chapters: f.chapters || [],
        sourceName: '本地书库'
      }));
    } catch (e) {
      console.warn("Local search failed", e);
      return [];
    }
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    return novel;
  },
  getChapterContent: async (chapter: Chapter): Promise<string> => {
    const html = await fetchText(chapter.url);
    const doc = parseHTML(html);
    const cDiv = doc.querySelector('#content, .chapter-content, .novel-content');
    if (!cDiv) throw new Error("Content not found");

    let text = cDiv.innerHTML;
    // Clean specific ads
    const ads = [
      "(http://www.shuwuwan.com/book/F72W-1.html)",
      "章节错误,点此举报(免注册)",
      "请记住本书首发域名：http://www.shuwuwan.com",
      "www.shuwuwan.com",
      "shuwuwan.com",
      "书屋湾",
      "首发域名"
    ];
    ads.forEach(ad => {
      text = text.split(ad).join('');
    });

    // Remove URLs
    text = text.replace(/https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/g, '');
    // Remove brackets
    text = text.replace(/\([^)]*\)|（[^）]*）|【[^】]*】|\[[^\]]*\]|「[^」]*」|『[^』]*』/g, '');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    tempDiv.querySelectorAll('script, div, a').forEach(el => el.remove());
    
    let content = tempDiv.innerHTML.replace(/<br\s*\/?>/gi, '\n');
    const finalDiv = document.createElement('div');
    finalDiv.innerHTML = content;
    return finalDiv.textContent?.trim() || "";
  }
};

/**
 * 为没有封面的小说生成一张漂亮的蓝粉渐变封面喵~
 */
export const generatePlaceholderCover = (title: string, author: string): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 绘制蓝粉渐变背景
  const gradient = ctx.createLinearGradient(0, 0, 300, 400);
  gradient.addColorStop(0, '#ff9ece'); // 猫娘粉
  gradient.addColorStop(1, '#82c3f9'); // 猫娘蓝
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 300, 400);

  // 绘制装饰性小猫爪或边框 (可选，这里先画个简约边框)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 10;
  ctx.strokeRect(15, 15, 270, 370);

  // 绘制标题
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 10;
  
  // 标题自动换行处理
  ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  const words = title.split('');
  let line = '';
  let y = 150;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > 220 && n > 0) {
      ctx.fillText(line, 150, y);
      line = words[n];
      y += 40;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 150, y);

  // 绘制作者
  ctx.font = '18px "Microsoft YaHei", sans-serif';
  ctx.fillText(author === '未知' ? '佚名' : author, 150, y + 60);

  // 底部加个可爱的标记
  ctx.font = '14px "Microsoft YaHei", sans-serif';
  ctx.fillText('InkStream 喵~', 150, 370);

  return canvas.toDataURL('image/png');
};

/**
 * 尝试从其他书源获取封面喵~
 */
export const fetchCoverFromOtherSources = async (novel: Novel): Promise<string | null> => {
  console.log(`[Cover] 正在为《${novel.title}》尝试从其他源抓取封面喵~`);
  // 排除掉已经确认为空的本地书库
  const otherProviders = PROVIDERS.filter(p => p.key !== 'local');
  
  // 并发搜索，提高效率喵~
  const searchPromises = otherProviders.map(async (provider) => {
    try {
      const results = await provider.search(novel.title);
      const match = results.find(n => n.title === novel.title && 
        (n.author.includes(novel.author) || novel.author.includes(n.author) || n.author === '未知' || novel.author === '未知'));
      if (match && match.coverUrl && !match.coverUrl.includes('nocover')) {
        return match.coverUrl;
      }
    } catch (e) {
      // 忽略单个源失败
    }
    return null;
  });

  const results = await Promise.all(searchPromises);
  let foundCover = results.find(url => url !== null);
  
  // 如果其他书源都没找到，动用浏览器搜索绝招喵~
  if (!foundCover) {
    foundCover = await fetchCoverFromBrowser(novel.title, novel.author);
  }
  
  if (foundCover) {
    // console.log(`[Cover] 找到了封面喵！URL: ${foundCover}`);
  }
  return foundCover;
};

/**
 * 最后的绝招：去浏览器（豆瓣/百度）搜寻封面喵~
 */
export const fetchCoverFromBrowser = async (title: string, author: string): Promise<string | null> => {
  try {
    console.log(`[Cover] 正在通过浏览器为《${title}》寻找封面喵~`);
    const response = await fetch(`/api/browser-cover?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`);
    const data = await response.json();
    if (data.success && data.coverUrl) {
      return data.coverUrl;
    }
  } catch (e) {
    console.warn("[Cover] Browser cover search failed喵~", e);
  }
  return null;
};

const yedujiProvider: SourceProvider = {
  key: 'yeduji',
  name: '夜读集',
  baseUrl: YEDUJI_URL,
  search: async (keyword: string): Promise<Novel[]> => {
    console.log(`[Yeduji] Searching for: ${keyword}喵~`);
    const searchUrl = `${YEDUJI_URL}/search/?q=${encodeURIComponent(keyword)}`;
    const html = await fetchText(searchUrl);
    console.log(`[Yeduji] HTML length: ${html.length}喵~`);
    if (html.length < 500) {
      console.log(`[Yeduji] HTML sample: ${html}喵~`);
    }
    const doc = parseHTML(html);
    const results: Novel[] = [];
    
    // 搜索结果在 .novel-item 容器中
    const items = doc.querySelectorAll('.novel-item');
    
    items.forEach(item => {
      const titleEl = item.querySelector('.title') || item.querySelector('a[href*="/book/"]');
      const title = titleEl?.textContent?.trim() || "";
      const href = titleEl?.getAttribute('href');
      
      if (!title || !href) return;
      
      const detailUrl = href.startsWith('http') ? href : `${YEDUJI_URL}${href}`;
      const author = item.querySelector('.author')?.textContent?.trim() || "未知";
      const description = item.querySelector('.desc')?.textContent?.trim() || "";
      const coverImg = item.querySelector('.cover img');
      let coverUrl = coverImg?.getAttribute('data-src') || coverImg?.getAttribute('src') || "";
      
      if (coverUrl && !coverUrl.startsWith('http')) {
        coverUrl = `${YEDUJI_URL}${coverUrl}`;
      }

      results.push({
        id: detailUrl,
        title: title,
        author: author,
        description: description,
        coverUrl: coverUrl,
        tags: [],
        status: 'Unknown',
        detailUrl: detailUrl,
        chapters: [],
        sourceName: '夜读集'
      });
    });

    console.log(`[Yeduji] Found ${results.length} items on page喵~`);
    return results;
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    console.log(`[Yeduji] Getting details for: ${novel.title} from ${novel.detailUrl}喵~`);
    const html = await fetchText(novel.detailUrl);
    console.log(`[Yeduji] Detail HTML length: ${html.length}喵~`);
    const doc = parseHTML(html);

    // 提取封面
    const coverImg = doc.querySelector('main img[src*="/data/cover/"]') || doc.querySelector('main img');
    if (coverImg) {
      const src = coverImg.getAttribute('src');
      novel.coverUrl = src?.startsWith('http') ? src : `${YEDUJI_URL}${src}`;
    }

    // 提取作者
    const authorLabel = Array.from(doc.querySelectorAll('main span, main div')).find(el => el.textContent?.includes('作者'));
    if (authorLabel) {
      const authorValue = authorLabel.nextElementSibling;
      novel.author = authorValue?.textContent?.trim() || novel.author;
    }

    // 提取状态
    const statusLabel = Array.from(doc.querySelectorAll('main span, main div')).find(el => el.textContent?.includes('状态'));
    if (statusLabel) {
      const statusValue = statusLabel.nextElementSibling;
      const statusText = statusValue?.textContent?.trim() || "";
      novel.status = statusText.includes('完结') ? 'Completed' : 'Serializing';
    }

    // 提取简介
    const descEl = doc.querySelector('main p') || doc.querySelector('.desc');
    if (descEl) {
      novel.description = descEl.textContent?.trim() || novel.description;
    }

    // 获取章节列表
    const listUrl = novel.detailUrl.endsWith('/') ? `${novel.detailUrl}list/` : `${novel.detailUrl}/list/`;
    console.log(`[Yeduji] Fetching chapter list from: ${listUrl}喵~`);
    const listHtml = await fetchText(listUrl);
    console.log(`[Yeduji] Chapter list HTML length: ${listHtml.length}喵~`);
    console.log(`[Yeduji] Chapter list HTML start: ${listHtml.substring(0, 500)}喵~`);
    const listDoc = parseHTML(listHtml);
    
    const chapters: Chapter[] = [];
    // 夜读集的列表页通常是 <ul><li><a href="..."><h4>标题</h4></a></li></ul>
    // 或者直接是 a 标签
    const chapterLinks = Array.from(listDoc.querySelectorAll('a[href*=".html"]'))
        .filter(a => {
            const href = a.getAttribute('href') || '';
            // 排除掉一些非章节链接，比如分类、首页等
            return !href.includes('/category/') && !href.includes('/list/') && !href.includes('/book/') || href.split('/').length > 3;
        });
    
    console.log(`[Yeduji] Found ${chapterLinks.length} filtered links in list page喵~`);
    
    chapterLinks.forEach((a, index) => {
      const href = a.getAttribute('href');
      if (!href) return;
      
      const fullUrl = href.startsWith('http') ? href : `${YEDUJI_URL}${href}`;
      const title = a.querySelector('h4')?.textContent?.trim() || 
                    a.querySelector('span')?.textContent?.trim() ||
                    a.textContent?.replace('免费', '').replace('VIP', '').trim() || 
                    `第${index + 1}章`;
      
      // 避免重复链接
      if (!chapters.find(c => c.url === fullUrl)) {
          chapters.push({
            number: chapters.length + 1,
            title: title,
            url: fullUrl
          });
      }
    });

    if (chapters.length === 0) {
        console.log(`[Yeduji] No chapters in list page, trying detail page fallback喵~`);
        // Try detail page as fallback for chapters
        const detailChapterLinks = doc.querySelectorAll('main a[href*=".html"]');
        console.log(`[Yeduji] Found ${detailChapterLinks.length} links in detail page喵~`);
        detailChapterLinks.forEach((a, index) => {
             const href = a.getAttribute('href');
             if (!href || href.includes('list/')) return;
             const fullUrl = href.startsWith('http') ? href : `${YEDUJI_URL}${href}`;
             const title = a.querySelector('h4')?.textContent?.trim() || a.textContent?.replace('免费', '').replace('VIP', '').trim() || `第${index + 1}章`;
             if (!chapters.find(c => c.url === fullUrl)) {
                 chapters.push({
                     number: chapters.length + 1,
                     title: title,
                     url: fullUrl
                 });
             }
        });
    }

    console.log(`[Yeduji] Total chapters found: ${chapters.length}喵~`);
    if (chapters.length === 0) throw new Error("未找到章节列表喵~");

    return { ...novel, chapters };
  },
  getChapterContent: async (chapter: Chapter): Promise<string> => {
    console.log(`[Yeduji] Getting content for: ${chapter.title}喵~`);
    const html = await fetchText(chapter.url);
    const doc = parseHTML(html);
    
    // 内容通常在 article 或特定的 div 中
    const contentEl = doc.querySelector('article') || doc.querySelector('.content') || doc.querySelector('#content');
    if (!contentEl) throw new Error("未找到章节内容喵~");

    // 移除不必要的元素
    contentEl.querySelectorAll('script, style, ins, .ads, .breadcrumb').forEach(el => el.remove());

    let text = contentEl.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    
    const cleanText = tempDiv.textContent || "";
    const lines = cleanText.split('\n');
    
    const finalLines = lines
      .map(line => line.trim())
      .filter(l => {
        if (l.length === 0) return false;
        
        const junkKeywords = [
          '夜读集', 'www.', '目录', '上一页', '下一页', '尾页', '首页', 
          'Top', '返回目录', '获取失败', '第阅读记录页', '推荐本书', '举报错误'
        ];
        
        if (l.length < 20) {
          const navTerms = ['目录', '上一页', '下一页', '尾页', '首页', 'Top', '阅读记录'];
          if (navTerms.some(term => l === term || l.includes(` ${term} `) || l.startsWith(`${term} `) || l.endsWith(` ${term}`))) {
            return false;
          }
          const words = l.split(/\s+/);
          if (words.length > 1 && words.every(w => navTerms.includes(w) || /^[0-9\-\/]+$/.test(w))) {
            return false;
          }
        }
        
        return !junkKeywords.some(kw => l.includes(kw));
      });

    return finalLines.join('\n\n');
  }
};

const shukugeProvider: SourceProvider = {
  key: 'shukuge',
  name: '书库阁',
  baseUrl: SHUKUGE_URL,
  search: async (keyword: string): Promise<Novel[]> => {
    console.log(`[Shukuge] Searching for: ${keyword}喵~`);
    const searchUrl = `${SHUKUGE_URL}/Search?wd=${encodeURIComponent(keyword)}`;
    const html = await fetchText(searchUrl);
    const doc = parseHTML(html);
    const results: Novel[] = [];
    
    // 搜索结果通常在 .listitem 标签中
    const items = doc.querySelectorAll('.listitem');
    
    items.forEach(item => {
      const titleEl = item.querySelector('h2 a') as HTMLAnchorElement;
      if (!titleEl) return;
      
      const title = titleEl.textContent?.trim() || "";
      const href = titleEl.getAttribute('href') || "";
      const authorMatch = item.querySelector('.bookdesc')?.textContent?.match(/作者：(.*?)(?=\s|分类|$)/);
      const author = authorMatch ? authorMatch[1].trim() : "未知";
      
      const imgEl = item.querySelector('img');
      let coverUrl = imgEl?.getAttribute('src') || "";
      if (coverUrl && !coverUrl.startsWith('http')) {
        coverUrl = `${SHUKUGE_URL}${coverUrl}`;
      }
      
      if (isRelevant(title, author, keyword)) {
        results.push({
          id: href,
          title,
          author,
          coverUrl,
          description: item.querySelector('.bookdesc')?.textContent?.split('简介：')[1]?.trim() || "",
          tags: [],
          status: 'Unknown',
          detailUrl: href.startsWith('http') ? href : `${SHUKUGE_URL}${href}`,
          chapters: [],
          sourceName: '书库阁'
        });
      }
    });
    
    // 如果常规解析没结果，尝试从链接里直接找
    if (results.length === 0) {
      const links = doc.querySelectorAll('a[href*="/book/"]');
      links.forEach(link => {
        const title = link.textContent?.trim() || "";
        if (title && isRelevant(title, "未知", keyword)) {
          const href = link.getAttribute('href') || "";
          const detailUrl = href.startsWith('http') ? href : `${SHUKUGE_URL}${href}`;
          if (!results.some(r => r.detailUrl === detailUrl)) {
            results.push({
              id: href,
              title,
              author: "未知",
              coverUrl: "",
              description: "",
              tags: [],
              status: 'Unknown',
              detailUrl,
              chapters: [],
              sourceName: '书库阁'
            });
          }
        }
      });
    }
    
    return results;
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    // 书库阁的元数据通常在 /book/id/，而目录在 /book/id/index.html
    const detailUrl = novel.detailUrl.endsWith('index.html') ? novel.detailUrl.replace('index.html', '') : 
                     (novel.detailUrl.endsWith('/') ? novel.detailUrl : `${novel.detailUrl}/`);
    const indexUrl = `${detailUrl}index.html`;
    
    console.log(`[Shukuge] Fetching metadata from: ${detailUrl}喵~`);
    const detailHtml = await fetchText(detailUrl);
    const detailDoc = parseHTML(detailHtml);
    
    // 提取元数据
    const titleEl = detailDoc.querySelector('h1');
    if (titleEl) novel.title = titleEl.textContent?.trim() || novel.title;
    
    const authorEl = Array.from(detailDoc.querySelectorAll('p, span, a')).find(el => el.textContent?.includes('作者：'));
    if (authorEl) {
      novel.author = authorEl.textContent?.replace('作者：', '').trim() || novel.author;
    } else {
      const authorLink = detailDoc.querySelector('a[href*="/zuozhe/"]');
      if (authorLink) novel.author = authorLink.textContent?.trim() || novel.author;
    }

    // 提取封面
    const coverImg = detailDoc.querySelector('.bookdcover img') || detailDoc.querySelector('img[alt="' + novel.title + '"]');
    if (coverImg) {
      const src = coverImg.getAttribute('src');
      if (src) {
        novel.coverUrl = src.startsWith('http') ? src : `${SHUKUGE_URL}${src}`;
      }
    }

    // 提取简介
    const descEl = detailDoc.querySelector('.bookintro') || detailDoc.querySelector('.intro') || 
                   Array.from(detailDoc.querySelectorAll('p')).find(p => p.textContent?.length > 50);
    if (descEl) novel.description = descEl.textContent?.trim() || novel.description;

    console.log(`[Shukuge] Fetching chapters from: ${indexUrl}喵~`);
    const html = await fetchText(indexUrl);
    const doc = parseHTML(html);
    const chapters: Chapter[] = [];
    
    // 提取章节
    const links = doc.querySelectorAll('a[href*=".html"]');
    const seenUrls = new Set<string>();
    
    links.forEach(link => {
      const href = link.getAttribute('href') || "";
      const title = link.textContent?.trim() || "";
      
      // 过滤掉非章节链接
      if (href && !href.startsWith('http') && 
          title && !['首页', '上一页', '下一页', '末页', '加入书签', '投推荐票', '章节目录', 'TXT下载'].includes(title)) {
        
        try {
          const fullUrl = new URL(href, indexUrl).href;
          if (!seenUrls.has(fullUrl) && fullUrl.endsWith('.html') && !fullUrl.endsWith('index.html')) {
            seenUrls.add(fullUrl);
            chapters.push({
              number: chapters.length + 1,
              title,
              url: fullUrl
            });
          }
        } catch (e) {
          // 忽略无效链接
        }
      }
    });
    
    if (chapters.length === 0) throw new Error("未找到章节列表喵~");
    
    return { ...novel, chapters };
  },
  getChapterContent: async (chapter: Chapter): Promise<string> => {
    const html = await fetchText(chapter.url);
    const doc = parseHTML(html);
    const contentEl = doc.querySelector('#content');
    if (!contentEl) throw new Error("未找到章节内容喵~");
    
    // 清理广告
    contentEl.querySelectorAll('script, a, div[style*="display:none"]').forEach(el => el.remove());
    
    let text = contentEl.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
      
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    
    const cleanText = tempDiv.textContent || "";
    const lines = cleanText.split('\n');
    
    const finalLines = lines
      .map(line => line.trim())
      .filter(l => {
        if (l.length === 0) return false;
        
        const junkKeywords = [
          '书库阁', 'www.', '目录', '上一页', '下一页', '尾页', '首页', 
          'Top', '返回目录', '获取失败', '第阅读记录页', '推荐本书', '举报错误'
        ];
        
        if (l.length < 20) {
          const navTerms = ['目录', '上一页', '下一页', '尾页', '首页', 'Top', '阅读记录'];
          if (navTerms.some(term => l === term || l.includes(` ${term} `) || l.startsWith(`${term} `) || l.endsWith(` ${term}`))) {
            return false;
          }
          const words = l.split(/\s+/);
          if (words.length > 1 && words.every(w => navTerms.includes(w) || /^[0-9\-\/]+$/.test(w))) {
            return false;
          }
        }
        
        return !junkKeywords.some(kw => l.includes(kw));
      });

    return finalLines.join('\n\n');
  }
};

const dingdianProvider: SourceProvider = {
  key: 'dingdian',
  name: '顶点小说网',
  baseUrl: DINGDIAN_URL,
  search: async (keyword: string): Promise<Novel[]> => {
    console.log(`[Dingdian] Searching for: ${keyword}喵~`);
    
    // 检查缓存喵~
    const cacheKey = `dingdian:${keyword.toLowerCase().trim()}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[Dingdian] Using cached results for: ${keyword}喵~`);
      return cached.results;
    }
    
    let finalResults: Novel[] = [];
    
    // 方案1: 优先尝试直接HTTP搜索（更快喵~）
    try {
      const directResults = await directDingdianSearch(keyword);
      if (directResults.length > 0) {
        console.log(`[Dingdian] Direct search found ${directResults.length} results喵~`);
        finalResults = directResults;
      }
    } catch (directError) {
      console.warn("[Dingdian] Direct search failed, falling back to browser喵~", directError);
    }
    
    // 方案2: 如果直接搜索没结果，使用浏览器搜索作为备选
    if (finalResults.length === 0) {
      try {
        const browserSearchUrl = `/api/browser-search?site=dingdian&keyword=${encodeURIComponent(keyword)}`;
        const response = await fetch(browserSearchUrl, { 
          signal: AbortSignal.timeout(30000) // 30秒超时喵
        });
        const data = await response.json();
        
        if (data.success && data.results) {
          finalResults = data.results.map((item: any) => ({
            id: item.detailUrl,
            title: item.title,
            author: item.author || '未知',
            coverUrl: item.coverUrl || '',
            description: item.description || '',
            tags: [],
            status: 'Unknown',
            chapters: [],
            sourceName: '顶点小说网',
            detailUrl: item.detailUrl
          }));
        }
      } catch (e) {
        console.warn("Dingdian browser search also failed喵~", e);
      }
    }
    
    // 更新缓存喵~
    if (finalResults.length > 0) {
      searchCache.set(cacheKey, {
        results: finalResults,
        timestamp: Date.now()
      });
      
      // 清理过期缓存（避免内存泄漏喵~）
      cleanupSearchCache();
    }
    
    return finalResults;
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    console.log(`[Dingdian] Getting details for: ${novel.title}喵~`);
    
    let html = "";
    try {
      // 1. 尝试普通 fetch，探测编码
      html = await fetchText(novel.detailUrl, undefined, 'utf-8');
      
      // 检查是否需要切换到 GBK 喵~
      if (html.includes("charset=gb") || html.includes("charset=\"gb") || html.includes('琚')) {
        console.log("[Dingdian] Detecting GBK encoding, retrying...喵~");
        html = await fetchText(novel.detailUrl, undefined, 'gb18030');
      }
      
      // 如果内容太短或没找到关键列表，说明可能被拦截了喵
      if (html.length < 500 || !html.includes("id=\"list\"")) {
        throw new Error("Content too short or missing list, maybe anti-scraping喵~");
      }
    } catch (e) {
      console.warn("[Dingdian] Direct fetch failed or blocked, trying browser fallback...喵~");
      try {
        const browserDetailsUrl = `/api/browser-details?url=${encodeURIComponent(novel.detailUrl)}`;
        const response = await fetch(browserDetailsUrl);
        const data = await response.json();
        if (data.success && data.html) {
          html = data.html;
        } else {
          throw new Error("Browser fallback failed喵~");
        }
      } catch (browserError) {
        console.error("[Dingdian] Both fetch and browser fallback failed喵~", browserError);
        throw new Error("无法获取小说详情喵~ 请检查网络或稍后再试喵~");
      }
    }

    const doc = parseHTML(html);
    
    // 提取简介喵
    const descEl = doc.querySelector('#intro') || doc.querySelector('.intro') || doc.querySelector('#description') || doc.querySelector('.book-intro');
    if (descEl) {
      novel.description = descEl.textContent?.trim() || novel.description;
    }
    
    // 提取封面喵
    const coverImg = doc.querySelector('#fmimg img') || doc.querySelector('.book-img img') || doc.querySelector('.image img') || doc.querySelector('.imgbox img');
    if (coverImg) {
      const src = coverImg.getAttribute('data-original') || coverImg.getAttribute('data-src') || coverImg.getAttribute('src');
      if (src) {
        novel.coverUrl = src.startsWith('http') ? src : new URL(src, novel.detailUrl).href;
      }
    }
    
    const chapters: Chapter[] = [];
    const seenUrls = new Set<string>();
    
    // 提取章节列表喵 - 增加过滤“最新章节”重复项的逻辑
    const listDl = doc.querySelector('#list dl');
    if (listDl) {
      const children = Array.from(listDl.children);
      const dtElements = children.filter(c => c.tagName === 'DT');
      const dtCount = dtElements.length;
      
      // 策略：如果有多个DT，通常最后一个DT才是真正的正文开始喵
      // 或者寻找包含“正文”、“目录”且不含“最新”的DT喵
      let startCollecting = dtCount <= 1; 
      let foundDirectoryDt = false;

      children.forEach((child) => {
        if (child.tagName === 'DT') {
          const text = child.textContent || '';
          // 排除包含“最新”的标题，寻找真正的目录开始喵
          if ((text.includes('正文') || text.includes('目录') || text.includes('章节')) && !text.includes('最新')) {
            startCollecting = true;
            foundDirectoryDt = true;
          }
        } else if (child.tagName === 'A' && startCollecting) {
          const a = child as HTMLAnchorElement;
          const href = a.getAttribute('href');
          const title = a.textContent?.trim() || `第${chapters.length + 1}章`;
          
          if (href && !href.startsWith('javascript:')) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, novel.detailUrl).href;
            if (!seenUrls.has(fullUrl) && (fullUrl.endsWith('.html') || fullUrl.includes('/du/'))) {
              seenUrls.add(fullUrl);
              chapters.push({
                number: chapters.length + 1,
                title,
                url: fullUrl
              });
            }
          }
        }
      });

      // 兜底逻辑：如果刚才因为条件太严苛没找到目录DT，但明明有DT，就从最后一个DT开始抓喵
      if (!foundDirectoryDt && dtCount > 1) {
        chapters.length = 0; // 清空可能误抓的内容喵
        seenUrls.clear();
        let passedLastDt = false;
        const lastDt = dtElements[dtElements.length - 1];
        
        children.forEach((child) => {
          if (child === lastDt) {
            passedLastDt = true;
          } else if (child.tagName === 'A' && passedLastDt) {
            const a = child as HTMLAnchorElement;
            const href = a.getAttribute('href');
            const title = a.textContent?.trim() || `第${chapters.length + 1}章`;
            if (href && !href.startsWith('javascript:')) {
              const fullUrl = href.startsWith('http') ? href : new URL(href, novel.detailUrl).href;
              if (!seenUrls.has(fullUrl) && (fullUrl.endsWith('.html') || fullUrl.includes('/du/'))) {
                seenUrls.add(fullUrl);
                chapters.push({
                  number: chapters.length + 1,
                  title,
                  url: fullUrl
                });
              }
            }
          }
        });
      }
    }

    // 如果上面那种方式没抓到（可能结构变了），用兜底方案喵
    if (chapters.length === 0) {
      const chapterLinks = doc.querySelectorAll('#list a, .chapter-list a, .section-list a, #chapterlist li a, .read-section-list a');
      chapterLinks.forEach((a, index) => {
        const href = a.getAttribute('href');
        const title = a.textContent?.trim() || `第${index + 1}章`;
        
        if (href && !href.startsWith('javascript:')) {
          const fullUrl = href.startsWith('http') ? href : new URL(href, novel.detailUrl).href;
          if (!seenUrls.has(fullUrl) && (fullUrl.endsWith('.html') || fullUrl.includes('/du/'))) {
            seenUrls.add(fullUrl);
            chapters.push({
              number: chapters.length + 1,
              title,
              url: fullUrl
            });
          }
        }
      });
    }
    
    if (chapters.length === 0) {
      throw new Error("未找到章节列表喵~ 可能是该站结构已改变喵~");
    }

    return { ...novel, chapters };
  },
  getChapterContent: async (chapter: Chapter): Promise<string> => {
    console.log(`[Dingdian] Getting content for: ${chapter.title}喵~`);
    
    const fetchPageContent = async (url: string) => {
      let html = "";
      try {
        // 尝试普通 fetch，探测编码喵
        html = await fetchText(url, undefined, 'utf-8');
        if (html.includes("charset=gb") || html.includes("charset=\"gb") || html.includes('琚')) {
          html = await fetchText(url, undefined, 'gb18030');
        }
        
        // 如果内容太短，可能是被拦截了喵
        if (html.length < 500 || !html.includes("id=\"content\"")) {
          throw new Error("Content too short, maybe blocked喵~");
        }
      } catch (e) {
        console.warn(`[Dingdian] fetchText failed for ${url}, trying browser fallback喵~`);
        try {
          const browserDetailsUrl = `/api/browser-details?url=${encodeURIComponent(url)}`;
          const response = await fetch(browserDetailsUrl);
          const data = await response.json();
          if (data.success) {
            html = data.html;
          }
        } catch (err) {
          console.error(`[Dingdian] Browser fallback failed for ${url}喵~`, err);
        }
      }

      if (!html) return { text: "", nextUrl: null };
      
      const doc = parseHTML(html);
      const contentEl = doc.querySelector('#content') || doc.querySelector('.content') || doc.querySelector('#chaptercontent') || doc.querySelector('.read-content');
      if (!contentEl) return { text: "", nextUrl: null };
      
      // 清理广告喵
      contentEl.querySelectorAll('script, style, ins, .ads, .breadcrumb, a, .read-author-say, #center_tip').forEach(el => el.remove());
      
      let text = contentEl.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/p>/gi, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
        
      const cleanText = text.replace(/<[^>]+>/g, '').trim();
      
      // 检查是否有下一页（分页章节）喵~
      let nextUrl = null;
      const nextLink = Array.from(doc.querySelectorAll('a')).find(a => 
        (a.textContent?.includes('下一页') || a.textContent?.includes('下一页继续阅读')) && 
        !a.textContent?.includes('下一章')
      );
      
      if (nextLink) {
        const href = nextLink.getAttribute('href');
        if (href && !href.includes('index.html') && !href.startsWith('javascript:')) {
          const fullNextUrl = new URL(href, url).href;
          // 顶点分页通常是 _2.html，或者包含 next 喵
          if (fullNextUrl !== url && (fullNextUrl.includes('_') || fullNextUrl.length > url.length)) {
            nextUrl = fullNextUrl;
          }
        }
      }
      
      return { text: cleanText, nextUrl };
    };
    
    let allContent = "";
    let currentUrl = chapter.url!;
    let pageCount = 0;
    const maxPages = 5; // 防止死循环喵~
    
    while (currentUrl && pageCount < maxPages) {
      try {
        const { text, nextUrl } = await fetchPageContent(currentUrl);
        if (text) {
          allContent += text + "\n";
          currentUrl = nextUrl || "";
          pageCount++;
          if (nextUrl) await new Promise(r => setTimeout(r, 1000)); // 顶点抓取分页要慢一点喵~
        } else {
          break;
        }
      } catch (e) {
        console.error(`[Dingdian] Failed to fetch page ${pageCount + 1} for ${chapter.title}喵~`, e);
        break;
      }
    }
    
    const lines = allContent.split('\n');
    const finalLines = lines
      .map(line => line.trim())
      .filter(l => {
        if (l.length === 0) return false;
        const junkKeywords = [
          '顶点小说', '23ddw', 'www.', '目录', '上一页', '下一页', '尾页', '首页', 
          'Top', '返回目录', '获取失败', '推荐本书', '举报错误'
        ];
        return !junkKeywords.some(kw => l.includes(kw));
      });
      
    return finalLines.join('\n\n');
  }
};

export const PROVIDERS: SourceProvider[] = [wanbengeProvider, yedujiProvider, shukugeProvider, dingdianProvider, localProvider];

export const searchNovel = async (keyword: string, source: any = 'auto'): Promise<Novel[]> => {
  // Check if keyword is a URL
  if (isUrl(keyword)) {
      // Generic URL handling (experimental)
  }

  console.log(`[Search] Starting search for "${keyword}" across all providers喵~`);
  
  const resultsByProvider: Record<string, number> = {};
  
  const promises = PROVIDERS.map(p => {
    // 给每个源的搜索设置超时限制喵~
    const searchPromise = p.search(keyword).then(res => {
      resultsByProvider[p.name] = res.length;
      console.log(`[Search] ${p.name} returned ${res.length} results喵~`);
      return res;
    }).catch(e => {
      resultsByProvider[p.name] = 0;
      console.error(`[Search] ${p.name} failed:`, e.message || e);
      return [] as Novel[];
    });

    // 8秒超时，超时后返回空数组，不让它拖慢整体速度喵~
    const timeoutPromise = new Promise<Novel[]>((resolve) => {
      setTimeout(() => {
        console.warn(`[Search] ${p.name} timed out after 8s喵~`);
        resolve([]);
      }, 8000);
    });

    return Promise.race([searchPromise, timeoutPromise]);
  });

  const results = await Promise.all(promises);
  const allNovels = results.flat();
  
  console.log(`[Search] Aggregated results summary喵~:`);
  Object.entries(resultsByProvider).forEach(([name, count]) => {
      console.log(`- ${name}: ${count} results`);
  });
  console.log(`[Search] Total raw results: ${allNovels.length}喵~`);

  const localNovels = allNovels.filter(n => n.sourceName === '本地书库');
  const networkNovels = allNovels.filter(n => n.sourceName !== '本地书库');

  // Group network novels by title + author + source to avoid duplicate entries from SAME source
  const networkNovelsByBook: Record<string, Novel[]> = {};
  networkNovels.forEach(n => {
      const title = n.title.trim().toLowerCase();
      const author = n.author.trim().toLowerCase();
      const source = n.sourceName || '未知';
      // 改为按书名+作者+书源进行分组，这样不同书源的同名书就会分开显示喵~
      const key = `${title}_${author}_${source}`;
      if (!networkNovelsByBook[key]) networkNovelsByBook[key] = [];
      networkNovelsByBook[key].push(n);
  });

  console.log(`[Search] Grouped ${networkNovels.length} network novels into ${Object.keys(networkNovelsByBook).length} unique books喵~`);

  // Merge sources for the same book
  const mergedNetworkNovels: Novel[] = Object.entries(networkNovelsByBook).map(([key, group]) => {
      // Pick the best result as the primary (prefer one with description/cover)
      const primary = group.sort((a, b) => {
          const score = (n: Novel) => (n.description ? 2 : 0) + (n.coverUrl ? 1 : 0);
          return score(b) - score(a);
      })[0];

      // Collect all sources and de-duplicate by URL
      const seenUrls = new Set<string>();
      const sources: NovelSource[] = [];
      
      group.forEach(n => {
          if (!seenUrls.has(n.detailUrl)) {
              seenUrls.add(n.detailUrl);
              sources.push({
                  name: n.sourceName || '未知',
                  url: n.detailUrl
              });
          }
      });
      
      // Collect unique source names for display
      const sourceNames = Array.from(new Set(sources.map(s => s.name))).filter(Boolean);
      
      return {
          ...primary,
          sourceName: sourceNames.join(' | '), // Show multiple sources in the tag
          sources: sources
      };
  });

  const filteredNetworkNovels = mergedNetworkNovels.filter(netNovel => {
    const isLocal = localNovels.some(localNovel => {
      const titleMatch = localNovel.title.trim().toLowerCase() === netNovel.title.trim().toLowerCase();
      const authorMatch = localNovel.author.toLowerCase() === netNovel.author.toLowerCase() || 
                         localNovel.author === '未知' || 
                         netNovel.author === '未知';
      return titleMatch && authorMatch;
    });
    return !isLocal;
  });

  // Final filtering to ensure relevance
  return [...localNovels, ...filteredNetworkNovels].filter(n => isRelevant(n.title, n.author, keyword));
}

const getProviderByName = (name: string): SourceProvider | undefined => {
  if (name.includes('本地书库')) return localProvider;
  if (name.includes('完本阁')) return wanbengeProvider;
  if (name.includes('夜读集')) return yedujiProvider;
  if (name.includes('书库阁')) return shukugeProvider;
  if (name.includes('顶点小说网')) return dingdianProvider;
  return undefined;
};

export const getNovelDetails = async (novel: Novel): Promise<Novel> => {
  // If we have multiple sources, try them one by one until one succeeds
  if (novel.sources && novel.sources.length > 0) {
    console.log(`[Details] Trying multiple sources for "${novel.title}"喵~`);
    for (const source of novel.sources) {
      const provider = getProviderByName(source.name);
      if (provider) {
        try {
          console.log(`[Details] Trying source: ${source.name} (${source.url})喵~`);
          // Temporarily set the detailUrl to this source's URL for the provider to use
          const tempNovel = { ...novel, detailUrl: source.url, sourceName: source.name };
          const details = await provider.getDetails(tempNovel);
          if (details && details.chapters && details.chapters.length > 0) {
            console.log(`[Details] Successfully got details from ${source.name}喵~`);
            // Update the original novel with the successful source's info
            return {
              ...details,
              sourceName: novel.sourceName, // Keep the combined source name for UI
              sources: novel.sources        // Keep the sources list
            };
          }
        } catch (e) {
          console.warn(`[Details] Source ${source.name} failed:`, e);
        }
      }
    }
  }

  // Fallback to original logic if no sources or all failed
  const name = novel.sourceName || '';
  const provider = getProviderByName(name) || wanbengeProvider;
  return provider.getDetails(novel);
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const retry = async <T>(fn: () => Promise<T>, retries = 3, delayMs = 1000, context: string = ''): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    console.warn(`Retry attempt remaining: ${retries} for ${context}. Error: ${error instanceof Error ? error.message : String(error)}`);
    await delay(delayMs);
    return retry(fn, retries - 1, delayMs * 2, context);
  }
};

export const downloadAndParseNovel = async (novel: Novel, onProgress: (msg: string, percent: number) => void): Promise<Novel> => {
  const name = novel.sourceName || '';
  const isScrapable = PROVIDERS.some(p => name.includes(p.name) || name.includes(p.key));

  if (novel.chapters.length > 0 && isScrapable) {
    onProgress(`准备下载 ${novel.chapters.length} 章...`, 0);

    // 完本阁对频率限制非常严格，所以我们要慢一点喵~
    const isWanbenge = name.includes('完本阁');
    const limit = pLimit(isWanbenge ? 2 : 3); 
    let completed = 0;
    let failedCount = 0;
    
    const fetchChapter = async (chapter: Chapter) => {
      if (!chapter.url) return;
      
      // 在下载前随机休息一下，假装是真人在翻页喵~
      if (isWanbenge) {
        const jitter = Math.random() * 1000 + 500; // 0.5s - 1.5s
        await new Promise(resolve => setTimeout(resolve, jitter));
      }

      try {
        await retry(async () => {
          // Find the provider that can handle this chapter's URL
          let provider = PROVIDERS.find(p => {
            // Check by URL matching
            const urlMatch = (p.baseUrl && chapter.url?.includes(new URL(p.baseUrl).hostname)) || 
                             (p.name === '完本阁' && chapter.url?.includes('jizai22.com'));
            return urlMatch;
          });
          
          // Fallback: use the provider matching the sourceName
          if (!provider) {
            provider = PROVIDERS.find(p => name.includes(p.key) || name.includes(p.name));
          }

          if (provider && provider.getChapterContent) {
            chapter.content = await provider.getChapterContent(chapter);
            if (!chapter.content || chapter.content === "获取失败") {
              throw new Error("Content extraction returned empty or failed");
            }
            return;
          }

          throw new Error(`No provider found for chapter URL: ${chapter.url}`);
        }, 3, 3000, `Chapter ${chapter.title}`);

      } catch (e) {
        console.warn(`Failed to fetch chapter ${chapter.title}`, e);
        chapter.content = "获取失败";
        failedCount++;
      } finally {
        completed++;
        const percent = Math.floor((completed / novel.chapters.length) * 100);
        // 每一章都汇报进度，不让主人等得心急喵！
        onProgress(`下载中: ${chapter.title} (${completed}/${novel.chapters.length}) ${failedCount > 0 ? `[失败${failedCount}]` : ''}`, percent);
      }
    };

    const input = novel.chapters.map(c => limit(() => fetchChapter(c)));
    await Promise.all(input);

    if (failedCount > 0) {
      onProgress(`下载完成，${failedCount} 章失败`, 100);
    } else {
      onProgress("所有章节下载完成", 100);
    }

    // 过滤掉下载失败或内容为空的章节喵~
    novel.chapters = novel.chapters.filter(c => c.content && c.content !== "获取失败" && c.content.trim().length > 0);
    // 重新编号喵~
    novel.chapters.forEach((c, i) => c.number = i + 1);

    return novel;

  } else {
    throw new Error("无法下载：该小说不支持自动抓取");
  }
};
