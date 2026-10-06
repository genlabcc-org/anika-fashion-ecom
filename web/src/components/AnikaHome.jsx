import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import "./AnikaHome.css";
import SiteHeader from "./SiteHeader";

import { getNavPath } from "../services/categoryRoute";
import { useStore } from "../hooks/useStore";
import { bannerService } from "../services/bannerService";

export default function AnikaHome() {
  const categories = useStore((state) => state.categories);
  const navigate = useNavigate();

  const [banners, setBanners] = useState([]);

  useEffect(() => {
    async function fetchBanners() {
      try {
        const data = await bannerService.getBanners();
        if (data && data.length > 0) {
          setBanners(data);
        }
      } catch (err) {
        console.error("Failed to load hero banners:", err);
      }
    }
    fetchBanners();
  }, []);

  // Preload first banner image dynamically to boost LCP
  useEffect(() => {
    if (banners && banners.length > 0) {
      const firstBanner = banners[0];
      const desktopImg = firstBanner.image_url || firstBanner.image;
      const mobileImg = firstBanner.mobile_url || desktopImg;
      if (!desktopImg) return;

      const isMobile = window.innerWidth <= 768;
      const targetImg = isMobile && mobileImg ? mobileImg : desktopImg;

      let link = document.querySelector('link[data-hero-preload]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.setAttribute('data-hero-preload', 'true');
        link.setAttribute('fetchpriority', 'high');
        document.head.appendChild(link);
      }
      link.href = targetImg;
    }
  }, [banners]);

  const handleNavClick = (link) => {
    if (link === 'Home') {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      navigate(getNavPath(link, categories));
    }
  };

  return (
    <div className="page">

      {/* ── Header ── */}
      <SiteHeader activeLink="Home" onLinkClick={handleNavClick} />

      {/* ── Hero (Dynamic Banners with Swiper) ── */}
      {banners.length > 0 && (
        <section className="hero-section">
          <Swiper
            className="hero-swiper"
            modules={[Autoplay, Pagination]}
            slidesPerView={1}
            loop={banners.length > 1}
            autoplay={banners.length > 1 ? { delay: 5000, disableOnInteraction: false } : false}
            pagination={banners.length > 1 ? { clickable: true } : false}
            speed={600}
          >
            {banners.map((b, i) => {
              const img = b.image_url || b.image;
              if (!img) return null;
              const title = b.title || "";
              const desc = b.description || b.tagline || "";
              const hasText = !!(title || desc);

              return (
                <SwiperSlide key={b.banner_id ?? i}>
                  <div
                    className="hero-image-wrapper"
                    style={{ cursor: b.link_url ? "pointer" : "default" }}
                    onClick={() => {
                      if (!b.link_url) return;
                      if (b.link_url.startsWith("/")) navigate(b.link_url);
                      else window.open(b.link_url, "_blank", "noopener");
                    }}
                  >
                    <picture style={{ display: "block", width: "100%", height: "100%" }}>
                      {b.mobile_url && (
                        <source media="(max-width: 768px)" srcSet={b.mobile_url} />
                      )}
                      <img
                        src={img}
                        alt={title || `Banner ${i + 1}`}
                        className="hero-image"
                        fetchPriority={i === 0 ? "high" : "auto"}
                        loading={i === 0 ? "eager" : "lazy"}
                        decoding={i === 0 ? "sync" : "async"}
                      />
                    </picture>

                    {hasText && (
                      <>
                        <div className="hero-overlay" />
                        <div className="hero-content">
                          {title && <h1 className="hero-title">{title}</h1>}
                          {desc && <p className="hero-subtitle">{desc}</p>}
                          <button
                            className="explore-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" });
                            }}
                          >
                            Explore Now
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </SwiperSlide>
              );
            })}
          </Swiper>
        </section>
      )}

    </div>
  );
}