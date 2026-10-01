import { useState, useEffect } from 'react';
import { videoService } from '../services/videoService';
import './RealExperience.css';

const maxThumb = (code) => `https://i.ytimg.com/vi/${code}/maxresdefault.jpg`;
const hqThumb = (code) => `https://i.ytimg.com/vi/${code}/hqdefault.jpg`;

const RealExperience = () => {
  const [videos, setVideos] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    videoService.getLatest(8, 'youtube').then(setVideos).catch(console.error);
  }, []);

  // close player with Esc
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => e.key === 'Escape' && setActive(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  if (videos.length === 0) return null; // nothing uploaded yet = section hidden

  // marquee only makes sense with enough cards
  const loop = videos.length >= 4;
  const items = loop ? [...videos, ...videos, ...videos] : videos;

  // YouTube serves a 120px grey placeholder when maxres doesn't exist
  const fallbackThumb = (e, code) => {
    const img = e.currentTarget;
    if (img.dataset.fb) return;
    if (img.naturalWidth <= 120 || e.type === 'error') {
      img.dataset.fb = '1';
      img.src = hqThumb(code);
    }
  };

  return (
    <div className="textParent">
      <div className="text">
        <div className="realExperiences">Anika Expressions</div>
        <div className="hearFromOur">#MyAnikaStory</div>
      </div>

      <div className="experience-scroll-container">
        <div className={`experience-track ${loop ? '' : 'experience-track--static'}`}>
          {items.map((v, i) => (
            <button
              key={`${v.id}-${i}`}
              type="button"
              className="experience-item"
              onClick={() => setActive(v)}
              aria-label={v.title ? `Play ${v.title}` : 'Play video'}
            >
              <img
                src={maxThumb(v.code)}
                className="frameChild"
                alt={v.title || `Customer video ${i + 1}`}
                loading="lazy"
                onLoad={(e) => fallbackThumb(e, v.code)}
                onError={(e) => fallbackThumb(e, v.code)}
              />
              <span className="experience-play">▶</span>
            </button>
          ))}
        </div>
      </div>

      {active && (
        <div className="exp-modal" onClick={() => setActive(null)}>
          <div className="exp-modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="exp-close" onClick={() => setActive(null)} aria-label="Close">✕</button>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${active.code}?autoplay=1&playsinline=1&rel=0`}
              title={active.title || 'Anika video'}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default RealExperience;