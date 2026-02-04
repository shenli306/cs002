import React, { useState, useRef, useEffect } from 'react';
import { Play, Clock, FileVideo } from 'lucide-react';

interface VideoFile {
  filename: string;
  url: string;
  size: number;
  time: string;
}

interface VideoCardProps {
  video: VideoFile;
  onSelect?: (video: VideoFile) => void;
}

// 全局缩略图生成队列控制喵~
const MAX_CONCURRENT_THUMBNAILS = 3;
let activeThumbnailGenerations = 0;
const thumbnailQueue: (() => void)[] = [];

const processThumbnailQueue = () => {
  if (activeThumbnailGenerations < MAX_CONCURRENT_THUMBNAILS && thumbnailQueue.length > 0) {
    const nextTask = thumbnailQueue.shift();
    if (nextTask) {
      activeThumbnailGenerations++;
      nextTask();
    }
  }
};

export function VideoCard({ video, onSelect }: VideoCardProps) {
  const handleClick = () => {
    if (onSelect) {
      onSelect(video);
    }
  };
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [duration, setDuration] = useState<string | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [shouldLoadMetadata, setShouldLoadMetadata] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isProcessing = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // 队列化缩略图生成逻辑喵~
  useEffect(() => {
    if (!isInView || thumbnail) return;

    const startLoading = () => {
      setShouldLoadMetadata(true);
    };

    thumbnailQueue.push(startLoading);
    processThumbnailQueue();

    return () => {
      // 如果还没开始加载就被卸载了，从队列中移除喵~
      const index = thumbnailQueue.indexOf(startLoading);
      if (index > -1) {
        thumbnailQueue.splice(index, 1);
      }
    };
  }, [isInView, video.url, thumbnail]);

  useEffect(() => {
    if (!shouldLoadMetadata) return;

    const v = videoRef.current;
    if (!v) return;

    const cleanup = () => {
      if (isProcessing.current) {
        isProcessing.current = false;
        activeThumbnailGenerations--;
        processThumbnailQueue();
      }
    };

    const handleLoadedMetadata = () => {
      const minutes = Math.floor(v.duration / 60);
      const seconds = Math.floor(v.duration % 60);
      setDuration(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      
      // 尝试在第 1 秒抓取缩略图喵~
      v.currentTime = 1;
    };

    const handleSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          setThumbnail(canvas.toDataURL('image/jpeg', 0.6)); // 降低一点质量提升性能喵~
        }
      } catch (e) {
        console.warn("Failed to generate thumbnail for", video.filename, e);
      } finally {
        cleanup();
      }
    };

    const handleError = () => {
      console.warn("Failed to load metadata for", video.filename);
      cleanup();
    };

    isProcessing.current = true;
    v.addEventListener('loadedmetadata', handleLoadedMetadata);
    v.addEventListener('seeked', handleSeeked);
    v.addEventListener('error', handleError);

    return () => {
      v.removeEventListener('loadedmetadata', handleLoadedMetadata);
      v.removeEventListener('seeked', handleSeeked);
      v.removeEventListener('error', handleError);
      cleanup();
    };
  }, [shouldLoadMetadata, video.url]);

  return (
    <div 
      ref={containerRef}
      onClick={handleClick}
      className="group relative glass-panel rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_20px_40px_-15px_rgba(255,158,206,0.3)] border border-white/10 hover:border-pink-500/30"
    >
      {/* 隐藏的视频元素用于提取元数据，仅在进入视口并排队成功后加载喵~ */}
      {shouldLoadMetadata && !thumbnail && (
        <video 
          ref={videoRef} 
          src={video.url} 
          preload="metadata" 
          muted 
          className="hidden" 
        />
      )}

      {/* 封面图区域喵~ */}
      <div className="aspect-video relative overflow-hidden bg-slate-900">
        {thumbnail ? (
          <img src={thumbnail} alt={video.filename} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/20 gap-3">
            <FileVideo size={48} className="animate-pulse" />
            <span className="text-xs font-medium">正在准备预览喵...</span>
          </div>
        )}
        
        {/* 悬浮层喵~ */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
        
        {/* 播放按钮喵~ */}
        <div className="absolute inset-0 flex items-center justify-center scale-75 group-hover:scale-100 opacity-0 group-hover:opacity-100 transition-all duration-500">
          <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-blue-400 rounded-full flex items-center justify-center shadow-xl">
            <Play size={32} className="text-white fill-white ml-1" />
          </div>
        </div>

        {/* 时长标签喵~ */}
        {duration && (
          <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[10px] font-bold text-white flex items-center gap-1 border border-white/10">
            <Clock size={10} />
            {duration}
          </div>
        )}
      </div>

      {/* 文本信息区域喵~ */}
      <div className="p-5">
        <h3 className="text-white font-bold text-sm line-clamp-2 leading-relaxed group-hover:text-pink-300 transition-colors">
          {video.filename}
        </h3>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-white/40 font-medium uppercase tracking-wider">
            {(video.size / (1024 * 1024)).toFixed(1)} MB
          </span>
          <span className="text-[10px] text-white/40">
            {new Date(video.time).toLocaleDateString()}
          </span>
        </div>
      </div>
      
      {/* 底部渐变边框喵~ */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-400 to-blue-400 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
    </div>
  );
}
