import React, { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import './Policy.css';
import SiteHeader from '../SiteHeader';
import SEO from '../SEO';

const SiteFooter = lazy(() => import('../SiteFooter'));

const LoadingSkeleton = ({ height = '200px' }) => (
  <div style={{ height, background: '#f5f5f5', borderRadius: '8px', margin: '16px 0' }} />
);

export default function Terms() {
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
        title="Terms of Service"
        description="Read the Terms and Conditions for ANIKA Jewellery. Learn about our service terms, customer policies, and purchasing guidelines."
        canonical="/terms"
        breadcrumbs={[
          { name: 'Home', path: '/' },
          { name: 'Terms of Service', path: '/terms' },
        ]}
      />
      <SiteHeader activeLink="" onLinkClick={handleHeaderLinkClick} />

      <section className="policy-section">
        <div className="policy-card">
          <h1 className="policy-h1">Terms of Service</h1>

          <p className="policy-intro">
            This document is an electronic record in accordance with the Information Technology Act, 2000
            and the rules made thereunder, including any amendments made from time to time. Being a
            system-generated electronic record, this document does not require any physical or digital signature.
          </p>

          <p className="policy-p">
            By accessing or using the website{' '}
            <a href="http://www.anikafashion.in" className="policy-link" target="_blank" rel="noopener noreferrer">
              www.anikafashion.in
            </a>{' '}
            ("Website"), you agree to carefully read, understand, and comply with these Terms of Use ("Terms").
            These Terms apply whenever you access, browse, register, or make a purchase through the Website
            using any computer, mobile device, or other electronic device.
          </p>

          <p className="policy-p">
            If you do not agree with these Terms, Privacy Policy, or any other policies displayed on the
            Website, please do not use the Website or its services.
          </p>

          <p className="policy-p">
            By using the Website, you acknowledge that you have read, understood, and agreed to be legally
            bound by these Terms and related policies, whether or not you create an account.
          </p>

          <p className="policy-p">
            As long as you comply with these Terms, Anika Fashion grants you a personal, limited, revocable,
            non-exclusive, and non-transferable right to access and use the Website for personal shopping purposes.
          </p>

          <h2 className="policy-h2">Acceptance of Terms</h2>
          <ul className="policy-list">
            <li>
              These Terms constitute a legally binding agreement between you and Anika Fashion. By accessing
              or using the Website, you agree to these Terms, our Privacy Policy, and any additional policies
              related to products, payments, offers, returns, refunds, cancellations, and other services
              provided through the Website.
            </li>
            <li>Every time you access or use the Website, you confirm your acceptance of these Terms and policies.</li>
            <li>If you do not wish to be bound by these Terms, you must stop using the Website immediately.</li>
          </ul>

          <h2 className="policy-h2">Eligibility of Users</h2>
          <p className="policy-p">
            The Website may be used by individuals or business entities who are legally capable of entering
            into binding contracts under applicable laws.
          </p>
          <p className="policy-p">
            As per Indian law, users must be at least 18 years of age to register or make purchases through the Website.
          </p>
          <p className="policy-p">
            Users below 18 years of age may use the Website only under the supervision and consent of a
            parent or legal guardian.
          </p>
          <p className="policy-p">
            You are responsible for ensuring that your use of the Website complies with all applicable laws and regulations.
          </p>

          <h2 className="policy-h2">Creating an Account</h2>
          <ul className="policy-list">
            <li>
              To access certain features of the Website, you may be required to create an account by providing
              accurate and complete information.
            </li>
            <li>
              You are responsible for maintaining the confidentiality of your account details, including your
              login credentials, and for all activities performed through your account.
            </li>
            <li>
              By creating an account, you authorize Anika Fashion to collect and use your information as
              described in our Privacy Policy.
            </li>
            <li>You agree to provide accurate information and update your details whenever required.</li>
            <li>
              By registering on the Website, you consent to receive communications from Anika Fashion,
              including order updates, promotional offers, newsletters, and other service-related information.
            </li>
            <li>You may unsubscribe from promotional communications at any time.</li>
          </ul>

          <h2 className="policy-h2">Limitation of Liability</h2>
          <p className="policy-p">
            To the maximum extent permitted by applicable law, Anika Fashion shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages arising from the use of or
            inability to use the Website.
          </p>
          <p className="policy-p">
            Anika Fashion shall not be responsible for losses caused due to technical issues, website
            interruptions, payment gateway failures, unauthorized access, data loss, or other circumstances
            beyond our reasonable control.
          </p>

          <h2 className="policy-h2">Copyrights and Intellectual Property</h2>
          <p className="policy-p">
            All content available on this Website, including but not limited to trademarks, brand names,
            logos, product images, designs, text, graphics, website layout, icons, source code, and other
            materials, are the exclusive property of Anika Fashion unless otherwise stated.
          </p>
          <p className="policy-p">
            Users are prohibited from copying, reproducing, modifying, distributing, selling, or commercially
            exploiting any content from the Website without prior written permission from Anika Fashion.
          </p>
          <p className="policy-p">Any unauthorized use of Website content may result in legal action.</p>

          <h2 className="policy-h2">Payments</h2>
          <p className="policy-p">Anika Fashion uses trusted third-party payment gateways to process online payments.</p>
          <p className="policy-p">
            While we take reasonable measures to ensure secure transactions, Anika Fashion is not responsible
            for delays, failures, or errors caused by third-party payment service providers, banking networks,
            or technical issues beyond our control.
          </p>
          <p className="policy-p">
            Customers are responsible for providing accurate payment and billing information during transactions.
          </p>

          <h2 className="policy-h2">Order Cancellation Policy</h2>
          <p className="policy-p">Anika Fashion reserves the right to cancel an order under certain circumstances, including:</p>
          <ul className="policy-list">
            <li>Incorrect product information or pricing errors</li>
            <li>Product unavailability or stock issues</li>
            <li>Quantity limitations</li>
            <li>Suspicious or fraudulent transactions</li>
            <li>Issues identified during order verification</li>
          </ul>
          <p className="policy-p">
            If an order is cancelled after payment has been completed, the eligible amount will be refunded
            through the original payment method as per applicable refund timelines.
          </p>

          <h2 className="policy-h2">Cancellation by Customer</h2>
          <p className="policy-p">
            Customers may request cancellation of an order before the product has been processed or shipped.
          </p>
          <p className="policy-p">Once an order has been dispatched, cancellation requests may not be accepted.</p>
          <p className="policy-p">
            Anika Fashion reserves the right to review cancellation requests based on order status and
            applicable policies.
          </p>

          <h2 className="policy-h2">Fraudulent or Declined Transactions</h2>
          <p className="policy-p">
            Anika Fashion reserves the right to take appropriate action against users involved in fraudulent
            activities, including unauthorized payment methods, misuse of offers, or suspicious transactions.
          </p>
          <p className="policy-p">
            The company may recover any losses, costs, or damages caused due to fraudulent activities and may
            initiate legal action wherever necessary.
          </p>

          <h2 className="policy-h2">Product Colours and Images</h2>
          <p className="policy-p">
            Anika Fashion makes every effort to display product images and colours as accurately as possible.
          </p>
          <p className="policy-p">
            However, actual product colours may vary slightly depending on device screens, display settings,
            lighting conditions, and photography effects.
          </p>
          <p className="policy-p">
            Anika Fashion does not guarantee that the colour displayed on your device will exactly match the
            actual product.
          </p>

          <h2 className="policy-h2">Feedback and Reviews</h2>
          <p className="policy-p">
            Customers are encouraged to share genuine feedback and reviews about their shopping experience.
          </p>
          <p className="policy-p">
            Reviews help Anika Fashion improve its products and services and help other customers make
            informed decisions.
          </p>
          <p className="policy-p">
            Customers must ensure that their reviews are honest, respectful, and do not contain misleading
            information, offensive content, or false claims.
          </p>
          <p className="policy-p">
            Anika Fashion reserves the right to remove inappropriate reviews or restrict accounts involved in
            misuse of the review system.
          </p>

          <div className="policy-contact-block">
            <h2 className="policy-h2">Contact Us</h2>
            <p className="policy-p" style={{ marginBottom: 0 }}>
              For any questions, concerns, or support regarding these Terms, please contact Anika Fashion
              through the contact details provided on the Website.
              <br />
              Website:{' '}
              <a href="http://www.anikafashion.in" className="policy-link" target="_blank" rel="noopener noreferrer">
                www.anikafashion.in
              </a>
            </p>
          </div>
        </div>
      </section>

      <Suspense fallback={<LoadingSkeleton height="300px" />}>
        <SiteFooter />
      </Suspense>
    </div>
  );
}