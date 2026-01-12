import React, { useEffect, useState } from 'react';
import { AppState } from '../types';
import { HardDriveDownload, CheckCircle2, Search, Loader2 } from 'lucide-react';

interface DynamicIslandProps {
  state: AppState;
  progress: number;
  message?: string;
  onClick?: () => void;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({ state, progress, message, onClick }) => {
  const [showSuccess, setShowSuccess] = useState(false);

  // Detect completion to trigger a brief success state
  useEffect(() => {
    if (state === AppState.COMPLETE) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 2500);
      return () => clearTimeout(timer);
    } else {
      setShowSuccess(false);
    }
  }, [state]);

  const isWorking = [AppState.SEARCHING, AppState.DOWNLOADING, AppState.PACKING].includes(state);
  const isExpanded = isWorking || showSuccess;

  // Animation bezier curve mimicking iOS physics
  const springTransition = "transition-all duration-[600ms] ease-[cubic-bezier(0.175,0.885,0.32,1.1)]"; // Bouncy
  const smoothTransition = "transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"; // Smooth

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] ${smoothTransition}`}>
      <div
        onClick={onClick}
        className={`
          bg-black border border-white/10 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)] 
          rounded-[2.5rem] overflow-hidden text-white flex items-center justify-center cursor-pointer
          ${smoothTransition}
          ${isExpanded ? 'w-[360px] h-[68px] px-2' : 'w-[120px] h-[36px]'}
        `}
      >
        <div className="relative w-full h-full flex items-center justify-center">

          {/* Idle State Indicator */}
          <div
            className={`absolute w-20 h-1.5 rounded-full bg-white/20 transition-opacity duration-300 ${isExpanded ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`}
          />

          {/* Expanded Content */}
          <div
            className={`w-full h-full flex items-center px-4 gap-4 transition-all duration-500 ${isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
          >
            {/* Icon Section */}
            <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
              {state === AppState.SEARCHING && (
                <>
                  <div className="absolute inset-0 border-[3px] border-pink-500/30 rounded-full"></div>
                  <div className="absolute inset-0 border-[3px] border-pink-400 rounded-full border-t-transparent animate-spin"></div>
                  <Search size={16} className="text-pink-200" />
                </>
              )}

              {state === AppState.DOWNLOADING && (
                <div className="relative flex items-center justify-center">
                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                    <path className="text-white/10" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                    <path className="text-pink-400 drop-shadow-[0_0_10px_rgba(244,114,182,0.5)] transition-all duration-300 ease-out" strokeDasharray={`${progress}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                  </svg>
                  <span className="absolute text-[10px] font-bold text-white">{progress}</span>
                </div>
              )}

              {state === AppState.PACKING && (
                <HardDriveDownload size={22} className="text-pink-400 animate-pulse" />
              )}

              {(showSuccess || state === AppState.COMPLETE) && (
                <CheckCircle2 size={24} className="text-emerald-400 animate-in zoom-in spin-in-12 duration-500" />
              )}
            </div>

            {/* Text Section */}
            <div className="flex flex-col flex-1 min-w-0 justify-center">
              <span className="text-[13px] font-bold text-white/95 truncate tracking-wide font-sans">
                {state === AppState.SEARCHING && "正在全网搜索..."}
                {state === AppState.DOWNLOADING && "正在抓取章节内容"}
                {state === AppState.PACKING && "正在打包 EPUB..."}
                {(showSuccess || state === AppState.COMPLETE) && "打包完成"}
              </span>
              <span className="text-[11px] text-white/50 truncate font-medium">
                {showSuccess ? "文件已开始下载" : (message || "请保持网络畅通")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};