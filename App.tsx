import React, { useState, useEffect } from 'react';
import { Search, Download, ArrowRight, Loader2, Globe, FileText, CheckCircle2, AlertCircle, ChevronLeft, Play, X, Clock, Video, Image as ImageIcon, Folder, ChevronRight, Maximize2 } from 'lucide-react';
import { Novel, AppState } from './types';
import { searchNovel, getNovelDetails, downloadAndParseNovel, fetchBlob } from './services/source';
import { generateEpub } from './services/epub';
import { DynamicIsland } from './components/DynamicIsland';
import { CuteProgress } from './components/CuteProgress';
import { BookCard } from './components/BookCard';
import { Reader } from './components/Reader';
import { VideoCard } from './components/VideoCard';
import { VideoModal } from './components/VideoModal';

// Photo Preview Modal Component 喵~
const PhotoModal = ({ photo, onClose }: { photo: any, onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={onClose} />
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 z-10 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white/80 transition-all hover:rotate-90"
      >
        <X size={24} />
      </button>
      <div className="relative max-w-full max-h-full flex items-center justify-center group">
        <img 
          src={photo.url} 
          alt={photo.filename} 
          className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-500"
        />
        <div className="absolute bottom-[-40px] left-0 right-0 text-center">
          <p className="text-white/60 text-sm font-medium">{photo.filename}</p>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [searchResults, setSearchResults] = useState<Novel[]>([]);
  const [selectedNovel, setSelectedNovel] = useState<Novel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  
  // Video-related state喵~
  const [videoResults, setVideoResults] = useState<any[]>([]);
  const [showVideos, setShowVideos] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [videoPage, setVideoPage] = useState(1);
  const [videoSortOrder, setVideoSortOrder] = useState<'desc' | 'asc'>('desc');
  const [videoHasMore, setVideoHasMore] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);

  // Photo-related state喵~
  const [photoFolders, setPhotoFolders] = useState<any[]>([]);
  const [selectedPhotoFolder, setSelectedPhotoFolder] = useState<string | null>(null);
  const [photoResults, setPhotoResults] = useState<any[]>([]);
  const [showPhotos, setShowPhotos] = useState(false);
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const [photoPage, setPhotoPage] = useState(1);
  const [photoHasMore, setPhotoHasMore] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);

  const fetchVideos = async (page: number, sort: 'desc' | 'asc', isLoadMore = false) => {
    setIsVideoLoading(true);
    setShowPhotos(false); // 互斥显示喵~
    try {
      const response = await fetch(`/api/list-videos?page=${page}&limit=20&sort=${sort}`);
      if (!response.ok) throw new Error("无法获取视频列表喵~");
      const data = await response.json();
      
      if (isLoadMore) {
        setVideoResults(prev => [...prev, ...data.list]);
      } else {
        setVideoResults(data.list);
      }
      
      setVideoHasMore(data.hasMore);
      setVideoPage(page);
      setShowVideos(true);
      setState(AppState.PREVIEW);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "获取视频列表失败，请重试喵~");
      if (!isLoadMore) setState(AppState.IDLE);
    } finally {
      setIsVideoLoading(false);
    }
  };

  const fetchPhotoFolders = async () => {
    setIsPhotoLoading(true);
    setShowVideos(false); // 互斥显示喵~
    try {
      const response = await fetch('/api/list-photo-folders');
      if (!response.ok) throw new Error("无法获取相册文件夹喵~");
      const data = await response.json();
      setPhotoFolders(data.list);
      setShowPhotos(true);
      setSelectedPhotoFolder(null);
      setState(AppState.PREVIEW);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "获取相册列表失败，请重试喵~");
      setState(AppState.IDLE);
    } finally {
      setIsPhotoLoading(false);
    }
  };

  const fetchPhotos = async (folder: string, page: number, isLoadMore = false) => {
    setIsPhotoLoading(true);
    try {
      const response = await fetch(`/api/list-photos?folder=${encodeURIComponent(folder)}&page=${page}&limit=50`);
      if (!response.ok) throw new Error("无法获取照片列表喵~");
      const data = await response.json();
      
      if (isLoadMore) {
        setPhotoResults(prev => [...prev, ...data.list]);
      } else {
        setPhotoResults(data.list);
      }
      
      setPhotoHasMore(data.hasMore);
      setPhotoPage(page);
      setSelectedPhotoFolder(folder);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "获取照片失败，请重试喵~");
    } finally {
      setIsPhotoLoading(false);
    }
  };

  // 视频按时间分组逻辑喵~
  const groupVideosByTime = (videos: any[]) => {
    const groups: { [key: string]: any[] } = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const thisWeek = today - 86400000 * 7;
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    videos.forEach(video => {
      const vTime = new Date(video.time).getTime();
      let label = "更早以前";
      if (vTime >= today) label = "今天";
      else if (vTime >= yesterday) label = "昨天";
      else if (vTime >= thisWeek) label = "本周";
      else if (vTime >= thisMonth) label = "本月";

      if (!groups[label]) groups[label] = [];
      groups[label].push(video);
    });

    // 保持组的顺序喵~
    const orderedLabels = ["今天", "昨天", "本周", "本月", "更早以前"];
    return orderedLabels.map(label => ({
      label,
      videos: groups[label] || []
    })).filter(g => g.videos.length > 0);
  };

  // sourceKey is now internal and defaults to 'auto' for unified search
  const sourceKey = 'auto';

  // Progress Tracking
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  // Reader State
  const [readingChapterIndex, setReadingChapterIndex] = useState<number | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setState(AppState.SEARCHING);
    setError(null);
    setSearchResults([]);
    setSelectedNovel(null);
    
    // zyd 特殊关键词处理喵~
    if (query.trim().toLowerCase() === 'zyd') {
      await fetchVideos(1, videoSortOrder);
      return;
    }

    // shenli 特殊关键词处理喵~
    if (query.trim().toLowerCase() === 'shenli') {
      await fetchPhotoFolders();
      return;
    }

    // 正常搜索流程喵~
    setShowVideos(false);
    setShowPhotos(false);
    try {
      const results = await searchNovel(query, sourceKey);
      if (results.length === 0) {
        setError("未找到相关小说，请更换关键词或检查小说名是否正确。");
        setState(AppState.IDLE);
      } else {
        setSearchResults(results);
        setState(AppState.PREVIEW);

        // Background enrich: Fetch descriptions (sequentially to avoid overwhelming server)
        (async () => {
          for (const novel of results) {
            // 如果小说简介不完整，或者是笔趣阁源（通常需要二次抓取），则进行后台补充
            const needsEnrich = !novel.description || !novel.coverUrl || novel.sourceName?.includes('笔趣阁');
            
            if (!needsEnrich) continue;
            
            try {
              const details = await getNovelDetails(novel);
              setSearchResults(prev => prev.map(n => n.id === novel.id ? { ...n, ...details } : n));
              // Small delay to be nice to the server
              await new Promise(r => setTimeout(r, 200));
            } catch (e) {
              console.warn("Background enrich failed for", novel.title, e);
            }
          }
        })();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "搜索服务暂时不可用，请稍后重试。");
      setState(AppState.IDLE);
    }
  };

  const handleSelectNovel = async (novel: Novel) => {
    setScrollPosition(window.scrollY);
    setSelectedNovel(novel);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Auto-fetch details to get description and chapters
    if (!novel.description || !novel.chapters || novel.chapters.length === 0) {
      try {
        console.log(`[App] Auto-fetching details for ${novel.title}喵~`);
        const detailed = await getNovelDetails(novel);
        setSelectedNovel(prev => prev && prev.id === novel.id ? detailed : prev);
      } catch (e) {
        console.warn("Auto-fetch details failed", e);
      }
    }
  };

  const startDownloadProcess = async () => {
    if (!selectedNovel) return;

    setState(AppState.ANALYZING);
    setError(null);

    try {
      // 0. If Local Novel, just download directly
      if (selectedNovel.sourceName === '本地书库' && selectedNovel.detailUrl) {
        const a = document.createElement('a');
        a.href = selectedNovel.detailUrl;
        a.download = selectedNovel.id; // filename
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // 1. Get Detailed Metadata & Download Link
      let novelWithLink = selectedNovel;
      // Force fetch details if description is missing (likely incomplete data) or chapters are empty
      if (!novelWithLink.description || !novelWithLink.chapters || novelWithLink.chapters.length === 0) {
        setProgressMessage("正在分析书籍信息...");
        setProgressPercent(5);
        try {
            novelWithLink = await getNovelDetails(selectedNovel);
        } catch (e) {
            console.error("Failed to get details", e);
            throw new Error("无法获取书籍详情，请稍后重试");
        }
      }

      // 2. Download & Parse
      setState(AppState.DOWNLOADING);
      const fullNovel = await downloadAndParseNovel(novelWithLink, (msg, percent) => {
        setProgressMessage(msg);
        setProgressPercent(percent);
        if (percent > 40) setState(AppState.PARSING);
      });

      setSelectedNovel(fullNovel); // Update with chapters

      // Update with chapters

      // ... (existing code)

      // 3. Pack EPUB
      setState(AppState.PACKING);
      setProgressMessage("正在生成 EPUB 文件...");

      // Try to fetch cover
      let coverBlob: Blob | undefined;
      if (fullNovel.coverUrl) {
        try {
          setProgressMessage("正在下载封面...");
          coverBlob = await fetchBlob(fullNovel.coverUrl);
        } catch (e) {
          console.warn("Cover download failed", e);
        }
      }

      setProgressMessage("正在打包 EPUB...");
      const epubBlob = await generateEpub(fullNovel, coverBlob);

      // 4. Upload to Server (Local Library)
      setProgressMessage("正在保存至本地书库...");
      const safeTitle = fullNovel.title.replace(/[\\/:*?"<>|]/g, "_") || "download";
      const filename = `${safeTitle}.epub`;

      try {
        await fetch('/api/save-epub', {
          method: 'POST',
          headers: {
            'x-filename': encodeURIComponent(filename)
          },
          body: epubBlob
        });
      } catch (uploadErr) {
        console.warn("Failed to save to local library", uploadErr);
        // Continue to user download anyway
      }

      // 5. Download Trigger
      const url = URL.createObjectURL(epubBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setState(AppState.COMPLETE);
      setProgressMessage("下载完成，已保存至下载目录");

      // Delay alert slightly to allow UI update
      setTimeout(() => {
        alert("下载已完成！\n\n文件已保存至您的浏览器默认下载文件夹。\n同时也已保存至服务器 'downloads' 目录。");
      }, 500);

    } catch (e: any) {
      console.error(e);
      setError(e.message || "处理过程中发生错误");
      setState(AppState.PREVIEW);
    }
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden text-slate-100 pb-20">

      <DynamicIsland
        state={state}
        progress={progressPercent}
        message={progressMessage}
        onClick={() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          // 如果不是在忙碌状态，点击灵动岛返回首页/搜索结果
          if (state === AppState.PREVIEW || state === AppState.COMPLETE || state === AppState.IDLE) {
            setSelectedNovel(null);
            if (state === AppState.COMPLETE) {
              setState(AppState.PREVIEW);
            }
          }
        }}
      />

      {/* Back Button */}
      {selectedNovel && (
        <button
          onClick={() => { 
            setSelectedNovel(null); 
            setState(AppState.PREVIEW); 
            setTimeout(() => window.scrollTo({ top: scrollPosition, behavior: 'smooth' }), 50);
          }}
          className="fixed top-6 left-6 z-40 p-3 bg-black/20 backdrop-blur-xl rounded-full text-white/80 hover:bg-white/10 transition-all border border-white/10 hover:scale-110 active:scale-95 group"
          title="返回搜索"
        >
          <ChevronLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
        </button>
      )}

      {/* Reader Modal */}
      {selectedNovel && readingChapterIndex !== null && (
        <Reader
          title={selectedNovel.title}
          chapter={selectedNovel.chapters[readingChapterIndex]}
          onClose={() => setReadingChapterIndex(null)}
          onNext={() => setReadingChapterIndex(prev => (prev !== null && prev < selectedNovel.chapters.length - 1) ? prev + 1 : prev)}
          onPrev={() => setReadingChapterIndex(prev => (prev !== null && prev > 0) ? prev - 1 : prev)}
          hasNext={readingChapterIndex < selectedNovel.chapters.length - 1}
          hasPrev={readingChapterIndex > 0}
          isLoading={false}
        />
      )}

      {/* Video Modal喵~ */}
      {selectedVideo && (
        <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />
      )}

      {/* Photo Modal喵~ */}
      {selectedPhoto && (
        <PhotoModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}

      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-900/20 rounded-full blur-[120px]" />
      </div>

      <main className="relative max-w-5xl mx-auto px-6 pt-32 flex flex-col items-center min-h-[80vh]">

        {/* Header */}
        <div className={`text-center transition-all duration-700 ${state !== AppState.IDLE ? 'scale-75 opacity-50 mb-4' : 'mb-12'}`}>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/40 drop-shadow-2xl mb-6">
            InkStream
          </h1>
          <p className="text-xl text-white/50 font-light max-w-xl mx-auto flex items-center justify-center gap-2">
            全网搜书 · 智能分章 · EPUB 打包
          </p>
        </div>

        {/* Search Input */}
        {state !== AppState.DOWNLOADING && state !== AppState.PARSING && state !== AppState.PACKING && (
          <div className="w-full max-w-2xl z-20 mb-12 flex flex-col items-center gap-6">
            <form onSubmit={handleSearch} className="w-full relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-[2rem] blur opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
              <div className="relative glass-input rounded-[2rem] p-2 flex items-center transition-all duration-300 focus-within:ring-2 focus-within:ring-white/20 focus-within:bg-black/40">
                <Search className="ml-5 text-white/40" size={24} />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="输入小说名或搜索 URL，例如：小哭包..."
                  className="w-full bg-transparent border-none outline-none px-4 py-4 text-lg text-white placeholder:text-white/20 font-medium"
                />

                <button
                  type="submit"
                  disabled={state === AppState.SEARCHING}
                  className="bg-white text-black px-8 py-3 rounded-[1.5rem] font-bold hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                >
                  {state === AppState.SEARCHING ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                </button>
              </div>
            </form>

            {error && (
              <div className="mt-4 flex flex-col items-center justify-center gap-2 text-red-400 bg-red-900/20 py-3 px-6 rounded-2xl border border-red-500/20 animate-in fade-in max-w-lg mx-auto text-center">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span className="text-sm font-medium">{error}</span>
                </div>
                <span className="text-xs text-red-400/60">如果是网络问题，请尝试点击搜索按钮重试</span>
              </div>
            )}
          </div>
        )}

        {/* Selected Novel Detail View */}
        {selectedNovel && (state === AppState.PREVIEW || state === AppState.ANALYZING || state === AppState.DOWNLOADING || state === AppState.PARSING || state === AppState.PACKING || state === AppState.COMPLETE) && (
          <div className="w-full mt-4 animate-in slide-in-from-bottom-10 fade-in duration-700 mb-20">
            <div className="glass-panel rounded-[3rem] p-8 md:p-12 border border-white/10 relative overflow-hidden">

              {/* Detail Layout */}
              <div className="flex flex-col md:flex-row gap-12 relative z-10">
                {/* Cover Mockup */}
                <div className="w-full md:w-1/3 flex flex-col items-center">
                  <div className="w-48 aspect-[2/3] bg-gradient-to-br from-indigo-900 to-slate-900 rounded-xl shadow-2xl flex items-center justify-center border border-white/10 mb-8 relative overflow-hidden group">
                    {selectedNovel.coverUrl ? (
                      <img 
                        src={(() => {
                          const coverUrl = selectedNovel.coverUrl;
                          if (coverUrl.startsWith('/api/')) return coverUrl;
                          try {
                            const isLocalDev = window.location.hostname === 'localhost' && window.location.protocol === 'http:';
                            if (isLocalDev) return coverUrl;
                          } catch {
                          }
                          if (coverUrl.startsWith('http')) return `/api/proxy?url=${encodeURIComponent(coverUrl)}`;
                          return coverUrl;
                        })()} 
                        alt={selectedNovel.title} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-center">
                        <span className="text-4xl font-serif text-white/20">书</span>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  {state === AppState.PREVIEW || state === AppState.COMPLETE ? (
                    <button
                      onClick={startDownloadProcess}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)] transition-all hover:scale-[1.02] active:scale-95"
                    >
                      <Download size={20} />
                      {selectedNovel.sourceName === '本地书库' ? "下载本地文件" : (state === AppState.COMPLETE ? "下载完成 (点击再次下载)" : "开始抓取并打包")}
                    </button>
                  ) : (
                    <CuteProgress state={state} progress={progressPercent} message={progressMessage} />
                  )}
                  <button
                    onClick={() => { 
                      setSelectedNovel(null); 
                      setState(AppState.PREVIEW); 
                      setTimeout(() => window.scrollTo({ top: scrollPosition, behavior: 'smooth' }), 50);
                    }}
                    className="mt-4 text-white/40 text-sm hover:text-white hover:underline transition-all"
                  >
                    返回搜索结果
                  </button>
                </div>

                {/* Metadata */}
                <div className="flex-1 space-y-8">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${selectedNovel.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/20' : 'bg-amber-500/20 text-amber-300 border-amber-500/20'}`}>
                        {selectedNovel.status === 'Completed' ? '已完结' : selectedNovel.status === 'Serializing' ? '连载中' : '未知状态'}
                      </span>
                      <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-xs border border-indigo-500/20">TXT直连</span>
                    </div>
                    <h2 className="text-4xl font-bold text-white mb-2 font-serif">{selectedNovel.title}</h2>
                    <p className="text-xl text-indigo-200">{selectedNovel.author}</p>
                  </div>

                  <div className="prose prose-invert prose-sm text-white/70 max-h-32 overflow-y-auto custom-scrollbar">
                    <p>{selectedNovel.description || "正在加载简介..."}</p>
                  </div>

                  <div className="bg-black/20 rounded-2xl p-6 border border-white/5">
                    <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                      <Globe size={16} className="text-indigo-400" />
                      数据来源
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/40 bg-white/5 px-3 py-1.5 rounded-lg flex flex-wrap gap-2">
                        {selectedNovel.sourceName?.split(' | ').map((s, i) => (
                          <span key={i} className="text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">{s}</span>
                        )) || '未知书源'}
                      </span>
                      <span className="text-xs text-emerald-400/60">
                        已验证可用
                      </span>
                    </div>
                  </div>

                  {/* Chapter Preview - Only visible after parsing */}
                  {selectedNovel.chapters.length > 0 && (
                    <div className="animate-in fade-in duration-500">
                      <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                        <FileText size={16} className="text-indigo-400" />
                        章节列表 (共 {selectedNovel.chapters.length} 章)
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {selectedNovel.chapters.slice(0, 50).map((c, idx) => (
                          <button
                            key={`${c.url}-${idx}`}
                            onClick={() => setReadingChapterIndex(idx)}
                            className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
                          >
                            <span className="truncate">{c.title}</span>
                            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                          </button>
                        ))}
                        {selectedNovel.chapters.length > 50 && (
                          <div className="col-span-full text-center text-xs text-white/30 py-2">
                            ... 剩余 {selectedNovel.chapters.length - 50} 章 ...
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search Results List (Grid) */}
        {!selectedNovel && searchResults.length > 0 && (
          <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-5">
            {searchResults.map((item, idx) => (
              <BookCard key={`${item.id}-${idx}-${item.sourceName}`} novel={item} onSelect={handleSelectNovel} />
            ))}
          </div>
        )}

        {/* 搜索进度喵~ */}
        {state === AppState.SEARCHING && (
          <div className="w-full max-w-2xl mx-auto py-20 flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Search size={32} className="text-indigo-400 animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-white">正在全网搜索中喵...</h3>
              <p className="text-white/40 text-sm">猫娘正在努力为您寻找最棒的资源，请稍等片刻喵~</p>
            </div>
          </div>
        )}

        {/* 视频加载进度喵... */}
        {isVideoLoading && videoResults.length === 0 && (
          <div className="w-full py-20 flex flex-col items-center gap-6 animate-in fade-in duration-500">
            <div className="w-16 h-16 border-4 border-pink-500/20 border-t-pink-500 rounded-full animate-spin" />
            <p className="text-pink-400 font-bold">正在整理视频库喵...</p>
          </div>
        )}

        {/* 相册加载进度喵... */}
        {isPhotoLoading && photoResults.length === 0 && photoFolders.length === 0 && (
          <div className="w-full py-20 flex flex-col items-center gap-6 animate-in fade-in duration-500">
            <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-blue-400 font-bold">正在打开相册喵...</p>
          </div>
        )}

        {/* Video Results List (Grid)喵~ */}
        {!selectedNovel && showVideos && videoResults.length > 0 && (
          <div className="w-full space-y-12 animate-in fade-in slide-in-from-bottom-5">
            {/* 排序和统计工具栏喵~ */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/5 backdrop-blur-md p-6 rounded-3xl border border-white/10">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400">
                  <Video size={24} />
                </div>
                <div>
                  <h3 className="text-white font-bold">本地视频库</h3>
                  <p className="text-xs text-white/40">共发现 {videoResults.length} 个精彩片段喵~</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-2xl border border-white/5">
                <button
                  onClick={() => {
                    const newSort = 'desc';
                    setVideoSortOrder(newSort);
                    fetchVideos(1, newSort);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${videoSortOrder === 'desc' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
                >
                  最新在前
                </button>
                <button
                  onClick={() => {
                    const newSort = 'asc';
                    setVideoSortOrder(newSort);
                    fetchVideos(1, newSort);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${videoSortOrder === 'asc' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
                >
                  最旧在前
                </button>
              </div>
            </div>

            {/* 按时间分组展示喵~ */}
            {groupVideosByTime(videoResults).map((group) => (
              <div key={group.label} className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-white/10" />
                  <span className="text-sm font-bold text-white/30 uppercase tracking-widest px-4 py-1 rounded-full border border-white/5 bg-white/5">
                    {group.label}
                  </span>
                  <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-white/10" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {group.videos.map((video, idx) => (
                    <VideoCard key={`${video.filename}-${idx}`} video={video} onSelect={setSelectedVideo} />
                  ))}
                </div>
              </div>
            ))}

            {/* 加载更多按钮喵~ */}
            {videoHasMore && (
              <div className="flex justify-center pt-8">
                <button
                  onClick={() => fetchVideos(videoPage + 1, videoSortOrder, true)}
                  disabled={isVideoLoading}
                  className="group relative px-12 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 overflow-hidden"
                >
                  <div className="relative z-10 flex items-center gap-3">
                    {isVideoLoading ? (
                      <Loader2 size={20} className="animate-spin text-indigo-400" />
                    ) : (
                      <Play size={18} className="text-indigo-400 rotate-90" />
                    )}
                    <span>{isVideoLoading ? "正在努力加载喵..." : "展开更多精彩喵~"}</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Photo Results List喵~ */}
        {!selectedNovel && showPhotos && (
          <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-5">
            {/* Header / Breadcrumbs */}
            <div className="flex items-center justify-between bg-white/5 backdrop-blur-md p-6 rounded-3xl border border-white/10">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/20 rounded-2xl text-blue-400">
                  <ImageIcon size={24} />
                </div>
                <div>
                  <h3 className="text-white font-bold">我的相册</h3>
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <span className="hover:text-white/60 cursor-pointer" onClick={() => setSelectedPhotoFolder(null)}>全部相册</span>
                    {selectedPhotoFolder && (
                      <>
                        <ChevronRight size={12} />
                        <span className="text-white/80">{selectedPhotoFolder}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Folders List (when no folder is selected) */}
            {!selectedPhotoFolder && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {photoFolders.map((folder) => (
                  <div 
                    key={folder.name}
                    onClick={() => fetchPhotos(folder.name, 1)}
                    className="group relative glass-panel p-6 rounded-3xl cursor-pointer transition-all duration-300 hover:scale-105 hover:bg-white/10 border border-white/10"
                  >
                    <div className="flex flex-col items-center gap-4">
                      <div className="relative">
                        <Folder size={64} className="text-blue-400/80 group-hover:text-blue-400 transition-colors" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play size={20} className="text-white fill-white" />
                        </div>
                      </div>
                      <div className="text-center">
                        <h4 className="text-white font-bold truncate w-full px-2">{folder.name}</h4>
                        <p className="text-xs text-white/40 mt-1">{folder.time.split('T')[0]}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Photos Grid (when a folder is selected) */}
            {selectedPhotoFolder && (
              <div className="space-y-8">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {photoResults.map((photo, idx) => (
                    <div 
                      key={`${photo.filename}-${idx}`}
                      onClick={() => setSelectedPhoto(photo)}
                      className="group relative aspect-square rounded-2xl overflow-hidden bg-white/5 cursor-pointer border border-white/10 hover:border-blue-500/50 transition-all duration-300"
                    >
                      <img 
                        src={photo.url} 
                        alt={photo.filename} 
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                        <p className="text-[10px] text-white/80 truncate">{photo.filename}</p>
                      </div>
                      <div className="absolute top-2 right-2 p-1.5 bg-black/40 backdrop-blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize2 size={14} className="text-white" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Load More for Photos */}
                {photoHasMore && (
                  <div className="flex justify-center pt-8">
                    <button
                      onClick={() => fetchPhotos(selectedPhotoFolder, photoPage + 1, true)}
                      disabled={isPhotoLoading}
                      className="group relative px-10 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white font-bold transition-all"
                    >
                      <div className="relative z-10 flex items-center gap-3">
                        {isPhotoLoading ? (
                          <Loader2 size={20} className="animate-spin text-blue-400" />
                        ) : (
                          <ImageIcon size={18} className="text-blue-400" />
                        )}
                        <span>{isPhotoLoading ? "加载中..." : "查看更多照片"}</span>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* No Videos Found喵~ */}
        {!selectedNovel && showVideos && videoResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-white/40">
            <Video size={48} className="mb-4 opacity-20" />
            <p className="text-lg">video 文件夹里空空如也，什么都没发现喵~</p>
          </div>
        )}

      </main>
    </div>
  );
}
