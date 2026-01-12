import React from 'react';
import { Novel } from '../types';
import { Book, Download, Globe } from 'lucide-react';

interface BookCardProps {
  novel: Novel;
  onSelect: (novel: Novel) => void;
}

export const BookCard: React.FC<BookCardProps> = ({ novel, onSelect }) => {
  // Fix relative URLs for images if they exist
  const coverUrl = novel.coverUrl
    ? (novel.coverUrl.startsWith('http') || novel.coverUrl.startsWith('/api/') ? novel.coverUrl : `https://m.qishu99.cc${novel.coverUrl}`)
    : null;

  return (
    <div
      className="glass-panel rounded-3xl overflow-hidden cursor-pointer hover:bg-white/10 transition-all duration-300 group flex flex-col h-full relative"
      onClick={() => onSelect(novel)}
    >
      {/* Decorative Gradient Background */}
      <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-pink-500/10 via-indigo-500/10 to-transparent" />

      <div className="p-6 pt-8 relative flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div className="w-16 h-24 bg-gradient-to-br from-pink-500/20 to-indigo-500/20 rounded-lg shadow-lg flex items-center justify-center text-white/20 border border-white/10 shrink-0 overflow-hidden">
            {coverUrl ? (
              <img src={coverUrl} alt={novel.title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <Book size={32} />
            )}
          </div>
          <div className="flex gap-2">
            {novel.tags && Array.isArray(novel.tags) && novel.tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-white/5 rounded-md text-white/60 border border-white/5">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <h3 className="text-xl font-bold text-white mb-1 line-clamp-1 font-serif">{novel.title}</h3>
        <p className="text-sm text-indigo-300 mb-4">{novel.author}</p>

        <p className="text-white/50 text-xs leading-relaxed line-clamp-3 mb-6">
          {novel.description || "暂无简介"}
        </p>

        <div className="mt-auto flex items-center justify-between pt-4 border-t border-white/5">
          <div className="flex items-center gap-2 text-emerald-400/80 text-xs">
            <Globe size={12} />
            <span>{novel.sourceName || "奇书网"}</span>
          </div>
          <button className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
            <Download size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};