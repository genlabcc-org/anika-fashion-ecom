import React, { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import './Policy.css';
import SiteHeader from '../SiteHeader';
import SEO from '../SEO';

const SiteFooter = lazy(() => import('../SiteFooter'));

const LoadingSkeleton = ({ height = '200px' }) => (
  <div style={{ height, background: '#f5f5f5', borderRadius: '8px', margin: '16px 0' }} />
);

export default function Privacy() {
  const navigate = useNavigate();

  const handleHeaderLinkClick = (link) => {
    if (link === 'Home') {
      navigate('/');
    } else {
      navigate(`/${link.toLowerCase()}`);
    }
  };

  return (
    <div className="policy-root">
      <SEO
        title="Privacy Policy"
        description="Read the Privacy Policy for ANIKA Jewellery. Learn how we handle, store, and protect your personal information."
        canonical="/privacy"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Privacy Policy', path: '/privacy' },
        ]}
      />
      <SiteHeader activeLink="" onLinkClick={handleHeaderLinkClick} />

      <section className="policy-section">
        <div className="policy-card">
          <h1 className="policy-h1">Privacy Policy</h1>
          <p className="policy-updated">Last Updated: July 30, 2026</p>

          <p className="policy-intro">
            This Privacy Policy explains how Anika Fashion ("Website", "we", "us", or "our") collects, uses,
            stores, and protects your personal information when you visit, use our services, or make a
            purchase through{' '}
            <a href="http://www.anikafashion.in" className="policy-link" target="_blank" rel="noopener noreferrer">
              www.anikafashion.in
            </a>{' '}
            ("Website").
          </p>

          <p className="policy-p">
            For the purpose of this Privacy Policy, "you" and "your" refer to any user of our services,
            including customers, visitors, or any individual whose information we collect through our Website.
          </p>

          <p className="policy-p">
            Please read this Privacy Policy carefully to understand how we handle your personal information.
          </p>

          <h2 className="policy-h2">Changes to This Privacy Policy</h2>
          <p className="policy-p">
            We may update this Privacy Policy from time to time to reflect changes in our practices, business
            operations, legal requirements, or regulatory obligations.
          </p>
          <p className="policy-p">
            Any updates will be posted on this page with the revised "Last Updated" date. We encourage you to
            review this Privacy Policy periodically.
          </p>

          <h2 className="policy-h2">How We Collect and Use Your Personal Information</h2>
          <p className="policy-p">
            To provide and improve our services, we collect personal information from you through different
            sources depending on how you interact with our Website.
          </p>
          <p className="policy-p">We use your information to:</p>
          <ul className="policy-list">
            <li>Process and fulfill your orders</li>
            <li>Provide customer support</li>
            <li>Improve our products and services</li>
            <li>Communicate order updates and important information</li>
            <li>Send promotional offers and updates (with your consent)</li>
            <li>Prevent fraudulent activities</li>
            <li>Comply with applicable legal requirements</li>
          </ul>

          <h2 className="policy-h2">Information We Collect Directly from You</h2>
          <p className="policy-p">
            When you use our Website, create an account, place an order, or contact us, we may collect the
            following information:
          </p>

          <p className="policy-p" style={{ marginBottom: 6, fontWeight: 700, color: 'var(--text)' }}>
            Personal Details:
          </p>
          <ul className="policy-sub-list">
            <li>Name</li>
            <li>Email address</li>
            <li>Phone number</li>
            <li>Billing address</li>
            <li>Shipping address</li>
          </ul>

          <p className="policy-p" style={{ marginTop: 14, marginBottom: 6, fontWeight: 700, color: 'var(--text)' }}>
            Order Information:
          </p>
          <ul className="policy-sub-list">
            <li>Products purchased</li>
            <li>Order history</li>
            <li>Payment confirmation details</li>
            <li>Delivery information</li>
            <li>Return or exchange details</li>
          </ul>

          <p className="policy-p" style={{ marginTop: 14, marginBottom: 6, fontWeight: 700, color: 'var(--text)' }}>
            Account Information:
          </p>
          <ul className="policy-sub-list">
            <li>Username</li>
            <li>Password</li>
            <li>Account preferences</li>
            <li>Saved account details</li>
          </ul>

          <p className="policy-p" style={{ marginTop: 14, marginBottom: 6, fontWeight: 700, color: 'var(--text)' }}>
            Customer Support Information:
          </p>
          <p className="policy-p">
            Any information you provide when contacting us regarding orders, products, returns, exchanges, or
            other queries.
          </p>

          <h2 className="policy-h2">Information We Collect from Third Parties</h2>
          <p className="policy-p">
            We may receive information from trusted third-party service providers who support our Website
            operations, including:
          </p>
          <ul className="policy-list">
            <li>Payment gateway providers for processing payments securely</li>
            <li>Shipping and delivery partners for order fulfillment</li>
            <li>Website service providers and technology platforms</li>
            <li>Customer support and service providers</li>
          </ul>
          <p className="policy-p">
            Any information collected from third parties will be handled according to this Privacy Policy.
          </p>

          <h2 className="policy-h2">How We Use Your Personal Information</h2>

          <p className="policy-p" style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Providing Products and Services
          </p>
          <p className="policy-p">
            We use your personal information to process orders, complete payments, arrange shipping, manage
            returns and exchanges, and provide customer support.
          </p>

          <p className="policy-p" style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Communication
          </p>
          <p className="policy-p">We may use your information to send:</p>
          <ul className="policy-sub-list">
            <li>Order confirmations</li>
            <li>Shipping updates</li>
            <li>Customer support responses</li>
            <li>Important service notifications</li>
          </ul>
          <p className="policy-p" style={{ marginTop: 10 }}>
            With your permission, we may also send promotional offers, product updates, and marketing communications.
          </p>

          <p className="policy-p" style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Improving Our Services
          </p>
          <p className="policy-p">
            We use customer information to understand customer needs, improve our Website experience, enhance
            our products, and provide better services.
          </p>

          <p className="policy-p" style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Security and Fraud Prevention
          </p>
          <p className="policy-p">
            We may use your information to detect, investigate, and prevent fraudulent transactions,
            unauthorized activities, or misuse of our Website.
          </p>

          <h2 className="policy-h2">How We Share Your Personal Information</h2>
          <p className="policy-p">
            We may share your information with trusted third parties only when necessary to provide our services.
          </p>
          <p className="policy-p">This may include:</p>

          <p className="policy-p" style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Service Providers:
          </p>
          <ul className="policy-sub-list">
            <li>Payment processors</li>
            <li>Shipping and delivery partners</li>
            <li>Website hosting providers</li>
            <li>Customer support providers</li>
            <li>Service providers who help us operate our Website</li>
          </ul>

          <p className="policy-p" style={{ marginTop: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Legal Requirements:
          </p>
          <p className="policy-p">
            We may disclose your information if required by law, legal processes, government authorities, or
            to protect our rights, customers, or Website security.
          </p>

          <p className="policy-p" style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Business Operations:
          </p>
          <p className="policy-p">
            In case of business changes such as mergers, acquisitions, or restructuring, your information may
            be transferred as part of the business assets.
          </p>

          <h2 className="policy-h2">Payment Information</h2>
          <p className="policy-p">
            Payments made through our Website are processed securely through third-party payment gateways.
          </p>
          <p className="policy-p">
            Anika Fashion does not directly store your complete payment card or banking details.
          </p>
          <p className="policy-p">
            Payment service providers process your payment information according to their own privacy
            policies and security practices.
          </p>

          <h2 className="policy-h2">User Reviews and Content</h2>
          <p className="policy-p">
            If you submit product reviews, feedback, images, or other content on our Website, such
            information may be visible to other users.
          </p>
          <p className="policy-p">
            You are responsible for ensuring that the content you share is accurate and does not violate the
            rights of others.
          </p>
          <p className="policy-p">
            Anika Fashion reserves the right to remove inappropriate, misleading, or harmful content.
          </p>

          <h2 className="policy-h2">Third-Party Websites and Links</h2>
          <p className="policy-p">
            Our Website may contain links to third-party websites, services, or platforms.
          </p>
          <p className="policy-p">
            Anika Fashion is not responsible for the privacy practices, security, or content of external websites.
          </p>
          <p className="policy-p">
            We recommend reviewing the privacy policies of third-party websites before sharing personal information.
          </p>

          <h2 className="policy-h2">Children's Privacy</h2>
          <p className="policy-p">Our Website is not intended for individuals below the age of 18.</p>
          <p className="policy-p">We do not knowingly collect personal information from children.</p>
          <p className="policy-p">
            If you believe that a child has provided personal information without appropriate consent, please
            contact us, and we will take necessary steps to remove such information.
          </p>

          <h2 className="policy-h2">Security and Retention of Information</h2>
          <p className="policy-p">
            We take reasonable measures to protect your personal information from unauthorized access,
            misuse, loss, or disclosure.
          </p>
          <p className="policy-p">However, no online platform can guarantee complete security.</p>
          <p className="policy-p">We retain your information only for as long as necessary to:</p>
          <ul className="policy-list">
            <li>Provide our services</li>
            <li>Maintain records</li>
            <li>Comply with legal obligations</li>
            <li>Resolve disputes</li>
            <li>Enforce agreements</li>
          </ul>

          <h2 className="policy-h2">Your Rights</h2>
          <p className="policy-p">
            Depending on applicable laws, you may have rights regarding your personal information, including:
          </p>

          <p className="policy-p" style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            Right to Access:
          </p>
          <p className="policy-p">You may request details about the personal information we hold about you.</p>

          <p className="policy-p" style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            Right to Correction:
          </p>
          <p className="policy-p">You may request correction of inaccurate or incomplete information.</p>

          <p className="policy-p" style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            Right to Deletion:
          </p>
          <p className="policy-p">You may request deletion of your personal information, subject to legal requirements.</p>

          <p className="policy-p" style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            Right to Withdraw Consent:
          </p>
          <p className="policy-p">You may withdraw consent for promotional communications at any time.</p>

          <p className="policy-p" style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            Managing Communication Preferences:
          </p>
          <p className="policy-p">
            You may unsubscribe from promotional emails or messages using available options.
          </p>

          <h2 className="policy-h2">Complaints</h2>
          <p className="policy-p">
            If you have concerns regarding the handling of your personal information or this Privacy Policy,
            please contact us.
          </p>
          <p className="policy-p">We will review and respond to your concerns within a reasonable timeframe.</p>

          <div className="policy-contact-block">
            <h2 className="policy-h2">Contact Us</h2>
            <p className="policy-p">
              If you have any questions about this Privacy Policy or wish to exercise your privacy rights,
              please contact us:
            </p>
            <p className="policy-p" style={{ marginBottom: 0 }}>
              <strong>Anika Fashion</strong>
              <br />
              Website:{' '}
              <a href="http://www.anikafashion.in" className="policy-link" target="_blank" rel="noopener noreferrer">
                www.anikafashion.in
              </a>
              <br />
              Email: anikafashionstorengl@gmail.com
              <br />
              Address: 121A, Kottar, Parvathipuram Road, Nagercoil, Tamil Nadu - 629004
            </p>
          </div>

          <p className="policy-p" style={{ marginTop: 24, fontStyle: 'italic' }}>
            For applicable data protection laws, Anika Fashion acts as the controller of your personal information.
          </p>
        </div>
      </section>

      <Suspense fallback={<LoadingSkeleton height="300px" />}>
        <SiteFooter />
      </Suspense>
    </div>
  );
}