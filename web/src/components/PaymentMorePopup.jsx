import React, { useState, useRef, useEffect } from 'react';
import './PaymentMorePopup.css';

// ── Native Vector SVG Badges (100% Native, Zero External Scripts) ─────────────
const GPayIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="Google Pay">
    <rect width="38" height="24" rx="3" fill="#ffffff" stroke="#000000" strokeOpacity="0.08" strokeWidth="1"/>
    <g transform="translate(6, 4.5) scale(0.68)">
      <path fill="#4285F4" d="M10.8 11.2c0-.7-.06-1.3-.18-1.9H5.5v3.6h3c-.13.7-.5 1.3-1.1 1.7v1.4h1.8c1-1 1.6-2.5 1.6-4.8z"/>
      <path fill="#34A853" d="M5.5 16.5c1.5 0 2.8-.5 3.7-1.4l-1.8-1.4c-.5.3-1.1.5-1.9.5-1.5 0-2.7-1-3.2-2.3H.5v1.5c1 2 3.1 3.1 5 3.1z"/>
      <path fill="#FBBC05" d="M2.3 11.9c-.1-.4-.2-.8-.2-1.3 0-.5.1-.9.2-1.3V7.8H.5C.2 8.5 0 9.2 0 10.6s.2 2.1.5 2.8l1.8-1.5z"/>
      <path fill="#EA4335" d="M5.5 5.7c.8 0 1.6.3 2.1.8l1.6-1.6C8.2 4 7 3.5 5.5 3.5 3.6 3.5 1.5 4.6.5 6.6l1.8 1.5c.5-1.4 1.7-2.4 3.2-2.4z"/>
    </g>
    <text x="17.5" y="15" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fontSize="7.8" fontWeight="600" fill="#5f6368">Pay</text>
  </svg>
);

const RuPayIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="RuPay">
    <rect width="38" height="24" rx="3" fill="#ffffff" stroke="#000000" strokeOpacity="0.08" strokeWidth="1"/>
    <text x="5" y="15" fontFamily="Arial, Helvetica, sans-serif" fontSize="8" fontWeight="900" fontStyle="italic" fill="#0c438c">Ru</text>
    <text x="16.5" y="15" fontFamily="Arial, Helvetica, sans-serif" fontSize="8" fontWeight="900" fontStyle="italic" fill="#00a3e0">Pay</text>
    <polygon points="30,7.5 33,12 30,16.5" fill="#f37021"/>
    <polygon points="32.5,7.5 35.5,12 32.5,16.5" fill="#00a3e0"/>
  </svg>
);

const PhonePeIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="PhonePe">
    <rect width="38" height="24" rx="3" fill="#5f259f"/>
    <circle cx="12" cy="12" r="7.5" fill="#ffffff"/>
    <path fill="#5f259f" d="M9.8 8.2h4.2v1.6h-1.4v6.2h-1.6v-2.6H9.8c-.8 0-1.4-.6-1.4-1.4v-2.4c0-.8.6-1.4 1.4-1.4zm0 1.5v1.9h1.2V9.7H9.8z"/>
    <path fill="#5f259f" d="M12.6 7l2 1.5-1 1.3-2-1.5z"/>
    <text x="21" y="14.5" fontFamily="Arial, sans-serif" fontSize="7.5" fontWeight="bold" fill="#ffffff">Pe</text>
  </svg>
);

const AirtelPayIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="Airtel Payments Bank">
    <rect width="38" height="24" rx="3" fill="#ffffff" stroke="#000000" strokeOpacity="0.08" strokeWidth="1"/>
    <g transform="translate(6, 4.5) scale(0.65)">
      <path fill="#ED1C24" d="M11 2C6 2 2 6 2 11c0 5 4 9 9 9s9-4 9-9c0-2-1-4-2-5l-2 2c1 1 1 2 1 3 0 3-3 6-6 6s-6-3-6-6 3-6 6-6c1 0 2 0 3 1l2-2c-1-1-3-1-5-1z"/>
      <circle cx="15.5" cy="6.5" r="2.5" fill="#ED1C24"/>
    </g>
    <text x="19" y="14" fontFamily="Arial, sans-serif" fontSize="6" fontWeight="bold" fill="#ED1C24">airtel</text>
  </svg>
);

const MobiKwikIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="MobiKwik">
    <rect width="38" height="24" rx="3" fill="#ffffff" stroke="#000000" strokeOpacity="0.08" strokeWidth="1"/>
    <g transform="translate(5, 5)">
      <path fill="#00A8EC" d="M0 12V3l3.5 5 3.5-5v9H5V6.5L3.5 9 2 6.5V12H0z"/>
    </g>
    <text x="15" y="14" fontFamily="Arial, sans-serif" fontSize="5.5" fontWeight="bold" fill="#00377B">Kwik</text>
  </svg>
);

const CredIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="CRED">
    <rect width="38" height="24" rx="3" fill="#141414"/>
    <path fill="none" stroke="#ffffff" strokeWidth="1.2" d="M6 6.5h7.5v7.5a3.8 3.8 0 01-7.5 0V6.5z"/>
    <path fill="#ffffff" d="M8 8.5h3.5v3.5a1.8 1.8 0 01-3.5 0V8.5z"/>
    <text x="16.5" y="14.5" fontFamily="Arial, sans-serif" fontSize="6.5" fontWeight="900" letterSpacing="0.8" fill="#ffffff">CRED</text>
  </svg>
);

const AmazonPayIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="Amazon Pay">
    <rect width="38" height="24" rx="3" fill="#ffffff" stroke="#000000" strokeOpacity="0.08" strokeWidth="1"/>
    <text x="6" y="14" fontFamily="Arial, sans-serif" fontSize="9" fontWeight="bold" fill="#111111">a</text>
    <path d="M5.5 16.5c3.2 2 6.5 1.5 9.5-.5" fill="none" stroke="#FF9900" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M14 15.2l1.6.8-.7-1.7" fill="#FF9900"/>
    <text x="18" y="13.5" fontFamily="Arial, sans-serif" fontSize="6.5" fontWeight="600" fill="#232F3E">pay</text>
  </svg>
);

const PaytmIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="Paytm">
    <rect width="38" height="24" rx="3" fill="#ffffff" stroke="#000000" strokeOpacity="0.08" strokeWidth="1"/>
    <text x="5" y="14.5" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="bold" fill="#002970">pay</text>
    <text x="21" y="14.5" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="bold" fill="#00BAF2">tm</text>
  </svg>
);

const NetBankingIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="Net Banking">
    <rect width="38" height="24" rx="3" fill="#ffffff" stroke="#000000" strokeOpacity="0.08" strokeWidth="1"/>
    <g transform="translate(11, 4.5)">
      <polygon points="8,1 1,5 15,5" fill="#222222"/>
      <rect x="2" y="6" width="2" height="6" fill="#222222"/>
      <rect x="5.5" y="6" width="2" height="6" fill="#222222"/>
      <rect x="9" y="6" width="2" height="6" fill="#222222"/>
      <rect x="12.5" y="6" width="2" height="6" fill="#222222"/>
      <rect x="0" y="13" width="16" height="1.8" fill="#222222"/>
    </g>
  </svg>
);

const AmexIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="American Express">
    <rect width="38" height="24" rx="3" fill="#006FCF"/>
    <text x="6" y="11" fontFamily="Arial, sans-serif" fontSize="5.5" fontWeight="900" fill="#ffffff">AM</text>
    <text x="6" y="18" fontFamily="Arial, sans-serif" fontSize="5.5" fontWeight="900" fill="#ffffff">EX</text>
    <rect x="18" y="7" width="14" height="10" fill="none" stroke="#ffffff" strokeWidth="0.8"/>
    <text x="19.5" y="14" fontFamily="Arial, sans-serif" fontSize="4.5" fontWeight="bold" fill="#ffffff">CARD</text>
  </svg>
);

const DinersIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="Diners Club">
    <rect width="38" height="24" rx="3" fill="#ffffff" stroke="#000000" strokeOpacity="0.08" strokeWidth="1"/>
    <circle cx="14" cy="12" r="7" fill="#0079BE"/>
    <path d="M14 6a6 6 0 000 12V6z" fill="#ffffff"/>
    <circle cx="21" cy="12" r="7" fill="#0079BE" opacity="0.3"/>
  </svg>
);

const MaestroIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="Maestro">
    <rect width="38" height="24" rx="3" fill="#1e1e1e"/>
    <circle cx="15" cy="12" r="6" fill="#EB001B"/>
    <circle cx="23" cy="12" r="6" fill="#00A2E5"/>
    <path d="M19 7.7a6 6 0 000 8.6 6 6 0 000-8.6z" fill="#7360A9"/>
  </svg>
);

const FreechargeIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="Freecharge">
    <rect width="38" height="24" rx="3" fill="#ffffff" stroke="#000000" strokeOpacity="0.08" strokeWidth="1"/>
    <circle cx="12" cy="12" r="7" fill="#F1592A"/>
    <text x="10" y="15" fontFamily="Arial, sans-serif" fontSize="9" fontWeight="bold" fill="#ffffff">f</text>
    <text x="21" y="14" fontFamily="Arial, sans-serif" fontSize="5.5" fontWeight="bold" fill="#222222">Free</text>
  </svg>
);

const OlaMoneyIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="Ola Money">
    <rect width="38" height="24" rx="3" fill="#ffffff" stroke="#000000" strokeOpacity="0.08" strokeWidth="1"/>
    <circle cx="13" cy="12" r="7" fill="#1CA34D"/>
    <circle cx="13" cy="12" r="3.5" fill="#ffffff"/>
    <text x="22" y="14" fontFamily="Arial, sans-serif" fontSize="6.5" fontWeight="bold" fill="#1CA34D">OLA</text>
  </svg>
);

const BhimIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="BHIM UPI">
    <rect width="38" height="24" rx="3" fill="#ffffff" stroke="#000000" strokeOpacity="0.08" strokeWidth="1"/>
    <polygon points="9,6 14,6 10,18 5,18" fill="#00A859"/>
    <polygon points="14,6 19,6 15,18 10,18" fill="#F37023"/>
    <text x="20" y="14.5" fontFamily="Arial, sans-serif" fontSize="6" fontWeight="900" fontStyle="italic" fill="#005B9F">BHIM</text>
  </svg>
);

const PayZappIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="PayZapp">
    <rect width="38" height="24" rx="3" fill="#004A8F"/>
    <circle cx="12" cy="12" r="6" fill="#ffffff"/>
    <text x="9.5" y="15" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="900" fill="#ED1C24">Z</text>
    <text x="19" y="14" fontFamily="Arial, sans-serif" fontSize="5.5" fontWeight="bold" fill="#ffffff">Zapp</text>
  </svg>
);

const ApplePayIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="Apple Pay">
    <rect width="38" height="24" rx="3" fill="#ffffff" stroke="#000000" strokeOpacity="0.08" strokeWidth="1"/>
    <g transform="translate(6, 4.5)">
      <path fill="#000000" d="M5.5 3c-.4.5-1 .9-1.6.8-.1-.6.2-1.2.6-1.6.4-.5 1.1-.8 1.6-.8.1.6-.2 1.1-.6 1.6zm.6 1.8c-.9 0-1.6.5-2 .5s-1.1-.5-1.9-.5c-1 0-1.9.6-2.4 1.5-.9 1.7-.2 4.2.7 5.5.5.6 1 1.3 1.7 1.3.7 0 .9-.4 1.8-.4s1 .4 1.8.4c.7 0 1.2-.6 1.6-1.3.5-.8.7-1.5.8-1.6-.1 0-1.4-.5-1.4-2.1 0-1.3 1.1-2 1.1-2-.6-.9-1.6-1-1.8-1z"/>
    </g>
    <text x="16" y="14.5" fontFamily="-apple-system, sans-serif" fontSize="6.8" fontWeight="600" fill="#000000">Pay</text>
  </svg>
);

const EmiIcon = () => (
  <svg viewBox="0 0 38 24" width="38" height="24" aria-label="EMI / PayLater">
    <rect width="38" height="24" rx="3" fill="#f8f4f0" stroke="#c8972a" strokeWidth="1"/>
    <text x="7" y="15" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="900" letterSpacing="0.6" fill="#7b1d1d">EMI</text>
    <text x="24" y="14.5" fontFamily="Arial, sans-serif" fontSize="5" fontWeight="bold" fill="#c8972a">0%</text>
  </svg>
);

// ── List of All 18 Native Icons (Requested 7 items prioritized at top) ────────
const POPUP_ICONS = [
  { id: 'gpay', name: 'Google Pay', Component: GPayIcon },
  { id: 'rupay', name: 'RuPay Card', Component: RuPayIcon },
  { id: 'phonepe', name: 'PhonePe UPI', Component: PhonePeIcon },
  { id: 'airtel', name: 'Airtel Payments Bank', Component: AirtelPayIcon },
  { id: 'mobikwik', name: 'MobiKwik Wallet', Component: MobiKwikIcon },
  { id: 'cred', name: 'CRED UPI & Pay', Component: CredIcon },
  { id: 'amazonpay', name: 'Amazon Pay', Component: AmazonPayIcon },
  { id: 'paytm', name: 'Paytm Wallet & UPI', Component: PaytmIcon },
  { id: 'netbanking', name: 'Net Banking (All Banks)', Component: NetBankingIcon },
  { id: 'amex', name: 'American Express', Component: AmexIcon },
  { id: 'diners', name: 'Diners Club', Component: DinersIcon },
  { id: 'maestro', name: 'Maestro Debit Card', Component: MaestroIcon },
  { id: 'freecharge', name: 'Freecharge Wallet', Component: FreechargeIcon },
  { id: 'olamoney', name: 'Ola Money', Component: OlaMoneyIcon },
  { id: 'bhim', name: 'BHIM UPI', Component: BhimIcon },
  { id: 'payzapp', name: 'HDFC PayZapp', Component: PayZappIcon },
  { id: 'applepay', name: 'Apple Pay', Component: ApplePayIcon },
  { id: 'emi', name: 'No Cost EMI', Component: EmiIcon },
];

export default function PaymentMorePopup({ count = '+18', className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef(null);

  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  return (
    <div
      className={`payment-more-wrap ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={`payment-more-trigger ${isOpen ? 'active' : ''}`}
        aria-label="View more payment methods"
        aria-expanded={isOpen}
      >
        {count}
      </button>

      {isOpen && (
        <div className="payment-popup-card" role="dialog" aria-label="Available Payment Methods">
          <div className="payment-popup-grid">
            {POPUP_ICONS.map(({ id, name, Component }) => (
              <div key={id} className="payment-popup-item" title={name} aria-label={name}>
                <Component />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
