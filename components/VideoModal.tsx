import React, { useEffect } from 'react';
import { X, Maximize, Volume2, Download } from 'lucide-react';

interface VideoFile {
  filename: string;
  url: string;
}

interface VideoModalProps {
  video: VideoFile;
  onClose: () => void;
}

export function VideoModal({ video, onClose }: VideoModalProps) {
  // 禁止背景滚动喵~
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
      {/* 遮罩层喵~ */}
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-xl animate-in fade-in duration-500"
        onClick={onClose}
      />

      {/* 内容区域喵~ */}
      <div className="relative w-full max-w-5xl aspect-video glass-panel rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl animate-in zoom-in-95 duration-500">
        {/* 顶部控制栏喵~ */}
        <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-10 bg-gradient-to-b from-black/80 to-transparent">
          <h2 className="text-white font-bold truncate pr-12 text-lg drop-shadow-md">
            {video.filename}
          </h2>
          <button 
            onClick={onClose}
            className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white/80 transition-all hover:rotate-90 active:scale-90 border border-white/10"
          >
            <X size={24} />
          </button>
        </div>

        {/* 视频播放器喵~ */}
        <video 
          src={video.url} 
          controls 
          autoPlay
          preload="auto"
          onError={(e) => {
            console.error("Video Playback Error:", e);
            alert("视频播放出错啦喵~ 可能是格式不支持或者网络断开喵。");
          }}
          className="w-full h-full object-contain bg-black"
        >
          您的浏览器不支持视频播放喵~
        </video>

        {/* 装饰性光晕喵~ */}
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-pink-500/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />
      </div>
    </div>
  );
}
