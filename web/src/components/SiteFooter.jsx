import React from 'react';
import './SiteFooter.css';
import LogoImg from "../assets/footer/logo.svg";

// Social icons from the project assets
import WhatsappIcon from '../assets/footer/whatsapp.svg';
import InstagramIcon from '../assets/footer/instagram.svg';
import FacebookIcon from '../assets/footer/facebook.svg';

const SiteFooter = () => {
  return (
    <footer className="footer-parent">
      <div className="footer-container">
        <div className="footer-grid">

          {/* Column 1: Logo, Newsletter, Socials */}
          <div className="footer-column brand-column">
            <div className="brand-header-mobile">
              <div className="footer-logo">
                <img src={LogoImg} alt="ANIKA" className="logo-img" />
              </div>

              <div className="socials-section">
                <div className="social-box-links">
                  <a href="https://www.instagram.com/anikafashionstore.jewellery/" className="social-box-icon" aria-label="Instagram">
                    <img src={InstagramIcon} alt="Instagram" />
                  </a>
                  <a href="https://www.facebook.com/people/anikafashionstore/100090910872220/?ref=1" className="social-box-icon" aria-label="Facebook">
                    <img src={FacebookIcon} alt="Facebook" />
                  </a>
                  <a href="https://wa.me/919363631636" className="social-box-icon" aria-label="WhatsApp">
                    <img src={WhatsappIcon} alt="WhatsApp" />
                  </a>
                </div>
              </div>
            </div>

            <div className="newsletter-section">
              <p className="footer-label">Subscribe to Newsletter</p>
              <div className="pill-input-group">
                <input type="email" placeholder="Email Address" className="pill-email-input" />
                <button className="pill-submit-btn">Submit</button>
              </div>
            </div>
          </div>

          {/* Column 2: Discover */}
          <div className="footer-column">
            <h3 className="section-title">Discover</h3>
            <ul className="footer-list">
              <li><a href="/rings" className="footer-link">Rings & Collections</a></li>
              <li><a href="/" className="footer-link">Wedding Jewellery</a></li>
              <li><a href="/necklaces" className="footer-link">Necklaces</a></li>
              <li><a href="/" className="footer-link">Special Services</a></li>
            </ul>
          </div>

          {/* Column 3: Contact Us */}
          <div className="footer-column">
            <h3 className="section-title">Contact Us</h3>
            <div className="contact-content">
              <p className="address-text">
                121A, Kottar-Parvathipuram Rd, Chetti Kulam,<br />
                Simon Nagar, Nagercoil, Tamil Nadu 629001
              </p>
              <p className="phone-text">+91 9363631636</p>

              <p className='phone-time'>Mon - Sat: 9:30 AM - 6:30 PM IST <br /> Closed on Sunday and Public Holidays </p>
            </div>
          </div>

          {/* Column 4: Help */}
          <div className="footer-column">
            <h3 className="section-title">Help</h3>
            <ul className="footer-list">
              <li><a href="/" className="footer-link">Payments</a></li>
              <li><a href="/" className="footer-link">Shipping</a></li>
              <li><a href="/" className="footer-link">Cancellations & Returns</a></li>
              <li><a href="/" className="footer-link">FAQ</a></li>
            </ul>
          </div>

        </div>

        {/* Footer Bottom */}
        <div className="footer-bottom">
          <div className="bottom-content">
            <p className="copyright-text">© 2026 Anika Jewellery · All rights reserved</p>
            <div className="legal-links">
              <a href="/Privacy">Privacy Policy</a>
              <span className="dot-sep">·</span>
              <a href="/Terms">Terms & Conditions</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
